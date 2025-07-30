// Package filesystem provides virtual path resolution for multiple directories
package filesystem

import (
	"fmt"
	"path"
	"path/filepath"
	"sort"
	"strings"

	"dendrite/internal/config"
)

// VirtualFS handles virtual path operations for multiple directories
type VirtualFS struct {
	Directories []config.DirMapping
}

// NewVirtualFS creates a new virtual filesystem
func NewVirtualFS(dirs []config.DirMapping) *VirtualFS {
	// Sort directories by virtual path length (longest first)
	// This ensures more specific paths are matched before general ones
	sortedDirs := make([]config.DirMapping, len(dirs))
	copy(sortedDirs, dirs)
	sort.Slice(sortedDirs, func(i, j int) bool {
		return len(sortedDirs[i].Virtual) > len(sortedDirs[j].Virtual)
	})

	return &VirtualFS{
		Directories: sortedDirs,
	}
}

// ResolvePath converts a virtual path to a physical path
// Returns empty string if no mapping found
func (vfs *VirtualFS) ResolvePath(virtualPath string) (physicalPath string, found bool) {
	// Normalize the virtual path
	virtualPath = path.Clean("/" + strings.TrimPrefix(virtualPath, "/"))

	// Special case for root - check if we have a direct mapping
	if virtualPath == "/" {
		for _, dir := range vfs.Directories {
			if dir.Virtual == "/" {
				return dir.Source, true
			}
		}
		return "", true // Root directory exists but has no physical path
	}

	// Find the matching directory mapping
	for _, dir := range vfs.Directories {
		// For root mapping ("/"), check if the path starts with it
		if dir.Virtual == "/" {
			// Root maps to everything
			relativePath := strings.TrimPrefix(virtualPath, "/")
			if relativePath == "" {
				return dir.Source, true
			}
			return filepath.Join(dir.Source, relativePath), true
		}
		
		if virtualPath == dir.Virtual || strings.HasPrefix(virtualPath, dir.Virtual+"/") {
			// Calculate the relative path within the virtual directory
			relativePath := strings.TrimPrefix(virtualPath, dir.Virtual)
			relativePath = strings.TrimPrefix(relativePath, "/")
			
			if relativePath == "" {
				return dir.Source, true
			}
			return filepath.Join(dir.Source, relativePath), true
		}
	}

	return "", false
}

// GetVirtualPath converts a physical path back to a virtual path
func (vfs *VirtualFS) GetVirtualPath(physicalPath string) (virtualPath string, found bool) {
	physicalPath = filepath.Clean(physicalPath)

	for _, dir := range vfs.Directories {
		if physicalPath == dir.Source {
			return dir.Virtual, true
		}
		if strings.HasPrefix(physicalPath, dir.Source+string(filepath.Separator)) {
			relativePath := strings.TrimPrefix(physicalPath, dir.Source)
			relativePath = strings.TrimPrefix(relativePath, string(filepath.Separator))
			// Convert to forward slashes for web paths
			relativePath = filepath.ToSlash(relativePath)
			return path.Join(dir.Virtual, relativePath), true
		}
	}

	return "", false
}

// ListVirtualDirectories returns the list of virtual directories at the root level
func (vfs *VirtualFS) ListVirtualDirectories() []string {
	roots := make(map[string]bool)
	
	for _, dir := range vfs.Directories {
		// Get the first component of the virtual path
		parts := strings.Split(strings.TrimPrefix(dir.Virtual, "/"), "/")
		if len(parts) > 0 && parts[0] != "" {
			roots[parts[0]] = true
		}
	}

	// Convert to sorted slice
	var result []string
	for root := range roots {
		result = append(result, root)
	}
	sort.Strings(result)
	
	return result
}

// GetDirectoryForVirtualPath returns the directory mapping for a given virtual path
func (vfs *VirtualFS) GetDirectoryForVirtualPath(virtualPath string) (config.DirMapping, bool) {
	virtualPath = path.Clean("/" + strings.TrimPrefix(virtualPath, "/"))

	for _, dir := range vfs.Directories {
		if virtualPath == dir.Virtual || strings.HasPrefix(virtualPath, dir.Virtual+"/") {
			return dir, true
		}
	}

	return config.DirMapping{}, false
}

// IsVirtualRoot checks if the given path is the virtual root
func (vfs *VirtualFS) IsVirtualRoot(virtualPath string) bool {
	virtualPath = path.Clean("/" + strings.TrimPrefix(virtualPath, "/"))
	return virtualPath == "/"
}

// ValidateJWTDirectories checks if JWT directories are allowed by server config
func ValidateJWTDirectories(jwtDirs []config.DirMapping, serverDirs []config.DirMapping) error {
	// Create a map of allowed source directories from server config
	allowedSources := make(map[string]string) // source -> virtual
	for _, dir := range serverDirs {
		allowedSources[dir.Source] = dir.Virtual
	}

	// Check each JWT directory
	for _, jwtDir := range jwtDirs {
		serverVirtual, exists := allowedSources[jwtDir.Source]
		if !exists {
			return fmt.Errorf("JWT directory not allowed by server config: %s", jwtDir.Source)
		}
		// Virtual paths must match
		if jwtDir.Virtual != serverVirtual {
			return fmt.Errorf("JWT virtual path mismatch for %s: expected %s, got %s", 
				jwtDir.Source, serverVirtual, jwtDir.Virtual)
		}
	}

	return nil
}