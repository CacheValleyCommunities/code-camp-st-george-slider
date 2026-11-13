package realtime

import (
	"encoding/json"
	"fmt"
	"time"
)

func mediaCommand(raw json.RawMessage) (any, bool) {
	var in struct {
		Action  string `json:"action"`
		Mode    string `json:"mode"`
		URL     string `json:"url"`
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	if !decode(raw, &in) {
		return nil, false
	}
	switch in.Action {
	case "show", "hide", "toggle":
		return map[string]string{"action": in.Action}, true
	case "mode":
		switch in.Mode {
		case "video", "image", "text":
		default:
			return nil, false
		}
		return map[string]string{
			"action":  "mode",
			"mode":    in.Mode,
			"url":     clip(in.URL, 2000),
			"title":   clip(in.Title, 200),
			"content": clip(in.Content, 2000),
		}, true
	default:
		return nil, false
	}
}

func notificationCommand(raw json.RawMessage) (any, bool) {
	var in struct {
		Type        string `json:"type"`
		Title       string `json:"title"`
		Message     string `json:"message"`
		ID          string `json:"id"`
		AutoDismiss int    `json:"autoDismiss"`
	}
	if !decode(raw, &in) {
		return nil, false
	}
	switch in.Type {
	case "info", "success", "warning", "error":
	default:
		in.Type = "info"
	}
	if in.AutoDismiss < 0 {
		in.AutoDismiss = 0
	}
	if in.AutoDismiss > 120000 {
		in.AutoDismiss = 120000
	}
	id := in.ID
	if !safeID(id) {
		id = fmt.Sprintf("notif-%d", time.Now().UnixNano())
	}
	title := clip(in.Title, 120)
	message := clip(in.Message, 500)
	if title == "" && message == "" {
		return nil, false
	}
	return map[string]any{
		"type":        in.Type,
		"title":       title,
		"message":     message,
		"id":          id,
		"autoDismiss": in.AutoDismiss,
	}, true
}

func dismissCommand(raw json.RawMessage) (any, bool) {
	var in struct {
		ID string `json:"id"`
	}
	if !decode(raw, &in) {
		return nil, false
	}
	if in.ID != "all" && !safeID(in.ID) {
		return nil, false
	}
	return map[string]string{"id": in.ID}, true
}

func tickerCommand(raw json.RawMessage) (any, bool) {
	var in struct {
		Announcements []string `json:"announcements"`
	}
	if !decode(raw, &in) {
		return nil, false
	}
	if len(in.Announcements) > 40 {
		in.Announcements = in.Announcements[:40]
	}
	lines := make([]string, 0, len(in.Announcements))
	for _, line := range in.Announcements {
		line = clip(line, 240)
		if line != "" {
			lines = append(lines, line)
		}
	}
	if len(lines) == 0 {
		return nil, false
	}
	return map[string]any{"announcements": lines}, true
}

func youTubeCommand(raw json.RawMessage) (string, string, bool) {
	var in struct {
		Action string `json:"action"`
		URL    string `json:"url"`
	}
	if !decode(raw, &in) {
		return "", "", false
	}
	switch in.Action {
	case "stop":
		return "stop", "", true
	case "play":
		if !IsYouTubeURL(in.URL) {
			return "", "", false
		}
		return "play", in.URL, true
	default:
		return "", "", false
	}
}
