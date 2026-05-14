package management

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
	log "github.com/sirupsen/logrus"
)

// SyncProviderModelsResult contains the sync result for all providers.
type SyncProviderModelsResult struct {
	Providers []SyncProviderResult `json:"providers"`
	Success   int                 `json:"success"`
	Failed    int                 `json:"failed"`
	Total     int                 `json:"total"`
}

// SyncProviderResult contains the sync result for a single provider.
type SyncProviderResult struct {
	Name       string   `json:"name"`
	BaseURL    string   `json:"baseUrl"`
	Status     string   `json:"status"` // "ok", "error", "timeout", "no-models-endpoint"
	Models     []string `json:"models"` // models from upstream (after sync)
	Error      string   `json:"error,omitempty"`
	Latency    int64    `json:"latencyMs"`
	OldCount   int      `json:"oldCount"`   // number of models before sync
	NewCount   int      `json:"newCount"`   // number of models after sync
}

// SyncProviderModels fetches models from all openai-compatibility providers
// and updates the config with the fetched models.
//
// POST /v0/management/providers/sync-models
func (h *Handler) SyncProviderModels(c *gin.Context) {
	if h == nil || h.cfg == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "config not available"})
		return
	}

	cfg := h.cfg
	globalProxy := cfg.ProxyURL
	var results []SyncProviderResult
	successCount := 0
	failedCount := 0

	// Sync models for each openai-compatibility provider
	for i, p := range cfg.OpenAICompatibility {
		name := p.Name
		baseURL := trimRightSlash(p.BaseURL)
		if baseURL == "" {
			results = append(results, SyncProviderResult{
				Name: name, BaseURL: baseURL, Status: "error",
				Error: "base-url is empty", OldCount: len(p.Models),
			})
			failedCount++
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
		oldCount := len(p.Models)

		// Probe the provider's /models endpoint
		result := probeEndpoint(modelsURL, "Bearer", apiKey, proxy, name, "openai-compat", hint(apiKey))

		// Create sync result
		syncResult := SyncProviderResult{
			Name:     name,
			BaseURL:  baseURL,
			Status:   result.Status,
			Models:   result.Models,
			Error:    result.Error,
			Latency:  result.Latency,
			OldCount: oldCount,
			NewCount: len(result.Models),
		}

		// Update config with fetched models if successful
		if result.Status == "ok" && len(result.Models) > 0 {
			// Convert models string slice to OpenAICompatibilityModel slice
			newModels := make([]config.OpenAICompatibilityModel, len(result.Models))
			for j, modelID := range result.Models {
				newModels[j] = config.OpenAICompatibilityModel{
					Name:  modelID,
					Alias: "", // No alias by default
				}
			}

			// Update the provider in config
			cfg.OpenAICompatibility[i].Models = newModels

			successCount++
			log.Infof("synced models for provider %s: %d → %d models", name, oldCount, len(newModels))
		} else {
			failedCount++
			log.Warnf("failed to sync models for provider %s: %s", name, result.Error)
		}

		results = append(results, syncResult)
	}

	// Save the updated config to disk
	if successCount > 0 {
		if err := config.SaveConfigPreserveComments(h.configFilePath, h.cfg); err != nil {
			log.Errorf("failed to save config after syncing models: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "failed to save config",
				"providers": results,
			})
			return
		}
		log.Info("config saved successfully after syncing provider models")
	}

	c.JSON(http.StatusOK, SyncProviderModelsResult{
		Providers: results,
		Success:   successCount,
		Failed:    failedCount,
		Total:     len(cfg.OpenAICompatibility),
	})
}

// trimRightSlash removes trailing slash from URL if present.
func trimRightSlash(s string) string {
	if len(s) == 0 {
		return s
	}
	if s[len(s)-1] == '/' {
		return s[:len(s)-1]
	}
	return s
}
