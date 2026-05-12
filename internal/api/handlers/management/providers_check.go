package management

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
	log "github.com/sirupsen/logrus"
)

const providerCheckTimeout = 15 * time.Second

// ProviderCheckResult represents the check result for a single provider.
type ProviderCheckResult struct {
	Name       string   `json:"name"`
	BaseURL    string   `json:"baseUrl"`
	Type       string   `json:"type"`   // "openai-compat", "codex", "anthropic", "gemini"
	Status     string   `json:"status"` // "ok", "error", "timeout", "no-models-endpoint", "oauth-active", "oauth-inactive"
	Models     []string `json:"models"`
	Error      string   `json:"error,omitempty"`
	Latency    int64    `json:"latencyMs"`
	APIKeyHint string   `json:"apiKeyHint,omitempty"`
}

type openAIModelsResp struct {
	Data []struct {
		ID      string `json:"id"`
		OwnedBy string `json:"owned_by"`
	} `json:"data"`
}

// proxyModelInfo holds model metadata including routing provenance.
type proxyModelInfo struct {
	ownedBy  string // from upstream /v1/models "owned_by" field
	routedBy string // non-empty when the model is served by an openai-compat provider
}

// CheckProviders probes ALL configured providers:
//  1. openai-compatibility — calls upstream /models directly
//  2. OAuth (codex, anthropic, gemini) — checks auth files for tokens,
//     then shows proxy-known models for each
//
// GET /v0/management/providers/check
func (h *Handler) CheckProviders(c *gin.Context) {
	if h == nil || h.cfg == nil {
		c.JSON(http.StatusOK, gin.H{"providers": []ProviderCheckResult{}})
		return
	}

	cfg := h.cfg
	globalProxy := cfg.ProxyURL
	var results []ProviderCheckResult

	// ── 1. openai-compatibility providers: probe upstream /models ──
	for _, p := range cfg.OpenAICompatibility {
		name := p.Name
		baseURL := strings.TrimRight(p.BaseURL, "/")
		if baseURL == "" {
			results = append(results, ProviderCheckResult{
				Name: name, Type: "openai-compat", Status: "error",
				Error: "base-url is empty",
			})
			continue
		}

		var apiKey string
		if len(p.APIKeyEntries) > 0 {
			apiKey = p.APIKeyEntries[0].APIKey
		}
		proxy := globalProxy
		if len(p.APIKeyEntries) > 0 && p.APIKeyEntries[0].ProxyURL != "" {
			proxy = p.APIKeyEntries[0].ProxyURL
		}

		modelsURL := buildModelsURL(baseURL)
		result := probeEndpoint(modelsURL, "Bearer", apiKey, proxy, name, "openai-compat", hint(apiKey))
		log.Debugf("check provider %s (%s) → %s, %d models, %dms", name, baseURL, result.Status, len(result.Models), result.Latency)
		results = append(results, result)
	}

	// ── 2. Get proxy-known models (aggregated /v1/models) ──
	// We query our own /v1/models endpoint to know which models each provider contributes
	proxyModels := h.getProxyModels()

	// ── 3. OAuth providers: check auth files + show proxy-known models ──
	authDir := cfg.AuthDir
	if authDir == "" {
		authDir = "/home/alex/.cli-proxy-api" // fallback
	}

	oauthProviders := []struct {
		name         string
		typeID       string
		upstreamURL  string
		authKeywords []string // keywords to match in auth file names
	}{
		{
			name: "OpenAI (Codex/ChatGPT)", typeID: "codex",
			upstreamURL:  "https://api.openai.com",
			authKeywords: []string{"codex", "openai", "chatgpt"},
		},
		{
			name: "Anthropic (Claude)", typeID: "anthropic",
			upstreamURL:  "https://api.anthropic.com",
			authKeywords: []string{"anthropic", "claude"},
		},
		{
			name: "Google (Gemini)", typeID: "gemini",
			upstreamURL:  "https://generativelanguage.googleapis.com",
			authKeywords: []string{"gemini", "google"},
		},
		{
			name: "Qwen (Alibaba)", typeID: "qwen",
			upstreamURL:  "https://dashscope.aliyuncs.com",
			authKeywords: []string{"qwen", "dashscope", "alibaba"},
		},
		{
			name: "Moonshot (Kimi)", typeID: "kimi",
			upstreamURL:  "https://api.moonshot.cn",
			authKeywords: []string{"kimi", "moonshot"},
		},
		{
			name: "iFlow", typeID: "iflow",
			upstreamURL:  "https://iflow.cn",
			authKeywords: []string{"iflow"},
		},
		{
			name: "Antigravity", typeID: "antigravity",
			upstreamURL:  "https://antigravity.google",
			authKeywords: []string{"antigravity"},
		},
	}

	for _, op := range oauthProviders {
		hasAuth := checkAuthFiles(authDir, op.authKeywords)
		modelsFromProvider := getModelsForProvider(proxyModels, op.typeID)

		if hasAuth {
			results = append(results, ProviderCheckResult{
				Name:    op.name,
				Type:    op.typeID,
				BaseURL: op.upstreamURL,
				Status:  "oauth-active",
				Models:  modelsFromProvider,
			})
		} else {
			status := "oauth-inactive"
			// If there are no models from this provider in proxy, auth is definitely inactive
			// But if there ARE models, the provider might be using API keys instead of OAuth
			if len(modelsFromProvider) > 0 {
				status = "models-via-proxy"
			}
			results = append(results, ProviderCheckResult{
				Name:    op.name,
				Type:    op.typeID,
				BaseURL: op.upstreamURL,
				Status:  status,
				Models:  modelsFromProvider,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{"providers": results, "allModels": getAllModelIDs(proxyModels)})
}

// getAllModelIDs returns a sorted list of all unique model IDs from proxyModels.
func getAllModelIDs(proxyModels map[string]proxyModelInfo) []string {
	ids := make([]string, 0, len(proxyModels))
	for id := range proxyModels {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

// getProxyModels fetches /v1/models from our own upstream configs (openai-compatibility)
// and returns the aggregated list. Since we're inside the server, we query the configured
// openai-compatibility upstreams directly and also check what models the proxy knows about.
func (h *Handler) getProxyModels() map[string]proxyModelInfo {
	models := make(map[string]proxyModelInfo)

	// Track which model IDs come from openai-compat providers so we can
	// avoid misassigning them to OAuth providers in getModelsForProvider.
	oaiCompatIDs := make(map[string]string) // modelID → provider name

	// First try the proxy's own /v1/models endpoint. This is the most accurate source:
	// it includes live OAuth/Codex models such as gpt-5.2, gpt-5.3-codex, aliases, etc.
	host := strings.TrimSpace(h.cfg.Host)
	if host == "" || host == "0.0.0.0" || host == "::" {
		host = "127.0.0.1"
	}
	port := h.cfg.Port
	if port > 0 {
		url := fmt.Sprintf("http://%s:%d/v1/models", host, port)
		client := &http.Client{Timeout: 5 * time.Second}
		req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, url, nil)
		if err == nil {
			if len(h.cfg.APIKeys) > 0 {
				req.Header.Set("Authorization", "Bearer "+h.cfg.APIKeys[0])
			}
			if resp, errDo := client.Do(req); errDo == nil {
				defer func() { _ = resp.Body.Close() }()
				if resp.StatusCode == http.StatusOK {
					body, _ := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
					var list openAIModelsResp
					if errDecode := json.Unmarshal(body, &list); errDecode == nil {
						for _, m := range list.Data {
							if m.ID != "" {
								models[m.ID] = proxyModelInfo{ownedBy: m.OwnedBy}
							}
						}
					}
				}
			}
		}
	}

	// Fallback/augmentation from openai-compatibility config.
	// Mark these models as routed by their openai-compat provider so that
	// getModelsForProvider can avoid assigning them to OAuth providers.
	for _, p := range h.cfg.OpenAICompatibility {
		for _, m := range p.Models {
			modelID := m.Name
			if m.Alias != "" {
				modelID = m.Alias
			}
			if modelID != "" {
				if existing, exists := models[modelID]; !exists {
					models[modelID] = proxyModelInfo{ownedBy: p.Name, routedBy: p.Name}
				} else {
					// Mark as routed by openai-compat even if we already have it from /v1/models
					existing.routedBy = p.Name
					models[modelID] = existing
				}
				oaiCompatIDs[modelID] = p.Name
			}
			// Also track by upstream (non-aliased) name in case it appears in /v1/models
			if m.Alias != "" && m.Name != modelID {
				if existing, exists := models[m.Name]; !exists {
					models[m.Name] = proxyModelInfo{ownedBy: p.Name, routedBy: p.Name}
				} else {
					existing.routedBy = p.Name
					models[m.Name] = existing
				}
			}
		}
	}

	for provider, entries := range h.cfg.OAuthModelAlias {
		for _, entry := range entries {
			if entry.Alias != "" {
				if _, exists := models[entry.Alias]; !exists {
					models[entry.Alias] = proxyModelInfo{ownedBy: provider}
				}
			}
			if entry.Name != "" {
				if _, exists := models[entry.Name]; !exists {
					models[entry.Name] = proxyModelInfo{ownedBy: provider}
				}
			}
		}
	}

	_ = oaiCompatIDs
	return models
}

// getModelsForProvider returns models associated with an OAuth provider type.
// It uses the routing provenance (routedBy) to avoid misattributing models:
// models that are explicitly routed through an openai-compat provider should not
// appear under OAuth provider sections (e.g. nvidia's "qwen/qwen3-coder-480b"
// should not appear under Qwen).
//
// When routedBy is not set (meaning the model comes from an OAuth/proxy source),
// it uses owned_by and model ID heuristics for matching.
func getModelsForProvider(proxyModels map[string]proxyModelInfo, providerType string) []string {
	var result []string
	for modelID, info := range proxyModels {
		// Models explicitly routed by an openai-compat provider belong to that provider,
		// not to any OAuth provider. Skip them to avoid false cross-assignments
		// (e.g. nvidia's "qwen/qwen3-coder-480b" appearing under Qwen).
		if info.routedBy != "" {
			continue
		}

		ownedBy := info.ownedBy
		if ownedBy != "" {
			switch providerType {
			case "codex":
				if strings.Contains(strings.ToLower(ownedBy), "openai") {
					result = append(result, modelID)
				}
			case "anthropic":
				if strings.Contains(strings.ToLower(ownedBy), "anthropic") {
					result = append(result, modelID)
				}
			case "gemini":
				if strings.Contains(strings.ToLower(ownedBy), "google") {
					result = append(result, modelID)
				}
			case "qwen":
				if strings.Contains(strings.ToLower(ownedBy), "alibaba") || strings.Contains(strings.ToLower(ownedBy), "dashscope") {
					result = append(result, modelID)
				}
			default:
				if strings.Contains(strings.ToLower(ownedBy), providerType) {
					result = append(result, modelID)
				}
			}
			continue
		}

		// owned_by is empty — fall back to model ID heuristics.
		// These are purposefully conservative to avoid false positives like
		// matching nvidia's "qwen/qwen3-coder-480b" to the Qwen provider.
		switch providerType {
		case "codex":
			if strings.Contains(strings.ToLower(modelID), "gpt") ||
				strings.EqualFold(modelID, "brain") || strings.EqualFold(modelID, "code") ||
				strings.EqualFold(modelID, "fast") || strings.Contains(strings.ToLower(modelID), "codex") {
				result = append(result, modelID)
			}
		case "anthropic":
			if strings.Contains(strings.ToLower(modelID), "claude") {
				result = append(result, modelID)
			}
		case "gemini":
			if strings.Contains(strings.ToLower(modelID), "gemini") {
				result = append(result, modelID)
			}
		case "qwen":
			// Only match model IDs that are clearly Qwen-native (e.g. "qwen3-plus"),
			// not cross-provider references like "qwen/qwen3-coder-480b" hosted on NVIDIA.
			if strings.HasPrefix(strings.ToLower(modelID), "qwen") && !strings.Contains(modelID, "/") {
				result = append(result, modelID)
			}
		}
	}

	return result
}

// checkAuthFiles checks if there are auth files matching the keywords
func checkAuthFiles(authDir string, keywords []string) bool {
	if authDir == "" {
		return false
	}

	entries, err := os.ReadDir(authDir)
	if err != nil {
		return false
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := strings.ToLower(entry.Name())
		for _, kw := range keywords {
			if strings.Contains(name, strings.ToLower(kw)) {
				// Check if it's a valid auth file (not just any file)
				data, err := os.ReadFile(filepath.Join(authDir, entry.Name()))
				if err != nil {
					continue
				}
				// Simple check: if file contains "token" or "access" or "refresh", it's likely an auth file
				content := strings.ToLower(string(data))
				if strings.Contains(content, "token") || strings.Contains(content, "access") || strings.Contains(content, "auth") {
					return true
				}
			}
		}
	}

	return false
}

func probeEndpoint(fullURL, authHeader, apiKey, proxy, name, typeID, keyHint string) ProviderCheckResult {
	start := time.Now()

	client := &http.Client{Timeout: providerCheckTimeout}
	if proxy != "" {
		if pu, err := url.Parse(proxy); err == nil {
			client.Transport = &http.Transport{Proxy: http.ProxyURL(pu)}
		}
	}

	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, fullURL, nil)
	if authHeader != "" {
		if authHeader == "Bearer" {
			req.Header.Set("Authorization", "Bearer "+apiKey)
		} else {
			req.Header.Set(authHeader, apiKey)
		}
	}
	req.Header.Set("User-Agent", "CLIProxyAPI/ProviderCheck")

	resp, err := client.Do(req)
	latency := time.Since(start).Milliseconds()

	if err != nil {
		status := "error"
		if strings.Contains(err.Error(), "deadline") || strings.Contains(err.Error(), "timeout") {
			status = "timeout"
		}
		return ProviderCheckResult{
			Name: name, Type: typeID, BaseURL: fullURL,
			Status: status, Error: err.Error(), Latency: latency, APIKeyHint: keyHint,
		}
	}
	defer func() { _ = resp.Body.Close() }()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024)) // 2MB

	if resp.StatusCode == http.StatusOK {
		models := parseModelsList(body)
		return ProviderCheckResult{
			Name: name, Type: typeID, BaseURL: fullURL,
			Status: "ok", Models: models, Latency: latency, APIKeyHint: keyHint,
		}
	}

	// Detect 404 → provider has no /v1/models endpoint
	errMsg := fmt.Sprintf("HTTP %d: %s", resp.StatusCode, truncateStr(string(body), 250))
	status := "error"
	if resp.StatusCode == http.StatusNotFound {
		status = "no-models-endpoint"
	}
	return ProviderCheckResult{
		Name: name, Type: typeID, BaseURL: fullURL,
		Status: status, Error: errMsg, Latency: latency, APIKeyHint: keyHint,
	}
}

// ModelsStaleResult contains the list of models that are in config but not available in upstream.
type ModelsStaleResult struct {
	Providers  []ProviderStaleModels `json:"providers"`
	TotalStale int                   `json:"totalStale"`
}

// ProviderStaleModels shows stale models for a single provider.
type ProviderStaleModels struct {
	Name       string   `json:"name"`
	BaseURL    string   `json:"baseUrl"`
	Configured []string `json:"configured"` // models in config
	Upstream   []string `json:"upstream"`   // models returned by upstream
	Stale      []string `json:"stale"`      // models in config but NOT in upstream
}

// GetStaleModels returns models that are configured but not available in upstream.
// GET /v0/management/models/stale
func (h *Handler) GetStaleModels(c *gin.Context) {
	if h == nil || h.cfg == nil {
		c.JSON(http.StatusOK, gin.H{"providers": []ProviderStaleModels{}, "totalStale": 0})
		return
	}

	cfg := h.cfg
	globalProxy := cfg.ProxyURL
	var results []ProviderStaleModels

	// Check each openai-compatibility provider
	for _, p := range cfg.OpenAICompatibility {
		name := p.Name
		baseURL := strings.TrimRight(p.BaseURL, "/")
		if baseURL == "" {
			continue
		}

		// Get configured models from config
		var configuredModels []string
		for _, m := range p.Models {
			configuredModels = append(configuredModels, m.Name)
			if m.Alias != "" && m.Alias != m.Name {
				configuredModels = append(configuredModels, m.Alias)
			}
		}

		// Get API key
		var apiKey string
		if len(p.APIKeyEntries) > 0 {
			apiKey = p.APIKeyEntries[0].APIKey
		}

		// Use proxy from config if set
		proxy := globalProxy
		if len(p.APIKeyEntries) > 0 && p.APIKeyEntries[0].ProxyURL != "" {
			proxy = p.APIKeyEntries[0].ProxyURL
		}

		// Probe upstream for models
		modelsURL := buildModelsURL(baseURL)
		result := probeEndpoint(modelsURL, "Bearer", apiKey, proxy, name, "openai-compat", hint(apiKey))

		// Find stale models (in config but not in upstream)
		upstreamMap := make(map[string]bool)
		for _, m := range result.Models {
			upstreamMap[m] = true
		}

		var stale []string
		for _, m := range configuredModels {
			if !upstreamMap[m] {
				stale = append(stale, m)
			}
		}

		results = append(results, ProviderStaleModels{
			Name:       name,
			BaseURL:    baseURL,
			Configured: configuredModels,
			Upstream:   result.Models,
			Stale:      stale,
		})
	}

	// Count total stale models
	totalStale := 0
	for _, r := range results {
		totalStale += len(r.Stale)
	}

	c.JSON(http.StatusOK, ModelsStaleResult{
		Providers:  results,
		TotalStale: totalStale,
	})
}

// RemoveStaleModels removes models that are in config but not available in upstream.
// POST /v0/management/models/cleanup
func (h *Handler) RemoveStaleModels(c *gin.Context) {
	if h == nil || h.cfg == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "handler not initialized"})
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	cfg := h.cfg
	globalProxy := cfg.ProxyURL

	var removed []string

	// For each openai-compatibility provider, find and remove stale models
	for i := range cfg.OpenAICompatibility {
		p := &cfg.OpenAICompatibility[i]
		name := p.Name
		baseURL := strings.TrimRight(p.BaseURL, "/")
		if baseURL == "" {
			continue
		}

		// Get API key and proxy
		var apiKey string
		if len(p.APIKeyEntries) > 0 {
			apiKey = p.APIKeyEntries[0].APIKey
		}
		proxy := globalProxy
		if len(p.APIKeyEntries) > 0 && p.APIKeyEntries[0].ProxyURL != "" {
			proxy = p.APIKeyEntries[0].ProxyURL
		}

		// Get upstream models
		modelsURL := buildModelsURL(baseURL)
		result := probeEndpoint(modelsURL, "Bearer", apiKey, proxy, name, "openai-compat", hint(apiKey))

		if result.Status != "ok" {
			log.Printf("cleanup: skipping %s (status: %s)", name, result.Status)
			continue
		}

		// Build upstream model map
		upstreamMap := make(map[string]bool)
		for _, m := range result.Models {
			upstreamMap[m] = true
		}

		// Filter out stale models
		var keptModels []config.OpenAICompatibilityModel
		for _, m := range p.Models {
			// Keep if model name is in upstream
			if upstreamMap[m.Name] {
				keptModels = append(keptModels, m)
			} else {
				// Also check if it's an alias to another model that's in upstream
				if m.Alias != "" && m.Alias != m.Name && upstreamMap[m.Alias] {
					keptModels = append(keptModels, m)
				} else {
					removed = append(removed, m.Name)
					if m.Alias != "" {
						removed = append(removed, m.Alias)
					}
				}
			}
		}

		p.Models = keptModels
	}

	// Save the updated config
	if err := config.SaveConfigPreserveComments(h.configFilePath, cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to save config: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"removed": removed,
		"total":   len(removed),
		"message": fmt.Sprintf("Removed %d stale models from config", len(removed)),
	})
}

func parseModelsList(body []byte) []string {
	// OpenAI format: {"data": [{"id": "..."}]}
	var oi openAIModelsResp
	if err := json.Unmarshal(body, &oi); err == nil && len(oi.Data) > 0 {
		ids := make([]string, 0, len(oi.Data))
		for _, m := range oi.Data {
			ids = append(ids, m.ID)
		}
		return ids
	}

	// Gemini format: {"models": [{"name": "models/..."}]}
	var gi struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	if err := json.Unmarshal(body, &gi); err == nil && len(gi.Models) > 0 {
		ids := make([]string, 0, len(gi.Models))
		for _, m := range gi.Models {
			ids = append(ids, strings.TrimPrefix(m.Name, "models/"))
		}
		return ids
	}

	return nil
}

// buildModelsURL constructs the /models endpoint URL from a base URL.
// If the base URL already ends with /v1, it appends only /models;
// otherwise it appends /v1/models.
func buildModelsURL(baseURL string) string {
	u := strings.TrimRight(baseURL, "/")
	if strings.HasSuffix(u, "/v1") {
		return u + "/models"
	}
	return u + "/v1/models"
}

func hint(k string) string {
	if len(k) >= 4 {
		return k[:4] + "..."
	}
	return ""
}

func truncateStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
