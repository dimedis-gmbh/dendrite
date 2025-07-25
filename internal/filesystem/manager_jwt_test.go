package filesystem

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"dendrite/internal/config"
)

func TestManagerWithJWTRestriction(t *testing.T) {
	// Create temporary test directory
	tmpDir, err := os.MkdirTemp("", "dendrite-jwt-test-*")
	require.NoError(t, err)
	defer func() {
		_ = os.RemoveAll(tmpDir)
	}()
	
	// Create subdirectories for testing
	userDir := filepath.Join(tmpDir, "users", "john_doe", "documents")
	err = os.MkdirAll(userDir, 0750)
	require.NoError(t, err)
	
	// Create a test file in the user directory
	testFile := filepath.Join(userDir, "test.txt")
	err = os.WriteFile(testFile, []byte("test content"), 0600)
	require.NoError(t, err)
	
	// Create a file outside the restricted directory
	outsideFile := filepath.Join(tmpDir, "outside.txt")
	err = os.WriteFile(outsideFile, []byte("outside content"), 0600)
	require.NoError(t, err)
	
	cfg := &config.Config{
		Dir: tmpDir,
	}
	
	t.Run("manager without restriction", func(t *testing.T) {
		manager := New(cfg)
		
		// Should be able to list root directory
		files, err := manager.ListFiles("/")
		assert.NoError(t, err)
		assert.Len(t, files, 2) // users/ and outside.txt
	})
	
	t.Run("manager with JWT restriction", func(t *testing.T) {
		// Create manager with restriction to john_doe's documents
		manager := NewWithRestriction(cfg, "users/john_doe/documents")
		
		// Should only see files within the restricted directory
		files, err := manager.ListFiles("/")
		assert.NoError(t, err)
		assert.Len(t, files, 1) // Only test.txt
		assert.Equal(t, "test.txt", files[0].Name)
		
		// Should not be able to access parent directories
		_, err = manager.ListFiles("/../..")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "access denied")
	})
	
	t.Run("getBaseDir with restriction", func(t *testing.T) {
		manager := NewWithRestriction(cfg, "users/john_doe/documents")
		baseDir := manager.getBaseDir()
		expectedDir := filepath.Join(tmpDir, "users", "john_doe", "documents")
		assert.Equal(t, expectedDir, baseDir)
	})
	
	t.Run("getBaseDir without restriction", func(t *testing.T) {
		manager := New(cfg)
		baseDir := manager.getBaseDir()
		assert.Equal(t, tmpDir, baseDir)
	})
	
	t.Run("file operations with JWT restriction", func(t *testing.T) {
		manager := NewWithRestriction(cfg, "users/john_doe/documents")
		
		// Test GetFilePath
		filePath, err := manager.GetFilePath("test.txt")
		assert.NoError(t, err)
		assert.Equal(t, testFile, filePath)
		
		// Test CreateFolder
		err = manager.CreateFolder("subfolder")
		assert.NoError(t, err)
		
		// Verify folder was created
		subfolderPath := filepath.Join(userDir, "subfolder")
		info, err := os.Stat(subfolderPath)
		assert.NoError(t, err)
		assert.True(t, info.IsDir())
		
		// Test StatFile
		stat, err := manager.StatFile("test.txt")
		assert.NoError(t, err)
		assert.Equal(t, "test.txt", stat.Name)
		assert.Equal(t, int64(12), stat.Size) // "test content" is 12 bytes
		
		// Cleanup
		_ = os.RemoveAll(subfolderPath)
	})
	
	t.Run("path traversal prevention", func(t *testing.T) {
		manager := NewWithRestriction(cfg, "users/john_doe/documents")
		
		// Create a file we're trying to reach via traversal
		parentFile := filepath.Join(tmpDir, "users", "john_doe", "secret.txt")
		err := os.WriteFile(parentFile, []byte("secret"), 0600)
		require.NoError(t, err)
		defer func() {
			_ = os.Remove(parentFile)
		}()
		
		// Various path traversal attempts
		traversalPaths := []string{
			"../secret.txt",  // Try to access parent directory
			"../",            // Try to list parent directory  
			"../../",         // Try to go two levels up
		}
		
		// Test GetFilePath
		for _, path := range traversalPaths {
			_, err := manager.GetFilePath(path)
			assert.Error(t, err, "GetFilePath: Path %s should be blocked", path)
			if err != nil {
				assert.Contains(t, err.Error(), "access denied")
			}
		}
		
		// Test ListFiles
		for _, path := range traversalPaths {
			_, err := manager.ListFiles(path)
			assert.Error(t, err, "ListFiles: Path %s should be blocked", path)
			if err != nil {
				assert.Contains(t, err.Error(), "access denied")
			}
		}
		
		// Test that we cannot delete files outside our restriction
		err = manager.DeleteFile("../secret.txt")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "access denied")
		
		// Verify the secret file still exists
		_, err = os.Stat(parentFile)
		assert.NoError(t, err)
	})
	
	t.Run("quota calculation with restriction", func(t *testing.T) {
		// Add quota to config
		cfg.QuotaBytes = 1024 * 1024 // 1MB
		manager := NewWithRestriction(cfg, "users/john_doe/documents")
		
		quotaInfo, err := manager.GetQuotaInfo()
		assert.NoError(t, err)
		assert.NotNil(t, quotaInfo)
		assert.Greater(t, quotaInfo.Used, int64(0))
		assert.Equal(t, cfg.QuotaBytes, quotaInfo.Limit)
	})
}