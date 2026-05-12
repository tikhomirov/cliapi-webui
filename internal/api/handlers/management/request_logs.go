package management

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
)

const (
	requestLogsDefaultLimit = 300
	requestLogsMaxLimit     = 1000
	requestLogReadLimit     = 2 << 20
	requestPreviewLimit     = 4000
)

type requestLogSummary struct {
	Name               string `json:"name"`
	Size               int64  `json:"size"`
	Modified           int64  `json:"modified"`
	RequestID          string `json:"request_id"`
	URL                string `json:"url"`
	Method             string `json:"method"`
	Timestamp          string `json:"timestamp"`
	TimestampUnixMilli int64  `json:"timestamp_unix_milli"`
	Model              string `json:"model"`
	TextPreview        string `json:"text_preview"`
	RequestBodyPreview string `json:"request_body_preview"`
}

// ListRequestLogs returns parsed request log summaries with request text previews.
func (h *Handler) ListRequestLogs(c *gin.Context) {
	if h == nil || h.cfg == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "configuration unavailable"})
		return
	}
	dir := h.logDirectory()
	if strings.TrimSpace(dir) == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "log directory not configured"})
		return
	}

	limit := requestLogsDefaultLimit
	if raw := strings.TrimSpace(c.Query("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid limit"})
			return
		}
		limit = parsed
	}
	if limit > requestLogsMaxLimit {
		limit = requestLogsMaxLimit
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusOK, gin.H{"logs": []requestLogSummary{}})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to list log directory: %v", err)})
		return
	}

	type candidate struct {
		name string
		path string
		info os.FileInfo
	}
	candidates := make([]candidate, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !isRequestLogFileName(name) {
			continue
		}
		info, errInfo := entry.Info()
		if errInfo != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to read log info for %s: %v", name, errInfo)})
			return
		}
		candidates = append(candidates, candidate{name: name, path: filepath.Join(dir, name), info: info})
	}
	sort.Slice(candidates, func(i, j int) bool { return candidates[i].info.ModTime().After(candidates[j].info.ModTime()) })
	if len(candidates) > limit {
		candidates = candidates[:limit]
	}

	logs := make([]requestLogSummary, 0, len(candidates))
	for _, cand := range candidates {
		summary, errParse := parseRequestLogSummary(cand.path, cand.name, cand.info)
		if errParse != nil {
			summary = requestLogSummary{Name: cand.name, Size: cand.info.Size(), Modified: cand.info.ModTime().Unix(), RequestID: requestIDFromLogName(cand.name)}
		}
		logs = append(logs, summary)
	}

	c.JSON(http.StatusOK, gin.H{"logs": logs})
}

// GetRequestLogText returns the parsed request text and bounded raw content for a request log file.
func (h *Handler) GetRequestLogText(c *gin.Context) {
	if h == nil || h.cfg == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "configuration unavailable"})
		return
	}
	name := strings.TrimSpace(c.Param("name"))
	if !isRequestLogFileName(name) || strings.ContainsAny(name, "/\\") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid log file name"})
		return
	}
	dir := h.logDirectory()
	dirAbs, errAbs := filepath.Abs(dir)
	if errAbs != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to resolve log directory: %v", errAbs)})
		return
	}
	fullPath := filepath.Clean(filepath.Join(dirAbs, name))
	if !strings.HasPrefix(fullPath, dirAbs+string(os.PathSeparator)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid log file path"})
		return
	}
	info, errStat := os.Stat(fullPath)
	if errStat != nil {
		if os.IsNotExist(errStat) {
			c.JSON(http.StatusNotFound, gin.H{"error": "log file not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to read log file: %v", errStat)})
		return
	}
	if info.IsDir() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid log file"})
		return
	}
	summary, errParse := parseRequestLogSummary(fullPath, name, info)
	if errParse != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to parse log file: %v", errParse)})
		return
	}
	data, _ := os.ReadFile(fullPath)
	if len(data) > requestLogReadLimit {
		data = data[:requestLogReadLimit]
	}
	c.JSON(http.StatusOK, gin.H{"log": summary, "raw_preview": safePreview(string(data), requestLogReadLimit)})
}

func isRequestLogFileName(name string) bool {
	if name == "" || name == defaultLogFileName || strings.HasPrefix(name, "error-") || !strings.HasSuffix(name, ".log") {
		return false
	}
	return strings.Contains(name, "-")
}

func parseRequestLogSummary(path string, name string, info os.FileInfo) (requestLogSummary, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return requestLogSummary{}, err
	}
	if len(data) > requestLogReadLimit {
		data = data[:requestLogReadLimit]
	}
	text := string(data)
	body := extractSection(text, "=== REQUEST BODY ===")
	timestamp := strings.TrimSpace(extractHeaderValue(text, "Timestamp:"))
	var tsMilli int64
	if parsed, errParse := time.Parse(time.RFC3339Nano, timestamp); errParse == nil {
		tsMilli = parsed.UnixMilli()
	}
	model, prompt := parseRequestBodyPrompt(body)
	return requestLogSummary{
		Name:               name,
		Size:               info.Size(),
		Modified:           info.ModTime().Unix(),
		RequestID:          requestIDFromLogName(name),
		URL:                strings.TrimSpace(extractHeaderValue(text, "URL:")),
		Method:             strings.TrimSpace(extractHeaderValue(text, "Method:")),
		Timestamp:          timestamp,
		TimestampUnixMilli: tsMilli,
		Model:              model,
		TextPreview:        safePreview(prompt, requestPreviewLimit),
		RequestBodyPreview: safePreview(strings.TrimSpace(body), requestPreviewLimit),
	}, nil
}

func requestIDFromLogName(name string) string {
	base := strings.TrimSuffix(name, ".log")
	idx := strings.LastIndex(base, "-")
	if idx < 0 || idx == len(base)-1 {
		return ""
	}
	return base[idx+1:]
}

func extractHeaderValue(text string, prefix string) string {
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, prefix) {
			return strings.TrimSpace(strings.TrimPrefix(line, prefix))
		}
	}
	return ""
}

func extractSection(text string, marker string) string {
	idx := strings.Index(text, marker)
	if idx < 0 {
		return ""
	}
	start := idx + len(marker)
	section := strings.TrimLeft(text[start:], "\r\n")
	if next := strings.Index(section, "\n=== "); next >= 0 {
		section = section[:next]
	}
	return strings.TrimSpace(section)
}

func parseRequestBodyPrompt(body string) (string, string) {
	body = strings.TrimSpace(body)
	if body == "" {
		return "", ""
	}
	var payload any
	if err := json.Unmarshal([]byte(body), &payload); err != nil {
		return "", body
	}
	root, _ := payload.(map[string]any)
	model, _ := root["model"].(string)
	parts := make([]string, 0)
	appendContent := func(prefix string, value any) {
		text := contentToText(value)
		if strings.TrimSpace(text) != "" {
			parts = append(parts, strings.TrimSpace(prefix+text))
		}
	}
	if sys, ok := root["system"]; ok {
		appendContent("system: ", sys)
	}
	if messages, ok := root["messages"].([]any); ok {
		for _, msgRaw := range messages {
			msg, _ := msgRaw.(map[string]any)
			role, _ := msg["role"].(string)
			prefix := ""
			if role != "" {
				prefix = role + ": "
			}
			appendContent(prefix, msg["content"])
		}
	}
	if len(parts) == 0 {
		return model, body
	}
	return model, strings.Join(parts, "\n\n")
}

func contentToText(value any) string {
	switch v := value.(type) {
	case string:
		return v
	case []any:
		parts := make([]string, 0, len(v))
		for _, item := range v {
			m, ok := item.(map[string]any)
			if !ok {
				parts = append(parts, fmt.Sprint(item))
				continue
			}
			if text, _ := m["text"].(string); text != "" {
				parts = append(parts, text)
				continue
			}
			if typ, _ := m["type"].(string); strings.Contains(typ, "image") {
				parts = append(parts, "[image]")
			}
		}
		return strings.Join(parts, "\n")
	case map[string]any:
		if text, _ := v["text"].(string); text != "" {
			return text
		}
	}
	return ""
}

func safePreview(text string, max int) string {
	text = strings.TrimSpace(text)
	if max <= 0 || len(text) <= max {
		return text
	}
	cut := text[:max]
	for !utf8.ValidString(cut) && len(cut) > 0 {
		cut = cut[:len(cut)-1]
	}
	return cut + "…"
}
