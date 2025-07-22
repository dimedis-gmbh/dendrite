package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParseQuota(t *testing.T) {
	tests := []struct {
		name          string
		quota         string
		expectedBytes int64
		expectError   bool
	}{
		{
			name:          "Valid MB quota",
			quota:         "100MB",
			expectedBytes: 100 * 1024 * 1024,
			expectError:   false,
		},
		{
			name:          "Valid GB quota",
			quota:         "2GB",
			expectedBytes: 2 * 1024 * 1024 * 1024,
			expectError:   false,
		},
		{
			name:          "Valid TB quota",
			quota:         "1TB",
			expectedBytes: 1024 * 1024 * 1024 * 1024,
			expectError:   false,
		},
		{
			name:          "Decimal quota",
			quota:         "1.5GB",
			expectedBytes: int64(1.5 * 1024 * 1024 * 1024),
			expectError:   false,
		},
		{
			name:        "Invalid format",
			quota:       "100XB",
			expectError: true,
		},
		{
			name:        "No unit",
			quota:       "100",
			expectError: true,
		},
		{
			name:        "Empty string",
			quota:       "",
			expectError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := &Config{Quota: tt.quota}
			err := ParseQuota(cfg)

			if tt.expectError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				if tt.quota != "" {
					assert.Equal(t, tt.expectedBytes, cfg.QuotaBytes)
				}
			}
		})
	}
}