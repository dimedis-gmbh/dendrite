package format

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestFileSize(t *testing.T) {
	tests := []struct {
		name     string
		bytes    int64
		expected string
	}{
		{"Zero bytes", 0, "0 B"},
		{"Single byte", 1, "1 B"},
		{"Less than KB", 1023, "1023 B"},
		{"Exactly 1 KB", 1024, "1.00 KB"},
		{"Multiple KB", 2048, "2.00 KB"},
		{"Less than MB", 1048575, "1024.00 KB"},
		{"Exactly 1 MB", 1048576, "1.00 MB"},
		{"Multiple MB", 21153906, "20.17 MB"},
		{"Less than GB", 1073741823, "1024.00 MB"},
		{"Exactly 1 GB", 1073741824, "1.00 GB"},
		{"Multiple GB", 5368709120, "5.00 GB"},
		{"Less than TB", 1099511627775, "1024.00 GB"},
		{"Exactly 1 TB", 1099511627776, "1.00 TB"},
		{"Multiple TB", 2199023255552, "2.00 TB"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := FileSize(tt.bytes)
			assert.Equal(t, tt.expected, result)
		})
	}
}