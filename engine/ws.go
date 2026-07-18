package main

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	websocketWriteWait  = 10 * time.Second
	websocketPongWait   = 60 * time.Second
	websocketPingPeriod = 25 * time.Second
)

type searchState struct {
	mu            sync.Mutex
	active        bool
	dropBestMoves int
}

func (s *searchState) IsActive() bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.active
}

func (s *searchState) MarkStarted() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.active = true
}

func (s *searchState) MarkStoppedByClient() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.active {
		s.dropBestMoves += 1
	}

	s.active = false
}

func (s *searchState) ShouldDropBestMove() bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.dropBestMoves > 0 {
		s.dropBestMoves -= 1
		return true
	}

	s.active = false
	return false
}

// writeBinaryMsg marshals v to JSON and sends it as a WebSocket binary message.
func writeBinaryMsg(conn *websocket.Conn, v any) error {
	b, err := json.Marshal(v)

	if err != nil {
		return err
	}

	return conn.WriteMessage(websocket.BinaryMessage, b)
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func handleWS(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			slog.WarnContext(r.Context(), "websocket upgrade failed", "error", err)
			return
		}

		sf, err := NewStockfish(cfg.StockfishPath)
		if err != nil {
			slog.ErrorContext(r.Context(), "stockfish initialization failed", "error", err)

			writeBinaryMsg(conn, WSMessage{Type: "error", Error: "engine init failed"})

			conn.Close()
			return
		}

		writeBinaryMsg(conn, WSMessage{Type: "ready"})

		state := &searchState{}
		var closeOnce sync.Once
		shutdown := func() {
			closeOnce.Do(func() {
				conn.Close()
				sf.Close()
			})
		}

		safeGo("websocket write pump", func() {
			writePump(conn, sf, state, shutdown)
		})
		safeGo("websocket read pump", func() {
			readPump(conn, sf, state, shutdown)
		})
	}
}

func writePump(conn *websocket.Conn, sf *Stockfish, state *searchState, shutdown func()) {
	defer shutdown()

	ticker := time.NewTicker(websocketPingPeriod)
	defer ticker.Stop()

	for {
		select {
		case line, ok := <-sf.Lines():
			if !ok {
				return
			}

			msg := parseSFLine(line)
			if msg == nil {
				continue
			}
			if msg.Type == "bestmove" && state.ShouldDropBestMove() {
				continue
			}

			conn.SetWriteDeadline(time.Now().Add(websocketWriteWait))
			if err := writeBinaryMsg(conn, msg); err != nil {
				slog.Warn("websocket write failed", "error", err)
				return
			}

		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(websocketWriteWait))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				slog.Warn("websocket ping failed", "error", err)
				return
			}
		}
	}
}

func readPump(conn *websocket.Conn, sf *Stockfish, state *searchState, shutdown func()) {
	defer shutdown()

	conn.SetReadDeadline(time.Now().Add(websocketPongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(websocketPongWait))
		return nil
	})

	for {
		mt, data, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				slog.Warn("websocket read failed", "error", err)
			}
			return
		}

		switch mt {
		case websocket.TextMessage, websocket.BinaryMessage:
			var msg WSMessage
			if err := json.Unmarshal(data, &msg); err != nil {
				slog.Warn("websocket message decoding failed", "error", err)
				continue
			}
			if msg.Type == "" {
				continue
			}

			switch msg.Type {
			case "start":
				if stopActiveSearch(sf, state) {
					time.Sleep(15 * time.Millisecond)
				}

				moves := parseUCIMoves(msg.Moves)
				if err := sf.SetPosition(msg.FEN, moves); err != nil {
					slog.Warn("Stockfish position update failed", "error", err)
					continue
				}

				depth := msg.Depth
				if depth <= 0 {
					depth = 1
				}

				if err := sf.GoDepth(depth, msg.MultiPV); err != nil {
					slog.Warn("Stockfish analysis start failed", "error", err, "depth", depth, "multi_pv", msg.MultiPV)
					continue
				}
				state.MarkStarted()

			case "stop":
				stopActiveSearch(sf, state)

			case "setoption":
				if err := sf.SetOption(msg.FEN, msg.Moves); err != nil {
					slog.Warn("Stockfish option update failed", "error", err, "option", msg.FEN)
				}
			}

		default:
			continue
		}
	}
}

func stopActiveSearch(sf *Stockfish, state *searchState) bool {
	if !state.IsActive() {
		return false
	}

	state.MarkStoppedByClient()

	if err := sf.Stop(); err != nil {
		slog.Warn("Stockfish analysis stop failed", "error", err)
	}

	return true
}
