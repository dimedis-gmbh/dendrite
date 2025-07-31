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

// configSource tracks where configuration values came from
type configSource struct {
	directoriesFromCLI bool
	jwtFromCLI         bool
	hasConfigFile      bool
}

// LoadConfig loads configuration from multiple sources with precedence:
// 1. Command line flags (highest)
// 2. Environment variables
// 3. Config file
// 4. Default values (lowest)
func LoadConfig() (*Config, error) {
	// Set up environment variables
	viper.SetEnvPrefix("DENDRITE")
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	viper.AutomaticEnv()

	// Define command line flags
	pflag.StringP("config", "c", "", "config file path")
	pflag.StringSlice("dir", []string{}, "directory mappings (format: source:virtual or just path)")
	pflag.String("listen", "", "server listen address (overrides config)")
	pflag.String("quota", "", "storage quota (overrides config)")
	pflag.String("jwt-secret", "", "JWT secret (overrides config)")
	pflag.String("base-dir", "", "base directory for JWT mode")
	pflag.Parse()

	// Bind flags to viper
	if err := viper.BindPFlags(pflag.CommandLine); err != nil {
		return nil, fmt.Errorf("error binding flags: %w", err)
	}

	// Track configuration sources
	source := &configSource{}

	// Only load config file if explicitly specified
	configFile := viper.GetString("config")
	if configFile != "" {
		source.hasConfigFile = true
		viper.SetConfigFile(configFile)
		viper.SetConfigType("toml")
		
		// Read config file
		if err := viper.ReadInConfig(); err != nil {
			return nil, fmt.Errorf("error reading config file %s: %w", configFile, err)
		}
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
		source.directoriesFromCLI = true
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
		source.jwtFromCLI = true
		cfg.JWTSecret = jwtSecret
	} else {
		cfg.JWTSecret = cfg.JWTAuth.JWTSecret
	}

	if baseDir := viper.GetString("base-dir"); baseDir != "" {
		cfg.BaseDir = baseDir
	} else {
		cfg.BaseDir = cfg.JWTAuth.BaseDir
	}

	// Set defaults if nothing was specified
	if cfg.Listen == "" {
		cfg.Listen = "127.0.0.1:3000"
	}

	// Validate configuration
	if err := validateConfig(&cfg, source); err != nil {
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
	if cfg.JWTSecret != "" {
		log.Printf("  JWT Auth: enabled")
		log.Printf("  Base Directory: %s", cfg.BaseDir)
	} else {
		log.Printf("  JWT Auth: disabled")
		log.Printf("  Directories: %d configured", len(cfg.Directories))
		for i, dir := range cfg.Directories {
			log.Printf("    [%d] %s -> %s", i+1, dir.Source, dir.Virtual)
		}
	}

	return &cfg, nil
}

// parseDirMapping parses a directory mapping string
// Formats: "source:virtual" or just "path" (maps to path:/)
func parseDirMapping(mapping string) (DirMapping, error) {
	parts := strings.SplitN(mapping, ":", 2)
	
	var source, virtual string
	
	if len(parts) == 1 {
		// Simple format: just a path, map to root
		source = strings.TrimSpace(parts[0])
		virtual = "/"
	} else {
		// Full format: source:virtual
		source = strings.TrimSpace(parts[0])
		virtual = strings.TrimSpace(parts[1])
	}

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
func validateConfig(cfg *Config, source *configSource) error {
	// JWT mode validation
	if cfg.JWTSecret != "" {
		// JWT mode requires base_dir
		if cfg.BaseDir == "" {
			if source.jwtFromCLI {
				return fmt.Errorf("--base-dir is required when using --jwt-secret")
			}
			return fmt.Errorf("base_dir is required in [jwt_auth] section when jwt_secret is set")
		}

		// Validate JWT secret length
		if len(cfg.JWTSecret) < 32 {
			return fmt.Errorf("JWT secret must be at least 32 characters (256 bits) for security")
		}

		// Validate base directory
		absPath, err := filepath.Abs(cfg.BaseDir)
		if err != nil {
			return fmt.Errorf("error resolving base directory path %s: %w", cfg.BaseDir, err)
		}

		// Check if directory exists
		info, err := os.Stat(absPath)
		if err != nil {
			if os.IsNotExist(err) {
				return fmt.Errorf("base directory does not exist: %s", absPath)
			}
			return fmt.Errorf("cannot access base directory %s: %w", absPath, err)
		}

		// Check if it's a directory
		if !info.IsDir() {
			return fmt.Errorf("base path is not a directory: %s", absPath)
		}

		// Test read permission
		entries, err := os.ReadDir(absPath)
		if err != nil {
			return fmt.Errorf("base directory is not readable %s: %w", absPath, err)
		}
		_ = entries // Just testing readability

		// Update base dir to absolute path
		cfg.BaseDir = absPath

		// In JWT mode, directories configuration is not allowed
		if len(cfg.Directories) > 0 {
			// Generate context-aware error message
			if source.jwtFromCLI && source.directoriesFromCLI {
				return fmt.Errorf("cannot use --dir with --jwt-secret; JWT mode and directory mode are mutually exclusive")
			} else if source.jwtFromCLI && !source.directoriesFromCLI && source.hasConfigFile {
				return fmt.Errorf("JWT authentication is enabled via --jwt-secret flag; " +
					"cannot use [[directories]] sections in configuration file")
			} else if !source.jwtFromCLI && source.directoriesFromCLI && source.hasConfigFile {
				return fmt.Errorf("JWT authentication is enabled in configuration file; cannot use --dir flag")
			}
			return fmt.Errorf("JWT authentication (jwt_secret) and directory mappings ([[directories]]) " +
				"cannot be used together in configuration file")
		}
	} else {
		// Non-JWT mode requires directories
		if len(cfg.Directories) == 0 {
			return fmt.Errorf("at least one directory mapping must be configured " +
				"(or use JWT mode with --jwt-secret and --base-dir)")
		}

		// Validate and resolve all directory paths
		virtualPaths := make(map[string]bool)
		for i, dir := range cfg.Directories {
			// Validate directory fields are not empty
			if strings.TrimSpace(dir.Source) == "" {
				return fmt.Errorf("directory mapping has empty 'source' field")
			}
			if strings.TrimSpace(dir.Virtual) == "" {
				return fmt.Errorf("directory mapping has empty 'virtual' field")
			}
			
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
	}

	return nil
}
