package main

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/dalitsokasonde/expense-tracker/api/internal/config"
	"github.com/dalitsokasonde/expense-tracker/api/internal/database"
	"github.com/dalitsokasonde/expense-tracker/api/internal/migrations"
)

func main() {
	direction := "up"
	if len(os.Args) > 1 {
		direction = os.Args[1]
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	db, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	dir := filepath.Join("migrations")
	if err := migrations.Run(ctx, db, direction, dir); err != nil {
		log.Fatal(err)
	}

	log.Printf("migrations %s complete", direction)
}

