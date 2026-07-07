package main

import "os"

type Config struct {
	Port          string
	StockfishPath string
}

// LoadConfig reads configuration from environment variables.
// PORT and STOCKFISH_PATH must be set externally; no defaults are provided.
func LoadConfig() Config {
	return Config{
		Port:          os.Getenv("PORT"),
		StockfishPath: os.Getenv("STOCKFISH_PATH"),
	}
}
