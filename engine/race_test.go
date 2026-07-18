package main

import (
	"sync"
	"testing"
)

func TestStockfishSendSerializesConcurrentWrites(t *testing.T) {
	writer := &commandWriter{}
	stockfish := &Stockfish{stdin: writer}
	const workers = 32

	var waitGroup sync.WaitGroup
	for index := 0; index < workers; index++ {
		waitGroup.Add(1)

		go func() {
			defer waitGroup.Done()

			if err := stockfish.send("isready"); err != nil {
				t.Errorf("send: %v", err)
			}
		}()
	}

	waitGroup.Wait()

	if got := len(writer.snapshot()); got != workers {
		t.Fatalf("command count = %d, want %d", got, workers)
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
