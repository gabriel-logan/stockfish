package main

import "os"

type Config struct {
	Port          string
	StockfishPath string
}

func LoadConfig() Config {
	return Config{
		Port:          os.Getenv("PORT"),
		StockfishPath: os.Getenv("STOCKFISH_PATH"),
	}
}
