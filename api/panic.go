package main

import (
	"log"
	"runtime/debug"
)

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
