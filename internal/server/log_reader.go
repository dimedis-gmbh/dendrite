package server

import (
	"bufio"
	"errors"
	"io"
	"log"
	"os"
	"regexp"
	"strings"
)

func openLogFile(filePath string) (*os.File, error) {
	file, err := os.Open(filePath) // #nosec G304 - filePath is validated by filesystem manager
	if err != nil {
		return nil, err
	}
	return file, nil
}

func closeLogFile(file *os.File) {
	if err := file.Close(); err != nil {
		log.Printf("Error closing file: %v", err)
	}
}

// readLastNLines reads the last N lines from a file efficiently
func readLastNLines(filePath string, n int) ([]string, error) {
	file, err := openLogFile(filePath)
	if err != nil {
		return nil, err
	}
	defer closeLogFile(file)

	// Get file size
	stat, err := file.Stat()
	if err != nil {
		return nil, err
	}

	// Start from end of file and read backwards to find N lines
	// Start with a reasonable buffer size
	bufferSize := int64(8192)
	if stat.Size() < bufferSize {
		bufferSize = stat.Size()
	}

	var lines []string
	var leftover []byte
	position := stat.Size()

	for position > 0 && len(lines) < n {
		// Calculate how much to read
		if position < bufferSize {
			bufferSize = position
		}
		position -= bufferSize

		// Seek to position and read
		_, err := file.Seek(position, 0)
		if err != nil {
			return nil, err
		}

		buffer := make([]byte, bufferSize)
		_, err = file.Read(buffer)
		if err != nil && !errors.Is(err, io.EOF) {
			return nil, err
		}

		// Combine with leftover from previous iteration
		if leftover != nil {
			buffer = append(buffer, leftover...)
		}

		// Split into lines
		content := string(buffer)
		parts := strings.Split(content, "\n")

		// First part might be incomplete (unless we're at start of file)
		if position > 0 {
			leftover = []byte(parts[0])
			parts = parts[1:]
		} else {
			leftover = nil
		}

		// Prepend lines (since we're reading backwards)
		for i := len(parts) - 1; i >= 0; i-- {
			if parts[i] != "" || i < len(parts)-1 { // Include empty lines except trailing
				lines = append([]string{parts[i]}, lines...)
				if len(lines) >= n {
					break
				}
			}
		}
	}

	// Trim to exactly n lines if we got more
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}

	return lines, nil
}

// filterLines applies search filters to log lines
func filterLines(lines []string, search string, caseSensitive bool, isRegex bool) ([]string, error) {
	if search == "" {
		return lines, nil
	}

	var filtered []string

	if isRegex {
		// Compile regex pattern
		pattern := search
		if !caseSensitive {
			pattern = "(?i)" + pattern
		}
		re, err := regexp.Compile(pattern)
		if err != nil {
			return nil, err
		}

		for _, line := range lines {
			if re.MatchString(line) {
				filtered = append(filtered, line)
			}
		}
	} else {
		// Simple string search
		searchStr := search
		if !caseSensitive {
			searchStr = strings.ToLower(search)
		}

		for _, line := range lines {
			lineToSearch := line
			if !caseSensitive {
				lineToSearch = strings.ToLower(line)
			}
			if strings.Contains(lineToSearch, searchStr) {
				filtered = append(filtered, line)
			}
		}
	}

	return filtered, nil
}

// readFilteredLastNLines reads the entire file, applies filters, then returns the last N lines
func readFilteredLastNLines(filePath string, n int, search string, caseSensitive bool, isRegex bool) ([]string, error) {
	file, err := openLogFile(filePath)
	if err != nil {
		return nil, err
	}
	defer closeLogFile(file)

	// Read all lines from the file
	scanner := bufio.NewScanner(file)
	var allLines []string
	for scanner.Scan() {
		allLines = append(allLines, scanner.Text())
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}

	// Apply filter to all lines
	filteredLines, err := filterLines(allLines, search, caseSensitive, isRegex)
	if err != nil {
		return nil, err
	}

	// Return the last N lines of the filtered results
	if len(filteredLines) <= n {
		return filteredLines, nil
	}
	return filteredLines[len(filteredLines)-n:], nil
}

// FileFollower follows a file for new content (like tail -f)
type FileFollower struct {
	file     *os.File
	reader   *bufio.Reader
	position int64
}

// NewFileFollower creates a new file follower
func NewFileFollower(filePath string) (*FileFollower, error) {
	file, err := openLogFile(filePath)
	if err != nil {
		return nil, err
	}

	// Seek to end of file
	position, err := file.Seek(0, 2)
	if err != nil {
		closeLogFile(file)
		return nil, err
	}

	return &FileFollower{
		file:     file,
		reader:   bufio.NewReader(file),
		position: position,
	}, nil
}

// ReadLine reads the next line from the file
func (ff *FileFollower) ReadLine() (string, error) {
	line, err := ff.reader.ReadString('\n')
	if err != nil && err != io.EOF {
		return "", err
	}

	// Update position
	ff.position += int64(len(line))

	// Remove trailing newline
	line = strings.TrimSuffix(line, "\n")
	line = strings.TrimSuffix(line, "\r")

	return line, err
}

// Close closes the file
func (ff *FileFollower) Close() error {
	return ff.file.Close()
}
