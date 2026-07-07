package main

import (
	"log"
	"runtime/debug"
)

// safeGo spawns fn in a goroutine with panic recovery, logging the stack trace if any.
func safeGo(fn func()) {
	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("goroutine panic: %v\n%s", rec, debug.Stack())
			}
		}()
		fn()
	}()
}

// safeGoNamed is like safeGo but prefixes the log with the given name.
func safeGoNamed(name string, fn func()) {
	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("goroutine %q panic: %v\n%s", name, rec, debug.Stack())
			}
		}()
		fn()
	}()
}
