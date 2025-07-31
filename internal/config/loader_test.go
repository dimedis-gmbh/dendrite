package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParseDirMapping(t *testing.T) {
	tests := []struct {
		name        string
		input       string
		wantSource  string
		wantVirtual string
		wantErr     bool
	}{
		{
			name:        "simple path maps to root",
			input:       "/var/www",
			wantSource:  "/var/www",
			wantVirtual: "/",
			wantErr:     false,
		},
		{
			name:        "full mapping with colon",
			input:       "/var/www:/web",
			wantSource:  "/var/www",
			wantVirtual: "/web",
			wantErr:     false,
		},
		{
			name:        "relative path",
			input:       "./docs",
			wantSource:  "./docs",
			wantVirtual: "/",
			wantErr:     false,
		},
		{
			name:        "current directory",
			input:       ".",
			wantSource:  ".",
			wantVirtual: "/",
			wantErr:     false,
		},
		{
			name:        "empty source",
			input:       ":/virtual",
			wantSource:  "",
			wantVirtual: "",
			wantErr:     true,
		},
		{
			name:        "empty virtual",
			input:       "/source:",
			wantSource:  "",
			wantVirtual: "",
			wantErr:     true,
		},
		{
			name:        "spaces are trimmed",
			input:       " /var/www : /web ",
			wantSource:  "/var/www",
			wantVirtual: "/web",
			wantErr:     false,
		},
		{
			name:        "multiple colons",
			input:       "/path:with:colons:/virtual",
			wantSource:  "/path",
			wantVirtual: "with:colons:/virtual",
			wantErr:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseDirMapping(tt.input)
			if tt.wantErr {
				assert.Error(t, err)
				return
			}
			assert.NoError(t, err)
			assert.Equal(t, tt.wantSource, got.Source)
			assert.Equal(t, tt.wantVirtual, got.Virtual)
		})
	}
}