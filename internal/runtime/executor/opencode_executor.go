package executor

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
	cliproxyauth "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/auth"
	cliproxyexecutor "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/executor"
)

// OpenCodeExecutor is a placeholder executor for OpenCode-style providers (opencode/opencode-zen/opencode-go).
//
// The project supports these provider keys in the auth layer, but the full runtime integration
// depends on the downstream OpenCode implementation (binary/API). For setups that do not use
// OpenCode providers, this executor keeps the build working and returns a clear 501 error.
//
// When OpenCode support is enabled, this executor should be replaced with a real implementation.
type OpenCodeExecutor struct {
	provider string
	cfg      *config.Config
}

func NewOpenCodeExecutor(provider string, cfg *config.Config) *OpenCodeExecutor {
	provider = strings.ToLower(strings.TrimSpace(provider))
	if provider == "" {
		provider = "opencode"
	}
	return &OpenCodeExecutor{provider: provider, cfg: cfg}
}

func (e *OpenCodeExecutor) Identifier() string { return e.provider }

func (e *OpenCodeExecutor) Execute(ctx context.Context, auth *cliproxyauth.Auth, req cliproxyexecutor.Request, opts cliproxyexecutor.Options) (cliproxyexecutor.Response, error) {
	return cliproxyexecutor.Response{}, statusErr{code: http.StatusNotImplemented, msg: "opencode executor is not implemented"}
}

func (e *OpenCodeExecutor) ExecuteStream(ctx context.Context, auth *cliproxyauth.Auth, req cliproxyexecutor.Request, opts cliproxyexecutor.Options) (*cliproxyexecutor.StreamResult, error) {
	// Return a closed channel to avoid downstream goroutine leaks.
	ch := make(chan cliproxyexecutor.StreamChunk)
	close(ch)
	return &cliproxyexecutor.StreamResult{Headers: http.Header{}, Chunks: ch}, statusErr{code: http.StatusNotImplemented, msg: "opencode executor is not implemented"}
}

func (e *OpenCodeExecutor) Refresh(ctx context.Context, auth *cliproxyauth.Auth) (*cliproxyauth.Auth, error) {
	return auth, nil
}

func (e *OpenCodeExecutor) CountTokens(ctx context.Context, auth *cliproxyauth.Auth, req cliproxyexecutor.Request, opts cliproxyexecutor.Options) (cliproxyexecutor.Response, error) {
	return cliproxyexecutor.Response{}, statusErr{code: http.StatusNotImplemented, msg: "opencode token counting is not implemented"}
}

func (e *OpenCodeExecutor) HttpRequest(ctx context.Context, auth *cliproxyauth.Auth, req *http.Request) (*http.Response, error) {
	return nil, fmt.Errorf("opencode executor: raw http requests are not supported")
}
