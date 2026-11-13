package settings_test

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"github.com/brentdalling/code-camp-slider-2025/internal/auth"
	"github.com/brentdalling/code-camp-slider-2025/internal/settings"
	"golang.org/x/crypto/bcrypt"
)

func TestSeedSaveAndValidation(t *testing.T) {
	accounts, err := auth.Open(filepath.Join(t.TempDir(), "codecamp.db"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	store, err := settings.New(accounts.DB())
	if err != nil {
		t.Fatal(err)
	}
	row, err := store.Get()
	if err != nil {
		t.Fatal(err)
	}
	if row.EventTitle != "CodeCamp 2025" || row.WifiSSID != "CodeCamp" || row.WifiPassword != "Welcome2Vasion" {
		t.Fatalf("seed identity = %+v", row)
	}
	if row.EventStart != "2025-11-14T08:00" || row.DayCampEnd != "2025-11-14T15:00" || row.Camp24End != "2025-11-15T08:00" {
		t.Fatalf("seed dates = %s %s %s", row.EventStart, row.DayCampEnd, row.Camp24End)
	}
	lines := row.Announcements()
	if len(lines) != 3 || lines[0] != "Welcome to CodeCamp 2025!" || lines[1] != "Bring Your Genius!" {
		t.Fatalf("seed ticker = %#v", lines)
	}
	if !strings.Contains(lines[2], "semi-colon") {
		t.Fatalf("seed ticker = %#v", lines)
	}
	if row.WifiLabel() != "WIFI: CodeCamp:Welcome2Vasion" {
		t.Fatalf("wifi label = %q", row.WifiLabel())
	}

	again, err := settings.New(accounts.DB())
	if err != nil {
		t.Fatal(err)
	}
	kept, err := again.Get()
	if err != nil {
		t.Fatal(err)
	}
	if kept.EventTitle != "CodeCamp 2025" || kept.WifiPassword != "Welcome2Vasion" {
		t.Fatalf("second open reseeded: %+v", kept)
	}

	_, err = store.Save(settings.Input{
		EventTitle:  "Camp",
		WifiSSID:    "Net",
		EventStart:  "2026-02-01T09:00",
		DayCampEnd:  "2026-01-01T09:00",
		Camp24End:   "2026-03-01T09:00",
		TickerLines: []string{"Hi"},
	})
	if !errors.Is(err, settings.ErrOrder) {
		t.Fatalf("out of order = %v", err)
	}
	unchanged, err := store.Get()
	if err != nil {
		t.Fatal(err)
	}
	if unchanged.EventTitle != "CodeCamp 2025" {
		t.Fatalf("rejected save changed the row: %+v", unchanged)
	}

	tooLong := validInput()
	tooLong.EventTitle = strings.Repeat("a", 81)
	if _, err := store.Save(tooLong); !errors.Is(err, settings.ErrTitle) {
		t.Fatalf("long title = %v", err)
	}
	tooLong.EventTitle = "Camp"
	tooLong.WifiSSID = strings.Repeat("n", 65)
	if _, err := store.Save(tooLong); !errors.Is(err, settings.ErrWifi) {
		t.Fatalf("long wifi = %v", err)
	}
	badDate := validInput()
	badDate.EventStart = "tomorrow"
	if _, err := store.Save(badDate); !errors.Is(err, settings.ErrDates) {
		t.Fatalf("bad date = %v", err)
	}
	tooMany := validInput()
	tooMany.TickerLines = make([]string, 41)
	for i := range tooMany.TickerLines {
		tooMany.TickerLines[i] = "line"
	}
	if _, err := store.Save(tooMany); !errors.Is(err, settings.ErrTicker) {
		t.Fatalf("too many lines = %v", err)
	}

	in := validInput()
	in.EventStart = "2026-04-02T09:00:30"
	saved, err := store.Save(in)
	if err != nil {
		t.Fatal(err)
	}
	if saved.EventStart != "2026-04-02T09:00" || saved.WifiSSID != "LabNet" || saved.WifiPassword != "secret-pass" {
		t.Fatalf("saved = %+v", saved)
	}
	if saved.WifiLabel() != "WIFI: LabNet:secret-pass" {
		t.Fatalf("wifi label = %q", saved.WifiLabel())
	}
	round, err := store.Get()
	if err != nil {
		t.Fatal(err)
	}
	if round.EventTitle != "Saturday Lab" || round.EventStart != saved.EventStart || round.Ticker != "Hello room" {
		t.Fatalf("round trip = %+v", round)
	}

	noPassword := validInput()
	noPassword.WifiPassword = ""
	saved, err = store.Save(noPassword)
	if err != nil {
		t.Fatal(err)
	}
	if saved.WifiLabel() != "WIFI: LabNet" {
		t.Fatalf("passwordless wifi = %q", saved.WifiLabel())
	}
	hidden := validInput()
	hidden.WifiSSID = ""
	hidden.WifiPassword = "   "
	saved, err = store.Save(hidden)
	if err != nil {
		t.Fatal(err)
	}
	if saved.WifiLabel() != "" {
		t.Fatalf("blank wifi = %q", saved.WifiLabel())
	}

	ticked, err := store.SaveTicker([]string{" Line A ", "", "Line B"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(ticked.Announcements(), "|") != "Line A|Line B" {
		t.Fatalf("ticker = %#v", ticked.Announcements())
	}
	if ticked.EventTitle != "Saturday Lab" {
		t.Fatalf("ticker save changed the title: %+v", ticked)
	}

	if err := accounts.DB().Delete(&settings.Settings{}, 1).Error; err != nil {
		t.Fatal(err)
	}
	reseeded, err := store.Get()
	if err != nil {
		t.Fatal(err)
	}
	if reseeded.EventTitle != "CodeCamp 2025" || reseeded.WifiSSID != "CodeCamp" {
		t.Fatalf("missing row was not seeded: %+v", reseeded)
	}
}

func validInput() settings.Input {
	return settings.Input{
		EventTitle:   "Saturday Lab",
		WifiSSID:     "LabNet",
		WifiPassword: "secret-pass",
		EventStart:   "2026-04-02T09:00",
		DayCampEnd:   "2026-04-02T17:00",
		Camp24End:    "2026-04-03T09:00",
		TickerLines:  []string{"Hello room"},
	}
}
