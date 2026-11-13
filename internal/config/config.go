package config

import "os"

type Config struct {
	Port    string
	DataDir string
	Root    string
}

func FromEnv() Config {
	cfg := Config{
		Port:    os.Getenv("PORT"),
		DataDir: os.Getenv("DATA_DIR"),
		Root:    os.Getenv("APP_ROOT"),
	}
	if cfg.Port == "" {
		cfg.Port = "3000"
	}
	if cfg.DataDir == "" {
		cfg.DataDir = "data"
	}
	if cfg.Root == "" {
		cfg.Root = "."
	}
	return cfg
}
