package featureflags

import "testing"

func TestEnabled_BooleanValues(t *testing.T) {
	m := NewManager("a=on,b=off,c=true,d=false,e=1,f=0")

	if !m.Enabled("a", 1) || !m.Enabled("c", 1) || !m.Enabled("e", 1) {
		t.Fatal("expected enabled boolean values to evaluate true")
	}
	if m.Enabled("b", 1) || m.Enabled("d", 1) || m.Enabled("f", 1) {
		t.Fatal("expected disabled boolean values to evaluate false")
	}
}

func TestEnabled_PercentageValues(t *testing.T) {
	m := NewManager("always=100%,never=0%,canary=25%")

	if !m.Enabled("always", 1) {
		t.Fatal("100% rollout should always be enabled")
	}
	if m.Enabled("never", 1) {
		t.Fatal("0% rollout should always be disabled")
	}

	first := m.Enabled("canary", 42)
	for i := 0; i < 5; i++ {
		if got := m.Enabled("canary", 42); got != first {
			t.Fatal("rollout evaluation must be deterministic per user")
		}
	}

	if m.Enabled("canary", 0) {
		t.Fatal("percentage rollout requires non-zero userID")
	}
}

func TestParseAndSnapshot(t *testing.T) {
	m := NewManager(" bad ,x=on, y = 20% ,z=off ")

	raw := m.Raw()
	if len(raw) != 3 {
		t.Fatalf("expected 3 parsed flags, got %d", len(raw))
	}
	if raw["x"] != "on" || raw["y"] != "20%" || raw["z"] != "off" {
		t.Fatalf("unexpected raw flags: %#v", raw)
	}

	snap := m.Snapshot(123)
	if len(snap) != 3 {
		t.Fatalf("expected snapshot size 3, got %d", len(snap))
	}
}
