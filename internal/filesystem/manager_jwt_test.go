package filesystem

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"dendrite/internal/config"
)

func TestManagerWithJWTRestriction(t *testing.T) {
	// Create temporary test directories
	tmpDir1, err := os.MkdirTemp("", "dendrite-jwt-test1-*")
	require.NoError(t, err)
	defer func() {
		_ = os.RemoveAll(tmpDir1)
	}()
	
	tmpDir2, err := os.MkdirTemp("", "dendrite-jwt-test2-*")
	require.NoError(t, err)
	defer func() {
		_ = os.RemoveAll(tmpDir2)
	}()
	
	tmpDir3, err := os.MkdirTemp("", "dendrite-jwt-test3-*")
	require.NoError(t, err)
	defer func() {
		_ = os.RemoveAll(tmpDir3)
	}()
	
	// Create test files in each directory
	testFile1 := filepath.Join(tmpDir1, "test1.txt")
	err = os.WriteFile(testFile1, []byte("test content 1"), 0600)
	require.NoError(t, err)
	
	testFile2 := filepath.Join(tmpDir2, "test2.txt")
	err = os.WriteFile(testFile2, []byte("test content 2"), 0600)
	require.NoError(t, err)
	
	testFile3 := filepath.Join(tmpDir3, "test3.txt")
	err = os.WriteFile(testFile3, []byte("test content 3"), 0600)
	require.NoError(t, err)
	
	// Server configuration with all 3 directories
	cfg := &config.Config{
		Directories: []config.DirMapping{
			{Source: tmpDir1, Virtual: "/docs"},
			{Source: tmpDir2, Virtual: "/images"},
			{Source: tmpDir3, Virtual: "/private"},
		},
	}
	
	t.Run("manager without restriction", func(t *testing.T) {
		manager := New(cfg)
		
		// Should be able to list root directory
		files, err := manager.ListFiles("/")
		assert.NoError(t, err)
		assert.Len(t, files, 3) // All 3 virtual directories
		
		// Should see all files
		docs, err := manager.ListFiles("/docs")
		assert.NoError(t, err)
		assert.Len(t, docs, 1)
		assert.Equal(t, "test1.txt", docs[0].Name)
		
		images, err := manager.ListFiles("/images")
		assert.NoError(t, err)
		assert.Len(t, images, 1)
		assert.Equal(t, "test2.txt", images[0].Name)
		
		private, err := manager.ListFiles("/private")
		assert.NoError(t, err)
		assert.Len(t, private, 1)
		assert.Equal(t, "test3.txt", private[0].Name)
	})
	
	t.Run("manager with JWT restriction to subset", func(t *testing.T) {
		// JWT only allows access to docs and images, not private
		jwtDirs := []config.DirMapping{
			{Source: tmpDir1, Virtual: "/docs"},
			{Source: tmpDir2, Virtual: "/images"},
		}
		
		manager := NewWithRestriction(cfg, jwtDirs)
		
		// Should only see allowed directories
		files, err := manager.ListFiles("/")
		assert.NoError(t, err)
		assert.Len(t, files, 2) // Only docs and images
		assert.Equal(t, "docs", files[0].Name)
		assert.Equal(t, "images", files[1].Name)
		
		// Should be able to access allowed directories
		docs, err := manager.ListFiles("/docs")
		assert.NoError(t, err)
		assert.Len(t, docs, 1)
		
		images, err := manager.ListFiles("/images")
		assert.NoError(t, err)
		assert.Len(t, images, 1)
		
		// Should NOT be able to access private directory
		_, err = manager.ListFiles("/private")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "virtual path not found")
	})
	
	t.Run("file operations with JWT restriction", func(t *testing.T) {
		// JWT only allows access to docs
		jwtDirs := []config.DirMapping{
			{Source: tmpDir1, Virtual: "/docs"},
		}
		
		manager := NewWithRestriction(cfg, jwtDirs)
		
		// Test GetFilePath
		filePath, err := manager.GetFilePath("/docs/test1.txt")
		assert.NoError(t, err)
		assert.Equal(t, testFile1, filePath)
		
		// Should fail for restricted paths
		_, err = manager.GetFilePath("/private/test3.txt")
		assert.Error(t, err)
		
		// Test CreateFolder
		err = manager.CreateFolder("/docs/subfolder")
		assert.NoError(t, err)
		
		// Verify folder was created
		subfolderPath := filepath.Join(tmpDir1, "subfolder")
		info, err := os.Stat(subfolderPath)
		assert.NoError(t, err)
		assert.True(t, info.IsDir())
		
		// Should fail to create in restricted directory
		err = manager.CreateFolder("/private/subfolder")
		assert.Error(t, err)
		
		// Test StatFile
		stat, err := manager.StatFile("/docs/test1.txt")
		assert.NoError(t, err)
		assert.Equal(t, "test1.txt", stat.Name)
		assert.Equal(t, "/docs/test1.txt", stat.Path)
		
		// Should fail for restricted paths
		_, err = manager.StatFile("/private/test3.txt")
		assert.Error(t, err)
	})
	
	t.Run("upload and copy with JWT restriction", func(t *testing.T) {
		// JWT allows docs and images
		jwtDirs := []config.DirMapping{
			{Source: tmpDir1, Virtual: "/docs"},
			{Source: tmpDir2, Virtual: "/images"},
		}
		
		manager := NewWithRestriction(cfg, jwtDirs)
		
		// Upload to allowed directory
		content := []byte("new file content")
		reader := bytes.NewReader(content)
		result, err := manager.UploadFile("/docs", "new.txt", reader, int64(len(content)))
		assert.NoError(t, err)
		assert.Equal(t, "/docs/new.txt", result.Path)
		
		// Upload to restricted directory should fail
		reader = bytes.NewReader(content)
		_, err = manager.UploadFile("/private", "new.txt", reader, int64(len(content)))
		assert.Error(t, err)
		
		// Copy between allowed directories
		err = manager.CopyFile("/docs/new.txt", "/images/copy.txt")
		assert.NoError(t, err)
		
		// Copy to restricted directory should fail
		err = manager.CopyFile("/docs/new.txt", "/private/copy.txt")
		assert.Error(t, err)
		
		// Move between allowed directories
		err = manager.MoveFile("/images/copy.txt", "/docs/moved.txt")
		assert.NoError(t, err)
		
		// Delete from allowed directory
		err = manager.DeleteFile("/docs/moved.txt")
		assert.NoError(t, err)
		
		// Delete from restricted directory should fail
		err = manager.DeleteFile("/private/test3.txt")
		assert.Error(t, err)
	})
	
	t.Run("quota calculation with JWT restriction", func(t *testing.T) {
		// Create larger files
		largeFile1 := filepath.Join(tmpDir1, "large1.bin")
		err = os.WriteFile(largeFile1, make([]byte, 1024*1024), 0600) // 1MB
		require.NoError(t, err)
		
		largeFile2 := filepath.Join(tmpDir2, "large2.bin")
		err = os.WriteFile(largeFile2, make([]byte, 2*1024*1024), 0600) // 2MB
		require.NoError(t, err)
		
		largeFile3 := filepath.Join(tmpDir3, "large3.bin")
		err = os.WriteFile(largeFile3, make([]byte, 3*1024*1024), 0600) // 3MB
		require.NoError(t, err)
		
		// JWT only allows access to docs and images (total 3MB)
		jwtDirs := []config.DirMapping{
			{Source: tmpDir1, Virtual: "/docs"},
			{Source: tmpDir2, Virtual: "/images"},
		}
		
		manager := NewWithRestriction(cfg, jwtDirs)
		
		// Quota should only count allowed directories
		quotaInfo, err := manager.GetQuotaInfo()
		assert.NoError(t, err)
		// Should be approximately 3MB (1MB + 2MB), not 6MB
		assert.Greater(t, quotaInfo.Used, int64(3*1024*1024-1000))
		assert.Less(t, quotaInfo.Used, int64(3*1024*1024+1000))
	})
	
	t.Run("create zip with JWT restriction", func(t *testing.T) {
		// JWT allows docs and images
		jwtDirs := []config.DirMapping{
			{Source: tmpDir1, Virtual: "/docs"},
			{Source: tmpDir2, Virtual: "/images"},
		}
		
		manager := NewWithRestriction(cfg, jwtDirs)
		
		// Should be able to zip allowed files
		var buf bytes.Buffer
		err = manager.CreateZip(&buf, []string{"/docs/test1.txt", "/images/test2.txt"})
		assert.NoError(t, err)
		assert.Greater(t, buf.Len(), 0)
		
		// Should skip restricted files silently
		buf.Reset()
		err = manager.CreateZip(&buf, []string{"/docs/test1.txt", "/private/test3.txt"})
		assert.NoError(t, err)
		assert.Greater(t, buf.Len(), 0) // Should still have docs file
	})
}