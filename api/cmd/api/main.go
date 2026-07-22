package main

import (
	"context"
	"log"
	"net/http"
	"path/filepath"
	"time"

	"github.com/dalitsokasonde/expense-tracker/api/internal/config"
	"github.com/dalitsokasonde/expense-tracker/api/internal/database"
	"github.com/dalitsokasonde/expense-tracker/api/internal/httpapi"
	"github.com/dalitsokasonde/expense-tracker/api/internal/migrations"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	db, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	if err := migrations.Run(ctx, db, "up", filepath.Join("migrations")); err != nil {
		log.Fatal(err)
	}

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           httpapi.New(cfg, db),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("api listening on %s", server.Addr)
	log.Fatal(server.ListenAndServe())
}
