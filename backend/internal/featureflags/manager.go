package featureflags

import (
	"fmt"
	"hash/fnv"
	"strconv"
	"strings"
)

// Manager evaluates feature flags defined in a simple key=value list.
// Example: "new_chat=on,new_feed=25%,legacy_ui=off"
type Manager struct {
	flags map[string]string
}

// NewManager creates a feature-flag manager from a comma-separated config string.
func NewManager(raw string) *Manager {
	out := make(map[string]string)

	for _, pair := range strings.Split(raw, ",") {
		pair = strings.TrimSpace(pair)
		if pair == "" {
			continue
		}
		parts := strings.SplitN(pair, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := normalize(parts[0])
		value := normalize(parts[1])
		if key == "" || value == "" {
			continue
		}
		out[key] = value
	}

	return &Manager{flags: out}
}

// Enabled returns whether a flag is enabled for a given user.
// Supported values:
// - on/true/1
// - off/false/0
// - N% (deterministic user rollout, e.g. 25%)
func (m *Manager) Enabled(name string, userID uint) bool {
	if m == nil {
		return false
	}

	value, ok := m.flags[normalize(name)]
	if !ok {
		return false
	}

	switch value {
	case "on", "true", "1":
		return true
	case "off", "false", "0":
		return false
	}

	if strings.HasSuffix(value, "%") {
		pctRaw := strings.TrimSuffix(value, "%")
		pct, err := strconv.Atoi(pctRaw)
		if err != nil {
			return false
		}
		if pct <= 0 {
			return false
		}
		if pct >= 100 {
			return true
		}
		if userID == 0 {
			return false
		}
		return rolloutBucket(name, userID) < pct
	}

	return false
}

// Raw returns a copy of configured flags.
func (m *Manager) Raw() map[string]string {
	out := make(map[string]string, len(m.flags))
	for k, v := range m.flags {
		out[k] = v
	}
	return out
}

// Snapshot returns evaluated flag status for one user.
func (m *Manager) Snapshot(userID uint) map[string]bool {
	out := make(map[string]bool, len(m.flags))
	for name := range m.flags {
		out[name] = m.Enabled(name, userID)
	}
	return out
}

func normalize(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

func rolloutBucket(name string, userID uint) int {
	h := fnv.New32a()
	_, _ = h.Write([]byte(fmt.Sprintf("%s:%d", normalize(name), userID)))
	return int(h.Sum32() % 100)
}
