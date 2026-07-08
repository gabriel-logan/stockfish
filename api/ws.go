package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

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
			log.Printf("ws upgrade: %v", err)
			return
		}

		sf, err := NewStockfish(cfg.StockfishPath)
		if err != nil {
			log.Printf("stockfish init: %v", err)

			writeBinaryMsg(conn, WSMessage{Type: "error", Error: "engine init failed"})

			conn.Close()
			return
		}

		writeBinaryMsg(conn, WSMessage{Type: "ready"})

		var closeOnce sync.Once
		shutdown := func() {
			closeOnce.Do(func() {
				conn.Close()
				sf.Close()
			})
		}

		safeGo(func() { writePump(conn, sf, shutdown) })
		safeGo(func() { readPump(conn, sf, shutdown) })
	}
}

func writePump(conn *websocket.Conn, sf *Stockfish, shutdown func()) {
	defer shutdown()

	for line := range sf.Lines() {
		msg := parseSFLine(line)
		if msg == nil {
			continue
		}
		conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
		if err := writeBinaryMsg(conn, msg); err != nil {
			log.Printf("writePump: %v", err)
			return
		}
	}
}

func readPump(conn *websocket.Conn, sf *Stockfish, shutdown func()) {
	defer shutdown()

	for {
		mt, data, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("readPump: %v", err)
			}
			return
		}

		switch mt {
		case websocket.TextMessage, websocket.BinaryMessage:
			var msg WSMessage
			if err := json.Unmarshal(data, &msg); err != nil {
				log.Printf("readPump unmarshal: %v", err)
				continue
			}
			if msg.Type == "" {
				continue
			}

			switch msg.Type {
			case "start":
				if err := sf.Stop(); err != nil {
					log.Printf("readPump stop: %v", err)
				}
				time.Sleep(15 * time.Millisecond)

				moves := strings.Fields(msg.Moves)
				if err := sf.SetPosition(msg.FEN, moves); err != nil {
					log.Printf("readPump setpos: %v", err)
					continue
				}

				depth := msg.Depth
				if depth <= 0 {
					depth = 1
				}

				if err := sf.GoDepth(depth, msg.MultiPV); err != nil {
					log.Printf("readPump go: %v", err)
				}

			case "stop":
				if err := sf.Stop(); err != nil {
					log.Printf("readPump stop: %v", err)
				}

			case "setoption":
				if err := sf.SetOption(msg.FEN, msg.Moves); err != nil {
					log.Printf("readPump setopt: %v", err)
				}
			}

		default:
			continue
		}
	}
}

// parseSFLine parses a single line of Stockfish UCI output into a structured message.
func parseSFLine(line string) *WSMessage {
	if strings.HasPrefix(line, "bestmove") {
		return parseBestMove(line)
	}

	if strings.HasPrefix(line, "info") {
		return parseInfoLine(line)
	}

	return nil
}

// parseBestMove extracts the best move and ponder from a "bestmove" UCI line.
func parseBestMove(line string) *WSMessage {
	msg := &WSMessage{Type: "bestmove"}

	fields := strings.Fields(line)

	for i, f := range fields {
		switch f {
		case "bestmove":
			if i+1 < len(fields) {
				msg.BestMove = fields[i+1]
			}
		case "ponder":
			if i+1 < len(fields) {
				msg.Ponder = fields[i+1]
			}
		}
	}
	return msg
}

// parseInfoLine parses an "info" UCI line, extracting depth, score, PV, nodes, etc.
func parseInfoLine(line string) *WSMessage {
	msg := &WSMessage{Type: "analysis"}

	fields := strings.Fields(line)

	for i := 0; i < len(fields); i++ {
		switch fields[i] {
		case "depth":
			if i+1 < len(fields) {
				n, err := strconv.Atoi(fields[i+1])
				if err == nil {
					msg.Depth = n
				}
			}
		case "seldepth":
			if i+1 < len(fields) {
				n, err := strconv.Atoi(fields[i+1])
				if err == nil {
					msg.SelDepth = n
				}
			}
		case "multipv":
			if i+1 < len(fields) {
				n, err := strconv.Atoi(fields[i+1])
				if err == nil {
					msg.MultiPV = n
				}
			}
		case "score":
			if i+1 < len(fields) {
				switch fields[i+1] {
				case "cp":
					if i+2 < len(fields) {
						n, err := strconv.Atoi(fields[i+2])
						if err == nil {
							score := float64(n) / 100.0
							msg.Score = &score
						}
					}
				case "mate":
					if i+2 < len(fields) {
						n, err := strconv.Atoi(fields[i+2])
						if err == nil {
							msg.Mate = &n
						}
					}
				}
			}
		case "nodes":
			if i+1 < len(fields) {
				n, err := strconv.ParseInt(fields[i+1], 10, 64)
				if err == nil {
					msg.Nodes = n
				}
			}
		case "nps":
			if i+1 < len(fields) {
				n, err := strconv.ParseInt(fields[i+1], 10, 64)
				if err == nil {
					msg.NPS = n
				}
			}
		case "time":
			if i+1 < len(fields) {
				n, err := strconv.ParseInt(fields[i+1], 10, 64)
				if err == nil {
					msg.Time = n
				}
			}
		case "pv":
			if i+1 < len(fields) {
				msg.PV = fields[i+1:]
			}
			return msg
		case "string":
			return nil
		}
	}
	if msg.Depth == 0 && msg.Mate == nil && len(msg.PV) == 0 {
		return nil
	}
	return msg
}
