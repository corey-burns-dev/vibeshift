package seed

import (
	"net/url"
	"strings"
	"testing"
	"time"

	"sanctum/internal/models"
)

func TestBuildPostWithTemplate_TimestampsAndFormats(t *testing.T) {
	opts := Options{DryRun: true, MaxDays: 30}
	f := NewFactory(nil, opts)
	user := &models.User{ID: 1}

	p := f.BuildPostWithTemplate(user, models.PostTypeVideo)
	if p.YoutubeURL == "" {
		t.Fatalf("expected youtube url for video post")
	}
	if !strings.Contains(p.YoutubeURL, "youtube.com/watch?v=") {
		t.Fatalf("unexpected youtube url format: %s", p.YoutubeURL)
	}

	// timestamp should be within MaxDays
	if time.Since(p.CreatedAt) > (time.Duration(opts.MaxDays)+1)*24*time.Hour {
		t.Fatalf("created_at too old: %v", p.CreatedAt)
	}

	p2 := f.BuildPostWithTemplate(user, models.PostTypeLink)
	if p2.LinkURL == "" {
		t.Fatalf("expected link url for link post")
	}
	if _, err := url.ParseRequestURI(p2.LinkURL); err != nil {
		t.Fatalf("invalid link url: %v", err)
	}
}
