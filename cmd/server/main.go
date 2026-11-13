package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/brentdalling/code-camp-slider-2025/internal/auth"
	"github.com/brentdalling/code-camp-slider-2025/internal/config"
	"github.com/brentdalling/code-camp-slider-2025/internal/realtime"
	"github.com/brentdalling/code-camp-slider-2025/internal/settings"
	"github.com/brentdalling/code-camp-slider-2025/internal/web"
)

func main() {
	cfg := config.FromEnv()
	accounts, err := auth.Open(filepath.Join(cfg.DataDir, "codecamp.db"), 12)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	if _, err := accounts.EnsureSeedAdmin(); err != nil {
		log.Fatalf("seed admin: %v", err)
	}

	games, err := realtime.LoadGames(filepath.Join(cfg.Root, "public", "js", "game-data.js"))
	if err != nil {
		log.Printf("game data: %v", err)
		games = realtime.GamesFile{}
	} else {
		log.Printf("loaded %d game(s)", len(games.Games))
	}

	engine := realtime.NewEngine(games)
	hub := realtime.NewHub(engine)
	hub.SetSessionCheck(accounts.SessionLive)

	room, err := settings.New(accounts.DB())
	if err != nil {
		log.Fatalf("room settings: %v", err)
	}
	hub.SetTickerSaver(func(lines []string) ([]string, error) {
		row, err := room.SaveTicker(lines)
		if err != nil {
			return nil, err
		}
		return row.Announcements(), nil
	})

	app, err := web.New(cfg.Root, cfg.DataDir, accounts, hub, room)
	if err != nil {
		log.Fatalf("templates: %v", err)
	}

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           app.Router(),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				accounts.PurgeExpired()
			}
		}
	}()

	log.Printf("listening on http://localhost:%s", cfg.Port)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
