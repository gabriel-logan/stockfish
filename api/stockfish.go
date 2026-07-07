package main

import (
	"bufio"
	"fmt"
	"io"
	"log"
	"os/exec"
	"strings"
	"sync"
	"time"
)

type Stockfish struct {
	cmd     *exec.Cmd
	stdin   io.WriteCloser
	lines   chan string
	writeMu sync.Mutex
	done    chan struct{}
}

func NewStockfish(path string) (*Stockfish, error) {
	cmd := exec.Command(path)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start: %w", err)
	}

	sf := &Stockfish{
		cmd:   cmd,
		stdin: stdin,
		lines: make(chan string, 1024),
		done:  make(chan struct{}),
	}

	safeGo(func() {
		defer close(sf.lines)
		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for scanner.Scan() {
			select {
			case sf.lines <- scanner.Text():
			case <-sf.done:
				return
			}
		}
		if err := scanner.Err(); err != nil {
			log.Printf("stockfish scanner: %v", err)
		}
	})

	if err := sf.send("uci"); err != nil {
		sf.Close()
		return nil, err
	}
	if err := sf.waitFor("uciok", 10*time.Second); err != nil {
		sf.Close()
		return nil, fmt.Errorf("uci init: %w", err)
	}
	if err := sf.send("isready"); err != nil {
		sf.Close()
		return nil, err
	}
	if err := sf.waitFor("readyok", 10*time.Second); err != nil {
		sf.Close()
		return nil, fmt.Errorf("engine not ready: %w", err)
	}

	sf.SetOption("Threads", "1")
	sf.SetOption("Hash", "16")

	return sf, nil
}

func (sf *Stockfish) send(cmd string) error {
	sf.writeMu.Lock()
	defer sf.writeMu.Unlock()
	_, err := io.WriteString(sf.stdin, cmd+"\n")
	return err
}

func (sf *Stockfish) SetOption(name, value string) error {
	return sf.send(fmt.Sprintf("setoption name %s value %s", name, value))
}

func (sf *Stockfish) SetPosition(fen string, moves []string) error {
	var cmd string
	if fen == "" || fen == "startpos" {
		cmd = "position startpos"
	} else {
		cmd = "position fen " + fen
	}
	if len(moves) > 0 {
		cmd += " moves " + strings.Join(moves, " ")
	}
	return sf.send(cmd)
}

func (sf *Stockfish) GoDepth(depth int, multiPV int) error {
	if multiPV < 1 {
		multiPV = 1
	}
	if err := sf.SetOption("MultiPV", fmt.Sprintf("%d", multiPV)); err != nil {
		return err
	}
	return sf.send(fmt.Sprintf("go depth %d", depth))
}

func (sf *Stockfish) GoInfinite(multiPV int) error {
	if multiPV < 1 {
		multiPV = 1
	}
	if err := sf.SetOption("MultiPV", fmt.Sprintf("%d", multiPV)); err != nil {
		return err
	}
	return sf.send("go infinite")
}

func (sf *Stockfish) Stop() error {
	return sf.send("stop")
}

func (sf *Stockfish) Lines() <-chan string {
	return sf.lines
}

func (sf *Stockfish) waitFor(target string, timeout time.Duration) error {
	deadline := time.After(timeout)
	for {
		select {
		case line, ok := <-sf.lines:
			if !ok {
				return io.ErrClosedPipe
			}
			if strings.TrimSpace(line) == target {
				return nil
			}
		case <-deadline:
			return fmt.Errorf("timeout waiting for %q", target)
		}
	}
}

func (sf *Stockfish) Close() error {
	sf.send("quit")

	done := make(chan error, 1)
	go func() {
		done <- sf.cmd.Wait()
	}()

	select {
	case err := <-done:
		close(sf.done)
		return err
	case <-time.After(5 * time.Second):
		sf.cmd.Process.Kill()
		close(sf.done)
		return <-done
	}
}
