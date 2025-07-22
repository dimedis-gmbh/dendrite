// Package assets embeds the web UI files into the binary.
package assets

import (
	"embed"
	"io/fs"
)

//go:embed all:web
var content embed.FS

// WebFS returns the embedded web filesystem, stripped of the "web" prefix
func WebFS() (fs.FS, error) {
	return fs.Sub(content, "web")
}