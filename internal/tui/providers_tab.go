package tui

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// providersTabModel displays all providers and their models with filtering.
type providersTabModel struct {
	client       *Client
	viewport     viewport.Model
	providers    []providerEntry
	allModels    []string // full list from /v1/models (server-aggregated)
	filterInput  textinput.Model
	filterActive bool
	err          error
	width        int
	height       int
	ready        bool
}

// providerEntry mirrors the ProviderCheckResult JSON from the management API.
type providerEntry struct {
	Name       string   `json:"name"`
	BaseURL    string   `json:"baseUrl"`
	Type       string   `json:"type"`
	Status     string   `json:"status"`
	Models     []string `json:"models"`
	Error      string   `json:"error,omitempty"`
	LatencyMs  int64    `json:"latencyMs"`
	APIKeyHint string   `json:"apiKeyHint,omitempty"`
}

type providersDataMsg struct {
	providers []providerEntry
	allModels []string
	err       error
}

func newProvidersTabModel(client *Client) providersTabModel {
	ti := textinput.New()
	ti.CharLimit = 256
	ti.Placeholder = T("providers_filter_placeholder")
	ti.Prompt = "  🔍 "
	return providersTabModel{
		client:      client,
		filterInput: ti,
	}
}

func (m providersTabModel) Init() tea.Cmd {
	return m.fetchProviders
}

func (m providersTabModel) fetchProviders() tea.Msg {
	result := providersDataMsg{}

	data, err := m.client.getJSON("/v0/management/providers/check")
	if err != nil {
		result.err = err
		return result
	}

	arr, ok := data["providers"]
	if !ok || arr == nil {
		result.err = fmt.Errorf("no providers data")
		return result
	}

	raw, errMarshal := json.Marshal(arr)
	if errMarshal != nil {
		result.err = errMarshal
		return result
	}

	var entries []providerEntry
	if errUnmarshal := json.Unmarshal(raw, &entries); errUnmarshal != nil {
		result.err = errUnmarshal
		return result
	}

	result.providers = entries

	// Also extract the full aggregated model list from allModels field.
	allModelsRaw, ok := data["allModels"]
	if ok && allModelsRaw != nil {
		rawAll, errM := json.Marshal(allModelsRaw)
		if errM == nil {
			var allModels []string
			if errU := json.Unmarshal(rawAll, &allModels); errU == nil {
				result.allModels = allModels
			}
		}
	}

	return result
}

func (m providersTabModel) Update(msg tea.Msg) (providersTabModel, tea.Cmd) {
	switch msg := msg.(type) {
	case localeChangedMsg:
		// Update placeholder on locale change
		m.filterInput.Placeholder = T("providers_filter_placeholder")
		m.viewport.SetContent(m.renderContent())
		return m, nil

	case providersDataMsg:
		if msg.err != nil {
			m.err = msg.err
		} else {
			m.err = nil
			m.providers = msg.providers
			m.allModels = msg.allModels
		}
		m.viewport.SetContent(m.renderContent())
		return m, nil

	case tea.KeyMsg:
		// --- Filter mode ---
		if m.filterActive {
			switch msg.String() {
			case "enter":
				m.filterActive = false
				m.filterInput.Blur()
				m.viewport.SetContent(m.renderContent())
				return m, nil
			case "esc":
				if m.filterInput.Value() == "" {
					m.filterActive = false
					m.filterInput.Blur()
				} else {
					m.filterInput.SetValue("")
				}
				m.viewport.SetContent(m.renderContent())
				return m, nil
			default:
				var cmd tea.Cmd
				m.filterInput, cmd = m.filterInput.Update(msg)
				m.viewport.SetContent(m.renderContent())
				return m, cmd
			}
		}

		// --- Normal mode ---
		switch msg.String() {
		case "r":
			return m, m.fetchProviders
		case "/":
			m.filterActive = true
			m.filterInput.Focus()
			m.viewport.SetContent(m.renderContent())
			return m, textinput.Blink
		default:
			var cmd tea.Cmd
			m.viewport, cmd = m.viewport.Update(msg)
			return m, cmd
		}
	}

	var cmd tea.Cmd
	m.viewport, cmd = m.viewport.Update(msg)
	return m, cmd
}

func (m *providersTabModel) SetSize(w, h int) {
	m.width = w
	m.height = h
	m.filterInput.Width = w - 10
	if !m.ready {
		m.viewport = viewport.New(w, h)
		m.viewport.SetContent(m.renderContent())
		m.ready = true
	} else {
		m.viewport.Width = w
		m.viewport.Height = h
	}
}

func (m providersTabModel) View() string {
	if !m.ready {
		return T("loading")
	}
	return m.viewport.View()
}

func (m providersTabModel) renderContent() string {
	var sb strings.Builder

	sb.WriteString(titleStyle.Render(T("providers_title")))
	sb.WriteString("\n")
	sb.WriteString(helpStyle.Render(T("providers_help")))
	sb.WriteString("\n")

	// Filter line
	if m.filterActive || m.filterInput.Value() != "" {
		sb.WriteString(m.filterInput.View())
		sb.WriteString("\n")
	} else {
		sb.WriteString(helpStyle.Render(T("providers_filter_hint")))
		sb.WriteString("\n")
	}

	sb.WriteString(strings.Repeat("─", m.width))
	sb.WriteString("\n")

	if m.err != nil {
		sb.WriteString(errorStyle.Render(T("error_prefix") + m.err.Error()))
		sb.WriteString("\n")
		return sb.String()
	}

	if len(m.providers) == 0 && len(m.allModels) == 0 {
		sb.WriteString(subtitleStyle.Render(T("providers_no_data")))
		sb.WriteString("\n")
		return sb.String()
	}

	filter := strings.ToLower(m.filterInput.Value())

	// ─── All Models (aggregated from /v1/models) ───
	if len(m.allModels) > 0 {
		var filteredAll []string
		if filter != "" {
			for _, model := range m.allModels {
				if strings.Contains(strings.ToLower(model), filter) {
					filteredAll = append(filteredAll, model)
				}
			}
		} else {
			filteredAll = m.allModels
		}

		if len(filteredAll) > 0 {
			allHeader := fmt.Sprintf("  %s %s (%d %s)", "📋", T("providers_all_models"), len(filteredAll), T("providers_models"))
			sb.WriteString(lipgloss.NewStyle().Bold(true).Foreground(colorInfo).Render(allHeader))
			sb.WriteString("\n\n")

			sorted := make([]string, len(filteredAll))
			copy(sorted, filteredAll)
			sort.Strings(sorted)
			sb.WriteString(renderModelColumns(sorted, m.width))
			sb.WriteString("\n")
		}
	}

	// ─── Per-Provider sections ───
	totalModels := 0
	shownModels := 0

	for _, p := range m.providers {
		modelCount := len(p.Models)
		totalModels += modelCount

		// Filter models
		var filteredModels []string
		if filter != "" {
			for _, model := range p.Models {
				if strings.Contains(strings.ToLower(model), filter) {
					filteredModels = append(filteredModels, model)
				}
			}
		} else {
			filteredModels = p.Models
		}

		// If filtering, skip providers with no matching models
		if filter != "" && len(filteredModels) == 0 {
			continue
		}

		shownModels += len(filteredModels)

		// Provider header
		sIcon := statusIcon(p.Status)
		typeLabel := providerTypeLabel(p.Type)

		header := fmt.Sprintf("  %s %s", sIcon, p.Name)
		if typeLabel != "" {
			header += fmt.Sprintf("  [%s]", typeLabel)
		}
		header += fmt.Sprintf("  (%d %s)", len(filteredModels), T("providers_models"))
		if p.LatencyMs > 0 {
			header += fmt.Sprintf("  %dms", p.LatencyMs)
		}

		providerStyle := lipgloss.NewStyle().Bold(true).Foreground(providerColor(p.Status))
		sb.WriteString(providerStyle.Render(header))
		sb.WriteString("\n")

		// Status label
		statusLabel := statusTextLabel(p.Status)
		if statusLabel != "" {
			sb.WriteString(lipgloss.NewStyle().Foreground(colorMuted).Render(fmt.Sprintf("    %s", statusLabel)))
			sb.WriteString("\n")
		}

		// Base URL
		if p.BaseURL != "" {
			sb.WriteString(lipgloss.NewStyle().Foreground(colorMuted).Render(fmt.Sprintf("    %s", p.BaseURL)))
			sb.WriteString("\n")
		}

		// Error info
		if p.Error != "" {
			errText := truncateProviderStr(p.Error, 120)
			sb.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("196")).Render(fmt.Sprintf("    ⚠ %s", errText)))
			sb.WriteString("\n")
		}

		// API key hint
		if p.APIKeyHint != "" {
			sb.WriteString(lipgloss.NewStyle().Foreground(colorMuted).Render(fmt.Sprintf("    🔑 %s", p.APIKeyHint)))
			sb.WriteString("\n")
		}

		// Models
		if len(filteredModels) > 0 {
			sb.WriteString("\n")

			sorted := make([]string, len(filteredModels))
			copy(sorted, filteredModels)
			sort.Strings(sorted)
			sb.WriteString(renderModelColumns(sorted, m.width))
		}

		sb.WriteString("\n")
	}

	// Summary line
	summary := fmt.Sprintf(T("providers_summary"), totalModels, len(m.providers))
	if filter != "" {
		summary = fmt.Sprintf(T("providers_summary_filtered"), shownModels, len(m.providers), filter)
	}
	if len(m.allModels) > 0 {
		summary += fmt.Sprintf("  •  %s: %d", T("providers_all_models"), len(m.allModels))
	}
	sb.WriteString(lipgloss.NewStyle().Bold(true).Foreground(colorInfo).Render("  " + summary))
	sb.WriteString("\n")

	return sb.String()
}

// renderModelColumns renders a list of models in a column layout.
func renderModelColumns(models []string, width int) string {
	var sb strings.Builder

	maxModelWidth := 42
	if width <= 0 {
		// Fallback: single column
		for _, model := range models {
			sb.WriteString(fmt.Sprintf("    • %s\n", model))
		}
		return sb.String()
	}

	cols := width / maxModelWidth
	if cols < 1 {
		cols = 1
	}
	if cols > 4 {
		cols = 4
	}
	colWidth := (width - 4) / cols

	rows := (len(models) + cols - 1) / cols
	for row := 0; row < rows; row++ {
		var parts []string
		for col := 0; col < cols; col++ {
			idx := row + col*rows
			if idx < len(models) {
				parts = append(parts, truncate(models[idx], colWidth-2))
			}
		}
		sb.WriteString("    ")
		sb.WriteString(strings.Join(parts, strings.Repeat(" ", 2)))
		sb.WriteString("\n")
	}

	return sb.String()
}

func statusIcon(status string) string {
	switch status {
	case "ok":
		return "✅"
	case "oauth-active":
		return "🟢"
	case "oauth-inactive":
		return "🟡"
	case "models-via-proxy":
		return "🔷"
	case "timeout":
		return "⏱️"
	case "error", "no-models-endpoint":
		return "❌"
	default:
		return "❓"
	}
}

func statusTextLabel(status string) string {
	switch status {
	case "ok":
		return T("providers_status_ok")
	case "oauth-active":
		return T("providers_status_oauth_active")
	case "oauth-inactive":
		return T("providers_status_oauth_inactive")
	case "models-via-proxy":
		return T("providers_status_models_via_proxy")
	case "timeout":
		return T("providers_status_timeout")
	case "error":
		return T("providers_status_error")
	case "no-models-endpoint":
		return T("providers_status_no_models")
	default:
		return status
	}
}

func providerColor(status string) lipgloss.Color {
	switch status {
	case "ok":
		return lipgloss.Color("82")
	case "oauth-active":
		return lipgloss.Color("82")
	case "oauth-inactive":
		return lipgloss.Color("214")
	case "models-via-proxy":
		return lipgloss.Color("111")
	case "timeout":
		return lipgloss.Color("214")
	case "error", "no-models-endpoint":
		return lipgloss.Color("196")
	default:
		return colorText
	}
}

func providerTypeLabel(typeID string) string {
	switch typeID {
	case "openai-compat":
		return "OpenAI Compat"
	case "codex":
		return "Codex/OpenAI"
	case "anthropic":
		return "Anthropic"
	case "gemini":
		return "Gemini"
	case "vertex":
		return "Vertex AI"
	case "qwen":
		return "Qwen"
	case "kimi":
		return "Kimi"
	case "iflow":
		return "iFlow"
	case "antigravity":
		return "Antigravity"
	default:
		return typeID
	}
}

func truncateProviderStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
