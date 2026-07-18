package main

import "testing"

func TestLoadConfig(t *testing.T) {
	t.Setenv("PORT", "8080")
	t.Setenv("STOCKFISH_PATH", "/usr/local/bin/stockfish")

	config := LoadConfig()

	if config.Port != "8080" {
		t.Fatalf("Port = %q, want %q", config.Port, "8080")
	}
	if config.StockfishPath != "/usr/local/bin/stockfish" {
		t.Fatalf(
			"StockfishPath = %q, want %q",
			config.StockfishPath,
			"/usr/local/bin/stockfish",
		)
	}
}
