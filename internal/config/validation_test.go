package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/spf13/pflag"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestValidateConfigEmptyDirectoryFields tests that empty directory fields are rejected
func TestValidateConfigEmptyDirectoryFields(t *testing.T) {
	tmpDir := t.TempDir()
	
	testCases := []struct {
		name      string
		config    *Config
		wantError string
	}{
		{
			name: "empty source field",
			config: &Config{
				Directories: []DirMapping{
					{Source: "", Virtual: "/test"},
				},
			},
			wantError: "directory mapping has empty 'source' field",
		},
		{
			name: "whitespace-only source field",
			config: &Config{
				Directories: []DirMapping{
					{Source: "   ", Virtual: "/test"},
				},
			},
			wantError: "directory mapping has empty 'source' field",
		},
		{
			name: "empty virtual field",
			config: &Config{
				Directories: []DirMapping{
					{Source: tmpDir, Virtual: ""},
				},
			},
			wantError: "directory mapping has empty 'virtual' field",
		},
		{
			name: "whitespace-only virtual field",
			config: &Config{
				Directories: []DirMapping{
					{Source: tmpDir, Virtual: "  \t\n  "},
				},
			},
			wantError: "directory mapping has empty 'virtual' field",
		},
		{
			name: "both fields empty",
			config: &Config{
				Directories: []DirMapping{
					{Source: "", Virtual: ""},
				},
			},
			wantError: "directory mapping has empty 'source' field",
		},
		{
			name: "second directory has empty field",
			config: &Config{
				Directories: []DirMapping{
					{Source: tmpDir, Virtual: "/valid"},
					{Source: "", Virtual: "/invalid"},
				},
			},
			wantError: "directory mapping has empty 'source' field",
		},
	}
	
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateConfig(tc.config, &configSource{})
			assert.Error(t, err)
			assert.Contains(t, err.Error(), tc.wantError)
		})
	}
}

// TestValidateConfigValidDirectories tests that valid directories pass validation
func TestValidateConfigValidDirectories(t *testing.T) {
	tmpDir := t.TempDir()
	subDir := filepath.Join(tmpDir, "subdir")
	require.NoError(t, os.Mkdir(subDir, 0750))
	
	config := &Config{
		Directories: []DirMapping{
			{Source: tmpDir, Virtual: "/tmp"},
			{Source: subDir, Virtual: "/sub"},
		},
	}
	
	err := validateConfig(config, &configSource{})
	assert.NoError(t, err)
}

// TestLoadConfigWithEmptyFields tests that TOML configs with empty fields are rejected
func TestLoadConfigWithEmptyFields(t *testing.T) {
	tmpDir := t.TempDir()
	
	testCases := []struct {
		name      string
		toml      string
		wantError string
	}{
		{
			name: "empty source in TOML",
			toml: `
[main]
listen = "127.0.0.1:3000"

[[directories]]
source = ""
virtual = "/test"
`,
			wantError: "directory mapping has empty 'source' field",
		},
		{
			name: "missing source in TOML",
			toml: `
[main]
listen = "127.0.0.1:3000"

[[directories]]
virtual = "/test"
`,
			wantError: "directory mapping has empty 'source' field",
		},
		{
			name: "empty virtual in TOML",
			toml: `
[main]
listen = "127.0.0.1:3000"

[[directories]]
source = "/tmp"
virtual = ""
`,
			wantError: "directory mapping has empty 'virtual' field",
		},
		{
			name: "missing virtual in TOML",
			toml: `
[main]
listen = "127.0.0.1:3000"

[[directories]]
source = "/tmp"
`,
			wantError: "directory mapping has empty 'virtual' field",
		},
		{
			name: "whitespace source in TOML",
			toml: `
[main]
listen = "127.0.0.1:3000"

[[directories]]
source = "   "
virtual = "/test"
`,
			wantError: "directory mapping has empty 'source' field",
		},
	}
	
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Save and restore command line state
			oldCommandLine := pflag.CommandLine
			pflag.CommandLine = pflag.NewFlagSet(os.Args[0], pflag.ContinueOnError)
			defer func() { pflag.CommandLine = oldCommandLine }()
			
			// Save and restore os.Args
			oldArgs := os.Args
			defer func() { os.Args = oldArgs }()
			
			// Create config file
			configFile := filepath.Join(tmpDir, tc.name+".toml")
			require.NoError(t, os.WriteFile(configFile, []byte(tc.toml), 0600))
			
			// Simulate command line args
			os.Args = []string{"dendrite", "--config", configFile}
			
			// Try to load config
			_, err := LoadConfig()
			assert.Error(t, err)
			assert.Contains(t, err.Error(), tc.wantError)
		})
	}
}