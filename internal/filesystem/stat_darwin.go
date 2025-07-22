//go:build darwin

package filesystem

import (
	"syscall"
	"time"
)

// getStatTimes extracts platform-specific timestamps from syscall.Stat_t
func getStatTimes(stat *syscall.Stat_t) (atime, ctime time.Time) {
	atime = time.Unix(stat.Atimespec.Sec, stat.Atimespec.Nsec)
	ctime = time.Unix(stat.Ctimespec.Sec, stat.Ctimespec.Nsec)
	return atime, ctime
}