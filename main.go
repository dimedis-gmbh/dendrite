// Package main provides the entry point for the Dendrite file manager application.
package main

import (
	"fmt"
	"log"
	"net/http"
	"time"

	"dendrite/internal/config"
	"dendrite/internal/server"
)

func main() {
	// Load configuration from multiple sources
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Error loading configuration: %v", err)
	}

	fmt.Printf("Starting Dendrite file manager on %s\n", cfg.Listen)
	if cfg.QuotaBytes > 0 {
		fmt.Printf("Quota limit: %s (%d bytes)\n", cfg.Quota, cfg.QuotaBytes)
	}
	if cfg.JWTSecret != "" {
		fmt.Printf("JWT authentication enabled\n")
		fmt.Printf("Base directory: %s\n", cfg.BaseDir)
	} else {
		fmt.Printf("Serving %d directories\n", len(cfg.Directories))
	}

	srv := server.New(cfg)

	// Create HTTP server with timeouts
	httpServer := &http.Server{
		Addr:         cfg.Listen,
		Handler:      srv.Router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	log.Fatal(httpServer.ListenAndServe())
}
