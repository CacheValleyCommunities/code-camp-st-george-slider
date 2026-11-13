package realtime

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"log"
	"sort"
	"sync"
	"time"
)

type Bus interface {
	SendDisplay(env Envelope)
	SendGame(env Envelope)
	SendAdmin(env Envelope)
	SendClient(c *Client, env Envelope)
}

type Envelope struct {
	Type string `json:"type"`
	Data any    `json:"data,omitempty"`
}

type Player struct {
	Name   string
	Score  int
	Token  string
	Client *Client
}

type Engine struct {
	mu      sync.Mutex
	bus     Bus
	games   []Game
	active  bool
	gameID  string
	index   int
	started time.Time
	answers map[string]int
	players map[string]*Player
	timer   *time.Timer
	gen     int
}

type outMsg struct {
	dest string
	c    *Client
	env  Envelope
}

func NewEngine(file GamesFile) *Engine {
	games := file.Games
	if games == nil {
		games = []Game{}
	}
	return &Engine{
		games:   games,
		answers: map[string]int{},
		players: map[string]*Player{},
	}
}

func (e *Engine) SetBus(bus Bus) {
	e.mu.Lock()
	e.bus = bus
	e.mu.Unlock()
}

func (e *Engine) flush(msgs []outMsg) {
	e.mu.Lock()
	bus := e.bus
	e.mu.Unlock()
	if bus == nil {
		return
	}
	for _, msg := range msgs {
		switch msg.dest {
		case "display":
			bus.SendDisplay(msg.env)
		case "game":
			bus.SendGame(msg.env)
		case "admin":
			bus.SendAdmin(msg.env)
		case "client":
			if msg.c != nil {
				bus.SendClient(msg.c, msg.env)
			}
		default:
		}
	}
}

func (e *Engine) Join(c *Client, token string) {
	e.mu.Lock()
	msgs := e.joinLocked(c, token)
	e.mu.Unlock()
	e.flush(msgs)
}

func (e *Engine) joinLocked(c *Client, token string) []outMsg {
	if token != "" {
		if player, ok := e.players[token]; ok {
			player.Client = c
			c.token = token
			return append([]outMsg{clientMsg(c, "game-joined", map[string]any{
				"sessionToken": player.Token,
				"userName":     player.Name,
			})}, e.playerUpdateLocked()...)
		}
	}
	player := &Player{
		Name:   e.uniqueNameLocked(),
		Token:  newPlayerToken(),
		Client: c,
	}
	c.token = player.Token
	e.players[player.Token] = player
	msgs := []outMsg{
		clientMsg(c, "game-joined", map[string]any{
			"sessionToken": player.Token,
			"userName":     player.Name,
		}),
		displayMsg("notification", map[string]any{
			"type":        "info",
			"title":       "Player Joined",
			"message":     player.Name + " joined the game!",
			"id":          fmt.Sprintf("notif-join-%d", time.Now().UnixNano()),
			"autoDismiss": 5000,
		}),
	}
	return append(msgs, e.playerUpdateLocked()...)
}

func (e *Engine) Disconnect(c *Client) {
	e.mu.Lock()
	changed := false
	if c != nil && c.token != "" {
		if player, ok := e.players[c.token]; ok && player.Client == c {
			player.Client = nil
			changed = true
		}
	}
	var msgs []outMsg
	if changed {
		msgs = e.playerUpdateLocked()
	}
	e.mu.Unlock()
	e.flush(msgs)
}

func (e *Engine) Select(gameID string) {
	e.mu.Lock()
	if e.find(gameID) == nil {
		e.mu.Unlock()
		return
	}
	e.gameID = gameID
	msgs := e.gameListLocked(nil)
	e.mu.Unlock()
	e.flush(msgs)
}

func (e *Engine) Start(c *Client, gameID string) {
	e.mu.Lock()
	msgs := e.startLocked(c, gameID)
	e.mu.Unlock()
	e.flush(msgs)
}

func (e *Engine) startLocked(c *Client, gameID string) []outMsg {
	if e.active {
		return nil
	}
	if gameID == "" {
		gameID = e.gameID
	}
	if gameID == "" && len(e.games) > 0 {
		gameID = e.games[0].ID
	}
	game := e.find(gameID)
	if game == nil {
		return []outMsg{clientMsg(c, "game-error", map[string]string{"message": "No game selected"})}
	}
	if len(game.Questions) == 0 {
		return []outMsg{clientMsg(c, "game-error", map[string]string{"message": "Selected game has no questions"})}
	}
	e.gameID = gameID
	e.active = true
	e.index = 0
	e.answers = map[string]int{}
	for _, player := range e.players {
		player.Score = 0
	}
	log.Printf("game started: %s players=%d", game.Name, len(e.players))
	msgs := []outMsg{displayMsg("game-command", map[string]string{"action": "show"})}
	return append(msgs, e.startQuestionLocked()...)
}

func (e *Engine) Stop() {
	e.mu.Lock()
	e.invalidateLocked()
	e.active = false
	msgs := []outMsg{displayMsg("game-command", map[string]string{"action": "hide"})}
	if e.gameID != "" {
		msgs = append(msgs, e.leaderboardLocked()...)
	}
	e.mu.Unlock()
	e.flush(msgs)
}

func (e *Engine) Answer(c *Client, questionID, answerIndex int) {
	e.mu.Lock()
	msgs := e.answerLocked(c, questionID, answerIndex)
	e.mu.Unlock()
	e.flush(msgs)
}

func (e *Engine) answerLocked(c *Client, questionID, answerIndex int) []outMsg {
	if c == nil || c.token == "" || !e.active {
		return nil
	}
	player, ok := e.players[c.token]
	if !ok || player.Client != c {
		return nil
	}
	if _, answered := e.answers[c.token]; answered {
		return nil
	}
	question := e.currentQuestion()
	if question == nil || question.ID != questionID {
		return nil
	}
	if answerIndex < 0 || answerIndex >= len(question.Answers) {
		return nil
	}
	correct := question.Answers[answerIndex].Correct
	elapsed := int(time.Since(e.started).Seconds())
	points := 0
	if correct {
		points = PointsForElapsed(elapsed)
	}
	e.answers[c.token] = answerIndex
	player.Score += points
	msgs := []outMsg{clientMsg(c, "game-answer-result", map[string]any{
		"correct":            correct,
		"points":             points,
		"timeElapsed":        elapsed,
		"correctAnswerIndex": correctIndex(question),
	})}
	if e.everyoneAnsweredLocked() {
		e.armLocked(2*time.Second, "advance")
	}
	return msgs
}

func (e *Engine) Snapshot(c *Client) {
	e.mu.Lock()
	msgs := append(e.gameListLocked(c), e.playerUpdateLockedTo(c)...)
	e.mu.Unlock()
	e.flush(msgs)
}

func (e *Engine) startQuestionLocked() []outMsg {
	game := e.find(e.gameID)
	if game == nil || e.index >= len(game.Questions) {
		e.active = false
		return e.leaderboardLocked()
	}
	question := &game.Questions[e.index]
	e.answers = map[string]int{}
	e.started = time.Now()
	e.armLocked(30*time.Second, "advance")
	publicAnswers := make([]map[string]string, 0, len(question.Answers))
	for _, answer := range question.Answers {
		publicAnswers = append(publicAnswers, map[string]string{"text": answer.Text})
	}
	payload := map[string]any{
		"id":             question.ID,
		"question":       question.Question,
		"answers":        publicAnswers,
		"questionNumber": e.index + 1,
		"totalQuestions": len(game.Questions),
		"timeLeft":       30,
	}
	log.Printf("question %d/%d: %s", e.index+1, len(game.Questions), question.Question)
	return []outMsg{
		gameMsg("game-question", payload),
		displayMsg("game-display-question", payload),
	}
}

func (e *Engine) advanceLocked() []outMsg {
	msgs := e.resultsLocked()
	e.index++
	game := e.find(e.gameID)
	if game != nil && e.index < len(game.Questions) {
		e.armLocked(3*time.Second, "next")
		return msgs
	}
	e.active = false
	e.armLocked(3*time.Second, "board")
	return msgs
}

func (e *Engine) resultsLocked() []outMsg {
	question := e.currentQuestion()
	if question == nil {
		return nil
	}
	return []outMsg{displayMsg("game-question-results", map[string]any{
		"correctAnswerIndex": correctIndex(question),
	})}
}

func (e *Engine) leaderboardLocked() []outMsg {
	list := make([]*Player, 0, len(e.players))
	for _, player := range e.players {
		list = append(list, player)
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].Score == list[j].Score {
			return list[i].Name < list[j].Name
		}
		return list[i].Score > list[j].Score
	})
	if len(list) > 5 {
		list = list[:5]
	}
	type row struct {
		Rank  int    `json:"rank"`
		Name  string `json:"name"`
		Score int    `json:"score"`
	}
	rows := make([]row, 0, len(list))
	for i, player := range list {
		rows = append(rows, row{Rank: i + 1, Name: player.Name, Score: player.Score})
	}
	payload := map[string]any{"players": rows}
	log.Printf("leaderboard players=%d", len(rows))
	return []outMsg{
		displayMsg("game-leaderboard", payload),
		displayMsg("game-display-leaderboard", payload),
		gameMsg("game-end", map[string]any{}),
	}
}

func (e *Engine) playerUpdateLocked() []outMsg {
	return []outMsg{adminMsg("game-players-update", e.playerPayload())}
}

func (e *Engine) playerUpdateLockedTo(c *Client) []outMsg {
	return []outMsg{clientMsg(c, "game-players-update", e.playerPayload())}
}

func (e *Engine) playerPayload() map[string]any {
	names := make([]string, 0)
	for _, player := range e.players {
		if player.Client != nil {
			names = append(names, player.Name)
		}
	}
	sort.Strings(names)
	return map[string]any{
		"totalPlayers": len(e.players),
		"players":      names,
	}
}

func (e *Engine) gameListLocked(c *Client) []outMsg {
	payload := e.gameListPayload()
	if c != nil {
		return []outMsg{clientMsg(c, "game-list-update", payload)}
	}
	return []outMsg{adminMsg("game-list-update", payload)}
}

func (e *Engine) gameListPayload() map[string]any {
	type item struct {
		ID            string `json:"id"`
		Name          string `json:"name"`
		Description   string `json:"description"`
		QuestionCount int    `json:"questionCount"`
	}
	items := make([]item, 0, len(e.games))
	for _, game := range e.games {
		items = append(items, item{
			ID:            game.ID,
			Name:          game.Name,
			Description:   game.Description,
			QuestionCount: len(game.Questions),
		})
	}
	return map[string]any{
		"games":        items,
		"selectedGame": e.gameID,
	}
}

func (e *Engine) everyoneAnsweredLocked() bool {
	connected := 0
	for _, player := range e.players {
		if player.Client != nil {
			connected++
		}
	}
	return connected > 0 && len(e.answers) >= connected
}

func (e *Engine) currentQuestion() *Question {
	game := e.find(e.gameID)
	if game == nil || e.index < 0 || e.index >= len(game.Questions) {
		return nil
	}
	return &game.Questions[e.index]
}

func (e *Engine) find(id string) *Game {
	for i := range e.games {
		if e.games[i].ID == id {
			return &e.games[i]
		}
	}
	return nil
}

func (e *Engine) armLocked(delay time.Duration, kind string) {
	if e.timer != nil {
		e.timer.Stop()
	}
	e.gen++
	gen := e.gen
	e.timer = time.AfterFunc(delay, func() {
		e.fire(gen, kind)
	})
}

func (e *Engine) invalidateLocked() {
	e.gen++
	if e.timer != nil {
		e.timer.Stop()
		e.timer = nil
	}
}

func (e *Engine) fire(gen int, kind string) {
	e.mu.Lock()
	if gen != e.gen {
		e.mu.Unlock()
		return
	}
	var msgs []outMsg
	switch kind {
	case "advance":
		msgs = e.advanceLocked()
	case "next":
		msgs = e.startQuestionLocked()
	case "board":
		msgs = e.leaderboardLocked()
	default:
	}
	e.mu.Unlock()
	e.flush(msgs)
}

func (e *Engine) uniqueNameLocked() string {
	used := map[string]bool{}
	for _, player := range e.players {
		used[player.Name] = true
	}
	for attempt := 0; attempt < 8; attempt++ {
		name := generateName()
		if !used[name] {
			return name
		}
	}
	return generateName() + "-" + newPlayerToken()[len("session-"):]
}

func correctIndex(question *Question) int {
	for i, answer := range question.Answers {
		if answer.Correct {
			return i
		}
	}
	return -1
}

func displayMsg(eventType string, data any) outMsg {
	return outMsg{dest: "display", env: Envelope{Type: eventType, Data: data}}
}

func gameMsg(eventType string, data any) outMsg {
	return outMsg{dest: "game", env: Envelope{Type: eventType, Data: data}}
}

func adminMsg(eventType string, data any) outMsg {
	return outMsg{dest: "admin", env: Envelope{Type: eventType, Data: data}}
}

func clientMsg(c *Client, eventType string, data any) outMsg {
	return outMsg{dest: "client", c: c, env: Envelope{Type: eventType, Data: data}}
}

func newPlayerToken() string {
	buf := make([]byte, 9)
	_, _ = rand.Read(buf)
	return fmt.Sprintf("session-%d-%s", time.Now().UnixMilli(), base64.RawURLEncoding.EncodeToString(buf))
}

func generateName() string {
	colors := []string{"Red", "Blue", "Green", "Yellow", "Purple", "Orange", "Pink", "Cyan", "Magenta", "Lime", "Teal", "Violet"}
	animals := []string{"Lion", "Tiger", "Bear", "Eagle", "Shark", "Dolphin", "Wolf", "Fox", "Rabbit", "Deer", "Hawk", "Panther"}
	languages := []string{"JavaScript", "Python", "Java", "C++", "Ruby", "Go", "Rust", "Swift", "Kotlin", "TypeScript", "PHP", "C#"}
	return colors[randIndex(len(colors))] + animals[randIndex(len(animals))] + languages[randIndex(len(languages))]
}

func randIndex(n int) int {
	if n <= 1 {
		return 0
	}
	var buf [1]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return 0
	}
	return int(buf[0]) % n
}
