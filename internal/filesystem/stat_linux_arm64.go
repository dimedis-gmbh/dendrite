//go:build linux && arm64

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
		stat.Nlink = uint64(sysstat.Nlink) // Conversion needed on ARM64 - uint32 to uint64
		stat.AccessTime = time.Unix(sysstat.Atim.Sec, sysstat.Atim.Nsec)
		stat.ChangeTime = time.Unix(sysstat.Ctim.Sec, sysstat.Ctim.Nsec)
	}
}