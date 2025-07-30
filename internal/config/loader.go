package config

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/pflag"
	"github.com/spf13/viper"
)

// LoadConfig loads configuration from multiple sources with precedence:
// 1. Command line flags (highest)
// 2. Environment variables
// 3. Config file
// 4. Default values (lowest)
func LoadConfig() (*Config, error) {
	// Set up Viper for config file
	viper.SetConfigName("dendrite")
	viper.SetConfigType("toml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("/etc/dendrite/")
	viper.AddConfigPath("$HOME/.dendrite/")

	// Set up environment variables
	viper.SetEnvPrefix("DENDRITE")
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	viper.AutomaticEnv()

	// Define command line flags
	pflag.StringP("config", "c", "", "config file path")
	pflag.String("listen", "", "server listen address (overrides config)")
	pflag.String("quota", "", "storage quota (overrides config)")
	pflag.String("jwt-secret", "", "JWT secret (overrides config)")
	pflag.StringSliceP("dir", "d", []string{}, "directory mappings (source:virtual)")
	pflag.Parse()

	// Bind flags to viper
	if err := viper.BindPFlags(pflag.CommandLine); err != nil {
		return nil, fmt.Errorf("error binding flags: %w", err)
	}

	// Load config file if specified
	if configFile := viper.GetString("config"); configFile != "" {
		viper.SetConfigFile(configFile)
	}

	// Read config file (ignore if not found)
	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("error reading config file: %w", err)
		}
		// Config file not found is OK, we'll use flags/env/defaults
	} else {
		log.Printf("Using config file: %s", viper.ConfigFileUsed())
	}

	// Create config struct
	var cfg Config

	// Unmarshal the config
	if err := viper.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("error unmarshaling config: %w", err)
	}

	// Process command line directory mappings
	dirFlags := viper.GetStringSlice("dir")
	if len(dirFlags) > 0 {
		// Command line directories override config file directories
		cmdDirs := make([]DirMapping, 0, len(dirFlags))
		for _, dir := range dirFlags {
			mapping, err := parseDirMapping(dir)
			if err != nil {
				return nil, fmt.Errorf("invalid directory mapping '%s': %w", dir, err)
			}
			cmdDirs = append(cmdDirs, mapping)
		}
		cfg.Directories = append(cfg.Directories, cmdDirs...)
	}

	// Apply command line overrides to legacy fields
	if listen := viper.GetString("listen"); listen != "" {
		cfg.Listen = listen
	} else {
		cfg.Listen = cfg.Main.Listen
	}

	if quota := viper.GetString("quota"); quota != "" {
		cfg.Quota = quota
	} else {
		cfg.Quota = cfg.Main.Quota
	}

	if jwtSecret := viper.GetString("jwt-secret"); jwtSecret != "" {
		cfg.JWTSecret = jwtSecret
	} else {
		cfg.JWTSecret = cfg.Main.JWTSecret
	}

	// Set defaults if nothing was specified
	if cfg.Listen == "" {
		cfg.Listen = "127.0.0.1:3000"
	}

	// Validate configuration
	if err := validateConfig(&cfg); err != nil {
		return nil, err
	}

	// Parse quota if provided
	if cfg.Quota != "" {
		if err := ParseQuota(&cfg); err != nil {
			return nil, fmt.Errorf("error parsing quota: %w", err)
		}
	}

	// Log final configuration (without secrets)
	log.Printf("Configuration loaded:")
	log.Printf("  Listen: %s", cfg.Listen)
	log.Printf("  Quota: %s", cfg.Quota)
	log.Printf("  JWT Auth: %s", func() string {
		if cfg.JWTSecret != "" {
			return "enabled"
		}
		return "disabled"
	}())
	log.Printf("  Directories: %d configured", len(cfg.Directories))
	for i, dir := range cfg.Directories {
		log.Printf("    [%d] %s -> %s", i+1, dir.Source, dir.Virtual)
	}

	return &cfg, nil
}

// parseDirMapping parses a directory mapping string in the format "source:virtual"
func parseDirMapping(mapping string) (DirMapping, error) {
	parts := strings.SplitN(mapping, ":", 2)
	if len(parts) != 2 {
		return DirMapping{}, fmt.Errorf("expected format 'source:virtual'")
	}

	source := strings.TrimSpace(parts[0])
	virtual := strings.TrimSpace(parts[1])

	if source == "" {
		return DirMapping{}, fmt.Errorf("source directory cannot be empty")
	}
	if virtual == "" {
		return DirMapping{}, fmt.Errorf("virtual path cannot be empty")
	}

	return DirMapping{
		Source:  source,
		Virtual: virtual,
	}, nil
}

// validateConfig validates the configuration
func validateConfig(cfg *Config) error {
	if len(cfg.Directories) == 0 {
		return fmt.Errorf("at least one directory mapping must be configured")
	}

	// Validate and resolve all directory paths
	virtualPaths := make(map[string]bool)
	for i, dir := range cfg.Directories {
		// Resolve source to absolute path
		absPath, err := filepath.Abs(dir.Source)
		if err != nil {
			return fmt.Errorf("error resolving directory path %s: %w", dir.Source, err)
		}

		// Check if directory exists
		info, err := os.Stat(absPath)
		if err != nil {
			if os.IsNotExist(err) {
				return fmt.Errorf("directory does not exist: %s", absPath)
			}
			return fmt.Errorf("cannot access directory %s: %w", absPath, err)
		}

		// Check if it's a directory
		if !info.IsDir() {
			return fmt.Errorf("path is not a directory: %s", absPath)
		}

		// Test read permission
		entries, err := os.ReadDir(absPath)
		if err != nil {
			return fmt.Errorf("directory is not readable %s: %w", absPath, err)
		}
		_ = entries // Just testing readability

		// Update source to absolute path
		cfg.Directories[i].Source = absPath

		// Validate virtual path
		if !strings.HasPrefix(dir.Virtual, "/") {
			return fmt.Errorf("virtual path must start with /: %s", dir.Virtual)
		}

		// Check for duplicate virtual paths
		if virtualPaths[dir.Virtual] {
			return fmt.Errorf("duplicate virtual path: %s", dir.Virtual)
		}
		virtualPaths[dir.Virtual] = true
	}

	// Validate JWT secret if provided
	if cfg.JWTSecret != "" && len(cfg.JWTSecret) < 32 {
		return fmt.Errorf("JWT secret must be at least 32 characters (256 bits) for security")
	}

	return nil
}