package main

import (
	"strconv"
	"strings"
)

// parseUCIMoves splits a whitespace-delimited UCI move list.
func parseUCIMoves(moves string) []string {
	return strings.Fields(moves)
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
