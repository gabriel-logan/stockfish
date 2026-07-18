package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandleAnalyzeRejectsUnsupportedMethod(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/analyze", nil)
	response := httptest.NewRecorder()

	handleAnalyze("unused").ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf(
			"status = %d, want %d",
			response.Code,
			http.StatusMethodNotAllowed,
		)
	}
}

func TestHandleAnalyzeRejectsInvalidJSON(t *testing.T) {
	request := httptest.NewRequest(
		http.MethodPost,
		"/analyze",
		strings.NewReader("{invalid"),
	)
	response := httptest.NewRecorder()

	handleAnalyze("unused").ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusBadRequest)
	}
	if !strings.Contains(response.Body.String(), "invalid json") {
		t.Fatalf("body = %q, want invalid json", response.Body.String())
	}
}

func TestHandleAnalyzeReportsEngineStartFailure(t *testing.T) {
	request := httptest.NewRequest(
		http.MethodPost,
		"/analyze",
		strings.NewReader(`{"fen":"startpos","depth":1}`),
	)
	response := httptest.NewRecorder()

	handleAnalyze("/path/that/does/not/exist").ServeHTTP(response, request)

	if response.Code != http.StatusInternalServerError {
		t.Fatalf(
			"status = %d, want %d",
			response.Code,
			http.StatusInternalServerError,
		)
	}
	if !strings.Contains(response.Body.String(), "engine init failed") {
		t.Fatalf("body = %q, want engine init failed", response.Body.String())
	}
}
