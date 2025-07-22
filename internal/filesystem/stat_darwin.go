//go:build darwin

package filesystem

import (
	"os"
	"syscall"
	"time"
)

// getSysStatInfo extracts platform-specific stat information
func getSysStatInfo(info os.FileInfo, stat *FileStatInfo) {
	if sysstat, ok := info.Sys().(*syscall.Stat_t); ok {
		stat.UID = sysstat.Uid
		stat.Gid = sysstat.Gid
		stat.Nlink = uint64(sysstat.Nlink)
		stat.AccessTime = time.Unix(sysstat.Atimespec.Sec, sysstat.Atimespec.Nsec)
		stat.ChangeTime = time.Unix(sysstat.Ctimespec.Sec, sysstat.Ctimespec.Nsec)
	}
}