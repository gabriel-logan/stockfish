package main

import (
	"log/slog"
	"runtime/debug"
)

// safeGo spawns fn in a named goroutine with panic recovery, logging the stack trace if any.
func safeGo(name string, fn func()) {
	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error("goroutine panic", "goroutine", name, "panic", rec, "stack", string(debug.Stack()))
			}
		}()
		fn()
	}()
}
