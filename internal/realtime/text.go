package realtime

import (
	"errors"
	"strings"
	"unicode/utf8"
)

var errInvalidYouTube = errors.New("invalid youtube url")

func clip(value string, max int) string {
	value = strings.TrimSpace(value)
	if utf8.RuneCountInString(value) <= max {
		return value
	}
	runes := []rune(value)
	return string(runes[:max])
}

func safeID(id string) bool {
	if id == "" || utf8.RuneCountInString(id) > 80 {
		return false
	}
	for _, r := range id {
		switch {
		case r >= 'a' && r <= 'z':
		case r >= 'A' && r <= 'Z':
		case r >= '0' && r <= '9':
		case r == '-' || r == '_':
		default:
			return false
		}
	}
	return true
}
