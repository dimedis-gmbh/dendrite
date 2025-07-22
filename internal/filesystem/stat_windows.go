//go:build windows

package filesystem

import (
	"syscall"
	"time"
)

// getStatTimes extracts platform-specific timestamps from syscall.Stat_t
func getStatTimes(stat *syscall.Stat_t) (atime, ctime time.Time) {
	// Windows uses different field names and types
	// For Windows, we'll return the current time as a fallback
	// In production, you might want to use Windows-specific APIs
	now := time.Now()
	return now, now
}