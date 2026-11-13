package web

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/brentdalling/code-camp-slider-2025/internal/auth"
	"github.com/brentdalling/code-camp-slider-2025/internal/realtime"
	"github.com/brentdalling/code-camp-slider-2025/internal/settings"
	"github.com/gorilla/websocket"
	"github.com/skip2/go-qrcode"
	"golang.org/x/crypto/bcrypt"
)

func TestDashboardAuthAndPublicGameSocket(t *testing.T) {
	app := newTestApp(t)
	ts := httptest.NewServer(app.Router())
	t.Cleanup(ts.Close)

	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	client := &http.Client{Jar: jar}
	body := get(t, client, ts.URL+"/setup")
	if !strings.Contains(body, "Create the admin account") {
		t.Fatalf("setup page = %s", body)
	}
	postForm(t, client, ts.URL+"/setup", url.Values{
		"email":    {"admin@example.com"},
		"password": {"password123"},
		"csrf":     {csrfToken(t, body)},
	})
	adminPage := get(t, client, ts.URL+"/admin/users")
	if !strings.Contains(adminPage, "admin@example.com") || !strings.Contains(adminPage, "Add user") {
		t.Fatalf("admin page missing account controls")
	}
	displayPage := get(t, client, ts.URL+"/admin")
	if !strings.Contains(displayPage, "Display window") || strings.Contains(displayPage, "Add user") {
		t.Fatal("display page should show the display panel")
	}
	missing, err := client.Get(ts.URL + "/admin/no-such-panel")
	if err != nil {
		t.Fatal(err)
	}
	defer missing.Body.Close()
	if missing.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown admin section = %d", missing.StatusCode)
	}

	closed := &http.Client{Jar: jar, CheckRedirect: stopRedirect}
	res, err := closed.PostForm(ts.URL+"/setup", url.Values{
		"email":    {"second@example.com"},
		"password": {"password123"},
		"csrf":     {csrfToken(t, adminPage)},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("second setup = %d", res.StatusCode)
	}

	anon := &http.Client{CheckRedirect: stopRedirect}
	res, err = anon.Get(ts.URL + "/admin")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusFound || !strings.Contains(res.Header.Get("Location"), "/login") {
		t.Fatalf("unauthenticated admin = %d %s", res.StatusCode, res.Header.Get("Location"))
	}

	postForm(t, client, ts.URL+"/admin/users", url.Values{
		"email":    {"staff@example.com"},
		"password": {"staff-password"},
		"role":     {"staff"},
		"csrf":     {csrfToken(t, adminPage)},
	})

	staffJar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	staff := &http.Client{Jar: staffJar}
	loginPage := get(t, staff, ts.URL+"/login")
	postForm(t, staff, ts.URL+"/login", url.Values{
		"email":    {"staff@example.com"},
		"password": {"staff-password"},
		"csrf":     {csrfToken(t, loginPage)},
	})
	staffPage := get(t, staff, ts.URL+"/admin/users")
	if strings.Contains(staffPage, "Temporary password") {
		t.Fatal("staff can see the add-user form")
	}
	staffSettings := get(t, staff, ts.URL+"/admin/settings")
	if !strings.Contains(staffSettings, "Room settings") || !strings.Contains(staffSettings, "Save room settings") {
		t.Fatal("staff cannot see room settings")
	}
	staffLogos := get(t, staff, ts.URL+"/admin/logos")
	if !strings.Contains(staffLogos, "Sponsor logos") {
		t.Fatal("staff cannot see logo upload")
	}
	denied := &http.Client{Jar: staffJar, CheckRedirect: stopRedirect}
	res, err = denied.PostForm(ts.URL+"/admin/users", url.Values{
		"email":    {"extra@example.com"},
		"password": {"password123"},
		"role":     {"staff"},
		"csrf":     {csrfToken(t, staffPage)},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("staff create user = %d", res.StatusCode)
	}

	_, resp, err := websocket.DefaultDialer.Dial(wsURL(ts.URL, "/ws/admin"), nil)
	if err == nil {
		t.Fatal("admin socket allowed an anonymous client")
	}
	if resp == nil || resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("admin socket status = %v", resp)
	}

	conn, _, err := websocket.DefaultDialer.Dial(wsURL(ts.URL, "/ws/game"), http.Header{
		"Origin": {ts.URL},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if err := conn.WriteJSON(map[string]any{"type": "game-join", "data": map[string]any{}}); err != nil {
		t.Fatal(err)
	}
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var joined struct {
		Type string `json:"type"`
		Data struct {
			UserName     string `json:"userName"`
			SessionToken string `json:"sessionToken"`
		} `json:"data"`
	}
	if err := conn.ReadJSON(&joined); err != nil {
		t.Fatal(err)
	}
	if joined.Type != "game-joined" || joined.Data.UserName == "" || joined.Data.SessionToken == "" {
		t.Fatalf("joined = %+v", joined)
	}

	_, resp, err = websocket.DefaultDialer.Dial(wsURL(ts.URL, "/ws/game"), http.Header{
		"Origin": {"https://evil.example"},
	})
	if err == nil {
		t.Fatal("foreign origin was allowed on the game socket")
	}
	if resp == nil || resp.StatusCode != http.StatusForbidden {
		t.Fatalf("foreign origin status = %v", resp)
	}

	gamePage := get(t, client, ts.URL+"/game")
	if !strings.Contains(gamePage, "No account needed") {
		t.Fatal("game page missing public copy")
	}
	display := get(t, client, ts.URL+"/")
	if !strings.Contains(display, "SPONSORS_DATA") || !strings.Contains(display, "/js/ws.js") {
		t.Fatal("display page is missing sponsor data or the socket client")
	}
}

func TestGameQRAndTitle(t *testing.T) {
	app := newTestApp(t)
	ts := httptest.NewServer(app.Router())
	t.Cleanup(ts.Close)

	res, err := http.Get(ts.URL + "/qr?game=quiz")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusOK || res.Header.Get("Content-Type") != "image/png" {
		t.Fatalf("qr status %d type %s", res.StatusCode, res.Header.Get("Content-Type"))
	}
	want, err := qrcode.Encode(ts.URL+"/game?game=quiz", qrcode.Medium, 512)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(body, want) {
		t.Fatalf("qr png = %d bytes, want %d", len(body), len(want))
	}

	req := httptest.NewRequest(http.MethodGet, "/qr?game=quiz", nil)
	req.Host = "display.example:3000"
	req.Header.Set("X-Forwarded-Proto", "https, http")
	rec := httptest.NewRecorder()
	app.Router().ServeHTTP(rec, req)
	forwarded, err := qrcode.Encode("https://display.example:3000/game?game=quiz", qrcode.Medium, 512)
	if err != nil {
		t.Fatal(err)
	}
	if rec.Code != http.StatusOK || !bytes.Equal(rec.Body.Bytes(), forwarded) {
		t.Fatalf("forwarded qr status %d bytes %d", rec.Code, rec.Body.Len())
	}

	missing, err := http.Get(ts.URL + "/qr?game=missing")
	if err != nil {
		t.Fatal(err)
	}
	defer missing.Body.Close()
	if missing.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown qr = %d", missing.StatusCode)
	}

	named := get(t, http.DefaultClient, ts.URL+"/game?game=quiz")
	if !strings.Contains(named, "<h1>Quiz</h1>") || !strings.Contains(named, "<title>Quiz</title>") {
		t.Fatalf("named game page = %s", named)
	}
	plain := get(t, http.DefaultClient, ts.URL+"/game?game=nope")
	if !strings.Contains(plain, "<h1>CodeCamp Quiz</h1>") {
		t.Fatalf("unknown game page = %s", plain)
	}
}

func TestDisplayReadsRoomSettings(t *testing.T) {
	app := newTestApp(t)
	ts := httptest.NewServer(app.Router())
	t.Cleanup(ts.Close)

	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	client := &http.Client{Jar: jar}
	setupPage := get(t, client, ts.URL+"/setup")
	postForm(t, client, ts.URL+"/setup", url.Values{
		"email":    {"admin@example.com"},
		"password": {"password123"},
		"csrf":     {csrfToken(t, setupPage)},
	})

	display := get(t, client, ts.URL+"/")
	if !strings.Contains(display, "WIFI: CodeCamp:Welcome2Vasion") {
		t.Fatal("display is missing the seeded Wi-Fi line")
	}
	if !strings.Contains(display, "2025-11-14T08:00") {
		t.Fatal("display is missing the seeded countdown start")
	}
	if strings.Contains(display, "2025-11-14T08:00:00") {
		t.Fatal("display still uses the old event date constant")
	}
	if !strings.Contains(display, `id="event-title">CodeCamp 2025`) {
		t.Fatal("display is missing the seeded title")
	}
	if !strings.Contains(display, "Bring Your Genius!") {
		t.Fatal("display is missing the seeded ticker")
	}

	adminPage := get(t, client, ts.URL+"/admin/settings")
	if !strings.Contains(adminPage, `name="eventTitle"`) || !strings.Contains(adminPage, "Welcome2Vasion") {
		t.Fatal("room settings form is missing saved values")
	}
	saveRes, err := client.PostForm(ts.URL+"/admin/settings", url.Values{
		"csrf":         {csrfToken(t, adminPage)},
		"eventTitle":   {"Saturday Lab"},
		"wifiSsid":     {"LabNet"},
		"wifiPassword": {"secret-pass"},
		"eventStart":   {"2026-04-02T09:00"},
		"dayCampEnd":   {"2026-04-02T17:00"},
		"camp24End":    {"2026-04-03T09:00"},
		"ticker":       {"Hello room"},
	})
	if err != nil {
		t.Fatal(err)
	}
	saveBody, err := io.ReadAll(saveRes.Body)
	saveRes.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	if saveRes.StatusCode != http.StatusOK || !strings.Contains(string(saveBody), "Room settings saved. The display will update.") {
		t.Fatalf("save status %d: %s", saveRes.StatusCode, saveBody)
	}
	savedPage := get(t, client, ts.URL+"/admin/settings")
	if !strings.Contains(savedPage, `value="Saturday Lab"`) || !strings.Contains(savedPage, "Hello room") {
		t.Fatal("saved settings did not round-trip into the form")
	}

	display = get(t, client, ts.URL+"/")
	if !strings.Contains(display, "WIFI: LabNet:secret-pass") || strings.Contains(display, "Welcome2Vasion") {
		t.Fatal("display did not pick up the saved Wi-Fi line")
	}
	if !strings.Contains(display, "2026-04-02T09:00") || !strings.Contains(display, "Saturday Lab") || !strings.Contains(display, "Hello room") {
		t.Fatal("display did not pick up the saved title, date, or ticker")
	}

	nofollow := &http.Client{Jar: jar, CheckRedirect: stopRedirect}
	res, err := nofollow.PostForm(ts.URL+"/admin/settings", url.Values{
		"csrf":         {csrfToken(t, savedPage)},
		"eventTitle":   {"Broken order"},
		"wifiSsid":     {"LabNet"},
		"wifiPassword": {"secret-pass"},
		"eventStart":   {"2026-05-02T09:00"},
		"dayCampEnd":   {"2025-01-01T09:00"},
		"camp24End":    {"2026-05-03T09:00"},
		"ticker":       {"Nope"},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusSeeOther || !strings.Contains(res.Header.Get("Location"), "error=order") {
		t.Fatalf("out of order = %d %s", res.StatusCode, res.Header.Get("Location"))
	}
	display = get(t, client, ts.URL+"/")
	if strings.Contains(display, "Broken order") || strings.Contains(display, "2025-01-01T09:00") {
		t.Fatal("rejected dates were written to the display")
	}
	if !strings.Contains(display, "WIFI: LabNet:secret-pass") {
		t.Fatal("rejected save cleared the Wi-Fi line")
	}
}

func TestLogosFollowTheCurrentEvent(t *testing.T) {
	app := newTestApp(t)
	ts := httptest.NewServer(app.Router())
	t.Cleanup(ts.Close)

	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	client := &http.Client{Jar: jar}
	setupPage := get(t, client, ts.URL+"/setup")
	postForm(t, client, ts.URL+"/setup", url.Values{
		"email":    {"admin@example.com"},
		"password": {"password123"},
		"csrf":     {csrfToken(t, setupPage)},
	})
	adminPage := get(t, client, ts.URL+"/admin/logos")
	if !strings.Contains(adminPage, "Sponsor logos") || !strings.Contains(adminPage, `id="logo-event"`) {
		t.Fatal("admin page is missing the logo form")
	}
	postLogo(t, client, ts.URL+"/admin/logos", csrfToken(t, adminPage), "CodeCamp 2025", "12")
	adminPage = get(t, client, ts.URL+"/admin/logos")
	postLogo(t, client, ts.URL+"/admin/logos", csrfToken(t, adminPage), "Other Camp", "99")

	display := get(t, client, ts.URL+"/")
	if !strings.Contains(display, `"seconds":12`) || strings.Contains(display, `"seconds":99`) {
		t.Fatalf("display logos = %s", display)
	}
	match := regexp.MustCompile(`/logos/[0-9a-f-]{36}\.png`).FindString(display)
	if match == "" {
		t.Fatal("display is missing the logo url")
	}
	res, err := client.Get(ts.URL + match)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusOK || res.Header.Get("Content-Type") != "image/png" || !bytes.HasPrefix(body, []byte("\x89PNG")) {
		t.Fatalf("logo file status %d type %s", res.StatusCode, res.Header.Get("Content-Type"))
	}
	missing, err := client.Get(ts.URL + "/logos/not-a-guid.png")
	if err != nil {
		t.Fatal(err)
	}
	defer missing.Body.Close()
	if missing.StatusCode != http.StatusNotFound {
		t.Fatalf("bad logo name = %d", missing.StatusCode)
	}

	adminPage = get(t, client, ts.URL+"/admin/logos")
	if !strings.Contains(adminPage, "Other Camp") || !strings.Contains(adminPage, "CodeCamp 2025") {
		t.Fatal("admin list is missing a saved logo")
	}
}

func TestBulkLogoUpload(t *testing.T) {
	app := newTestApp(t)
	ts := httptest.NewServer(app.Router())
	t.Cleanup(ts.Close)

	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	client := &http.Client{Jar: jar}
	setupPage := get(t, client, ts.URL+"/setup")
	postForm(t, client, ts.URL+"/setup", url.Values{
		"email":    {"admin@example.com"},
		"password": {"password123"},
		"csrf":     {csrfToken(t, setupPage)},
	})
	adminPage := get(t, client, ts.URL+"/admin/logos")
	if !strings.Contains(adminPage, `id="logo-bulk-file"`) || !strings.Contains(adminPage, "multiple") {
		t.Fatal("admin page is missing the bulk logo form")
	}
	png := testPNG(t)
	page := postBulkLogos(t, client, ts.URL+"/admin/logos/bulk", csrfToken(t, adminPage), "CodeCamp 2025", "21", []bulkFile{
		{name: "one.png", body: png},
		{name: "notes.txt", body: []byte("not an image")},
		{name: "two.png", body: png},
	})
	if !strings.Contains(page, "Saved 2 logos. 1 could not be read.") {
		t.Fatalf("bulk notice = %s", page)
	}
	if strings.Count(page, `class="logo-thumb"`) != 2 || strings.Count(page, "<td>21</td>") != 2 {
		t.Fatalf("bulk list = %s", page)
	}
	display := get(t, client, ts.URL+"/")
	if strings.Count(display, `"seconds":21`) != 2 {
		t.Fatalf("display logos = %s", display)
	}
	if len(regexp.MustCompile(`/logos/[0-9a-f-]{36}\.png`).FindAllString(display, -1)) != 2 {
		t.Fatalf("display logo urls = %s", display)
	}

	adminPage = get(t, client, ts.URL+"/admin/logos")
	empty := postBulkLogos(t, client, ts.URL+"/admin/logos/bulk", csrfToken(t, adminPage), "CodeCamp 2025", "21", nil)
	if !strings.Contains(empty, "Choose a PNG, JPEG, or GIF image.") {
		t.Fatalf("empty bulk upload = %s", empty)
	}
	if strings.Count(empty, `class="logo-thumb"`) != 2 {
		t.Fatal("empty upload changed the saved logos")
	}
}

type bulkFile struct {
	name string
	body []byte
}

func postBulkLogos(t *testing.T, client *http.Client, rawURL, csrf, event, seconds string, files []bulkFile) string {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for _, field := range [][2]string{{"csrf", csrf}, {"event", event}, {"seconds", seconds}} {
		if err := writer.WriteField(field[0], field[1]); err != nil {
			t.Fatal(err)
		}
	}
	for _, file := range files {
		part, err := writer.CreateFormFile("logos", file.name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write(file.body); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	req, err := http.NewRequest(http.MethodPost, rawURL, &body)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	page, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusOK {
		t.Fatalf("bulk upload status %d: %s", res.StatusCode, page)
	}
	return string(page)
}

func postLogo(t *testing.T, client *http.Client, rawURL, csrf, event, seconds string) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for _, field := range [][2]string{{"csrf", csrf}, {"event", event}, {"seconds", seconds}} {
		if err := writer.WriteField(field[0], field[1]); err != nil {
			t.Fatal(err)
		}
	}
	part, err := writer.CreateFormFile("logo", "logo.png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(testPNG(t)); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	req, err := http.NewRequest(http.MethodPost, rawURL, &body)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	page, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusOK || !strings.Contains(string(page), "Logo saved. The display will show it for that event.") {
		t.Fatalf("logo upload status %d: %s", res.StatusCode, page)
	}
}

func testPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.NRGBA{R: 20, G: 40, B: 80, A: 255})
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func newTestApp(t *testing.T) *Server {
	t.Helper()
	accounts, err := auth.Open(filepath.Join(t.TempDir(), "app.db"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	engine := realtime.NewEngine(realtime.GamesFile{Games: []realtime.Game{{
		ID:   "quiz",
		Name: "Quiz",
		Questions: []realtime.Question{{
			ID:       1,
			Question: "Ready?",
			Answers:  []realtime.Answer{{Text: "Yes", Correct: true}},
		}},
	}}})
	hub := realtime.NewHub(engine)
	hub.SetSessionCheck(accounts.SessionLive)
	room, err := settings.New(accounts.DB())
	if err != nil {
		t.Fatal(err)
	}
	hub.SetTickerSaver(func(lines []string) ([]string, error) {
		row, err := room.SaveTicker(lines)
		if err != nil {
			return nil, err
		}
		return row.Announcements(), nil
	})
	app, err := New(filepath.Join("..", ".."), t.TempDir(), accounts, hub, room)
	if err != nil {
		t.Fatal(err)
	}
	return app
}

func get(t *testing.T, client *http.Client, rawURL string) string {
	t.Helper()
	res, err := client.Get(rawURL)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusOK {
		t.Fatalf("%s status %d: %s", rawURL, res.StatusCode, body)
	}
	return string(body)
}

func postForm(t *testing.T, client *http.Client, rawURL string, values url.Values) {
	t.Helper()
	res, err := client.PostForm(rawURL, values)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("POST %s status %d: %s", rawURL, res.StatusCode, body)
	}
}

func csrfToken(t *testing.T, body string) string {
	t.Helper()
	const marker = `name="csrf" value="`
	start := strings.Index(body, marker)
	if start < 0 {
		t.Fatal("csrf field missing")
	}
	rest := body[start+len(marker):]
	end := strings.Index(rest, `"`)
	if end < 0 {
		t.Fatal("csrf field truncated")
	}
	return rest[:end]
}

func stopRedirect(req *http.Request, via []*http.Request) error {
	return http.ErrUseLastResponse
}

func wsURL(httpURL, path string) string {
	return "ws" + strings.TrimPrefix(httpURL, "http") + path
}
