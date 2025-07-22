package filesystem

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"dendrite/internal/config"
)

func TestManager_isPathSafe(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "dendrite-test")
	require.NoError(t, err)
	defer func() {
		if err := os.RemoveAll(tempDir); err != nil {
			t.Errorf("Failed to remove temp dir: %v", err)
		}
	}()

	cfg := &config.Config{Dir: tempDir}
	manager := New(cfg)

	tests := []struct {
		name     string
		path     string
		expected bool
	}{
		{
			name:     "Safe path within directory",
			path:     filepath.Join(tempDir, "subdir", "file.txt"),
			expected: true,
		},
		{
			name:     "Unsafe path outside directory",
			path:     filepath.Join(tempDir, "..", "outside.txt"),
			expected: false,
		},
		{
			name:     "Same as managed directory",
			path:     tempDir,
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := manager.isPathSafe(tt.path)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestGetMimeType(t *testing.T) {
	cfg := &config.Config{}
	manager := New(cfg)

	tests := []struct {
		filename string
		expected string
	}{
		{"test.txt", "text/plain"},
		{"test.go", "text/plain"},
		{"test.json", "application/json"},
		{"test.jpg", "image/jpeg"},
		{"test.png", "image/png"},
		{"test.zip", "application/zip"},
		{"test.unknown", "application/octet-stream"},
		{"test", "application/octet-stream"},
	}

	for _, tt := range tests {
		t.Run(tt.filename, func(t *testing.T) {
			result := manager.getMimeType(tt.filename)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestManager_GetQuotaInfo(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "dendrite-test")
	require.NoError(t, err)
	defer func() {
		if err := os.RemoveAll(tempDir); err != nil {
			t.Errorf("Failed to remove temp dir: %v", err)
		}
	}()

	// Create a test file
	testFile := filepath.Join(tempDir, "test.txt")
	testContent := []byte("Hello, World!")
	err = os.WriteFile(testFile, testContent, 0600)
	require.NoError(t, err)

	tests := []struct {
		name        string
		quotaBytes  int64
		expectUsed  bool
		expectLimit bool
	}{
		{
			name:        "No quota limit",
			quotaBytes:  0,
			expectUsed:  true,
			expectLimit: false,
		},
		{
			name:        "With quota limit",
			quotaBytes:  1024 * 1024, // 1MB
			expectUsed:  true,
			expectLimit: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := &config.Config{
				Dir:        tempDir,
				QuotaBytes: tt.quotaBytes,
			}
			manager := New(cfg)

			info, err := manager.GetQuotaInfo()
			require.NoError(t, err)

			if tt.expectUsed {
				assert.Greater(t, info.Used, int64(0))
			}

			if tt.expectLimit {
				assert.Equal(t, tt.quotaBytes, info.Limit)
				assert.Equal(t, tt.quotaBytes-info.Used, info.Available)
				assert.Equal(t, info.Used > tt.quotaBytes, info.Exceeded)
			} else {
				assert.Equal(t, int64(0), info.Limit)
				assert.Equal(t, int64(-1), info.Available)
				assert.False(t, info.Exceeded)
			}
		})
	}
}