package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func requestWithClaims(path, role string) *http.Request {
	request := httptest.NewRequest(http.MethodGet, path, nil)
	return request.WithContext(context.WithValue(request.Context(), claimsKey, &Claims{UserID: "user-1", Role: role}))
}

func TestRequireRole(t *testing.T) {
	called := false
	handler := RequireRole("system_admin")(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { called = true }))

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, requestWithClaims("/v1/admin/users", "system_admin"))
	if response.Code != http.StatusOK || !called {
		t.Fatalf("expected system admin request to pass, got status %d", response.Code)
	}

	called = false
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, requestWithClaims("/v1/admin/users", "member"))
	if response.Code != http.StatusForbidden || called {
		t.Fatalf("expected member request to be forbidden, got status %d", response.Code)
	}
}

func TestSystemAdminBoundary(t *testing.T) {
	tests := []struct {
		name       string
		path       string
		role       string
		wantStatus int
		wantCalled bool
	}{
		{name: "blocks financial API", path: "/v1/accounts", role: "system_admin", wantStatus: http.StatusForbidden},
		{name: "allows admin API", path: "/v1/admin/users", role: "system_admin", wantStatus: http.StatusNoContent, wantCalled: true},
		{name: "allows prefixed admin API", path: "/api/v1/admin/backups", role: "system_admin", wantStatus: http.StatusNoContent, wantCalled: true},
		{name: "allows member financial API", path: "/v1/accounts", role: "member", wantStatus: http.StatusNoContent, wantCalled: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			called := false
			handler := SystemAdminBoundary(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				called = true
				w.WriteHeader(http.StatusNoContent)
			}))
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, requestWithClaims(test.path, test.role))
			if response.Code != test.wantStatus || called != test.wantCalled {
				t.Fatalf("got status %d and called=%t, want %d and %t", response.Code, called, test.wantStatus, test.wantCalled)
			}
		})
	}
}
