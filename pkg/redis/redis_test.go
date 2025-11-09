package redispkg

import "testing"

func TestParseRedisURL(t *testing.T) {
	tests := []struct {
		in       string
		wantAddr string
		wantPass string
		wantDB   int
		wantTLS  bool
	}{
		{"redis://:mypassword@redis:6379/1", "redis:6379", "mypassword", 1, false},
		{"rediss://:s3cret@redis.example.com:6380/2", "redis.example.com:6380", "s3cret", 2, true},
		{"redis:6379", "redis:6379", "", 0, false},
		{"", "redis:6379", "", 0, false},
	}

	for _, tc := range tests {
		addr, pass, db, tls := ParseRedisURL(tc.in)
		if addr != tc.wantAddr {
			t.Fatalf("ParseRedisURL(%q) addr = %q, want %q", tc.in, addr, tc.wantAddr)
		}
		if pass != tc.wantPass {
			t.Fatalf("ParseRedisURL(%q) pass = %q, want %q", tc.in, pass, tc.wantPass)
		}
		if db != tc.wantDB {
			t.Fatalf("ParseRedisURL(%q) db = %d, want %d", tc.in, db, tc.wantDB)
		}
		if tls != tc.wantTLS {
			t.Fatalf("ParseRedisURL(%q) tls = %v, want %v", tc.in, tls, tc.wantTLS)
		}
	}
}
