package realtime

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

var youtubePatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([^&\n?#]+)`),
	regexp.MustCompile(`youtube\.com/watch\?.*v=([^&\n?#]+)`),
}

func IsYouTubeURL(raw string) bool {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme != "https" || parsed.User != nil || parsed.Host == "" {
		return false
	}
	if parsed.Port() != "" && parsed.Port() != "443" {
		return false
	}
	switch strings.ToLower(parsed.Hostname()) {
	case "www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be":
	default:
		return false
	}
	return youtubeID(raw) != ""
}

func youtubeID(raw string) string {
	for _, pattern := range youtubePatterns {
		match := pattern.FindStringSubmatch(raw)
		if len(match) > 1 && match[1] != "" {
			return match[1]
		}
	}
	return ""
}

func YouTubeTitle(ctx context.Context, raw string) (string, error) {
	if !IsYouTubeURL(raw) {
		return "", errInvalidYouTube
	}
	endpoint := "https://www.youtube.com/oembed?format=json&url=" + url.QueryEscape(raw)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", err
	}
	client := &http.Client{Timeout: 4 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", errInvalidYouTube
	}
	var payload struct {
		Title string `json:"title"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(nil, resp.Body, 1<<20)).Decode(&payload); err != nil {
		return "", err
	}
	title := clip(payload.Title, 200)
	if title == "" {
		return "", errInvalidYouTube
	}
	return title, nil
}
