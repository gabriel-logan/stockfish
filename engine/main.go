package main

import (
	"fmt"
	"log"
	"net/http"
)

func main() {
	cfg := LoadConfig()

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status": "ok"}`))
	})

	mux.HandleFunc("/ws", handleWS(cfg))
	mux.HandleFunc("/analyze", handleAnalyze(cfg.StockfishPath))

	h := corsMiddleware(mux)
	h = recoverMiddleware(h)

	server := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: h,
	}

	fmt.Printf("server starting on http://localhost:%s (stockfish: %s)\n", cfg.Port, cfg.StockfishPath)
	if err := server.ListenAndServe(); err != nil {
		log.Fatalf("server: %v", err)
	}
}
