package realtime

import (
	"encoding/json"
	"os"
	"strings"

	"github.com/dop251/goja"
)

type GamesFile struct {
	Games []Game `json:"games"`
}

type Game struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Difficulty  string     `json:"difficulty"`
	Questions   []Question `json:"questions"`
}

type Question struct {
	ID       int      `json:"id"`
	Question string   `json:"question"`
	Answers  []Answer `json:"answers"`
	Points   int      `json:"points"`
}

type Answer struct {
	Text    string `json:"text"`
	Correct bool   `json:"correct"`
}

// LoadGames evaluates the existing game-data.js file. The browser still
// receives questions from the server with the correct flags removed.
func LoadGames(path string) (GamesFile, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return GamesFile{}, err
	}
	src := string(raw)
	if i := strings.Index(src, "if (typeof module"); i >= 0 {
		src = src[:i]
	}
	vm := goja.New()
	value, err := vm.RunString(src + "\ngameData;")
	if err != nil {
		return GamesFile{}, err
	}
	encoded, err := json.Marshal(value.Export())
	if err != nil {
		return GamesFile{}, err
	}
	var file GamesFile
	if err := json.Unmarshal(encoded, &file); err != nil {
		return GamesFile{}, err
	}
	if file.Games == nil {
		file.Games = []Game{}
	}
	return file, nil
}
