package main

type WSMessage struct {
	Type     string   `json:"type"`
	FEN      string   `json:"fen,omitempty"`
	Depth    int      `json:"depth,omitempty"`
	MultiPV  int      `json:"multi_pv,omitempty"`
	Moves    string   `json:"moves,omitempty"`
	SelDepth int      `json:"seldepth,omitempty"`
	Score    float64  `json:"score,omitempty"`
	Mate     int      `json:"mate,omitempty"`
	PV       []string `json:"pv,omitempty"`
	Nodes    int64    `json:"nodes,omitempty"`
	NPS      int64    `json:"nps,omitempty"`
	Time     int64    `json:"time_ms,omitempty"`
	BestMove string   `json:"bestmove,omitempty"`
	Ponder   string   `json:"ponder,omitempty"`
	Error    string   `json:"error,omitempty"`
}

type AnalyzeRequest struct {
	FEN     string `json:"fen"`
	Depth   int    `json:"depth"`
	MultiPV int    `json:"multi_pv"`
	Moves   string `json:"moves,omitempty"`
	Elo     int    `json:"elo,omitempty"`
}

type AnalyzeResponse struct {
	BestMove string      `json:"bestmove,omitempty"`
	Ponder   string      `json:"ponder,omitempty"`
	Analysis []WSMessage `json:"analysis"`
}
