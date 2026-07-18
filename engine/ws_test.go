package main

import "testing"

func TestSearchStateLifecycle(t *testing.T) {
	state := &searchState{}

	if state.IsActive() {
		t.Fatal("new state is active")
	}

	state.MarkStarted()

	if !state.IsActive() {
		t.Fatal("started state is inactive")
	}

	state.MarkStoppedByClient()

	if state.IsActive() {
		t.Fatal("stopped state is active")
	}
	if !state.ShouldDropBestMove() {
		t.Fatal("best move from stopped search was not dropped")
	}
	if state.ShouldDropBestMove() {
		t.Fatal("unexpected extra best move drop")
	}
}

func TestSearchStateTracksRepeatedStops(t *testing.T) {
	state := &searchState{}

	state.MarkStarted()
	state.MarkStoppedByClient()
	state.MarkStarted()
	state.MarkStoppedByClient()

	if !state.ShouldDropBestMove() {
		t.Fatal("first best move was not dropped")
	}
	if !state.ShouldDropBestMove() {
		t.Fatal("second best move was not dropped")
	}
	if state.ShouldDropBestMove() {
		t.Fatal("unexpected third best move drop")
	}
}
