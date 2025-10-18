package filesystem

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"dendrite/internal/config"
)

const sampleExifJPEGBase64 = "" +
	"/9j/4QGPRXhpZgAATU0AKgAAAAgACQEPAAIAAAAMAAAAegEQAAIAAAAHAAAAhgEaAAUAAAABAAAAjQEbAAUAAAABAAAAlQEo" +
	"AAMAAAABAAIAAAExAAIAAAAHAAAAnQE7AAIAAAAHAAAApIdpAAQAAAABAAAAq4glAAQAAAABAAABJQAAAABEZW5kcml0ZUNh" +
	"bQBNb2RlbFgAAAABLAAAAAEAAAEsAAAAAXBpZXhpZgBUZXN0ZXIAAAeCmgAFAAAAAQAAAQGCnQAFAAAAAQAAAQmIJwADAAAA" +
	"AQDIAACQAwACAAAAFAAAARGgAQADAAAAAQABAACgAgAEAAAAAQAAAAOgAwAEAAAAAQAAAAIAAAABAAAAfQAAABwAAAAKMjAy" +
	"NToxMDowOCAyMDo0MDowMAAABAABAAIAAAACTgAAAAACAAUAAAADAAABVwADAAIAAAACRQAAAAAEAAUAAAADAAABbwAAACgA" +
	"AAABAAAAAAAAAAEAAAAAAAAAAQAAAEoAAAABAAAAAAAAAAEAAAAAAAAAAf/bAEMAAwICAwICAwMDAwQDAwQFCAUFBAQFCgcH" +
	"BggMCgwMCwoLCw0OEhANDhEOCwsQFhARExQVFRUMDxcYFhQYEhQVFP/bAEMBAwQEBQQFCQUFCRQNCw0UFBQUFBQUFBQUFBQU" +
	"FBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFP/AABEIAAIAAwMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAA" +
	"AAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQz" +
	"YnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJma" +
	"oqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEB" +
	"AAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVi" +
	"ctEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeY" +
	"mZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APW6" +
	"KKK/Aj8vP//Z"

func TestManager_isPathSafe(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "dendrite-test")
	require.NoError(t, err)
	defer func() {
		if err := os.RemoveAll(tempDir); err != nil {
			t.Errorf("Failed to remove temp dir: %v", err)
		}
	}()

	cfg := &config.Config{
		Directories: []config.DirMapping{
			{Source: tempDir, Virtual: "/test"},
		},
	}
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
				Directories: []config.DirMapping{
					{Source: tempDir, Virtual: "/test"},
				},
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
		name          string
		quotaBytes    int64
		existingFiles map[string]int64 // filename -> size
		uploadSize    int64
		expectedError string
	}{
		{
			name:          "Upload exceeds quota - empty directory",
			quotaBytes:    1048576, // 1 MB
			uploadSize:    1126400, // 1.07 MB
			expectedError: "upload would exceed quota limit (current: 0 B, file: 1.07 MB, limit: 1.00 MB)",
		},
		{
			name:       "Upload exceeds quota - with existing files",
			quotaBytes: 1048576, // 1 MB
			existingFiles: map[string]int64{
				"existing.txt": 512000, // 500 KB
			},
			uploadSize:    614400, // 600 KB
			expectedError: "upload would exceed quota limit (current: 500.00 KB, file: 600.00 KB, limit: 1.00 MB)",
		},
		{
			name:       "Large quota in GB",
			quotaBytes: 5368709120, // 5 GB
			existingFiles: map[string]int64{
				"large1.bin": 2147483648, // 2 GB
				"large2.bin": 2147483648, // 2 GB
			},
			uploadSize:    1610612736, // 1.5 GB
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
				err := os.WriteFile(filePath, make([]byte, size), 0600)
				require.NoError(t, err)
			}

			cfg := &config.Config{
				Directories: []config.DirMapping{
					{Source: testDir, Virtual: "/test"},
				},
				QuotaBytes: tt.quotaBytes,
			}
			manager := New(cfg)

			// Try to upload a file that exceeds quota
			reader := bytes.NewReader(make([]byte, tt.uploadSize))
			_, err = manager.UploadFile("/test", "test-upload.bin", reader, tt.uploadSize)

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
	err = os.WriteFile(sourceFile, make([]byte, sourceSize), 0600)
	require.NoError(t, err)

	// Create an existing file to contribute to quota usage
	existingFile := filepath.Join(tempDir, "existing.bin")
	existingSize := int64(512000) // 500 KB
	err = os.WriteFile(existingFile, make([]byte, existingSize), 0600)
	require.NoError(t, err)

	cfg := &config.Config{
		Directories: []config.DirMapping{
			{Source: tempDir, Virtual: "/test"},
		},
		QuotaBytes: 1048576, // 1 MB
	}
	manager := New(cfg)

	// Try to copy file that would exceed quota
	err = manager.CopyFile("/test/source.bin", "/test/dest.bin")

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
		Directories: []config.DirMapping{
			{Source: tempDir, Virtual: "/test"},
		},
		QuotaBytes: 1048576, // 1 MB
	}
	manager := New(cfg)

	// Upload a file within quota
	uploadSize := int64(102400) // 100 KB
	reader := bytes.NewReader(make([]byte, uploadSize))
	result, err := manager.UploadFile("/test", "small.bin", reader, uploadSize)

	// Should succeed
	require.NoError(t, err)
	assert.NotNil(t, result)
	assert.Equal(t, "/test/small.bin", result.Path)
	assert.Equal(t, uploadSize, result.Size)

	// Verify file was created
	filePath := filepath.Join(tempDir, "small.bin")
	info, err := os.Stat(filePath)
	require.NoError(t, err)
	assert.Equal(t, uploadSize, info.Size())
}

func TestVirtualPathOperations(t *testing.T) {
	// Create test directories
	tempDir1 := t.TempDir()
	tempDir2 := t.TempDir()

	// Create test configuration
	cfg := &config.Config{
		QuotaBytes: 1024 * 1024 * 10, // 10MB
		Directories: []config.DirMapping{
			{Source: tempDir1, Virtual: "/test1"},
			{Source: tempDir2, Virtual: "/test2"},
		},
	}

	// Create filesystem manager
	mgr := New(cfg)

	t.Run("ListVirtualRoot", func(t *testing.T) {
		files, err := mgr.ListFiles("/")
		require.NoError(t, err)
		assert.Len(t, files, 2)
		assert.Equal(t, "test1", files[0].Name)
		assert.Equal(t, "test2", files[1].Name)
	})

	t.Run("UploadToVirtualPath", func(t *testing.T) {
		content := "test content"
		reader := bytes.NewReader([]byte(content))

		result, err := mgr.UploadFile("/test1", "test.txt", reader, int64(len(content)))
		require.NoError(t, err)
		assert.Equal(t, "/test1/test.txt", result.Path)

		// Verify file exists
		physicalPath := filepath.Join(tempDir1, "test.txt")
		assert.FileExists(t, physicalPath)

		// Verify content
		data, err := os.ReadFile(physicalPath) // #nosec G304 - test file
		require.NoError(t, err)
		assert.Equal(t, content, string(data))
	})

	t.Run("ListVirtualDirectory", func(t *testing.T) {
		files, err := mgr.ListFiles("/test1")
		require.NoError(t, err)
		assert.Len(t, files, 1)
		assert.Equal(t, "test.txt", files[0].Name)
		assert.Equal(t, "/test1/test.txt", files[0].Path)
	})

	t.Run("CopyAcrossVirtualPaths", func(t *testing.T) {
		err := mgr.CopyFile("/test1/test.txt", "/test2/copy.txt")
		require.NoError(t, err)

		// Verify copy exists
		physicalPath := filepath.Join(tempDir2, "copy.txt")
		assert.FileExists(t, physicalPath)

		// Verify content
		data, err := os.ReadFile(physicalPath) // #nosec G304 - test file
		require.NoError(t, err)
		assert.Equal(t, "test content", string(data))
	})

	t.Run("MoveAcrossVirtualPaths", func(t *testing.T) {
		// Create a new file
		content := "move test"
		reader := bytes.NewReader([]byte(content))
		_, err := mgr.UploadFile("/test1", "move.txt", reader, int64(len(content)))
		require.NoError(t, err)

		// Move it
		err = mgr.MoveFile("/test1/move.txt", "/test2/moved.txt")
		require.NoError(t, err)

		// Verify source doesn't exist
		sourcePath := filepath.Join(tempDir1, "move.txt")
		assert.NoFileExists(t, sourcePath)

		// Verify destination exists
		destPath := filepath.Join(tempDir2, "moved.txt")
		assert.FileExists(t, destPath)
	})

	t.Run("DeleteFromVirtualPath", func(t *testing.T) {
		err := mgr.DeleteFile("/test2/copy.txt")
		require.NoError(t, err)

		// Verify file doesn't exist
		physicalPath := filepath.Join(tempDir2, "copy.txt")
		assert.NoFileExists(t, physicalPath)
	})

	t.Run("QuotaCalculation", func(t *testing.T) {
		quota, err := mgr.GetQuotaInfo()
		require.NoError(t, err)

		// Should have files from previous tests
		assert.Greater(t, quota.Used, int64(0))
		assert.Equal(t, cfg.QuotaBytes, quota.Limit)
		assert.False(t, quota.Exceeded)
	})

	t.Run("CreateFolderInVirtualPath", func(t *testing.T) {
		err := mgr.CreateFolder("/test1/subfolder")
		require.NoError(t, err)

		// Verify folder exists
		physicalPath := filepath.Join(tempDir1, "subfolder")
		info, err := os.Stat(physicalPath)
		require.NoError(t, err)
		assert.True(t, info.IsDir())
	})

	t.Run("InvalidVirtualPath", func(t *testing.T) {
		_, err := mgr.ListFiles("/invalid")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "virtual path not found")
	})
}

func TestJWTRestrictions(t *testing.T) {
	// Create test directories
	tempDir1 := t.TempDir()
	tempDir2 := t.TempDir()
	tempDir3 := t.TempDir()

	// Create test configuration with 3 directories
	cfg := &config.Config{
		QuotaBytes: 1024 * 1024 * 10, // 10MB
		Directories: []config.DirMapping{
			{Source: tempDir1, Virtual: "/dir1"},
			{Source: tempDir2, Virtual: "/dir2"},
			{Source: tempDir3, Virtual: "/dir3"},
		},
	}

	// Create filesystem manager with JWT restrictions (only dir1 and dir2)
	jwtDirs := []config.DirMapping{
		{Source: tempDir1, Virtual: "/dir1"},
		{Source: tempDir2, Virtual: "/dir2"},
	}
	mgr := NewWithRestriction(cfg, jwtDirs)

	t.Run("ListRestrictedRoot", func(t *testing.T) {
		files, err := mgr.ListFiles("/")
		require.NoError(t, err)
		assert.Len(t, files, 2)
		assert.Equal(t, "dir1", files[0].Name)
		assert.Equal(t, "dir2", files[1].Name)
		// dir3 should not be visible
	})

	t.Run("AccessRestrictedDirectory", func(t *testing.T) {
		// Should be able to access dir1
		_, err := mgr.ListFiles("/dir1")
		assert.NoError(t, err)

		// Should be able to access dir2
		_, err = mgr.ListFiles("/dir2")
		assert.NoError(t, err)

		// Should NOT be able to access dir3
		_, err = mgr.ListFiles("/dir3")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "virtual path not found")
	})

	t.Run("UploadToRestrictedPath", func(t *testing.T) {
		// Should fail to upload to dir3
		content := "test"
		reader := bytes.NewReader([]byte(content))
		_, err := mgr.UploadFile("/dir3", "test.txt", reader, int64(len(content)))
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "virtual path not found")
	})
}

func TestCreateZip(t *testing.T) {
	// Create test directory
	tempDir := t.TempDir()

	// Create test configuration
	cfg := &config.Config{
		Directories: []config.DirMapping{
			{Source: tempDir, Virtual: "/test"},
		},
	}

	// Create filesystem manager
	mgr := New(cfg)

	// Create test files
	testFiles := map[string]string{
		"file1.txt":     "content1",
		"file2.txt":     "content2",
		"dir/file3.txt": "content3",
	}

	for name, content := range testFiles {
		fullPath := filepath.Join(tempDir, name)
		dir := filepath.Dir(fullPath)
		err := os.MkdirAll(dir, 0750)
		require.NoError(t, err)
		err = os.WriteFile(fullPath, []byte(content), 0600)
		require.NoError(t, err)
	}

	t.Run("CreateZipWithFiles", func(t *testing.T) {
		var buf bytes.Buffer
		paths := []string{"/test/file1.txt", "/test/file2.txt"}

		err := mgr.CreateZip(&buf, paths)
		require.NoError(t, err)

		// Verify zip was created
		assert.Greater(t, buf.Len(), 0)
	})

	t.Run("CreateZipWithDirectory", func(t *testing.T) {
		var buf bytes.Buffer
		paths := []string{"/test/dir"}

		err := mgr.CreateZip(&buf, paths)
		require.NoError(t, err)

		// Verify zip was created
		assert.Greater(t, buf.Len(), 0)
	})
}

func TestStatFile(t *testing.T) {
	// Create test directory
	tempDir := t.TempDir()

	// Create test configuration
	cfg := &config.Config{
		Directories: []config.DirMapping{
			{Source: tempDir, Virtual: "/test"},
		},
	}

	// Create filesystem manager
	mgr := New(cfg)

	// Create test file
	testFile := filepath.Join(tempDir, "stat-test.txt")
	content := "test content for stat"
	err := os.WriteFile(testFile, []byte(content), 0600)
	require.NoError(t, err)

	// Create image file
	imageFile := filepath.Join(tempDir, "stat-image.png")
	img := image.NewRGBA(image.Rect(0, 0, 2, 3))
	for y := 0; y < 3; y++ {
		for x := 0; x < 2; x++ {
			alpha := uint8(255)
			if x == 0 && y == 0 {
				alpha = 128
			}
			red := 50 * x
			if red > 255 {
				red = 255
			}
			green := 80 * y
			if green > 255 {
				green = 255
			}
			// #nosec G115 -- red and green are clamped to the uint8 range above.
			img.Set(x, y, color.RGBA{R: uint8(red), G: uint8(green), B: 120, A: alpha})
		}
	}
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, img))
	require.NoError(t, os.WriteFile(imageFile, buf.Bytes(), 0600))

	// Create JPEG with EXIF metadata
	exifBytes, err := base64.StdEncoding.DecodeString(sampleExifJPEGBase64)
	require.NoError(t, err)
	exifFile := filepath.Join(tempDir, "stat-exif.jpg")
	require.NoError(t, os.WriteFile(exifFile, exifBytes, 0600))

	t.Run("StatExistingFile", func(t *testing.T) {
		stat, err := mgr.StatFile("/test/stat-test.txt")
		require.NoError(t, err)

		assert.Equal(t, "stat-test.txt", stat.Name)
		assert.Equal(t, "/test/stat-test.txt", stat.Path)
		assert.Equal(t, int64(len(content)), stat.Size)
		assert.False(t, stat.IsDir)
		assert.Equal(t, "text/plain", stat.MimeType)
	})

	t.Run("StatImageFile", func(t *testing.T) {
		stat, err := mgr.StatFile("/test/stat-image.png")
		require.NoError(t, err)

		assert.Equal(t, "stat-image.png", stat.Name)
		assert.Equal(t, "/test/stat-image.png", stat.Path)
		if assert.NotNil(t, stat.Image) {
			assert.Equal(t, "image/png", stat.MimeType)
			assert.Equal(t, 2, stat.Image.Width)
			assert.Equal(t, 3, stat.Image.Height)
			assert.Equal(t, 8, stat.Image.ColorDepth)
			assert.Equal(t, "RGBA", stat.Image.ColorType)
		}
	})

	t.Run("StatExifJPEG", func(t *testing.T) {
		stat, err := mgr.StatFile("/test/stat-exif.jpg")
		require.NoError(t, err)

		if assert.NotNil(t, stat.Image) {
			assert.True(t, stat.Image.HasExif)
			assert.Greater(t, stat.Image.DPIWidth, 0.0)
			assert.Equal(t, "sRGB", stat.Image.ColorSpace)
		}
	})

	t.Run("StatNonExistentFile", func(t *testing.T) {
		_, err := mgr.StatFile("/test/nonexistent.txt")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "file not found")
	})

	t.Run("StatInvalidVirtualPath", func(t *testing.T) {
		_, err := mgr.StatFile("/invalid/file.txt")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "virtual path not found")
	})

	t.Run("GetExifData", func(t *testing.T) {
		exifData, err := mgr.GetExifData("/test/stat-exif.jpg")
		require.NoError(t, err)
		require.NotNil(t, exifData)
		if assert.Contains(t, exifData.Tags, "Make") {
			assert.Equal(t, "DendriteCam", exifData.Tags["Make"])
		}
	})
}
