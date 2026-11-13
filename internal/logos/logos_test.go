package logos_test

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/brentdalling/code-camp-slider-2025/internal/auth"
	"github.com/brentdalling/code-camp-slider-2025/internal/logos"
	"golang.org/x/crypto/bcrypt"
)

func TestCreateListDeleteAndEventFilter(t *testing.T) {
	store := openStore(t, t.TempDir())

	current, err := store.Create("CodeCamp 2025", 12, pngReader())
	if err != nil {
		t.Fatal(err)
	}
	if !logosOK(current.Filename) {
		t.Fatalf("filename = %s", current.Filename)
	}
	if _, err := os.Stat(filepath.Join(storeDir(t, store), current.Filename)); err != nil {
		t.Fatal(err)
	}

	other, err := store.Create("  other camp ", 30, pngReader())
	if err != nil {
		t.Fatal(err)
	}
	if other.Event != "other camp" {
		t.Fatalf("trimmed event = %q", other.Event)
	}

	views, err := store.ForEvent("codecamp 2025")
	if err != nil {
		t.Fatal(err)
	}
	if len(views) != 1 || views[0].Seconds != 12 || views[0].Logo != "/logos/"+current.Filename {
		t.Fatalf("current event = %+v", views)
	}
	others, err := store.ForEvent("Other Camp")
	if err != nil {
		t.Fatal(err)
	}
	if len(others) != 1 || others[0].Seconds != 30 {
		t.Fatalf("other event = %+v", others)
	}

	names, err := store.EventNames()
	if err != nil {
		t.Fatal(err)
	}
	if len(names) != 2 {
		t.Fatalf("events = %#v", names)
	}

	if _, err := store.Path("../" + current.Filename); err == nil {
		t.Fatal("path traversal was accepted")
	}
	if _, err := store.Path("not-a-guid.png"); err == nil {
		t.Fatal("non-guid filename was accepted")
	}
	path, err := store.Path(current.Filename)
	if err != nil || !strings.HasSuffix(path, current.Filename) {
		t.Fatalf("path = %s %v", path, err)
	}

	if err := store.Delete(current.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("deleted logo file is still on disk")
	}
	if err := store.Delete(current.ID); err != logos.ErrNotFound {
		t.Fatalf("second delete = %v", err)
	}
	views, err = store.ForEvent("CodeCamp 2025")
	if err != nil || len(views) != 0 {
		t.Fatalf("after delete = %+v %v", views, err)
	}
}

func TestRejectsBadInput(t *testing.T) {
	store := openStore(t, t.TempDir())
	if _, err := store.Create("", 10, pngReader()); err != logos.ErrEvent {
		t.Fatalf("empty event = %v", err)
	}
	if _, err := store.Create(strings.Repeat("a", 81), 10, pngReader()); err != logos.ErrEvent {
		t.Fatalf("long event = %v", err)
	}
	if _, err := store.Create("Camp", 0, pngReader()); err != logos.ErrDuration {
		t.Fatalf("zero seconds = %v", err)
	}
	if _, err := store.Create("Camp", 601, pngReader()); err != logos.ErrDuration {
		t.Fatalf("long duration = %v", err)
	}
	if _, err := store.Create("Camp", 10, strings.NewReader("not an image")); err != logos.ErrImage {
		t.Fatalf("text upload = %v", err)
	}
	rows, err := store.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 0 {
		t.Fatalf("rejected uploads were stored: %+v", rows)
	}
}

func TestImportsLegacyTiersOnce(t *testing.T) {
	legacy := t.TempDir()
	if err := os.MkdirAll(filepath.Join(legacy, "gold"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(legacy, "bronze"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(legacy, "gold", "acme.png"), mustPNG(), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(legacy, "bronze", "mark.gif"), []byte("GIF89a"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(legacy, "gold", "skip.svg"), []byte("<svg></svg>"), 0o644); err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	accounts := openAccounts(t)
	first, err := logos.New(accounts.DB(), dir, legacy, "CodeCamp 2025")
	if err != nil {
		t.Fatal(err)
	}
	rows, err := first.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Event != "CodeCamp 2025" || rows[0].DurationSeconds != 60 {
		t.Fatalf("import = %+v", rows)
	}
	if _, err := os.Stat(filepath.Join(legacy, "gold", "acme.png")); err != nil {
		t.Fatal("import removed the original file")
	}

	second, err := logos.New(accounts.DB(), dir, legacy, "CodeCamp 2025")
	if err != nil {
		t.Fatal(err)
	}
	again, err := second.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(again) != 1 {
		t.Fatalf("second import = %+v", again)
	}
}

func openStore(t *testing.T, dir string) *logos.Store {
	t.Helper()
	store, err := logos.New(openAccounts(t).DB(), dir, t.TempDir(), "CodeCamp 2025")
	if err != nil {
		t.Fatal(err)
	}
	return store
}

func openAccounts(t *testing.T) *auth.Service {
	t.Helper()
	accounts, err := auth.Open(filepath.Join(t.TempDir(), "codecamp.db"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	return accounts
}

func storeDir(t *testing.T, store *logos.Store) string {
	t.Helper()
	path, err := store.Path(mustName(t, store))
	if err != nil {
		t.Fatal(err)
	}
	return filepath.Dir(path)
}

func mustName(t *testing.T, store *logos.Store) string {
	t.Helper()
	rows, err := store.List()
	if err != nil || len(rows) == 0 {
		t.Fatal(err)
	}
	return rows[0].Filename
}

func logosOK(name string) bool {
	return len(name) == len("xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx.png") && strings.HasSuffix(name, ".png")
}

func pngReader() *bytes.Reader {
	return bytes.NewReader(mustPNG())
}

func mustPNG() []byte {
	img := image.NewNRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.NRGBA{R: 255, A: 255})
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		panic(err)
	}
	return buf.Bytes()
}
