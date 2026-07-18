package main

import (
	"log/slog"
	"net/http"
	"os"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	cfg := LoadConfig()

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status": "ok"}`))
	})

	mux.HandleFunc("/ws", handleWS(cfg))
	mux.HandleFunc("/analyze", handleAnalyze(cfg.StockfishPath))

	h := corsMiddleware(mux)
	h = requestLoggingMiddleware(h)
	h = recoverMiddleware(h)

	server := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: h,
	}

	slog.Info("starting engine server", "port", cfg.Port, "stockfish_path", cfg.StockfishPath)
	if err := server.ListenAndServe(); err != nil {
		if err != http.ErrServerClosed {
			slog.Error("engine server stopped", "error", err)
			os.Exit(1)
		}
	}
}
