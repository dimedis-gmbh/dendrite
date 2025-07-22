// Package main provides the entry point for the Dendrite file manager application.
package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"dendrite/internal/config"
	"dendrite/internal/server"
)

func main() {
	var cfg config.Config

	flag.StringVar(&cfg.Listen, "listen", "127.0.0.1:3000", "IP address and port to listen on")
	flag.StringVar(&cfg.Dir, "dir", "./", "Directory to expose for web management")
	flag.StringVar(&cfg.Quota, "quota", "", "Maximum directory size (e.g., 1GB, 500MB)")
	flag.Parse()

	// Validate and resolve directory path
	absDir, err := filepath.Abs(cfg.Dir)
	if err != nil {
		log.Fatalf("Error resolving directory path: %v", err)
	}

	if _, err := os.Stat(absDir); os.IsNotExist(err) {
		log.Fatalf("Directory does not exist: %s", absDir)
	}

	cfg.Dir = absDir

	// Parse quota if provided
	if cfg.Quota != "" {
		if err := config.ParseQuota(&cfg); err != nil {
			log.Fatalf("Error parsing quota: %v", err)
		}
	}

	fmt.Printf("Starting Dendrite file manager on %s\n", cfg.Listen)
	fmt.Printf("Managing directory: %s\n", cfg.Dir)
	if cfg.QuotaBytes > 0 {
		fmt.Printf("Quota limit: %s (%d bytes)\n", cfg.Quota, cfg.QuotaBytes)
	}

	srv := server.New(&cfg)
	
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
