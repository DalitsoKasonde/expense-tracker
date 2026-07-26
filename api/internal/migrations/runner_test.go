package migrations

import (
	"os"
	"testing"
)

func TestIsDevelopmentSeed(t *testing.T) {
	cases := map[string]bool{
		"013_seed_test_user":  true,
		"001_users":           false,
		"014_offline_support": false,
	}

	for name, want := range cases {
		if got := IsDevelopmentSeed(name); got != want {
			t.Errorf("IsDevelopmentSeed(%q) = %v, want %v", name, got, want)
		}
	}
}

// Every migration flagged as a development seed must exist on disk, otherwise
// the guard silently protects nothing after a rename.
func TestDevelopmentSeedsExistOnDisk(t *testing.T) {
	for name := range developmentSeeds {
		path := "../../migrations/" + name + ".up.sql"
		if !fileExists(path) {
			t.Errorf("development seed %q has no migration file at %s", name, path)
		}
	}
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
