package realtime

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Kind int

const (
	KindDisplay Kind = iota
	KindGame
	KindAdmin
)

type Client struct {
	conn        *websocket.Conn
	send        chan []byte
	kind        Kind
	userID      uint
	sessionHash string
	token       string
	hub         *Hub
}

type inbound struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

type SessionCheck func(sessionHash string) bool

// TickerSaver persists ticker lines and returns the lines that were stored.
type TickerSaver func(lines []string) ([]string, error)

type Hub struct {
	engine     *Engine
	clients    map[*Client]struct{}
	mu         sync.Mutex
	upgrader   websocket.Upgrader
	sessions   SessionCheck
	saveTicker TickerSaver
}

func NewHub(engine *Engine) *Hub {
	hub := &Hub{
		engine:  engine,
		clients: map[*Client]struct{}{},
	}
	hub.upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin:     sameOrigin,
	}
	engine.SetBus(hub)
	return hub
}

func (h *Hub) SetSessionCheck(check SessionCheck) {
	h.mu.Lock()
	h.sessions = check
	h.mu.Unlock()
}

func (h *Hub) SetTickerSaver(save TickerSaver) {
	h.mu.Lock()
	h.saveTicker = save
	h.mu.Unlock()
}

func (h *Hub) Serve(w http.ResponseWriter, r *http.Request, kind Kind, userID uint, sessionHash string) {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade: %v", err)
		return
	}
	client := &Client{
		conn:        conn,
		send:        make(chan []byte, 64),
		kind:        kind,
		userID:      userID,
		sessionHash: sessionHash,
		hub:         h,
	}
	h.register(client)
}

func (h *Hub) CloseUser(userID uint) {
	h.mu.Lock()
	var conns []*websocket.Conn
	for client := range h.clients {
		if client.kind == KindAdmin && client.userID == userID {
			conns = append(conns, client.conn)
		}
	}
	h.mu.Unlock()
	for _, conn := range conns {
		_ = conn.Close()
	}
}

func (h *Hub) register(client *Client) {
	h.mu.Lock()
	h.clients[client] = struct{}{}
	h.mu.Unlock()
	go client.writePump()
	if client.kind == KindAdmin {
		h.engine.Snapshot(client)
	}
	client.readPump()
}

func (h *Hub) unregister(client *Client) {
	h.mu.Lock()
	if _, ok := h.clients[client]; !ok {
		h.mu.Unlock()
		return
	}
	delete(h.clients, client)
	close(client.send)
	h.mu.Unlock()
	if client.kind == KindGame {
		h.engine.Disconnect(client)
	}
}

func (h *Hub) dispatch(client *Client, msg inbound) {
	switch client.kind {
	case KindDisplay:
		return
	case KindGame:
		h.dispatchGame(client, msg)
	case KindAdmin:
		if !h.adminAllowed(client) {
			if client.conn != nil {
				_ = client.conn.Close()
			}
			return
		}
		h.dispatchAdmin(client, msg)
	default:
		return
	}
}

func (h *Hub) adminAllowed(client *Client) bool {
	h.mu.Lock()
	check := h.sessions
	h.mu.Unlock()
	if check == nil {
		return true
	}
	return check(client.sessionHash)
}

func (h *Hub) dispatchGame(client *Client, msg inbound) {
	switch msg.Type {
	case "game-join":
		var body struct {
			SessionToken string `json:"sessionToken"`
		}
		_ = decode(msg.Data, &body)
		h.engine.Join(client, clip(body.SessionToken, 120))
	case "game-answer":
		var body struct {
			QuestionID  int `json:"questionId"`
			AnswerIndex int `json:"answerIndex"`
		}
		if !decode(msg.Data, &body) {
			return
		}
		h.engine.Answer(client, body.QuestionID, body.AnswerIndex)
	default:
	}
}

func (h *Hub) dispatchAdmin(client *Client, msg inbound) {
	switch msg.Type {
	case "media-control":
		if payload, ok := mediaCommand(msg.Data); ok {
			h.SendDisplay(Envelope{Type: "media-command", Data: payload})
		}
	case "notification":
		if payload, ok := notificationCommand(msg.Data); ok {
			h.SendDisplay(Envelope{Type: "notification", Data: payload})
		}
	case "dismiss-notification":
		if payload, ok := dismissCommand(msg.Data); ok {
			h.SendDisplay(Envelope{Type: "dismiss-notification", Data: payload})
		}
	case "ticker-update":
		payload, ok := tickerCommand(msg.Data)
		if !ok {
			return
		}
		body, ok := payload.(map[string]any)
		if !ok {
			return
		}
		lines, ok := body["announcements"].([]string)
		if !ok || len(lines) == 0 {
			return
		}
		h.mu.Lock()
		save := h.saveTicker
		h.mu.Unlock()
		if save != nil {
			saved, err := save(append([]string(nil), lines...))
			if err != nil {
				log.Printf("ticker save: %v", err)
				return
			}
			if len(saved) == 0 {
				return
			}
			body["announcements"] = saved
		}
		h.SendDisplay(Envelope{Type: "ticker-update", Data: body})
	case "youtube-audio":
		h.playYouTube(msg.Data)
	case "game-select":
		var body struct {
			GameID string `json:"gameId"`
		}
		if decode(msg.Data, &body) {
			h.engine.Select(clip(body.GameID, 64))
		}
	case "game-start":
		var body struct {
			GameID string `json:"gameId"`
		}
		_ = decode(msg.Data, &body)
		h.engine.Start(client, clip(body.GameID, 64))
	case "game-stop":
		h.engine.Stop()
	case "game-window-toggle":
		h.SendDisplay(Envelope{Type: "game-window-toggle"})
	default:
	}
}

func (h *Hub) playYouTube(raw json.RawMessage) {
	action, videoURL, ok := youTubeCommand(raw)
	if !ok {
		return
	}
	if action == "play" {
		ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
		title, err := YouTubeTitle(ctx, videoURL)
		cancel()
		if err != nil {
			log.Printf("youtube title: %v", err)
		} else {
			h.SendDisplay(Envelope{Type: "notification", Data: map[string]any{
				"type":        "info",
				"title":       "Now Playing",
				"message":     title,
				"id":          "youtube-audio",
				"autoDismiss": 5000,
			}})
		}
		h.SendDisplay(Envelope{Type: "youtube-audio", Data: map[string]string{
			"action": "play",
			"url":    videoURL,
		}})
		return
	}
	h.SendDisplay(Envelope{Type: "youtube-audio", Data: map[string]string{"action": "stop"}})
}

func (h *Hub) SendDisplay(env Envelope) { h.broadcast(KindDisplay, env) }
func (h *Hub) SendGame(env Envelope)    { h.broadcast(KindGame, env) }
func (h *Hub) SendAdmin(env Envelope)   { h.broadcast(KindAdmin, env) }

func (h *Hub) SendClient(client *Client, env Envelope) {
	payload, err := json.Marshal(env)
	if err != nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.clients[client]; !ok {
		return
	}
	select {
	case client.send <- payload:
	default:
	}
}

func (h *Hub) broadcast(kind Kind, env Envelope) {
	payload, err := json.Marshal(env)
	if err != nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for client := range h.clients {
		if client.kind != kind {
			continue
		}
		select {
		case client.send <- payload:
		default:
		}
	}
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister(c)
		_ = c.conn.Close()
	}()
	c.conn.SetReadLimit(1 << 16)
	_ = c.conn.SetReadDeadline(time.Now().Add(70 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(70 * time.Second))
	})
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		_ = c.conn.SetReadDeadline(time.Now().Add(70 * time.Second))
		var msg inbound
		if err := json.Unmarshal(data, &msg); err != nil || msg.Type == "" {
			continue
		}
		c.hub.dispatch(c, msg)
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(25 * time.Second)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()
	for {
		select {
		case payload, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, payload); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func sameOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		// Browsers always send Origin on a websocket handshake. A missing
		// header is a non-browser client, which is allowed for the public game.
		return true
	}
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Host == "" {
		return false
	}
	host := r.Host
	if forwarded := r.Header.Get("X-Forwarded-Host"); forwarded != "" {
		host = forwarded
		if comma := strings.Index(host, ","); comma >= 0 {
			host = strings.TrimSpace(host[:comma])
		}
	}
	return strings.EqualFold(parsed.Host, host)
}

func decode(raw json.RawMessage, dest any) bool {
	if len(raw) == 0 {
		return true
	}
	return json.Unmarshal(raw, dest) == nil
}
