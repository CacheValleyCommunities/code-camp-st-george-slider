package realtime

import (
	"path/filepath"
	"testing"
)

func TestPointsForElapsed(t *testing.T) {
	if got := PointsForElapsed(0); got != 50 {
		t.Fatalf("0s = %d", got)
	}
	if got := PointsForElapsed(1); got != 49 {
		t.Fatalf("1s = %d", got)
	}
	if got := PointsForElapsed(10); got != 39 {
		t.Fatalf("10s = %d", got)
	}
}

func TestLoadGames(t *testing.T) {
	file, err := LoadGames(filepath.Join("..", "..", "public", "js", "game-data.js"))
	if err != nil {
		t.Fatal(err)
	}
	if len(file.Games) < 2 {
		t.Fatalf("games = %d", len(file.Games))
	}
	if file.Games[0].Questions[0].Question == "" {
		t.Fatal("missing question text")
	}
}

func TestGameSocketCannotStartAndAnswerScores(t *testing.T) {
	engine := NewEngine(GamesFile{Games: []Game{{
		ID:   "quiz",
		Name: "Quiz",
		Questions: []Question{{
			ID:       1,
			Question: "2+2?",
			Answers:  []Answer{{Text: "4", Correct: true}, {Text: "5", Correct: false}},
		}},
	}}})
	bus := &memBus{}
	engine.SetBus(bus)
	t.Cleanup(engine.Stop)

	hub := NewHub(engine)
	player := &Client{kind: KindGame, hub: hub}
	hub.dispatch(player, inbound{Type: "game-start", Data: []byte(`{"gameId":"quiz"}`)})
	if engine.active {
		t.Fatal("public game socket started the quiz")
	}

	engine.SetBus(bus)
	engine.Join(player, "")
	engine.Start(&Client{kind: KindAdmin}, "quiz")
	if !engine.active {
		t.Fatal("admin start did not begin the quiz")
	}
	engine.Answer(player, 1, 0)
	engine.Answer(player, 1, 1)
	if bus.count("game-answer-result") != 1 {
		t.Fatal("second answer was accepted")
	}
	result := bus.find("game-answer-result")
	payload, _ := result.Data.(map[string]any)
	if payload["correct"] != true || payload["points"] != 50 {
		t.Fatalf("result = %#v", payload)
	}
	engine.Stop()
}

func TestSelectNotifiesDisplay(t *testing.T) {
	engine := NewEngine(GamesFile{Games: []Game{
		{ID: "quiz", Name: "Quiz"},
		{ID: "other", Name: "Other"},
	}})
	bus := &memBus{}
	engine.SetBus(bus)

	engine.AnnounceSelected(&Client{})
	first := bus.find("game-selected")
	if first == nil {
		t.Fatal("display connect did not receive a quiz")
	}
	payload, _ := first.Data.(map[string]string)
	if payload["id"] != "quiz" || payload["name"] != "Quiz" {
		t.Fatalf("default selection = %#v", first.Data)
	}

	engine.Select("other")
	if bus.count("game-selected") != 2 {
		t.Fatalf("game-selected count = %d", bus.count("game-selected"))
	}
	selected := bus.msgs[len(bus.msgs)-1]
	payload, _ = selected.Data.(map[string]string)
	if selected.Type != "game-selected" || payload["id"] != "other" || payload["name"] != "Other" {
		t.Fatalf("selected = %#v", selected)
	}

	engine.Select("missing")
	if bus.count("game-selected") != 2 {
		t.Fatal("unknown quiz changed the selection")
	}
	id, name, ok := engine.PublicGame(" other ")
	if !ok || id != "other" || name != "Other" {
		t.Fatalf("public game = %q %q %v", id, name, ok)
	}
	if _, _, ok = engine.PublicGame("missing"); ok {
		t.Fatal("unknown quiz was published")
	}
}

func TestYouTubeURL(t *testing.T) {
	if !IsYouTubeURL("https://www.youtube.com/watch?v=jfKfPfyJRdk") {
		t.Fatal("expected youtube url")
	}
	if IsYouTubeURL("http://www.youtube.com/watch?v=jfKfPfyJRdk") || IsYouTubeURL("https://evil.example/watch?v=abc") {
		t.Fatal("accepted unsafe url")
	}
}

type memBus struct {
	msgs []Envelope
}

func (m *memBus) SendDisplay(env Envelope)           { m.msgs = append(m.msgs, env) }
func (m *memBus) SendGame(env Envelope)              { m.msgs = append(m.msgs, env) }
func (m *memBus) SendAdmin(env Envelope)             { m.msgs = append(m.msgs, env) }
func (m *memBus) SendClient(c *Client, env Envelope) { m.msgs = append(m.msgs, env) }

func (m *memBus) find(eventType string) *Envelope {
	for i := range m.msgs {
		if m.msgs[i].Type == eventType {
			return &m.msgs[i]
		}
	}
	return nil
}

func (m *memBus) count(eventType string) int {
	n := 0
	for _, msg := range m.msgs {
		if msg.Type == eventType {
			n++
		}
	}
	return n
}
