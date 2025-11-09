package db

import (
	"os"
	"testing"
)

func TestGetenvDefault(t *testing.T) {
	const key = "TEST_GETENV_DEFAULT_KEY"
	// ensure unset
	os.Unsetenv(key)
	if got := getenvDefault(key, "fallback"); got != "fallback" {
		t.Fatalf("getenvDefault unset = %q, want %q", got, "fallback")
	}

	// set and verify
	os.Setenv(key, "value1")
	if got := getenvDefault(key, "fallback"); got != "value1" {
		t.Fatalf("getenvDefault set = %q, want %q", got, "value1")
	}
	os.Unsetenv(key)
}

// TestNewDB requires a live database; skip when DATABASE_URL is not provided.
func TestNewDB_SkipUnlessDatabaseURL(t *testing.T) {
	if os.Getenv("DATABASE_URL") == "" {
		t.Skip("skipping TestNewDB: no DATABASE_URL provided")
	}

	// If DATABASE_URL is present we attempt to open and ping. This will fail
	// in CI without proper compose setup; it's intentionally conditional.
	dbHandle, err := NewDB()
	if err != nil {
		t.Fatalf("NewDB returned error: %v", err)
	}
	if dbHandle == nil {
		t.Fatalf("NewDB returned nil db handle")
	}
	_ = dbHandle.Close()
}
