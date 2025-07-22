// Package filesystem handles file operations and quota management.
package filesystem

import (
	"archive/zip"
	"fmt"
	"io"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"dendrite/internal/config"
)

// Manager handles filesystem operations
type Manager struct {
	Config *config.Config
}

// New creates a new filesystem manager
func New(cfg *config.Config) *Manager {
	return &Manager{
		Config: cfg,
	}
}

// FileInfo represents file/directory information
type FileInfo struct {
	Name     string    `json:"name"`
	Path     string    `json:"path"`
	Size     int64     `json:"size"`
	IsDir    bool      `json:"isDir"`
	ModTime  time.Time `json:"modTime"`
	Mode     string    `json:"mode"`
	MimeType string    `json:"mimeType,omitempty"`
}

// QuotaInfo represents quota usage information
type QuotaInfo struct {
	Used      int64 `json:"used"`
	Limit     int64 `json:"limit"`
	Available int64 `json:"available"`
	Exceeded  bool  `json:"exceeded"`
}

// FileStatInfo represents detailed file stat information
type FileStatInfo struct {
	Name       string      `json:"name"`
	Path       string      `json:"path"`
	Size       int64       `json:"size"`
	IsDir      bool        `json:"isDir"`
	Mode       string      `json:"mode"`
	ModTime    time.Time   `json:"modTime"`
	AccessTime time.Time   `json:"accessTime"`
	ChangeTime time.Time   `json:"changeTime"`
	UID        uint32      `json:"uid"`
	Gid        uint32      `json:"gid"`
	Nlink      uint64      `json:"nlink"`
	MimeType   string      `json:"mimeType,omitempty"`
}

// UploadResult represents the result of a file upload
type UploadResult struct {
	Path     string `json:"path"`
	Size     int64  `json:"size"`
	Message  string `json:"message"`
}

// ListFiles returns a list of files in the given path
func (m *Manager) ListFiles(path string) ([]FileInfo, error) {
	fullPath := filepath.Join(m.Config.Dir, path)
	
	// Security check: ensure path is within managed directory
	if !m.isPathSafe(fullPath) {
		return nil, fmt.Errorf("access denied: path outside managed directory")
	}

	entries, err := os.ReadDir(fullPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read directory: %w", err)
	}

	files := make([]FileInfo, 0, len(entries))
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue // Skip files we can't read
		}

		relativePath := filepath.Join(path, entry.Name())
		fileInfo := FileInfo{
			Name:    entry.Name(),
			Path:    relativePath,
			Size:    info.Size(),
			IsDir:   entry.IsDir(),
			ModTime: info.ModTime(),
			Mode:    info.Mode().String(),
		}

		if !entry.IsDir() {
			fileInfo.MimeType = m.getMimeType(entry.Name())
		}

		files = append(files, fileInfo)
	}

	return files, nil
}

// GetQuotaInfo returns current quota usage information
func (m *Manager) GetQuotaInfo() (*QuotaInfo, error) {
	used, err := m.calculateDirectorySize(m.Config.Dir)
	if err != nil {
		return nil, fmt.Errorf("failed to calculate directory size: %w", err)
	}

	info := &QuotaInfo{
		Used:  used,
		Limit: m.Config.QuotaBytes,
	}

	if m.Config.QuotaBytes > 0 {
		info.Available = m.Config.QuotaBytes - used
		info.Exceeded = used > m.Config.QuotaBytes
	} else {
		info.Available = -1 // Unlimited
	}

	return info, nil
}

// isPathSafe checks if the given path is within the managed directory
func (m *Manager) isPathSafe(path string) bool {
	abs, err := filepath.Abs(path)
	if err != nil {
		return false
	}

	managedAbs, err := filepath.Abs(m.Config.Dir)
	if err != nil {
		return false
	}

	rel, err := filepath.Rel(managedAbs, abs)
	if err != nil {
		return false
	}

	// Path should not start with .. (going up from managed directory)
	return !filepath.IsAbs(rel) && !strings.HasPrefix(rel, "..")
}

// calculateDirectorySize recursively calculates the total size of a directory
func (m *Manager) calculateDirectorySize(path string) (int64, error) {
	var size int64

	err := filepath.WalkDir(path, func(_ string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // Skip files/directories we can't access
		}

		if !d.IsDir() {
			info, err := d.Info()
			if err != nil {
				return nil // Skip files we can't stat
			}
			size += info.Size()
		}

		return nil
	})

	return size, err
}

// UploadFile uploads a file to the specified path with quota checking
func (m *Manager) UploadFile(targetPath, filename string, file io.Reader, size int64) (
	result *UploadResult, err error) {
	// Check quota before upload
	if m.Config.QuotaBytes > 0 {
		currentUsed, err := m.calculateDirectorySize(m.Config.Dir)
		if err != nil {
			return nil, fmt.Errorf("failed to calculate current usage: %w", err)
		}
		
		if currentUsed+size > m.Config.QuotaBytes {
			return nil, fmt.Errorf("upload would exceed quota limit (current: %d, file: %d, limit: %d)", 
				currentUsed, size, m.Config.QuotaBytes)
		}
	}

	fullPath := filepath.Join(m.Config.Dir, targetPath, filename)
	
	// Security check
	if !m.isPathSafe(fullPath) {
		return nil, fmt.Errorf("access denied: path outside managed directory")
	}

	// Create directory if it doesn't exist
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0750); err != nil {
		return nil, fmt.Errorf("failed to create directory: %w", err)
	}

	// Create the file with secure permissions
	outFile, err := os.OpenFile(fullPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0640) // #nosec G302,G304
	if err != nil {
		return nil, fmt.Errorf("failed to create file: %w", err)
	}
	defer func() {
		if cerr := outFile.Close(); cerr != nil && err == nil {
			err = cerr
		}
	}()

	// Copy the file content
	written, err := io.Copy(outFile, file)
	if err != nil {
		return nil, fmt.Errorf("failed to write file: %w", err)
	}

	return &UploadResult{
		Path:    filepath.Join(targetPath, filename),
		Size:    written,
		Message: "File uploaded successfully",
	}, nil
}

// GetFilePath returns the full filesystem path for a relative path
func (m *Manager) GetFilePath(path string) (string, error) {
	fullPath := filepath.Join(m.Config.Dir, path)
	
	if !m.isPathSafe(fullPath) {
		return "", fmt.Errorf("access denied: path outside managed directory")
	}
	
	return fullPath, nil
}

// DeleteFile deletes a file or directory
func (m *Manager) DeleteFile(path string) error {
	fullPath := filepath.Join(m.Config.Dir, path)
	
	if !m.isPathSafe(fullPath) {
		return fmt.Errorf("access denied: path outside managed directory")
	}

	return os.RemoveAll(fullPath)
}

// MoveFile moves a file or directory from source to destination
func (m *Manager) MoveFile(sourcePath, destPath string) error {
	sourceFullPath := filepath.Join(m.Config.Dir, sourcePath)
	destFullPath := filepath.Join(m.Config.Dir, destPath)
	
	if !m.isPathSafe(sourceFullPath) || !m.isPathSafe(destFullPath) {
		return fmt.Errorf("access denied: path outside managed directory")
	}

	// Create destination directory if needed
	destDir := filepath.Dir(destFullPath)
	if err := os.MkdirAll(destDir, 0750); err != nil {
		return fmt.Errorf("failed to create destination directory: %w", err)
	}

	return os.Rename(sourceFullPath, destFullPath)
}

// CopyFile copies a file or directory from source to destination
func (m *Manager) CopyFile(sourcePath, destPath string) error {
	sourceFullPath := filepath.Join(m.Config.Dir, sourcePath)
	destFullPath := filepath.Join(m.Config.Dir, destPath)
	
	if !m.isPathSafe(sourceFullPath) || !m.isPathSafe(destFullPath) {
		return fmt.Errorf("access denied: path outside managed directory")
	}

	// Check if source exists
	sourceInfo, err := os.Stat(sourceFullPath)
	if err != nil {
		return fmt.Errorf("source file not found: %w", err)
	}

	// Check quota for copy operation
	if m.Config.QuotaBytes > 0 {
		currentUsed, err := m.calculateDirectorySize(m.Config.Dir)
		if err != nil {
			return fmt.Errorf("failed to calculate current usage: %w", err)
		}
		
		copySize := sourceInfo.Size()
		if sourceInfo.IsDir() {
			copySize, _ = m.calculateDirectorySize(sourceFullPath)
		}
		
		if currentUsed+copySize > m.Config.QuotaBytes {
			return fmt.Errorf("copy would exceed quota limit")
		}
	}

	// Create destination directory
	destDir := filepath.Dir(destFullPath)
	if err := os.MkdirAll(destDir, 0750); err != nil {
		return fmt.Errorf("failed to create destination directory: %w", err)
	}

	if sourceInfo.IsDir() {
		return m.copyDirectory(sourceFullPath, destFullPath)
	}
	
	return m.copyFile(sourceFullPath, destFullPath)
}

// StatFile returns detailed file stat information
func (m *Manager) StatFile(path string) (*FileStatInfo, error) {
	fullPath := filepath.Join(m.Config.Dir, path)
	
	if !m.isPathSafe(fullPath) {
		return nil, fmt.Errorf("access denied: path outside managed directory")
	}

	info, err := os.Stat(fullPath)
	if err != nil {
		return nil, fmt.Errorf("file not found: %w", err)
	}

	stat := &FileStatInfo{
		Name:    info.Name(),
		Path:    path,
		Size:    info.Size(),
		IsDir:   info.IsDir(),
		Mode:    info.Mode().String(),
		ModTime: info.ModTime(),
	}

	// Get system-specific stat info
	if sysstat, ok := info.Sys().(*syscall.Stat_t); ok {
		stat.UID = sysstat.Uid
		stat.Gid = sysstat.Gid
		stat.Nlink = uint64(sysstat.Nlink)
		stat.AccessTime, stat.ChangeTime = getStatTimes(sysstat)
	}

	if !info.IsDir() {
		stat.MimeType = m.getMimeType(info.Name())
	}

	return stat, nil
}

// copyFile copies a single file
func (m *Manager) copyFile(src, dst string) (err error) {
	sourceFile, err := os.Open(src) // #nosec G304
	if err != nil {
		return err
	}
	defer func() {
		if cerr := sourceFile.Close(); cerr != nil {
			log.Printf("Error closing source file: %v", cerr)
		}
	}()

	destFile, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0640) // #nosec G302,G304
	if err != nil {
		return err
	}
	defer func() {
		if cerr := destFile.Close(); cerr != nil && err == nil {
			err = cerr
		}
	}()

	_, err = io.Copy(destFile, sourceFile)
	if err != nil {
		return err
	}

	// Copy file permissions
	sourceInfo, err := os.Stat(src)
	if err != nil {
		return err
	}
	
	return os.Chmod(dst, sourceInfo.Mode())
}

// copyDirectory recursively copies a directory
func (m *Manager) copyDirectory(src, dst string) error {
	return filepath.WalkDir(src, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		// Calculate relative path
		relPath, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}

		destPath := filepath.Join(dst, relPath)

		if d.IsDir() {
			return os.MkdirAll(destPath, 0750)
		}

		return m.copyFile(path, destPath)
	})
}

// CreateZip creates a ZIP archive containing the specified paths
func (m *Manager) CreateZip(w io.Writer, paths []string) (err error) {
	zipWriter := zip.NewWriter(w)
	defer func() {
		if cerr := zipWriter.Close(); cerr != nil && err == nil {
			err = cerr
		}
	}()

	for _, path := range paths {
		fullPath := filepath.Join(m.Config.Dir, path)
		
		if !m.isPathSafe(fullPath) {
			continue // Skip unsafe paths
		}

		info, err := os.Stat(fullPath)
		if err != nil {
			continue // Skip missing files
		}

		if info.IsDir() {
			err = m.addDirToZip(zipWriter, fullPath, path)
		} else {
			err = m.addFileToZip(zipWriter, fullPath, path)
		}

		if err != nil {
			return fmt.Errorf("failed to add %s to zip: %w", path, err)
		}
	}

	return nil
}

// addFileToZip adds a single file to the zip archive
func (m *Manager) addFileToZip(zw *zip.Writer, fullPath, relativePath string) error {
	file, err := os.Open(fullPath) // #nosec G304
	if err != nil {
		return err
	}
	defer func() {
		if cerr := file.Close(); cerr != nil {
			log.Printf("Error closing file %s: %v", fullPath, cerr)
		}
	}()

	info, err := os.Stat(fullPath)
	if err != nil {
		return err
	}

	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	
	header.Name = relativePath
	header.Method = zip.Deflate

	writer, err := zw.CreateHeader(header)
	if err != nil {
		return err
	}

	_, err = io.Copy(writer, file)
	return err
}

// addDirToZip recursively adds a directory to the zip archive
func (m *Manager) addDirToZip(zw *zip.Writer, fullPath, relativePath string) error {
	return filepath.WalkDir(fullPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // Skip files we can't access
		}

		// Calculate relative path within the zip
		relPath, err := filepath.Rel(fullPath, path)
		if err != nil {
			return err
		}

		zipPath := filepath.Join(relativePath, relPath)
		
		if d.IsDir() {
			// Create directory entry in zip
			header := &zip.FileHeader{
				Name:   zipPath + "/",
				Method: zip.Store,
			}
			_, err = zw.CreateHeader(header)
			return err
		}

		// Add file to zip
		return m.addFileToZip(zw, path, zipPath)
	})
}

// CreateFolder creates a new directory at the specified path
func (m *Manager) CreateFolder(path string) error {
	fullPath := filepath.Join(m.Config.Dir, path)
	
	if !m.isPathSafe(fullPath) {
		return fmt.Errorf("access denied: path outside managed directory")
	}

	// Check if directory already exists
	if _, err := os.Stat(fullPath); err == nil {
		return fmt.Errorf("directory already exists")
	}

	// Create the directory with 755 permissions
	if err := os.MkdirAll(fullPath, 0750); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	return nil
}

// getMimeType returns a basic MIME type based on file extension
func (m *Manager) getMimeType(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".txt", ".log":
		return "text/plain"
	case ".html", ".htm":
		return "text/html"
	case ".css":
		return "text/css"
	case ".js":
		return "application/javascript"
	case ".json":
		return "application/json"
	case ".pdf":
		return "application/pdf"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".zip":
		return "application/zip"
	case ".tar", ".gz":
		return "application/gzip"
	case ".go":
		return "text/plain"
	case ".md":
		return "text/markdown"
	case ".yaml", ".yml":
		return "application/yaml"
	default:
		return "application/octet-stream"
	}
}