package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCORSMiddleware(t *testing.T) {
	nextCalled := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		w.WriteHeader(http.StatusNoContent)
	})
	handler := corsMiddleware(next)

	t.Run("adds headers to regular requests", func(t *testing.T) {
		nextCalled = false
		request := httptest.NewRequest(http.MethodGet, "/", nil)
		response := httptest.NewRecorder()

		handler.ServeHTTP(response, request)

		if !nextCalled {
			t.Fatal("next handler was not called")
		}
		if response.Code != http.StatusNoContent {
			t.Fatalf("status = %d, want %d", response.Code, http.StatusNoContent)
		}
		if origin := response.Header().Get("Access-Control-Allow-Origin"); origin != "*" {
			t.Fatalf("allow origin = %q, want %q", origin, "*")
		}
	})

	t.Run("handles preflight without calling next", func(t *testing.T) {
		nextCalled = false
		request := httptest.NewRequest(http.MethodOptions, "/", nil)
		response := httptest.NewRecorder()

		handler.ServeHTTP(response, request)

		if nextCalled {
			t.Fatal("next handler was called for preflight")
		}
		if response.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
		}
	})
}

func TestRecoverMiddleware(t *testing.T) {
	handler := recoverMiddleware(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("boom")
	}))
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusInternalServerError {
		t.Fatalf(
			"status = %d, want %d",
			response.Code,
			http.StatusInternalServerError,
		)
	}
	if !strings.Contains(response.Body.String(), "internal server error") {
		t.Fatalf("body = %q, want internal server error", response.Body.String())
	}
}
