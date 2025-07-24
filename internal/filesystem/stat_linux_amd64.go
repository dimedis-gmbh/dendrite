//go:build linux && amd64

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
		stat.Nlink = sysstat.Nlink // No conversion needed on AMD64 - already uint64
		stat.AccessTime = time.Unix(sysstat.Atim.Sec, sysstat.Atim.Nsec)
		stat.ChangeTime = time.Unix(sysstat.Ctim.Sec, sysstat.Ctim.Nsec)
	}
}