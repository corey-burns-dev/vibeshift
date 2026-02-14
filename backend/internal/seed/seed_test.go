package seed

import "testing"

func TestComputeCounts_Default(t *testing.T) {
	text, media, link, video := computeCounts(10, defaultDistribution)
	if text+media+link+video != 10 {
		t.Fatalf("sum mismatch: got %d", text+media+link+video)
	}
	if text != 5 || media != 3 || link != 1 || video != 1 {
		t.Fatalf("unexpected default counts: text=%d, media=%d, link=%d, video=%d", text, media, link, video)
	}
}

func TestComputeCounts_PCReplace(t *testing.T) {
	d, ok := CategoryDistributions["pc-gaming"]
	if !ok {
		t.Fatalf("pc-gaming distribution not found")
	}
	text, media, link, video := computeCounts(10, d)
	if text+media+link+video != 10 {
		t.Fatalf("sum mismatch: got %d", text+media+link+video)
	}
	if text != 4 || media != 0 || link != 4 || video != 2 {
		t.Fatalf("unexpected pc-gaming counts: text=%d, media=%d, link=%d, video=%d", text, media, link, video)
	}
}
