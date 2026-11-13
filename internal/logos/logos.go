// Package logos stores sponsor images on disk and a pointer to each file in the database.
package logos

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"image"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	_ "image/gif"
	_ "image/jpeg"

	"gorm.io/gorm"
)

const (
	maxEvent   = 80
	minSeconds = 1
	maxSeconds = 600
	maxEdge    = 8192
	maxBytes   = 8 << 20
)

var (
	ErrEvent    = errors.New("invalid event")
	ErrDuration = errors.New("invalid duration")
	ErrImage    = errors.New("invalid image")
	ErrNotFound = errors.New("not found")

	pngName = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$`)
)

// Logo is one sponsor image for one event.
type Logo struct {
	ID              uint      `gorm:"primaryKey"`
	Event           string    `gorm:"size:80;index;not null"`
	DurationSeconds int       `gorm:"not null"`
	Filename        string    `gorm:"size:64;uniqueIndex;not null"`
	CreatedAt       time.Time `gorm:"index"`
}

func (Logo) TableName() string { return "logos" }

// View is the public payload the display rotates.
type View struct {
	Logo    string `json:"logo"`
	Seconds int    `json:"seconds"`
}

// Store keeps logo rows and the PNG files they point at.
type Store struct {
	db  *gorm.DB
	dir string
}

// New prepares the logo directory and table. When the table is empty it copies
// raster images from legacyDir's tier folders and tags them with eventTitle.
func New(db *gorm.DB, dir, legacyDir, eventTitle string) (*Store, error) {
	if db == nil {
		return nil, errors.New("logos: nil database")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	if err := db.AutoMigrate(&Logo{}); err != nil {
		return nil, err
	}
	store := &Store{db: db, dir: dir}
	if err := store.importLegacy(legacyDir, eventTitle); err != nil {
		return nil, err
	}
	return store, nil
}

func (s *Store) Create(event string, seconds int, r io.Reader) (Logo, error) {
	event = strings.TrimSpace(event)
	if event == "" || utf8.RuneCountInString(event) > maxEvent {
		return Logo{}, ErrEvent
	}
	if seconds < minSeconds || seconds > maxSeconds {
		return Logo{}, ErrDuration
	}
	img, err := decodeImage(r)
	if err != nil {
		return Logo{}, err
	}
	name, err := s.writePNG(img)
	if err != nil {
		return Logo{}, err
	}
	row := Logo{
		Event:           event,
		DurationSeconds: seconds,
		Filename:        name,
		CreatedAt:       time.Now().UTC(),
	}
	if err := s.db.Create(&row).Error; err != nil {
		_ = os.Remove(filepath.Join(s.dir, name))
		return Logo{}, err
	}
	return row, nil
}

func (s *Store) Delete(id uint) error {
	var row Logo
	err := s.db.First(&row, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if err := s.db.Delete(&Logo{}, row.ID).Error; err != nil {
		return err
	}
	if err := os.Remove(filepath.Join(s.dir, row.Filename)); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func (s *Store) List() ([]Logo, error) {
	var rows []Logo
	err := s.db.Order("created_at desc").Order("id desc").Find(&rows).Error
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []Logo{}
	}
	return rows, nil
}

// ForEvent returns logos whose event matches title, ignoring case and surrounding space.
func (s *Store) ForEvent(title string) ([]View, error) {
	var rows []Logo
	err := s.db.Order("created_at asc").Order("id asc").Find(&rows).Error
	if err != nil {
		return nil, err
	}
	title = strings.TrimSpace(title)
	out := make([]View, 0)
	for _, row := range rows {
		if strings.EqualFold(strings.TrimSpace(row.Event), title) {
			out = append(out, row.Public())
		}
	}
	return out, nil
}

// EventNames returns the distinct event labels already stored, in first-seen order.
func (s *Store) EventNames() ([]string, error) {
	rows, err := s.List()
	if err != nil {
		return nil, err
	}
	seen := map[string]struct{}{}
	names := make([]string, 0)
	for _, row := range rows {
		key := strings.ToLower(strings.TrimSpace(row.Event))
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		names = append(names, row.Event)
	}
	return names, nil
}

// Path returns the file for a GUID png name. Anything else is rejected.
func (s *Store) Path(name string) (string, error) {
	if !pngName.MatchString(name) {
		return "", ErrNotFound
	}
	path := filepath.Join(s.dir, name)
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return "", ErrNotFound
	}
	return path, nil
}

func (row Logo) Public() View {
	return View{
		Logo:    "/logos/" + row.Filename,
		Seconds: row.DurationSeconds,
	}
}

func (s *Store) writePNG(img image.Image) (string, error) {
	id, err := newGUID()
	if err != nil {
		return "", err
	}
	name := id + ".png"
	final := filepath.Join(s.dir, name)
	tmp, err := os.CreateTemp(s.dir, "logo-*.png")
	if err != nil {
		return "", err
	}
	tmpName := tmp.Name()
	err = png.Encode(tmp, img)
	closeErr := tmp.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		_ = os.Remove(tmpName)
		return "", err
	}
	if err := os.Rename(tmpName, final); err != nil {
		_ = os.Remove(tmpName)
		return "", err
	}
	return name, nil
}

func decodeImage(r io.Reader) (image.Image, error) {
	img, _, err := image.Decode(io.LimitReader(r, maxBytes))
	if err != nil {
		return nil, ErrImage
	}
	bounds := img.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if width < 1 || height < 1 || width > maxEdge || height > maxEdge {
		return nil, ErrImage
	}
	return img, nil
}

func newGUID() (string, error) {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	buf[6] = (buf[6] & 0x0f) | 0x40
	buf[8] = (buf[8] & 0x3f) | 0x80
	raw := hex.EncodeToString(buf[:])
	return raw[0:8] + "-" + raw[8:12] + "-" + raw[12:16] + "-" + raw[16:20] + "-" + raw[20:32], nil
}

type legacyTier struct {
	name    string
	seconds int
}

func (s *Store) importLegacy(legacyDir, eventTitle string) error {
	eventTitle = strings.TrimSpace(eventTitle)
	if eventTitle == "" || utf8.RuneCountInString(eventTitle) > maxEvent {
		return nil
	}
	var n int64
	if err := s.db.Model(&Logo{}).Count(&n).Error; err != nil {
		return err
	}
	if n != 0 {
		return nil
	}
	tiers := []legacyTier{
		{name: "platinum", seconds: 60},
		{name: "gold", seconds: 60},
		{name: "silver", seconds: 30},
		{name: "bronze", seconds: 15},
	}
	for _, tier := range tiers {
		entries, err := os.ReadDir(filepath.Join(legacyDir, tier.name))
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}
			switch strings.ToLower(filepath.Ext(entry.Name())) {
			case ".png", ".jpg", ".jpeg", ".gif":
			default:
				continue
			}
			file, err := os.Open(filepath.Join(legacyDir, tier.name, entry.Name()))
			if err != nil {
				continue
			}
			_, createErr := s.Create(eventTitle, tier.seconds, file)
			_ = file.Close()
			if createErr != nil {
				continue
			}
		}
	}
	return nil
}
