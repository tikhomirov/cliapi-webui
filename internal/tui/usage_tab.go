package tui

import (
	tea "github.com/charmbracelet/bubbletea"
)

// usageTabModel is a stub for the usage tab (placeholder implementation).
type usageTabModel struct{}

func newUsageTabModel(_ *Client) usageTabModel {
	return usageTabModel{}
}

func (m usageTabModel) Init() tea.Cmd                               { return nil }
func (m usageTabModel) SetSize(w, h int)                            {}
func (m usageTabModel) Update(msg tea.Msg) (usageTabModel, tea.Cmd) { return m, nil }
func (m usageTabModel) View() string                                { return "\n  Usage statistics placeholder\n" }
