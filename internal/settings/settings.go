// Package settings stores the one room-settings row on the shared GORM database.
package settings

import (
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
)

const (
	maxTitle = 80
	maxWifi  = 64
	maxLines = 40
	maxLine  = 240
	whenMin  = "2006-01-02T15:04"
	whenSec  = "2006-01-02T15:04:05"
	rowID    = 1
)

var (
	ErrTitle  = errors.New("event title is too long")
	ErrWifi   = errors.New("wifi field is too long")
	ErrTicker = errors.New("invalid ticker")
	ErrDates  = errors.New("invalid dates")
	ErrOrder  = errors.New("dates out of order")
)

// Settings is the single row the display and control room share.
type Settings struct {
	ID           uint   `gorm:"primaryKey"`
	EventTitle   string `gorm:"size:80"`
	WifiSSID     string `gorm:"size:64"`
	WifiPassword string `gorm:"size:64"`
	EventStart   string `gorm:"size:32;not null"`
	DayCampEnd   string `gorm:"size:32;not null"`
	Camp24End    string `gorm:"size:32;not null"`
	Ticker       string `gorm:"not null"`
}

func (Settings) TableName() string { return "settings" }

// Input is a control-room submission. TickerLines are one announcement each.
type Input struct {
	EventTitle   string
	WifiSSID     string
	WifiPassword string
	EventStart   string
	DayCampEnd   string
	Camp24End    string
	TickerLines  []string
}

// View is the public payload rendered into the display page and pushed live.
type View struct {
	EventTitle    string            `json:"eventTitle"`
	WifiLabel     string            `json:"wifiLabel"`
	EventDates    map[string]string `json:"eventDates"`
	Announcements []string          `json:"announcements"`
}

type Store struct {
	db *gorm.DB
}

func New(db *gorm.DB) (*Store, error) {
	if db == nil {
		return nil, errors.New("settings: nil database")
	}
	if err := db.AutoMigrate(&Settings{}); err != nil {
		return nil, err
	}
	store := &Store{db: db}
	var n int64
	if err := db.Model(&Settings{}).Count(&n).Error; err != nil {
		return nil, err
	}
	if n == 0 {
		if err := store.seed(); err != nil {
			return nil, err
		}
	}
	return store, nil
}

func (s *Store) seed() error {
	row := defaults()
	return s.db.Create(&row).Error
}

func defaults() Settings {
	return Settings{
		ID:           rowID,
		EventTitle:   "CodeCamp 2025",
		WifiSSID:     "CodeCamp",
		WifiPassword: "Welcome2Vasion",
		EventStart:   "2025-11-14T08:00",
		DayCampEnd:   "2025-11-14T15:00",
		Camp24End:    "2025-11-15T08:00",
		Ticker: strings.Join([]string{
			"Welcome to CodeCamp 2025!",
			"Bring Your Genius!",
			"Don't forget the semi-colon! It's important in Python! 😉",
		}, "\n"),
	}
}

func (s *Store) Get() (Settings, error) {
	var row Settings
	err := s.db.First(&row, rowID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		if err := s.seed(); err != nil {
			return Settings{}, err
		}
		err = s.db.First(&row, rowID).Error
	}
	if err != nil {
		return Settings{}, err
	}
	return row, nil
}

func (s *Store) Save(in Input) (Settings, error) {
	title := strings.TrimSpace(in.EventTitle)
	if utf8.RuneCountInString(title) > maxTitle {
		return Settings{}, ErrTitle
	}
	ssid := strings.TrimSpace(in.WifiSSID)
	password := strings.TrimSpace(in.WifiPassword)
	if utf8.RuneCountInString(ssid) > maxWifi || utf8.RuneCountInString(password) > maxWifi {
		return Settings{}, ErrWifi
	}
	start, ok := normalizeWhen(in.EventStart)
	day, okDay := normalizeWhen(in.DayCampEnd)
	end, okEnd := normalizeWhen(in.Camp24End)
	if !ok || !okDay || !okEnd {
		return Settings{}, ErrDates
	}
	if !ordered(start, day, end) {
		return Settings{}, ErrOrder
	}
	lines, err := normalizeTicker(in.TickerLines)
	if err != nil {
		return Settings{}, err
	}
	row := Settings{
		ID:           rowID,
		EventTitle:   title,
		WifiSSID:     ssid,
		WifiPassword: password,
		EventStart:   start,
		DayCampEnd:   day,
		Camp24End:    end,
		Ticker:       strings.Join(lines, "\n"),
	}
	if err := s.db.Save(&row).Error; err != nil {
		return Settings{}, err
	}
	return row, nil
}

func (s *Store) SaveTicker(lines []string) (Settings, error) {
	cleaned, err := normalizeTicker(lines)
	if err != nil {
		return Settings{}, err
	}
	row, err := s.Get()
	if err != nil {
		return Settings{}, err
	}
	row.Ticker = strings.Join(cleaned, "\n")
	if err := s.db.Save(&row).Error; err != nil {
		return Settings{}, err
	}
	return row, nil
}

func (row Settings) Announcements() []string {
	return splitTicker(row.Ticker)
}

func (row Settings) DisplayTitle() string {
	title := strings.TrimSpace(row.EventTitle)
	if title == "" {
		return "CodeCamp"
	}
	return title
}

func (row Settings) WifiLabel() string {
	ssid := strings.TrimSpace(row.WifiSSID)
	password := strings.TrimSpace(row.WifiPassword)
	switch {
	case ssid == "" && password == "":
		return ""
	case password == "":
		return "WIFI: " + ssid
	case ssid == "":
		return "WIFI: " + password
	default:
		return "WIFI: " + ssid + ":" + password
	}
}

func (row Settings) Public() View {
	lines := row.Announcements()
	if lines == nil {
		lines = []string{}
	}
	return View{
		EventTitle: row.DisplayTitle(),
		WifiLabel:  row.WifiLabel(),
		EventDates: map[string]string{
			"start":      row.EventStart,
			"dayCampEnd": row.DayCampEnd,
			"camp24End":  row.Camp24End,
		},
		Announcements: lines,
	}
}

func normalizeWhen(value string) (string, bool) {
	parsed, ok := parseWhen(value)
	if !ok {
		return "", false
	}
	return parsed.Format(whenMin), true
}

func parseWhen(value string) (time.Time, bool) {
	value = strings.TrimSpace(value)
	for _, layout := range []string{whenMin, whenSec} {
		parsed, err := time.Parse(layout, value)
		if err == nil {
			return parsed, true
		}
	}
	return time.Time{}, false
}

func ordered(start, day, end string) bool {
	s, okS := parseWhen(start)
	d, okD := parseWhen(day)
	e, okE := parseWhen(end)
	if !okS || !okD || !okE {
		return false
	}
	return s.Before(d) && d.Before(e)
}

func normalizeTicker(lines []string) ([]string, error) {
	cleaned := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if utf8.RuneCountInString(line) > maxLine {
			return nil, ErrTicker
		}
		cleaned = append(cleaned, line)
		if len(cleaned) > maxLines {
			return nil, ErrTicker
		}
	}
	if len(cleaned) == 0 {
		return nil, ErrTicker
	}
	return cleaned, nil
}

func splitTicker(raw string) []string {
	raw = strings.ReplaceAll(raw, "\r\n", "\n")
	raw = strings.ReplaceAll(raw, "\r", "\n")
	if strings.TrimSpace(raw) == "" {
		return []string{}
	}
	parts := strings.Split(raw, "\n")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}
