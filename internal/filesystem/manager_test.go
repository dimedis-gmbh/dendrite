package filesystem

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"dendrite/internal/config"
	"bytes"
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

func TestManager_UploadFile_QuotaErrorMessage(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "dendrite-test-quota")
	require.NoError(t, err)
	defer func() {
		if err := os.RemoveAll(tempDir); err != nil {
			t.Errorf("Failed to remove temp dir: %v", err)
		}
	}()

	tests := []struct {
		name            string
		quotaBytes      int64
		existingFiles   map[string]int64 // filename -> size
		uploadSize      int64
		expectedError   string
	}{
		{
			name:       "Upload exceeds quota - empty directory",
			quotaBytes: 1048576, // 1 MB
			uploadSize: 1126400, // 1.07 MB
			expectedError: "upload would exceed quota limit (current: 0 B, file: 1.07 MB, limit: 1.00 MB)",
		},
		{
			name:       "Upload exceeds quota - with existing files",
			quotaBytes: 1048576, // 1 MB
			existingFiles: map[string]int64{
				"existing.txt": 512000, // 500 KB
			},
			uploadSize: 614400, // 600 KB
			expectedError: "upload would exceed quota limit (current: 500.00 KB, file: 600.00 KB, limit: 1.00 MB)",
		},
		{
			name:       "Large quota in GB",
			quotaBytes: 5368709120, // 5 GB
			existingFiles: map[string]int64{
				"large1.bin": 2147483648, // 2 GB
				"large2.bin": 2147483648, // 2 GB
			},
			uploadSize: 1610612736, // 1.5 GB
			expectedError: "upload would exceed quota limit (current: 4.00 GB, file: 1.50 GB, limit: 5.00 GB)",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create test directory structure
			testDir := filepath.Join(tempDir, tt.name)
			err := os.MkdirAll(testDir, 0750)
			require.NoError(t, err)

			// Create existing files
			for filename, size := range tt.existingFiles {
				filePath := filepath.Join(testDir, filename)
				err := os.WriteFile(filePath, make([]byte, size), 0644)
				require.NoError(t, err)
			}

			cfg := &config.Config{
				Dir:        testDir,
				QuotaBytes: tt.quotaBytes,
			}
			manager := New(cfg)

			// Try to upload a file that exceeds quota
			reader := bytes.NewReader(make([]byte, tt.uploadSize))
			_, err = manager.UploadFile("/", "test-upload.bin", reader, tt.uploadSize)

			// Verify error message
			require.Error(t, err)
			assert.Equal(t, tt.expectedError, err.Error())
		})
	}
}

func TestManager_CopyFile_QuotaErrorMessage(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "dendrite-test-copy-quota")
	require.NoError(t, err)
	defer func() {
		if err := os.RemoveAll(tempDir); err != nil {
			t.Errorf("Failed to remove temp dir: %v", err)
		}
	}()

	// Create a source file to copy
	sourceFile := filepath.Join(tempDir, "source.bin")
	sourceSize := int64(614400) // 600 KB
	err = os.WriteFile(sourceFile, make([]byte, sourceSize), 0644)
	require.NoError(t, err)

	// Create an existing file to contribute to quota usage
	existingFile := filepath.Join(tempDir, "existing.bin")
	existingSize := int64(512000) // 500 KB
	err = os.WriteFile(existingFile, make([]byte, existingSize), 0644)
	require.NoError(t, err)

	cfg := &config.Config{
		Dir:        tempDir,
		QuotaBytes: 1048576, // 1 MB
	}
	manager := New(cfg)

	// Try to copy file that would exceed quota
	err = manager.CopyFile("source.bin", "dest.bin")

	// Verify error message contains human-readable sizes
	require.Error(t, err)
	expectedError := "copy would exceed quota limit (current: 1.07 MB, copy size: 600.00 KB, limit: 1.00 MB)"
	assert.Equal(t, expectedError, err.Error())
}

func TestManager_UploadFile_WithinQuota(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "dendrite-test-within-quota")
	require.NoError(t, err)
	defer func() {
		if err := os.RemoveAll(tempDir); err != nil {
			t.Errorf("Failed to remove temp dir: %v", err)
		}
	}()

	cfg := &config.Config{
		Dir:        tempDir,
		QuotaBytes: 1048576, // 1 MB
	}
	manager := New(cfg)

	// Upload a file within quota
	uploadSize := int64(102400) // 100 KB
	reader := bytes.NewReader(make([]byte, uploadSize))
	result, err := manager.UploadFile("/", "small.bin", reader, uploadSize)

	// Should succeed
	require.NoError(t, err)
	assert.NotNil(t, result)
	assert.Equal(t, "/small.bin", result.Path)
	assert.Equal(t, uploadSize, result.Size)

	// Verify file was created
	filePath := filepath.Join(tempDir, "small.bin")
	info, err := os.Stat(filePath)
	require.NoError(t, err)
	assert.Equal(t, uploadSize, info.Size())
}