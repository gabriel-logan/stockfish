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
		defer shutdown()

		go writePump(conn, sf, shutdown)

		go readPump(conn, sf, shutdown)
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
			return
		}
	}
}

func readPump(conn *websocket.Conn, sf *Stockfish, shutdown func()) {
	defer shutdown()

	for {
		mt, data, err := conn.ReadMessage()
		if err != nil {
			return
		}

		switch mt {
		case websocket.TextMessage, websocket.BinaryMessage:
			var msg WSMessage
			if err := json.Unmarshal(data, &msg); err != nil {
				continue
			}
			if msg.Type == "" {
				continue
			}

			switch msg.Type {
			case "start":
				sf.Stop()
				time.Sleep(15 * time.Millisecond)

				moves := strings.Fields(msg.Moves)
				sf.SetPosition(msg.FEN, moves)

				if msg.Depth <= 0 {
					sf.GoInfinite(msg.MultiPV)
				} else {
					sf.GoDepth(msg.Depth, msg.MultiPV)
				}

			case "stop":
				sf.Stop()

			case "setoption":
				sf.SetOption(msg.FEN, msg.Moves)
			}

		default:
			continue
		}

	}
}

func parseSFLine(line string) *WSMessage {
	if strings.HasPrefix(line, "bestmove") {
		return parseBestMove(line)
	}
	if strings.HasPrefix(line, "info") {
		return parseInfoLine(line)
	}
	return nil
}

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

func parseInfoLine(line string) *WSMessage {
	msg := &WSMessage{Type: "analysis"}
	fields := strings.Fields(line)
	for i := 0; i < len(fields); i++ {
		switch fields[i] {
		case "depth":
			if i+1 < len(fields) {
				msg.Depth, _ = strconv.Atoi(fields[i+1])
			}
		case "seldepth":
			if i+1 < len(fields) {
				msg.SelDepth, _ = strconv.Atoi(fields[i+1])
			}
		case "multipv":
			if i+1 < len(fields) {
				msg.MultiPV, _ = strconv.Atoi(fields[i+1])
			}
		case "score":
			if i+1 < len(fields) {
				switch fields[i+1] {
				case "cp":
					if i+2 < len(fields) {
						cp, _ := strconv.Atoi(fields[i+2])
						msg.Score = float64(cp) / 100.0
					}
				case "mate":
					if i+2 < len(fields) {
						msg.Mate, _ = strconv.Atoi(fields[i+2])
					}
				}
			}
		case "nodes":
			if i+1 < len(fields) {
				msg.Nodes, _ = strconv.ParseInt(fields[i+1], 10, 64)
			}
		case "nps":
			if i+1 < len(fields) {
				msg.NPS, _ = strconv.ParseInt(fields[i+1], 10, 64)
			}
		case "time":
			if i+1 < len(fields) {
				msg.Time, _ = strconv.ParseInt(fields[i+1], 10, 64)
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
	if msg.Depth == 0 && msg.Mate == 0 && len(msg.PV) == 0 {
		return nil
	}
	return msg
}
