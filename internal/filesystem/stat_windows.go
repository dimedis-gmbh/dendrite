//go:build windows

package filesystem

import (
	"os"
)

// getSysStatInfo extracts platform-specific stat information
func getSysStatInfo(info os.FileInfo, stat *FileStatInfo) {
	// Windows doesn't have syscall.Stat_t in the same way as Unix systems
	// We'll set default values for Windows
	stat.UID = 0
	stat.Gid = 0
	stat.Nlink = 1
	// Use modification time as a fallback for access and change times
	stat.AccessTime = info.ModTime()
	stat.ChangeTime = info.ModTime()
}