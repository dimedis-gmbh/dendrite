// Package filesystem handles file operations and quota management.
package filesystem

import (
	"archive/zip"
	"bytes"
	"encoding/binary"
	"fmt"
	"image"
	"image/color"
	// register GIF decoder for metadata extraction
	_ "image/gif"
	// register JPEG decoder for metadata extraction
	_ "image/jpeg"
	// register PNG decoder for metadata extraction
	_ "image/png"
	"io"
	"io/fs"
	"log"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"dendrite/internal/config"
	"dendrite/internal/format"

	"github.com/rwcarlsen/goexif/exif"
	"github.com/rwcarlsen/goexif/tiff"
)

// Manager handles filesystem operations
type Manager struct {
	Config      *config.Config
	VirtualFS   *VirtualFS
	Directories []config.DirMapping // JWT-restricted directories (subset of Config.Directories)
}

// New creates a new filesystem manager
func New(cfg *config.Config) *Manager {
	return &Manager{
		Config:      cfg,
		VirtualFS:   NewVirtualFS(cfg.Directories),
		Directories: cfg.Directories, // Use all configured directories
	}
}

// NewWithRestriction creates a new filesystem manager with JWT directory restrictions
func NewWithRestriction(cfg *config.Config, jwtDirs []config.DirMapping) *Manager {
	return &Manager{
		Config:      cfg,
		VirtualFS:   NewVirtualFS(jwtDirs),
		Directories: jwtDirs, // Use only JWT-allowed directories
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
	Name       string         `json:"name"`
	Path       string         `json:"path"`
	Size       int64          `json:"size"`
	IsDir      bool           `json:"isDir"`
	Mode       string         `json:"mode"`
	ModTime    time.Time      `json:"modTime"`
	AccessTime time.Time      `json:"accessTime"`
	ChangeTime time.Time      `json:"changeTime"`
	UID        uint32         `json:"uid"`
	Gid        uint32         `json:"gid"`
	Nlink      uint64         `json:"nlink"`
	MimeType   string         `json:"mimeType,omitempty"`
	Image      *ImageMetadata `json:"image,omitempty"`
}

// ImageMetadata captures derived metadata for image files.
type ImageMetadata struct {
	Width      int     `json:"width,omitempty"`
	Height     int     `json:"height,omitempty"`
	ColorDepth int     `json:"colorDepth,omitempty"`
	ColorType  string  `json:"colorType,omitempty"`
	HasAlpha   bool    `json:"hasAlpha,omitempty"`
	ColorSpace string  `json:"colorSpace,omitempty"`
	DPIWidth   float64 `json:"dpiWidth,omitempty"`
	DPIHeight  float64 `json:"dpiHeight,omitempty"`
	HasExif    bool    `json:"hasExif,omitempty"`
}

// ExifData contains extracted EXIF tag values.
type ExifData struct {
	Tags map[string]string `json:"tags"`
}

// UploadResult represents the result of a file upload
type UploadResult struct {
	Path    string `json:"path"`
	Size    int64  `json:"size"`
	Message string `json:"message"`
}

// resolvePath converts a virtual path to a physical path
func (m *Manager) resolvePath(virtualPath string) (string, error) {
	physicalPath, found := m.VirtualFS.ResolvePath(virtualPath)
	if !found {
		return "", fmt.Errorf("virtual path not found: %s", virtualPath)
	}
	return physicalPath, nil
}

// ListFiles returns a list of files in the given virtual path
func (m *Manager) ListFiles(virtualPath string) ([]FileInfo, error) {
	// Handle virtual root specially
	if m.VirtualFS.IsVirtualRoot(virtualPath) {
		// Check if we have a single directory mapping to root
		if len(m.Directories) == 1 && m.Directories[0].Virtual == "/" {
			// The root maps directly to a physical directory, list its contents
			virtualPath = "/"
		} else {
			// Multiple mappings or non-root mappings, show virtual directories
			return m.listVirtualRoot()
		}
	}

	// Resolve virtual path to physical path
	fullPath, err := m.resolvePath(virtualPath)
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("directory not found: %s", virtualPath)
		}
		return nil, fmt.Errorf("failed to read directory: %w", err)
	}

	files := make([]FileInfo, 0, len(entries))
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue // Skip files we can't read
		}

		// Convert physical path back to virtual path
		physicalPath := filepath.Join(fullPath, entry.Name())
		virtualPath, _ := m.VirtualFS.GetVirtualPath(physicalPath)

		fileInfo := FileInfo{
			Name:    entry.Name(),
			Path:    virtualPath,
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
	// Calculate total size across all directories
	var totalUsed int64
	for _, dir := range m.Directories {
		size, err := m.calculateDirectorySize(dir.Source)
		if err != nil {
			log.Printf("Warning: failed to calculate size for %s: %v", dir.Source, err)
			continue
		}
		totalUsed += size
	}

	info := &QuotaInfo{
		Used:  totalUsed,
		Limit: m.Config.QuotaBytes,
	}

	if m.Config.QuotaBytes > 0 {
		info.Available = m.Config.QuotaBytes - totalUsed
		info.Exceeded = totalUsed > m.Config.QuotaBytes
	} else {
		info.Available = -1 // Unlimited
	}

	return info, nil
}

// listVirtualRoot lists the virtual directories at the root level
func (m *Manager) listVirtualRoot() ([]FileInfo, error) {
	var files []FileInfo

	// Get unique top-level virtual directories
	seen := make(map[string]bool)

	for _, dir := range m.Directories {
		// Extract the top-level component
		parts := strings.Split(strings.TrimPrefix(dir.Virtual, "/"), "/")
		if len(parts) == 0 || parts[0] == "" {
			continue
		}

		topLevel := parts[0]
		if seen[topLevel] {
			continue
		}
		seen[topLevel] = true

		// Check if this maps directly to a physical directory
		virtualPath := "/" + topLevel
		if physicalPath, found := m.VirtualFS.ResolvePath(virtualPath); found {
			// Get info from the physical directory
			info, err := os.Stat(physicalPath)
			if err == nil {
				files = append(files, FileInfo{
					Name:    topLevel,
					Path:    virtualPath,
					Size:    info.Size(),
					IsDir:   true,
					ModTime: info.ModTime(),
					Mode:    info.Mode().String(),
				})
			}
		} else {
			// Virtual directory without direct mapping
			files = append(files, FileInfo{
				Name:    topLevel,
				Path:    virtualPath,
				Size:    0,
				IsDir:   true,
				ModTime: time.Now(),
				Mode:    "drwxr-xr-x",
			})
		}
	}

	// Sort by name
	sort.Slice(files, func(i, j int) bool {
		return files[i].Name < files[j].Name
	})

	return files, nil
}

// isPathSafe checks if the given physical path is within any managed directory
func (m *Manager) isPathSafe(physicalPath string) bool {
	abs, err := filepath.Abs(physicalPath)
	if err != nil {
		return false
	}

	// Check if path is within any of the configured directories
	for _, dir := range m.Directories {
		absBase, err := filepath.Abs(dir.Source)
		if err != nil {
			continue
		}

		// Check if the path is within this directory
		rel, err := filepath.Rel(absBase, abs)
		if err != nil {
			continue
		}

		// Path is safe if it doesn't start with ".." (going up)
		if !strings.HasPrefix(rel, "..") && !strings.HasPrefix(filepath.ToSlash(rel), "..") {
			return true
		}
	}

	return false
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

// UploadFile uploads a file to the specified virtual path with quota checking
func (m *Manager) UploadFile(virtualTargetPath, filename string, file io.Reader, size int64) (
	result *UploadResult, err error) {
	// Check quota before upload
	if m.Config.QuotaBytes > 0 {
		quotaInfo, err := m.GetQuotaInfo()
		if err != nil {
			return nil, fmt.Errorf("failed to calculate current usage: %w", err)
		}

		if quotaInfo.Used+size > m.Config.QuotaBytes {
			return nil, fmt.Errorf("upload would exceed quota limit (current: %s, file: %s, limit: %s)",
				format.FileSize(quotaInfo.Used),
				format.FileSize(size),
				format.FileSize(m.Config.QuotaBytes))
		}
	}

	// Combine virtual path with filename
	virtualFullPath := filepath.ToSlash(filepath.Join(virtualTargetPath, filename))

	// Resolve virtual path to physical path
	physicalPath, err := m.resolvePath(virtualFullPath)
	if err != nil {
		return nil, fmt.Errorf("invalid virtual path: %w", err)
	}

	// Security check
	if !m.isPathSafe(physicalPath) {
		return nil, fmt.Errorf("access denied: path outside managed directory")
	}

	// Create directory if it doesn't exist
	dir := filepath.Dir(physicalPath)
	if err := os.MkdirAll(dir, 0750); err != nil {
		return nil, fmt.Errorf("failed to create directory: %w", err)
	}

	// Create the file with secure permissions
	outFile, err := os.OpenFile(physicalPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0640) // #nosec G302,G304
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
		Path:    virtualFullPath,
		Size:    written,
		Message: "File uploaded successfully",
	}, nil
}

// GetFilePath returns the full filesystem path for a virtual path
func (m *Manager) GetFilePath(virtualPath string) (string, error) {
	physicalPath, err := m.resolvePath(virtualPath)
	if err != nil {
		return "", err
	}

	if !m.isPathSafe(physicalPath) {
		return "", fmt.Errorf("access denied: path outside managed directory")
	}

	return physicalPath, nil
}

// DeleteFile deletes a file or directory
func (m *Manager) DeleteFile(virtualPath string) error {
	physicalPath, err := m.resolvePath(virtualPath)
	if err != nil {
		return err
	}

	if !m.isPathSafe(physicalPath) {
		return fmt.Errorf("access denied: path outside managed directory")
	}

	return os.RemoveAll(physicalPath)
}

// MoveFile moves a file or directory from source to destination
func (m *Manager) MoveFile(virtualSourcePath, virtualDestPath string) error {
	sourcePhysicalPath, err := m.resolvePath(virtualSourcePath)
	if err != nil {
		return fmt.Errorf("invalid source path: %w", err)
	}

	destPhysicalPath, err := m.resolvePath(virtualDestPath)
	if err != nil {
		return fmt.Errorf("invalid destination path: %w", err)
	}

	if !m.isPathSafe(sourcePhysicalPath) || !m.isPathSafe(destPhysicalPath) {
		return fmt.Errorf("access denied: path outside managed directory")
	}

	// Create destination directory if needed
	destDir := filepath.Dir(destPhysicalPath)
	if err := os.MkdirAll(destDir, 0750); err != nil {
		return fmt.Errorf("failed to create destination directory: %w", err)
	}

	return os.Rename(sourcePhysicalPath, destPhysicalPath)
}

// CopyFile copies a file or directory from source to destination
func (m *Manager) CopyFile(virtualSourcePath, virtualDestPath string) error {
	sourcePhysicalPath, err := m.resolvePath(virtualSourcePath)
	if err != nil {
		return fmt.Errorf("invalid source path: %w", err)
	}

	destPhysicalPath, err := m.resolvePath(virtualDestPath)
	if err != nil {
		return fmt.Errorf("invalid destination path: %w", err)
	}

	if !m.isPathSafe(sourcePhysicalPath) || !m.isPathSafe(destPhysicalPath) {
		return fmt.Errorf("access denied: path outside managed directory")
	}

	// Check if source exists
	sourceInfo, err := os.Stat(sourcePhysicalPath)
	if err != nil {
		return fmt.Errorf("source file not found: %w", err)
	}

	// Check quota for copy operation
	if m.Config.QuotaBytes > 0 {
		quotaInfo, err := m.GetQuotaInfo()
		if err != nil {
			return fmt.Errorf("failed to calculate current usage: %w", err)
		}

		copySize := sourceInfo.Size()
		if sourceInfo.IsDir() {
			copySize, _ = m.calculateDirectorySize(sourcePhysicalPath)
		}

		if quotaInfo.Used+copySize > m.Config.QuotaBytes {
			return fmt.Errorf("copy would exceed quota limit (current: %s, copy size: %s, limit: %s)",
				format.FileSize(quotaInfo.Used),
				format.FileSize(copySize),
				format.FileSize(m.Config.QuotaBytes))
		}
	}

	// Create destination directory
	destDir := filepath.Dir(destPhysicalPath)
	if err := os.MkdirAll(destDir, 0750); err != nil {
		return fmt.Errorf("failed to create destination directory: %w", err)
	}

	if sourceInfo.IsDir() {
		return m.copyDirectory(sourcePhysicalPath, destPhysicalPath)
	}

	return m.copyFile(sourcePhysicalPath, destPhysicalPath)
}

// StatFile returns detailed file stat information
func (m *Manager) StatFile(virtualPath string) (*FileStatInfo, error) {
	physicalPath, err := m.resolvePath(virtualPath)
	if err != nil {
		return nil, err
	}

	if !m.isPathSafe(physicalPath) {
		return nil, fmt.Errorf("access denied: path outside managed directory")
	}

	info, err := os.Stat(physicalPath)
	if err != nil {
		return nil, fmt.Errorf("file not found: %w", err)
	}

	stat := &FileStatInfo{
		Name:    info.Name(),
		Path:    virtualPath,
		Size:    info.Size(),
		IsDir:   info.IsDir(),
		Mode:    info.Mode().String(),
		ModTime: info.ModTime(),
	}

	// Get system-specific stat info
	getSysStatInfo(info, stat)

	if !info.IsDir() {
		stat.MimeType = m.getMimeType(info.Name())

		if meta, err := m.extractImageMetadata(physicalPath, stat.MimeType); err == nil && meta != nil {
			stat.Image = meta
		} else if err != nil {
			log.Printf("Warning: failed to extract image metadata for %s: %v", physicalPath, err)
		}
	}

	return stat, nil
}

func (m *Manager) extractImageMetadata(physicalPath, mimeType string) (*ImageMetadata, error) {
	if mimeType == "" || !strings.HasPrefix(mimeType, "image/") {
		return nil, nil
	}

	// #nosec G304 -- physicalPath is resolved via the virtual filesystem and cannot escape configured roots.
	file, err := os.Open(physicalPath)
	if err != nil {
		return nil, err
	}
	defer func() {
		if cerr := file.Close(); cerr != nil {
			log.Printf("Error closing image file: %v", cerr)
		}
	}()

	meta := &ImageMetadata{}

	if _, err := file.Seek(0, io.SeekStart); err == nil {
		if cfg, _, err := image.DecodeConfig(file); err == nil {
			meta.Width = cfg.Width
			meta.Height = cfg.Height
			colorType, hasAlpha, colorDepth := describeColorModel(cfg.ColorModel)
			if colorType != "" {
				meta.ColorType = colorType
			}
			meta.HasAlpha = hasAlpha
			if colorDepth > 0 {
				meta.ColorDepth = colorDepth
			}
		}
	}

	switch {
	case strings.Contains(mimeType, "png"):
		if _, err := file.Seek(0, io.SeekStart); err == nil {
			if err := parsePNGMetadata(file, meta); err != nil {
				return meta, err
			}
		}
	case strings.Contains(mimeType, "jpeg") || strings.Contains(mimeType, "jpg") || strings.Contains(mimeType, "jfif"):
		if err := parseJPEGMetadata(file, meta); err != nil {
			return meta, err
		}
	default:
		// Best-effort: if we have color depth but no color space, set defaults
		if meta.ColorSpace == "" {
			meta.ColorSpace = "Unspecified"
		}
	}

	if meta.ColorDepth == 0 {
		// Assume 8-bit depth when not provided
		meta.ColorDepth = 8
	}

	if meta.ColorSpace == "" {
		meta.ColorSpace = "Unspecified"
	}

	return meta, nil
}

func parsePNGMetadata(r io.ReadSeeker, meta *ImageMetadata) error {
	const ppmToDPI = 0.0254
	signature := make([]byte, 8)
	if _, err := io.ReadFull(r, signature); err != nil {
		return err
	}
	if !bytes.Equal(signature, []byte{137, 80, 78, 71, 13, 10, 26, 10}) {
		return fmt.Errorf("invalid PNG signature")
	}

	var seenIHDR bool
	for {
		var length uint32
		if err := binary.Read(r, binary.BigEndian, &length); err != nil {
			return err
		}

		typeBytes := make([]byte, 4)
		if _, err := io.ReadFull(r, typeBytes); err != nil {
			return err
		}
		chunkType := string(typeBytes)

		chunkData := make([]byte, length)
		if _, err := io.ReadFull(r, chunkData); err != nil {
			return err
		}

		// Skip CRC
		if _, err := io.CopyN(io.Discard, r, 4); err != nil {
			return err
		}

		switch chunkType {
		case "IHDR":
			if length != 13 {
				return fmt.Errorf("invalid IHDR length")
			}
			meta.Width = int(binary.BigEndian.Uint32(chunkData[0:4]))
			meta.Height = int(binary.BigEndian.Uint32(chunkData[4:8]))
			bitDepth := int(chunkData[8])
			colorType := chunkData[9]
			meta.ColorDepth = bitDepth
			meta.ColorType = describePNGColorType(colorType)
			meta.HasAlpha = pngHasAlpha(colorType)
			meta.ColorSpace = "Unspecified"
			seenIHDR = true
		case "pHYs":
			if length == 9 {
				x := binary.BigEndian.Uint32(chunkData[0:4])
				y := binary.BigEndian.Uint32(chunkData[4:8])
				unit := chunkData[8]
				if unit == 1 {
					meta.DPIWidth = math.Round(float64(x)*ppmToDPI*100) / 100
					meta.DPIHeight = math.Round(float64(y)*ppmToDPI*100) / 100
				}
			}
		case "sRGB":
			meta.ColorSpace = "sRGB"
		case "iCCP":
			if meta.ColorSpace == "" || meta.ColorSpace == "Unspecified" {
				meta.ColorSpace = "ICC Profile"
			}
		}

		if chunkType == "IEND" {
			break
		}
	}

	if !seenIHDR {
		return fmt.Errorf("IHDR chunk missing")
	}

	return nil
}

func parseJPEGMetadata(r io.ReadSeeker, meta *ImageMetadata) error {
	if _, err := r.Seek(0, io.SeekStart); err != nil {
		return err
	}

	if meta.ColorType == "" {
		if cfg, _, err := image.DecodeConfig(r); err == nil {
			meta.Width = cfg.Width
			meta.Height = cfg.Height
			colorType, hasAlpha, colorDepth := describeColorModel(cfg.ColorModel)
			meta.ColorType = colorType
			meta.HasAlpha = hasAlpha
			if colorDepth > 0 {
				meta.ColorDepth = colorDepth
			}
		}
	}

	if _, err := r.Seek(0, io.SeekStart); err != nil {
		return err
	}

	ex, err := exif.Decode(r)
	if err != nil {
		if exif.IsExifError(err) {
			meta.HasExif = false
			return nil
		}
		return err
	}

	meta.HasExif = true

	if tag, err := ex.Get(exif.XResolution); err == nil {
		if rat, err := tag.Rat(0); err == nil {
			if value, ok := rat.Float64(); ok {
				meta.DPIWidth = math.Round(value*100) / 100
			}
		}
	}
	if tag, err := ex.Get(exif.YResolution); err == nil {
		if rat, err := tag.Rat(0); err == nil {
			if value, ok := rat.Float64(); ok {
				meta.DPIHeight = math.Round(value*100) / 100
			}
		}
	}
	if tag, err := ex.Get(exif.ColorSpace); err == nil {
		if val, err := tag.Int(0); err == nil {
			meta.ColorSpace = describeExifColorSpace(val)
		}
	}
	if tag, err := ex.Get(exif.BitsPerSample); err == nil {
		if val, err := tag.Int(0); err == nil {
			meta.ColorDepth = val
		}
	}
	if meta.Width == 0 {
		if tag, err := ex.Get(exif.PixelXDimension); err == nil {
			if val, err := tag.Int(0); err == nil {
				meta.Width = val
			}
		}
	}
	if meta.Height == 0 {
		if tag, err := ex.Get(exif.PixelYDimension); err == nil {
			if val, err := tag.Int(0); err == nil {
				meta.Height = val
			}
		}
	}

	if meta.ColorType == "" {
		meta.ColorType = "YCbCr"
	}
	meta.HasAlpha = false

	if meta.ColorSpace == "" {
		meta.ColorSpace = "Unspecified"
	}

	return nil
}

func describeColorModel(model color.Model) (string, bool, int) {
	switch model {
	case color.RGBAModel, color.NRGBAModel:
		return "RGBA", true, 8
	case color.RGBA64Model, color.NRGBA64Model:
		return "RGBA", true, 16
	case color.GrayModel:
		return "Grayscale", false, 8
	case color.Gray16Model:
		return "Grayscale", false, 16
	case color.CMYKModel:
		return "CMYK", false, 8
	case color.YCbCrModel:
		return "YCbCr", false, 8
	case color.AlphaModel, color.Alpha16Model:
		return "Alpha", true, 8
	default:
		return "", false, 0
	}
}

func describePNGColorType(colorType byte) string {
	switch colorType {
	case 0:
		return "Grayscale"
	case 2:
		return "RGB"
	case 3:
		return "Indexed"
	case 4:
		return "Grayscale + Alpha"
	case 6:
		return "RGBA"
	default:
		return "Unknown"
	}
}

func pngHasAlpha(colorType byte) bool {
	return colorType == 4 || colorType == 6
}

func describeExifColorSpace(space int) string {
	switch space {
	case 1:
		return "sRGB"
	case 2:
		return "Adobe RGB"
	case 65535:
		return "Uncalibrated"
	default:
		return fmt.Sprintf("Color space %d", space)
	}
}

// GetExifData returns EXIF metadata for an image at the provided virtual path.
func (m *Manager) GetExifData(virtualPath string) (*ExifData, error) {
	physicalPath, err := m.resolvePath(virtualPath)
	if err != nil {
		return nil, err
	}

	if !m.isPathSafe(physicalPath) {
		return nil, fmt.Errorf("access denied: path outside managed directory")
	}

	info, err := os.Stat(physicalPath)
	if err != nil {
		return nil, fmt.Errorf("file not found: %w", err)
	}

	if info.IsDir() {
		return &ExifData{Tags: map[string]string{}}, nil
	}

	mimeType := m.getMimeType(info.Name())
	if !supportsExifMime(mimeType) {
		return &ExifData{Tags: map[string]string{}}, nil
	}

	// #nosec G304 -- physicalPath is resolved via the virtual filesystem and cannot escape configured roots.
	file, err := os.Open(physicalPath)
	if err != nil {
		return nil, err
	}
	defer func() {
		if cerr := file.Close(); cerr != nil {
			log.Printf("Error closing EXIF file: %v", cerr)
		}
	}()

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}

	ex, err := exif.Decode(file)
	if err != nil {
		if exif.IsExifError(err) {
			return &ExifData{Tags: map[string]string{}}, nil
		}
		return nil, err
	}

	collector := &exifCollector{tags: make(map[string]string)}
	if err := ex.Walk(collector); err != nil {
		return nil, err
	}

	return &ExifData{Tags: collector.tags}, nil
}

func supportsExifMime(mime string) bool {
	mime = strings.ToLower(mime)
	return strings.Contains(mime, "jpeg") || strings.Contains(mime, "tiff") || strings.Contains(mime, "jpg")
}

type exifCollector struct {
	tags map[string]string
}

func (c *exifCollector) Walk(name exif.FieldName, tag *tiff.Tag) error {
	if tag == nil {
		return nil
	}
	value := strings.TrimSpace(tag.String())
	value = strings.Trim(value, "\"")
	c.tags[string(name)] = value
	return nil
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

// CreateZip creates a ZIP archive containing the specified virtual paths
func (m *Manager) CreateZip(w io.Writer, virtualPaths []string) (err error) {
	zipWriter := zip.NewWriter(w)
	defer func() {
		if cerr := zipWriter.Close(); cerr != nil && err == nil {
			err = cerr
		}
	}()

	for _, virtualPath := range virtualPaths {
		physicalPath, err := m.resolvePath(virtualPath)
		if err != nil {
			continue // Skip paths that can't be resolved
		}

		if !m.isPathSafe(physicalPath) {
			continue // Skip unsafe paths
		}

		info, err := os.Stat(physicalPath)
		if err != nil {
			continue // Skip missing files
		}

		if info.IsDir() {
			err = m.addDirToZip(zipWriter, physicalPath, virtualPath)
		} else {
			err = m.addFileToZip(zipWriter, physicalPath, virtualPath)
		}

		if err != nil {
			return fmt.Errorf("failed to add %s to zip: %w", virtualPath, err)
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

// ReadFile reads the content of a file
func (m *Manager) ReadFile(virtualPath string) ([]byte, error) {
	physicalPath, err := m.resolvePath(virtualPath)
	if err != nil {
		return nil, err
	}

	if !m.isPathSafe(physicalPath) {
		return nil, fmt.Errorf("access denied: path outside managed directory")
	}

	return os.ReadFile(physicalPath) //nolint:gosec // Path is validated by isPathSafe
}

// WriteFile writes content to a file
func (m *Manager) WriteFile(virtualPath string, content []byte) error {
	physicalPath, err := m.resolvePath(virtualPath)
	if err != nil {
		return err
	}

	if !m.isPathSafe(physicalPath) {
		return fmt.Errorf("access denied: path outside managed directory")
	}

	// Check quota before writing
	if m.Config.QuotaBytes > 0 {
		// Get current file size if it exists
		var oldSize int64
		if info, err := os.Stat(physicalPath); err == nil {
			oldSize = info.Size()
		}

		// Calculate new size after write
		newSize := int64(len(content))

		// Get directory to check quota for
		var quotaPath string
		for _, dir := range m.Directories {
			if strings.HasPrefix(physicalPath, dir.Source) {
				quotaPath = dir.Source
				break
			}
		}

		if quotaPath == "" {
			return fmt.Errorf("file not in managed directory")
		}

		// Get current directory usage
		currentUsage, err := m.calculateDirectorySize(quotaPath)
		if err != nil {
			return fmt.Errorf("failed to calculate directory size: %w", err)
		}

		// Check if new size would exceed quota
		if currentUsage-oldSize+newSize > m.Config.QuotaBytes {
			return fmt.Errorf("quota exceeded: operation would exceed storage limit")
		}
	}

	// Write the file
	return os.WriteFile(physicalPath, content, 0600) //nolint:gosec // Path is validated by isPathSafe
}

// GetFileInfo returns information about a file
func (m *Manager) GetFileInfo(virtualPath string) (*FileInfo, error) {
	physicalPath, err := m.resolvePath(virtualPath)
	if err != nil {
		return nil, err
	}

	if !m.isPathSafe(physicalPath) {
		return nil, fmt.Errorf("access denied: path outside managed directory")
	}

	info, err := os.Stat(physicalPath)
	if err != nil {
		return nil, err
	}

	return &FileInfo{
		Name:     info.Name(),
		Path:     virtualPath,
		Size:     info.Size(),
		IsDir:    info.IsDir(),
		ModTime:  info.ModTime(),
		Mode:     info.Mode().String(),
		MimeType: m.getMimeType(info.Name()),
	}, nil
}

// CreateFolder creates a new directory at the specified virtual path
func (m *Manager) CreateFolder(virtualPath string) error {
	physicalPath, err := m.resolvePath(virtualPath)
	if err != nil {
		return err
	}

	if !m.isPathSafe(physicalPath) {
		return fmt.Errorf("access denied: path outside managed directory")
	}

	// Check if directory already exists
	if _, err := os.Stat(physicalPath); err == nil {
		return fmt.Errorf("directory already exists")
	}

	// Create the directory with 755 permissions
	if err := os.MkdirAll(physicalPath, 0750); err != nil {
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
