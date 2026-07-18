package main

import (
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"time"
)

type commandWriter struct {
	mu       sync.Mutex
	commands []string
	err      error
}

func (writer *commandWriter) Write(data []byte) (int, error) {
	writer.mu.Lock()
	defer writer.mu.Unlock()

	if writer.err != nil {
		return 0, writer.err
	}

	writer.commands = append(writer.commands, strings.TrimSpace(string(data)))

	return len(data), nil
}

func (writer *commandWriter) Close() error {
	return nil
}

func (writer *commandWriter) snapshot() []string {
	writer.mu.Lock()
	defer writer.mu.Unlock()

	return append([]string(nil), writer.commands...)
}

func TestStockfishCommands(t *testing.T) {
	writer := &commandWriter{}
	stockfish := &Stockfish{stdin: writer}

	if err := stockfish.SetOption("Hash", "32"); err != nil {
		t.Fatal(err)
	}
	if err := stockfish.SetPosition("startpos", []string{"e2e4", "e7e5"}); err != nil {
		t.Fatal(err)
	}
	if err := stockfish.SetPosition("custom fen", nil); err != nil {
		t.Fatal(err)
	}
	if err := stockfish.GoDepth(12, 0); err != nil {
		t.Fatal(err)
	}
	if err := stockfish.GoInfinite(3); err != nil {
		t.Fatal(err)
	}
	if err := stockfish.Stop(); err != nil {
		t.Fatal(err)
	}

	want := []string{
		"setoption name Hash value 32",
		"position startpos moves e2e4 e7e5",
		"position fen custom fen",
		"setoption name MultiPV value 1",
		"go depth 12",
		"setoption name MultiPV value 3",
		"go infinite",
		"stop",
	}
	got := writer.snapshot()

	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Fatalf("commands:\n%s\nwant:\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
	}
}

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

func TestStockfishSendReturnsWriterError(t *testing.T) {
	want := errors.New("write failed")
	stockfish := &Stockfish{stdin: &commandWriter{err: want}}

	if err := stockfish.send("uci"); !errors.Is(err, want) {
		t.Fatalf("error = %v, want %v", err, want)
	}
}

func TestWaitFor(t *testing.T) {
	t.Run("matches trimmed line", func(t *testing.T) {
		lines := make(chan string, 1)
		lines <- " readyok "
		stockfish := &Stockfish{lines: lines}

		if err := stockfish.waitFor("readyok", time.Second); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("reports closed output", func(t *testing.T) {
		lines := make(chan string)
		close(lines)
		stockfish := &Stockfish{lines: lines}

		if err := stockfish.waitFor("readyok", time.Second); !errors.Is(err, io.ErrClosedPipe) {
			t.Fatalf("error = %v, want %v", err, io.ErrClosedPipe)
		}
	})

	t.Run("times out", func(t *testing.T) {
		stockfish := &Stockfish{lines: make(chan string)}

		if err := stockfish.waitFor("readyok", time.Millisecond); err == nil {
			t.Fatal("expected timeout error")
		}
	})
}
