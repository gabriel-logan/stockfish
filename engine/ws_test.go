package main

import (
	"sync"
	"testing"
)

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

func TestSearchStateConcurrentAccess(t *testing.T) {
	state := &searchState{}
	const workers = 16
	const iterations = 100

	var waitGroup sync.WaitGroup
	for worker := 0; worker < workers; worker++ {
		waitGroup.Add(1)

		go func() {
			defer waitGroup.Done()

			for iteration := 0; iteration < iterations; iteration++ {
				state.MarkStarted()
				state.IsActive()
				state.MarkStoppedByClient()
				state.ShouldDropBestMove()
			}
		}()
	}

	waitGroup.Wait()

	state.mu.Lock()
	defer state.mu.Unlock()

	if state.dropBestMoves < 0 {
		t.Fatalf("dropBestMoves = %d, want a non-negative value", state.dropBestMoves)
	}
}
