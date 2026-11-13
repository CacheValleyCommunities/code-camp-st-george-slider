package web

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"errors"

	"github.com/brentdalling/code-camp-slider-2025/internal/auth"
	"github.com/brentdalling/code-camp-slider-2025/internal/logos"
	"github.com/brentdalling/code-camp-slider-2025/internal/realtime"
	"github.com/brentdalling/code-camp-slider-2025/internal/settings"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/skip2/go-qrcode"
)

const csrfCookie = "cc_csrf"

type ctxKey int

const nonceKey ctxKey = 1

type Server struct {
	auth    *auth.Service
	hub     *realtime.Hub
	room    *settings.Store
	logos   *logos.Store
	tmpl    *template.Template
	root    string
	limiter *limiter
}

func New(root, dataDir string, accounts *auth.Service, hub *realtime.Hub, room *settings.Store) (*Server, error) {
	tmpl, err := template.ParseFiles(
		filepath.Join(root, "templates", "index.html"),
		filepath.Join(root, "templates", "game.html"),
		filepath.Join(root, "templates", "admin.html"),
		filepath.Join(root, "templates", "login.html"),
		filepath.Join(root, "templates", "setup.html"),
	)
	if err != nil {
		return nil, err
	}
	row, err := room.Get()
	if err != nil {
		return nil, err
	}
	marks, err := logos.New(accounts.DB(), filepath.Join(dataDir, "logos"), filepath.Join(root, "logos"), row.DisplayTitle())
	if err != nil {
		return nil, err
	}
	return &Server{
		auth:    accounts,
		hub:     hub,
		room:    room,
		logos:   marks,
		tmpl:    tmpl,
		root:    root,
		limiter: newLimiter(20, 10*time.Minute),
	}, nil
}

func (s *Server) Router() http.Handler {
	router := chi.NewRouter()
	router.Use(middleware.RealIP)
	router.Use(middleware.Recoverer)
	router.Use(s.baseHeaders)

	router.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	router.Get("/", s.index)
	router.Get("/game", s.gamePage)
	router.Get("/qr", s.gameQR)
	router.Get("/setup", s.setupForm)
	router.Post("/setup", s.setup)
	router.Get("/login", s.loginForm)
	router.Post("/login", s.login)
	router.Post("/logout", s.logout)
	router.Get("/admin", s.admin)
	router.Get("/admin/game", s.adminPage("game"))
	router.Get("/admin/video", s.adminPage("video"))
	router.Get("/admin/image", s.adminPage("image"))
	router.Get("/admin/text", s.adminPage("text"))
	router.Get("/admin/settings", s.adminPage("settings"))
	router.Get("/admin/logos", s.adminPage("logos"))
	router.Get("/admin/audio", s.adminPage("audio"))
	router.Get("/admin/notifications", s.adminPage("notifications"))
	router.Get("/admin/players", s.adminPage("players"))
	router.Get("/admin/users", s.adminPage("users"))
	router.Get("/admin-cc-25-panel", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/admin", http.StatusFound)
	})
	router.Post("/admin/settings", s.saveSettings)
	router.Post("/admin/logos", s.createLogo)
	router.Post("/admin/logos/bulk", s.createLogos)
	router.Post("/admin/logos/{id}/delete", s.deleteLogo)
	router.Post("/admin/users", s.createUser)
	router.Post("/admin/users/{id}/delete", s.deleteUser)
	router.Get("/ws/display", s.displaySocket)
	router.Get("/ws/game", s.gameSocket)
	router.Get("/ws/admin", s.adminSocket)

	router.Handle("/css/*", staticDir("/css/", filepath.Join(s.root, "public", "css")))
	router.Handle("/js/*", staticDir("/js/", filepath.Join(s.root, "public", "js")))
	router.Handle("/images/*", staticDir("/images/", filepath.Join(s.root, "public", "images")))
	router.Get("/logos/{name}", s.serveLogo)
	router.Get("/9nlGN0.gif", s.serveRootFile("9nlGN0.gif"))
	router.Get("/pixel-bg.svg", s.serveRootFile("pixel-bg.svg"))
	return router
}

func (s *Server) index(w http.ResponseWriter, r *http.Request) {
	nonce := nonceFrom(r)
	setDisplayCSP(w, nonce)
	w.Header().Set("X-Frame-Options", "SAMEORIGIN")
	row, err := s.room.Get()
	if err != nil {
		http.Error(w, "could not load room settings", http.StatusInternalServerError)
		return
	}
	view := row.Public()
	marks, err := s.logos.ForEvent(view.EventTitle)
	if err != nil {
		http.Error(w, "could not load sponsors", http.StatusInternalServerError)
		return
	}
	sponsors, err := marshalJS(marks)
	if err != nil {
		http.Error(w, "could not load sponsors", http.StatusInternalServerError)
		return
	}
	dates, err := marshalJS(view.EventDates)
	if err != nil {
		http.Error(w, "could not load event dates", http.StatusInternalServerError)
		return
	}
	roomJSON, err := marshalJS(view)
	if err != nil {
		http.Error(w, "could not load room settings", http.StatusInternalServerError)
		return
	}
	s.render(w, "index.html", indexPage{
		Nonce:            nonce,
		EventTitle:       view.EventTitle,
		WifiLabel:        view.WifiLabel,
		Announcements:    view.Announcements,
		SponsorsJSON:     sponsors,
		EventDatesJSON:   dates,
		RoomSettingsJSON: roomJSON,
	})
}

func (s *Server) gamePage(w http.ResponseWriter, r *http.Request) {
	setAppCSP(w, nonceFrom(r))
	title := "CodeCamp Quiz"
	if _, name, ok := s.hub.PublicGame(r.URL.Query().Get("game")); ok && name != "" {
		title = name
	}
	s.render(w, "game.html", map[string]any{"Title": title})
}

func (s *Server) gameQR(w http.ResponseWriter, r *http.Request) {
	gameID, _, ok := s.hub.PublicGame(r.URL.Query().Get("game"))
	if !ok {
		http.NotFound(w, r)
		return
	}
	png, err := qrcode.Encode(publicGameURL(r, gameID), qrcode.Medium, 512)
	if err != nil {
		http.Error(w, "could not build qr code", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(png)
}

func publicGameURL(r *http.Request, gameID string) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if forwarded := forwardedProto(r.Header.Get("X-Forwarded-Proto")); forwarded != "" {
		scheme = forwarded
	}
	return (&url.URL{
		Scheme:   scheme,
		Host:     r.Host,
		Path:     "/game",
		RawQuery: "game=" + url.QueryEscape(gameID),
	}).String()
}

func forwardedProto(header string) string {
	proto, _, _ := strings.Cut(header, ",")
	proto = strings.ToLower(strings.TrimSpace(proto))
	switch proto {
	case "http", "https":
		return proto
	default:
		return ""
	}
}

func (s *Server) setupForm(w http.ResponseWriter, r *http.Request) {
	hasUsers, err := s.auth.HasUsers()
	if err != nil {
		http.Error(w, "unavailable", http.StatusInternalServerError)
		return
	}
	if hasUsers {
		http.Redirect(w, r, "/login", http.StatusFound)
		return
	}
	setAppCSP(w, nonceFrom(r))
	s.render(w, "setup.html", map[string]any{
		"CSRF":  s.csrfToken(w, r),
		"Error": setupError(r.URL.Query().Get("error")),
	})
}

func (s *Server) setup(w http.ResponseWriter, r *http.Request) {
	if !csrfOK(w, r) {
		return
	}
	hasUsers, err := s.auth.HasUsers()
	if err != nil {
		http.Error(w, "unavailable", http.StatusInternalServerError)
		return
	}
	if hasUsers {
		http.Error(w, "registration is closed", http.StatusForbidden)
		return
	}
	user, err := s.auth.CreateFirstAdmin(r.FormValue("email"), r.FormValue("password"))
	if err != nil {
		http.Redirect(w, r, "/setup?error="+setupErrorCode(err), http.StatusSeeOther)
		return
	}
	if err := s.startSession(w, r, user.ID); err != nil {
		http.Error(w, "could not start session", http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/admin?notice=welcome", http.StatusSeeOther)
}

func (s *Server) loginForm(w http.ResponseWriter, r *http.Request) {
	hasUsers, err := s.auth.HasUsers()
	if err != nil {
		http.Error(w, "unavailable", http.StatusInternalServerError)
		return
	}
	if !hasUsers {
		http.Redirect(w, r, "/setup", http.StatusFound)
		return
	}
	if _, ok := s.auth.FromRequest(r); ok {
		http.Redirect(w, r, "/admin", http.StatusFound)
		return
	}
	setAppCSP(w, nonceFrom(r))
	s.render(w, "login.html", map[string]any{
		"CSRF":  s.csrfToken(w, r),
		"Error": loginError(r.URL.Query().Get("error")),
	})
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	if !csrfOK(w, r) {
		return
	}
	if !s.limiter.Allow(clientIP(r)) {
		http.Redirect(w, r, "/login?error=rate", http.StatusSeeOther)
		return
	}
	user, err := s.auth.Login(r.FormValue("email"), r.FormValue("password"))
	if err != nil {
		http.Redirect(w, r, "/login?error=invalid", http.StatusSeeOther)
		return
	}
	s.limiter.Reset(clientIP(r))
	if err := s.startSession(w, r, user.ID); err != nil {
		http.Error(w, "could not start session", http.StatusInternalServerError)
		return
	}
	log.Printf("dashboard login: %s", user.Email)
	http.Redirect(w, r, "/admin", http.StatusSeeOther)
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if !csrfOK(w, r) {
		return
	}
	identity, ok := s.auth.FromRequest(r)
	if cookie, err := r.Cookie(auth.SessionCookie); err == nil {
		s.auth.EndSession(cookie.Value)
	}
	clearCookie(w, r, auth.SessionCookie)
	if ok {
		s.hub.CloseUser(identity.User.ID)
	}
	http.Redirect(w, r, "/login", http.StatusSeeOther)
}

func (s *Server) admin(w http.ResponseWriter, r *http.Request) {
	s.renderAdmin(w, r, "display")
}

func (s *Server) adminPage(section string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s.renderAdmin(w, r, section)
	}
}

func (s *Server) renderAdmin(w http.ResponseWriter, r *http.Request, section string) {
	identity, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if !knownAdminSection(section) {
		http.NotFound(w, r)
		return
	}
	setAppCSP(w, nonceFrom(r))
	page := adminPage{
		CSRF:    s.csrfToken(w, r),
		Email:   identity.User.Email,
		Role:    roleLabel(identity.User.Role),
		IsAdmin: identity.User.IsAdmin(),
		Section: section,
		Notice:  adminNotice(r.URL.Query()),
		Error:   adminError(r.URL.Query().Get("error")),
	}
	switch section {
	case "settings":
		if !s.fillRoom(w, &page) {
			return
		}
	case "logos":
		if !s.fillRoom(w, &page) || !s.fillLogos(w, &page) {
			return
		}
	case "users":
		if !s.fillUsers(w, &page, identity) {
			return
		}
	case "display", "game", "video", "image", "text", "audio", "notifications", "players":
	default:
		http.NotFound(w, r)
		return
	}
	s.render(w, "admin.html", page)
}

func knownAdminSection(section string) bool {
	switch section {
	case "display", "game", "video", "image", "text", "settings", "logos", "audio", "notifications", "players", "users":
		return true
	default:
		return false
	}
}

func (s *Server) fillRoom(w http.ResponseWriter, page *adminPage) bool {
	room, err := s.room.Get()
	if err != nil {
		http.Error(w, "unavailable", http.StatusInternalServerError)
		return false
	}
	page.EventTitle = room.EventTitle
	page.LogoEvent = room.DisplayTitle()
	page.WifiSSID = room.WifiSSID
	page.WifiPassword = room.WifiPassword
	page.EventStart = room.EventStart
	page.DayCampEnd = room.DayCampEnd
	page.Camp24End = room.Camp24End
	page.Ticker = room.Ticker
	return true
}

func (s *Server) fillLogos(w http.ResponseWriter, page *adminPage) bool {
	marks, err := s.logos.List()
	if err != nil {
		http.Error(w, "unavailable", http.StatusInternalServerError)
		return false
	}
	events, err := s.logos.EventNames()
	if err != nil {
		http.Error(w, "unavailable", http.StatusInternalServerError)
		return false
	}
	rows := make([]logoRow, 0, len(marks))
	for _, mark := range marks {
		rows = append(rows, logoRow{
			ID:      mark.ID,
			Event:   mark.Event,
			Seconds: mark.DurationSeconds,
			URL:     mark.Public().Logo,
		})
	}
	page.Logos = rows
	page.Events = events
	return true
}

func (s *Server) fillUsers(w http.ResponseWriter, page *adminPage, identity auth.Identity) bool {
	users, err := s.auth.ListUsers()
	if err != nil {
		http.Error(w, "unavailable", http.StatusInternalServerError)
		return false
	}
	rows := make([]userRow, 0, len(users))
	for _, user := range users {
		rows = append(rows, userRow{
			ID:        user.ID,
			Email:     user.Email,
			Role:      roleLabel(user.Role),
			Created:   user.CreatedAt.Local().Format("Jan 2, 2006 3:04 PM"),
			CanRemove: identity.User.IsAdmin() && user.ID != identity.User.ID,
		})
	}
	page.Users = rows
	return true
}

func adminPath(section, query string) string {
	path := "/admin"
	if section != "display" {
		path += "/" + section
	}
	if query != "" {
		path += "?" + query
	}
	return path
}

func (s *Server) saveSettings(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireUser(w, r); !ok {
		return
	}
	if !csrfOK(w, r) {
		return
	}
	before, beforeErr := s.room.Get()
	row, err := s.room.Save(settings.Input{
		EventTitle:   r.FormValue("eventTitle"),
		WifiSSID:     r.FormValue("wifiSsid"),
		WifiPassword: r.FormValue("wifiPassword"),
		EventStart:   r.FormValue("eventStart"),
		DayCampEnd:   r.FormValue("dayCampEnd"),
		Camp24End:    r.FormValue("camp24End"),
		TickerLines:  strings.Split(r.FormValue("ticker"), "\n"),
	})
	if err != nil {
		http.Redirect(w, r, adminPath("settings", "error="+settingsErrorCode(err)), http.StatusSeeOther)
		return
	}
	s.hub.SendDisplay(realtime.Envelope{Type: "room-settings", Data: row.Public()})
	if beforeErr != nil || !strings.EqualFold(before.DisplayTitle(), row.DisplayTitle()) {
		s.pushSponsors()
	}
	http.Redirect(w, r, adminPath("settings", "notice=settings"), http.StatusSeeOther)
}

func (s *Server) createUser(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	if !csrfOK(w, r) {
		return
	}
	role := r.FormValue("role")
	if _, err := s.auth.CreateUser(r.FormValue("email"), r.FormValue("password"), role); err != nil {
		http.Redirect(w, r, adminPath("users", "error="+userErrorCode(err)), http.StatusSeeOther)
		return
	}
	http.Redirect(w, r, adminPath("users", "notice=user-created"), http.StatusSeeOther)
}

func (s *Server) deleteUser(w http.ResponseWriter, r *http.Request) {
	identity, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	if !csrfOK(w, r) {
		return
	}
	id, err := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Redirect(w, r, adminPath("users", "error=not-found"), http.StatusSeeOther)
		return
	}
	if err := s.auth.DeleteUser(identity.User.ID, uint(id)); err != nil {
		http.Redirect(w, r, adminPath("users", "error="+userErrorCode(err)), http.StatusSeeOther)
		return
	}
	s.hub.CloseUser(uint(id))
	http.Redirect(w, r, adminPath("users", "notice=user-deleted"), http.StatusSeeOther)
}

func (s *Server) createLogo(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireUser(w, r); !ok {
		return
	}
	if !csrfMultipart(w, r) {
		return
	}
	seconds, err := strconv.Atoi(strings.TrimSpace(r.FormValue("seconds")))
	if err != nil {
		http.Redirect(w, r, adminPath("logos", "error=duration"), http.StatusSeeOther)
		return
	}
	file, _, err := r.FormFile("logo")
	if err != nil {
		http.Redirect(w, r, adminPath("logos", "error=image"), http.StatusSeeOther)
		return
	}
	defer file.Close()
	if _, err := s.logos.Create(r.FormValue("event"), seconds, file); err != nil {
		http.Redirect(w, r, adminPath("logos", "error="+logoErrorCode(err)), http.StatusSeeOther)
		return
	}
	s.pushSponsors()
	http.Redirect(w, r, adminPath("logos", "notice=logo"), http.StatusSeeOther)
}

func (s *Server) createLogos(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireUser(w, r); !ok {
		return
	}
	if !csrfMultipartLimit(w, r, maxBulkLogoBody) {
		return
	}
	seconds, err := strconv.Atoi(strings.TrimSpace(r.FormValue("seconds")))
	if err != nil {
		http.Redirect(w, r, adminPath("logos", "error=duration"), http.StatusSeeOther)
		return
	}
	var files int
	if r.MultipartForm != nil {
		files = len(r.MultipartForm.File["logos"])
	}
	if files == 0 || files > maxBulkLogos {
		http.Redirect(w, r, adminPath("logos", "error=image"), http.StatusSeeOther)
		return
	}
	event := r.FormValue("event")
	saved := 0
	skipped := 0
	for _, header := range r.MultipartForm.File["logos"] {
		file, openErr := header.Open()
		if openErr != nil {
			skipped++
			continue
		}
		_, createErr := s.logos.Create(event, seconds, file)
		_ = file.Close()
		if createErr == nil {
			saved++
			continue
		}
		if errors.Is(createErr, logos.ErrEvent) || errors.Is(createErr, logos.ErrDuration) {
			http.Redirect(w, r, adminPath("logos", "error="+logoErrorCode(createErr)), http.StatusSeeOther)
			return
		}
		skipped++
	}
	if saved == 0 {
		http.Redirect(w, r, adminPath("logos", "error=image"), http.StatusSeeOther)
		return
	}
	s.pushSponsors()
	query := fmt.Sprintf("notice=logos&saved=%d&skipped=%d", saved, skipped)
	http.Redirect(w, r, adminPath("logos", query), http.StatusSeeOther)
}

func (s *Server) deleteLogo(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireUser(w, r); !ok {
		return
	}
	if !csrfOK(w, r) {
		return
	}
	id, err := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Redirect(w, r, adminPath("logos", "error=logo-missing"), http.StatusSeeOther)
		return
	}
	if err := s.logos.Delete(uint(id)); err != nil {
		http.Redirect(w, r, adminPath("logos", "error="+logoErrorCode(err)), http.StatusSeeOther)
		return
	}
	s.pushSponsors()
	http.Redirect(w, r, adminPath("logos", "notice=logo-deleted"), http.StatusSeeOther)
}

func (s *Server) serveLogo(w http.ResponseWriter, r *http.Request) {
	path, err := s.logos.Path(chi.URLParam(r, "name"))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeFile(w, r, path)
}

func (s *Server) pushSponsors() {
	row, err := s.room.Get()
	if err != nil {
		return
	}
	views, err := s.logos.ForEvent(row.DisplayTitle())
	if err != nil {
		return
	}
	s.hub.SendDisplay(realtime.Envelope{Type: "sponsors", Data: views})
}

func (s *Server) displaySocket(w http.ResponseWriter, r *http.Request) {
	s.hub.Serve(w, r, realtime.KindDisplay, 0, "")
}

func (s *Server) gameSocket(w http.ResponseWriter, r *http.Request) {
	s.hub.Serve(w, r, realtime.KindGame, 0, "")
}

func (s *Server) adminSocket(w http.ResponseWriter, r *http.Request) {
	identity, ok := s.auth.FromRequest(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	s.hub.Serve(w, r, realtime.KindAdmin, identity.User.ID, identity.SessionHash)
}

func (s *Server) requireUser(w http.ResponseWriter, r *http.Request) (auth.Identity, bool) {
	hasUsers, err := s.auth.HasUsers()
	if err != nil {
		http.Error(w, "unavailable", http.StatusInternalServerError)
		return auth.Identity{}, false
	}
	if !hasUsers {
		http.Redirect(w, r, "/setup", http.StatusFound)
		return auth.Identity{}, false
	}
	identity, ok := s.auth.FromRequest(r)
	if !ok {
		http.Redirect(w, r, "/login", http.StatusFound)
		return auth.Identity{}, false
	}
	return identity, true
}

func (s *Server) requireAdmin(w http.ResponseWriter, r *http.Request) (auth.Identity, bool) {
	identity, ok := s.requireUser(w, r)
	if !ok {
		return auth.Identity{}, false
	}
	if !identity.User.IsAdmin() {
		http.Error(w, "forbidden", http.StatusForbidden)
		return auth.Identity{}, false
	}
	return identity, true
}

func (s *Server) startSession(w http.ResponseWriter, r *http.Request, userID uint) error {
	token, err := s.auth.StartSession(userID)
	if err != nil {
		return err
	}
	setCookie(w, r, auth.SessionCookie, token, int(auth.SessionTTL.Seconds()))
	return nil
}

func (s *Server) render(w http.ResponseWriter, name string, data any) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if err := s.tmpl.ExecuteTemplate(w, name, data); err != nil {
		log.Printf("template %s: %v", name, err)
	}
}

func (s *Server) serveRootFile(name string) http.HandlerFunc {
	path := filepath.Join(s.root, name)
	return func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, path)
	}
}

func (s *Server) baseHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nonce := newNonce()
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'")
		next.ServeHTTP(w, withNonce(r, nonce))
	})
}

func (s *Server) csrfToken(w http.ResponseWriter, r *http.Request) string {
	if cookie, err := r.Cookie(csrfCookie); err == nil && len(cookie.Value) >= 32 {
		return cookie.Value
	}
	token := newNonce()
	setCookie(w, r, csrfCookie, token, int(auth.SessionTTL.Seconds()))
	return token
}

func csrfOK(w http.ResponseWriter, r *http.Request) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := r.ParseForm(); err != nil {
		http.Error(w, "invalid form", http.StatusBadRequest)
		return false
	}
	cookie, err := r.Cookie(csrfCookie)
	if err != nil || !auth.TokensEqual(cookie.Value, r.FormValue("csrf")) || len(cookie.Value) < 32 {
		http.Error(w, "Invalid form submission. Go back and try again.", http.StatusForbidden)
		return false
	}
	return true
}

const (
	maxLogoBody     = 8 << 20
	maxBulkLogoBody = 64 << 20
	maxBulkLogos    = 30
)

func csrfMultipart(w http.ResponseWriter, r *http.Request) bool {
	return csrfMultipartLimit(w, r, maxLogoBody)
}

func csrfMultipartLimit(w http.ResponseWriter, r *http.Request, limit int64) bool {
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		http.Error(w, "invalid form", http.StatusBadRequest)
		return false
	}
	cookie, err := r.Cookie(csrfCookie)
	if err != nil || !auth.TokensEqual(cookie.Value, r.FormValue("csrf")) || len(cookie.Value) < 32 {
		http.Error(w, "Invalid form submission. Go back and try again.", http.StatusForbidden)
		return false
	}
	return true
}

func setCookie(w http.ResponseWriter, r *http.Request, name, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   requestIsHTTPS(r),
		MaxAge:   maxAge,
	})
}

func clearCookie(w http.ResponseWriter, r *http.Request, name string) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   requestIsHTTPS(r),
		MaxAge:   -1,
	})
}

func requestIsHTTPS(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

func setDisplayCSP(w http.ResponseWriter, nonce string) {
	w.Header().Set("Content-Security-Policy", strings.Join([]string{
		"default-src 'self'",
		"script-src 'self' 'nonce-" + nonce + "' https://www.youtube.com https://www.youtube-nocookie.com https://s.ytimg.com",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: https:",
		"media-src 'self' https: blob:",
		"frame-src https://www.youtube.com https://www.youtube-nocookie.com",
		"connect-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'self'",
	}, "; "))
}

func setAppCSP(w http.ResponseWriter, nonce string) {
	_ = nonce
	w.Header().Set("Content-Security-Policy", strings.Join([]string{
		"default-src 'self'",
		"script-src 'self'",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data:",
		"connect-src 'self'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'",
	}, "; "))
}

func staticDir(prefix, dir string) http.Handler {
	files := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/") {
			http.NotFound(w, r)
			return
		}
		http.StripPrefix(prefix, files).ServeHTTP(w, r)
	})
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func nonceFrom(r *http.Request) string {
	nonce, _ := r.Context().Value(nonceKey).(string)
	if nonce == "" {
		return newNonce()
	}
	return nonce
}

func withNonce(r *http.Request, nonce string) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), nonceKey, nonce))
}

func marshalJS(value any) (template.JS, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return template.JS(encoded), nil
}

type indexPage struct {
	Nonce            string
	EventTitle       string
	WifiLabel        string
	Announcements    []string
	SponsorsJSON     template.JS
	EventDatesJSON   template.JS
	RoomSettingsJSON template.JS
}

func newNonce() string {
	buf := make([]byte, 32)
	_, _ = rand.Read(buf)
	return base64.RawURLEncoding.EncodeToString(buf)
}

type limiter struct {
	mu     sync.Mutex
	max    int
	window time.Duration
	hits   map[string]*hit
}

type hit struct {
	n     int
	start time.Time
}

func newLimiter(max int, window time.Duration) *limiter {
	return &limiter{max: max, window: window, hits: map[string]*hit{}}
}

func (l *limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	if len(l.hits) > 1000 {
		for k, item := range l.hits {
			if now.Sub(item.start) > l.window {
				delete(l.hits, k)
			}
		}
	}
	item := l.hits[key]
	if item == nil || now.Sub(item.start) > l.window {
		l.hits[key] = &hit{n: 1, start: now}
		return true
	}
	if item.n >= l.max {
		return false
	}
	item.n++
	return true
}

func (l *limiter) Reset(key string) {
	l.mu.Lock()
	delete(l.hits, key)
	l.mu.Unlock()
}

func roleLabel(role string) string {
	switch role {
	case auth.RoleAdmin:
		return "Admin"
	case auth.RoleStaff:
		return "Staff"
	default:
		return "Staff"
	}
}

type userRow struct {
	ID        uint
	Email     string
	Role      string
	Created   string
	CanRemove bool
}

type adminPage struct {
	CSRF         string
	Email        string
	Role         string
	IsAdmin      bool
	Section      string
	Users        []userRow
	Logos        []logoRow
	Events       []string
	Notice       string
	Error        string
	EventTitle   string
	LogoEvent    string
	WifiSSID     string
	WifiPassword string
	EventStart   string
	DayCampEnd   string
	Camp24End    string
	Ticker       string
}

type logoRow struct {
	ID      uint
	Event   string
	Seconds int
	URL     string
}

func loginError(code string) string {
	switch code {
	case "invalid":
		return "Email or password is incorrect."
	case "rate":
		return "Too many attempts. Wait a few minutes and try again."
	default:
		return ""
	}
}

func setupError(code string) string {
	switch code {
	case "email":
		return "Enter a valid email address."
	case "password":
		return "Use a password between 10 and 72 characters."
	case "closed":
		return "An admin account already exists. Sign in instead."
	case "save":
		return "Could not create the account. Try again."
	default:
		return ""
	}
}

func adminNotice(query url.Values) string {
	switch query.Get("notice") {
	case "welcome":
		return "Admin account created. This dashboard is now private."
	case "user-created":
		return "User added. They can sign in with that email and password."
	case "user-deleted":
		return "User removed."
	case "settings":
		return "Room settings saved. The display will update."
	case "logo":
		return "Logo saved. The display will show it for that event."
	case "logos":
		return bulkLogoNotice(query.Get("saved"), query.Get("skipped"))
	case "logo-deleted":
		return "Logo removed."
	default:
		return ""
	}
}

func bulkLogoNotice(savedRaw, skippedRaw string) string {
	saved, err := strconv.Atoi(savedRaw)
	if err != nil || saved < 1 {
		return "Logos saved."
	}
	notice := "Saved 1 logo."
	if saved != 1 {
		notice = fmt.Sprintf("Saved %d logos.", saved)
	}
	skipped, err := strconv.Atoi(skippedRaw)
	if err != nil || skipped < 1 {
		return notice
	}
	return notice + fmt.Sprintf(" %d could not be read.", skipped)
}

func adminError(code string) string {
	switch code {
	case "email":
		return "Enter a valid email address."
	case "password":
		return "Use a password between 10 and 72 characters."
	case "taken":
		return "An account with that email already exists."
	case "role":
		return "Choose Admin or Staff."
	case "self":
		return "You can't remove your own account."
	case "last-admin":
		return "The last admin account has to stay."
	case "not-found":
		return "That user is no longer on the dashboard."
	case "save":
		return "Could not save that change. Try again."
	case "title":
		return "Event title must be 80 characters or fewer."
	case "wifi":
		return "Wi-Fi network and password must be 64 characters or fewer."
	case "ticker":
		return "Enter at least one announcement, up to 40 lines."
	case "dates":
		return "Enter a valid start, day-camp end, and 24-hour end."
	case "order":
		return "The countdown dates have to be in order: start, day camp, then 24-hour camp."
	case "settings":
		return "Could not save room settings."
	case "event":
		return "Enter an event name, up to 80 characters."
	case "duration":
		return "Display time must be a whole number of seconds from 1 to 600."
	case "image":
		return "Choose a PNG, JPEG, or GIF image."
	case "logo-missing":
		return "That logo is no longer saved."
	case "logo":
		return "Could not save that logo. Try again."
	default:
		return ""
	}
}

func logoErrorCode(err error) string {
	switch {
	case errors.Is(err, logos.ErrEvent):
		return "event"
	case errors.Is(err, logos.ErrDuration):
		return "duration"
	case errors.Is(err, logos.ErrImage):
		return "image"
	case errors.Is(err, logos.ErrNotFound):
		return "logo-missing"
	default:
		return "logo"
	}
}

func settingsErrorCode(err error) string {
	switch {
	case errors.Is(err, settings.ErrTitle):
		return "title"
	case errors.Is(err, settings.ErrWifi):
		return "wifi"
	case errors.Is(err, settings.ErrTicker):
		return "ticker"
	case errors.Is(err, settings.ErrDates):
		return "dates"
	case errors.Is(err, settings.ErrOrder):
		return "order"
	default:
		return "settings"
	}
}

func setupErrorCode(err error) string {
	switch err {
	case auth.ErrInvalidEmail:
		return "email"
	case auth.ErrInvalidPassword:
		return "password"
	case auth.ErrRegistrationClosed:
		return "closed"
	default:
		return "save"
	}
}

func userErrorCode(err error) string {
	switch err {
	case auth.ErrInvalidEmail:
		return "email"
	case auth.ErrInvalidPassword:
		return "password"
	case auth.ErrEmailTaken:
		return "taken"
	case auth.ErrInvalidRole:
		return "role"
	case auth.ErrDeleteSelf:
		return "self"
	case auth.ErrLastAdmin:
		return "last-admin"
	case auth.ErrNotFound:
		return "not-found"
	default:
		return "save"
	}
}
