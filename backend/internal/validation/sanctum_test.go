package validation

import "testing"

func TestValidateSanctumSlug(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		slug string
		ok   bool
	}{
		{name: "valid atrium with number", slug: "atrium-2", ok: true},
		{name: "valid devhub", slug: "devhub", ok: true},
		{name: "valid linux", slug: "linux", ok: true},
		{name: "too short", slug: "ab", ok: false},
		{name: "minimum length", slug: "abc", ok: true},
		{name: "maximum length", slug: "abcdefghijklmnopqrstuvwx", ok: true},
		{name: "too long", slug: "abcdefghijklmnopqrstuvwxy", ok: false},
		{name: "uppercase", slug: "Movies", ok: false},
		{name: "underscore", slug: "pc_gaming", ok: false},
		{name: "space", slug: "pc gaming", ok: false},
		{name: "symbol", slug: "pc!gaming", ok: false},
		{name: "leading hyphen", slug: "-linux", ok: false},
		{name: "trailing hyphen", slug: "linux-", ok: false},
		{name: "reserved admin", slug: "admin", ok: false},
		{name: "reserved api", slug: "api", ok: false},
		{name: "reserved sanctums", slug: "sanctums", ok: false},
		{name: "reserved s", slug: "s", ok: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateSanctumSlug(tc.slug)
			if tc.ok && err != nil {
				t.Fatalf("expected valid slug, got error: %v", err)
			}
			if !tc.ok && err == nil {
				t.Fatalf("expected invalid slug, got nil error")
			}
		})
	}
}
