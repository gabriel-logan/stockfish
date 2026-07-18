package main

import (
	"reflect"
	"testing"
)

func TestParseUCIMoves(t *testing.T) {
	got := parseUCIMoves("  e2e4\te7e5\n g1f3 ")
	want := []string{"e2e4", "e7e5", "g1f3"}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseUCIMoves() = %#v, want %#v", got, want)
	}
}

func TestParseSFLine(t *testing.T) {
	tests := []struct {
		name string
		line string
		want *WSMessage
	}{
		{
			name: "best move with ponder",
			line: "bestmove e2e4 ponder e7e5",
			want: &WSMessage{Type: "bestmove", BestMove: "e2e4", Ponder: "e7e5"},
		},
		{
			name: "centipawn analysis",
			line: "info depth 18 seldepth 24 multipv 2 score cp -35 nodes 1200 nps 60000 time 20 pv e2e4 e7e5",
			want: func() *WSMessage {
				score := -0.35

				return &WSMessage{
					Type:     "analysis",
					Depth:    18,
					SelDepth: 24,
					MultiPV:  2,
					Score:    &score,
					PV:       []string{"e2e4", "e7e5"},
					Nodes:    1200,
					NPS:      60000,
					Time:     20,
				}
			}(),
		},
		{
			name: "mate analysis",
			line: "info depth 10 score mate -3 pv h5h4",
			want: func() *WSMessage {
				mate := -3

				return &WSMessage{
					Type:  "analysis",
					Depth: 10,
					Mate:  &mate,
					PV:    []string{"h5h4"},
				}
			}(),
		},
		{
			name: "engine string",
			line: "info string NNUE evaluation using nn.bin",
			want: nil,
		},
		{
			name: "uninteresting info",
			line: "info nodes 10",
			want: nil,
		},
		{
			name: "unknown line",
			line: "readyok",
			want: nil,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := parseSFLine(test.line)

			if !reflect.DeepEqual(got, test.want) {
				t.Fatalf("parseSFLine() = %#v, want %#v", got, test.want)
			}
		})
	}
}

func TestParseInfoLineIgnoresInvalidNumbers(t *testing.T) {
	got := parseInfoLine("info depth invalid score cp nope pv e2e4")
	want := &WSMessage{Type: "analysis", PV: []string{"e2e4"}}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseInfoLine() = %#v, want %#v", got, want)
	}
}
