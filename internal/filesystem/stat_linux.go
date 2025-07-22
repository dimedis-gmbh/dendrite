//go:build linux

package filesystem

import (
	"syscall"
	"time"
)

// getStatTimes extracts platform-specific timestamps from syscall.Stat_t
func getStatTimes(stat *syscall.Stat_t) (atime, ctime time.Time) {
	atime = time.Unix(stat.Atim.Sec, stat.Atim.Nsec)
	ctime = time.Unix(stat.Ctim.Sec, stat.Ctim.Nsec)
	return atime, ctime
}