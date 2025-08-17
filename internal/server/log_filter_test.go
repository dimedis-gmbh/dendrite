package server

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestFilterLinesFunction tests the filterLines function
func TestFilterLinesFunction(t *testing.T) {
	lines := []string{
		"2025-01-15 10:00:00 INFO Start",
		"2025-01-15 10:00:01 ERROR Failed",
		"2025-01-15 10:00:02 error lowercase",
		"2025-01-15 10:00:03 WARNING Check",
	}

	t.Run("EmptyFilter", func(t *testing.T) {
		result, err := filterLines(lines, "", false, false)
		require.NoError(t, err)
		assert.Equal(t, lines, result, "Empty filter should return all lines")
	})

	t.Run("TextFilter", func(t *testing.T) {
		result, err := filterLines(lines, "ERROR", false, false)
		require.NoError(t, err)
		assert.Len(t, result, 2, "Should match both ERROR and error")
		assert.Contains(t, result[0], "ERROR")
		assert.Contains(t, result[1], "error")
	})

	t.Run("CaseSensitive", func(t *testing.T) {
		result, err := filterLines(lines, "ERROR", true, false)
		require.NoError(t, err)
		assert.Len(t, result, 1, "Should only match uppercase ERROR")
		assert.Contains(t, result[0], "ERROR Failed")
	})

	t.Run("Regex", func(t *testing.T) {
		result, err := filterLines(lines, "10:00:0[01]", false, true)
		require.NoError(t, err)
		assert.Len(t, result, 2, "Should match times ending in 00 or 01")
		assert.Contains(t, result[0], "10:00:00")
		assert.Contains(t, result[1], "10:00:01")
	})

	t.Run("InvalidRegex", func(t *testing.T) {
		_, err := filterLines(lines, "[invalid", false, true)
		assert.Error(t, err, "Invalid regex should return error")
	})

	t.Run("ComplexRegex", func(t *testing.T) {
		// Test the exact regex from the user's screenshot
		testLines := []string{
			"So 17 Aug 2025 17:20:00 CEST — log entry",
			"So 17 Aug 2025 17:25:00 CEST — log entry",
			"So 17 Aug 2025 17:28:59 CEST — log entry",
			"So 17 Aug 2025 17:29:00 CEST — log entry",
			"So 17 Aug 2025 17:29:26 CEST — log entry",
			"So 17 Aug 2025 17:29:27 CEST — log entry",
			"So 17 Aug 2025 17:30:00 CEST — log entry",
		}

		pattern := `So 17 Aug 2025 17:2[0-8]`
		result, err := filterLines(testLines, pattern, false, true)
		require.NoError(t, err)
		assert.Len(t, result, 3, "Should match only 17:20-17:28")

		// Verify the matched lines
		for _, line := range result {
			assert.Regexp(t, pattern, line)
		}

		// Verify 17:29 and 17:30 are not included
		for _, line := range result {
			assert.NotContains(t, line, "17:29")
			assert.NotContains(t, line, "17:30")
		}
	})
}
