package main

import (
	"log"
	"runtime/debug"
)

// safeGo spawns fn in a named goroutine with panic recovery, logging the stack trace if any.
func safeGo(name string, fn func()) {
	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("goroutine %q panic: %v\n%s", name, rec, debug.Stack())
			}
		}()
		fn()
	}()
}
