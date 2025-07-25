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
	flag.StringVar(&cfg.JWTSecret, "jwt", "", "JWT secret for authentication (minimum 32 characters)")
	flag.Parse()

	// Validate and resolve directory path
	absDir, err := filepath.Abs(cfg.Dir)
	if err != nil {
		log.Fatalf("Error resolving directory path: %v", err)
	}

	// Check if directory exists
	if _, err := os.Stat(absDir); err != nil {
		log.Fatalf("Directory does not exist or cannot be accessed: %s", absDir)
	}

	cfg.Dir = absDir

	// Validate JWT secret if provided
	if cfg.JWTSecret != "" && len(cfg.JWTSecret) < 32 {
		log.Fatalf("JWT secret must be at least 32 characters (256 bits) for security")
	}

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
	if cfg.JWTSecret != "" {
		fmt.Printf("JWT authentication enabled\n")
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
