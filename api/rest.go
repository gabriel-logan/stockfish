package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"
)

func handleAnalyze(stockfishPath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req AnalyzeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
			return
		}

		if req.FEN == "" {
			req.FEN = "startpos"
		}
		if req.Depth <= 0 {
			req.Depth = 20
		}
		if req.MultiPV <= 0 {
			req.MultiPV = 1
		}

		sf, err := NewStockfish(stockfishPath)
		if err != nil {
			log.Printf("stockfish init: %v", err)
			http.Error(w, `{"error":"engine init failed"}`, http.StatusInternalServerError)
			return
		}
		defer sf.Close()

		moves := strings.Fields(req.Moves)
		if err := sf.SetPosition(req.FEN, moves); err != nil {
			http.Error(w, `{"error":"set position failed"}`, http.StatusInternalServerError)
			return
		}

		if err := sf.GoDepth(req.Depth, req.MultiPV); err != nil {
			http.Error(w, `{"error":"analysis start failed"}`, http.StatusInternalServerError)
			return
		}

		lines := sf.Lines()
		analysis := make([]WSMessage, 0)
		var bestMove, ponder string

		timeout := time.After(5 * time.Minute)

	loop:
		for {
			select {
			case line, ok := <-lines:
				if !ok {
					break loop
				}
				msg := parseSFLine(line)
				if msg == nil {
					continue
				}
				switch msg.Type {
				case "analysis":
					filtered := WSMessage{
						Type:     "analysis",
						Depth:    msg.Depth,
						SelDepth: msg.SelDepth,
						MultiPV:  msg.MultiPV,
						Score:    msg.Score,
						Mate:     msg.Mate,
						PV:       msg.PV,
						Nodes:    msg.Nodes,
						NPS:      msg.NPS,
						Time:     msg.Time,
					}
					analysis = append(analysis, filtered)
				case "bestmove":
					bestMove = msg.BestMove
					ponder = msg.Ponder
					break loop
				}
			case <-timeout:
				sf.Stop()
				break loop
			}
		}

		resp := AnalyzeResponse{
			BestMove: bestMove,
			Ponder:   ponder,
			Analysis: analysis,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}
