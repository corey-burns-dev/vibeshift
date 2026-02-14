package validation

import (
	"fmt"
	"regexp"
	"strings"
)

var sanctumSlugRegex = regexp.MustCompile(`^[a-z0-9-]{3,24}$`)

var reservedSanctumSlugs = map[string]struct{}{
	"admin":         {},
	"api":           {},
	"auth":          {},
	"chat":          {},
	"settings":      {},
	"sanctums":      {},
	"s":             {},
	"users":         {},
	"posts":         {},
	"comments":      {},
	"conversations": {},
	"chatrooms":     {},
	"friends":       {},
	"games":         {},
	"streams":       {},
	"ws":            {},
	"swagger":       {},
	"metrics":       {},
	"login":         {},
	"signup":        {},
}

// ValidateSanctumSlug validates sanctum slug format and reserved names.
func ValidateSanctumSlug(slug string) error {
	if !sanctumSlugRegex.MatchString(slug) {
		return fmt.Errorf("slug must be 3-24 characters and contain only lowercase letters, numbers, and hyphens")
	}

	if strings.HasPrefix(slug, "-") || strings.HasSuffix(slug, "-") {
		return fmt.Errorf("slug cannot start or end with a hyphen")
	}

	if _, exists := reservedSanctumSlugs[slug]; exists {
		return fmt.Errorf("slug is reserved")
	}

	return nil
}
