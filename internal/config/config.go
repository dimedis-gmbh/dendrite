// Package config handles application configuration and quota parsing.
package config

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// Config holds the application configuration
type Config struct {
	Listen     string
	Dir        string
	Quota      string
	QuotaBytes int64
}

// ParseQuota parses the quota string and sets QuotaBytes
func ParseQuota(cfg *Config) error {
	if cfg.Quota == "" {
		return nil
	}

	// Regular expression to match number and unit (e.g., "1GB", "500MB", "2TB")
	re := regexp.MustCompile(`^(\d+(?:\.\d+)?)(MB|GB|TB)$`)
	matches := re.FindStringSubmatch(strings.ToUpper(cfg.Quota))

	if len(matches) != 3 {
		return fmt.Errorf("invalid quota format: %s (expected format: 1GB, 500MB, 2TB)", cfg.Quota)
	}

	value, err := strconv.ParseFloat(matches[1], 64)
	if err != nil {
		return fmt.Errorf("invalid quota value: %s", matches[1])
	}

	unit := matches[2]
	var multiplier int64

	switch unit {
	case "MB":
		multiplier = 1024 * 1024
	case "GB":
		multiplier = 1024 * 1024 * 1024
	case "TB":
		multiplier = 1024 * 1024 * 1024 * 1024
	default:
		return fmt.Errorf("unsupported quota unit: %s", unit)
	}

	cfg.QuotaBytes = int64(value * float64(multiplier))
	return nil
}