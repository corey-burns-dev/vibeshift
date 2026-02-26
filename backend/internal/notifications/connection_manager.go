package notifications

import (
	"context"
	"log"
	"strconv"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	defaultPresenceOnlineSetKey  = "ws:online_users"
	defaultPresenceLastSeenKeyNS = "ws:last_seen:"
	// TTL for last-seen key in Redis. Must exceed PongWait (10s) by a comfortable
	// margin so that a pong arriving late under production network jitter does not
	// expire the key before it can be refreshed, causing false offline events.
	// 25s gives 2.5× headroom above PongWait and 8× the PingPeriod (3s).
	defaultPresenceTTL = 25 * time.Second
	// Small grace to avoid transient flaps but remain responsive.
	defaultOfflineGrace = 2 * time.Second
	// Frequent reaper to clean stale Redis keys quickly and surface offline events.
	defaultReaperInterval = 3 * time.Second
)

// ConnectionManagerConfig controls Redis presence and cleanup behavior.
type ConnectionManagerConfig struct {
	OnlineSetKey       string
	LastSeenKeyPrefix  string
	LastSeenTTL        time.Duration
	OfflineGracePeriod time.Duration
	ReaperInterval     time.Duration
	OnUserOnline       func(userID uint)
	OnUserOffline      func(userID uint)
}

// ConnectionManager tracks active users, mirrors presence in Redis, and emits
// online/offline transitions with an offline grace window.
type ConnectionManager struct {
	rdb *redis.Client

	mu              sync.RWMutex
	localConnCounts map[uint]int
	offlineTimers   map[uint]*time.Timer
	offlineNotified map[uint]bool

	onlineSetKey      string
	lastSeenKeyPrefix string
	lastSeenTTL       time.Duration
	offlineGrace      time.Duration
	reaperInterval    time.Duration

	onUserOnline  func(userID uint)
	onUserOffline func(userID uint)

	listeners []struct {
		onOnline  func(userID uint)
		onOffline func(userID uint)
	}

	stopOnce sync.Once
	stopCh   chan struct{}
}

// NewConnectionManager creates a manager and starts a Redis reaper when Redis is available.
func NewConnectionManager(rdb *redis.Client, cfg ConnectionManagerConfig) *ConnectionManager {
	m := &ConnectionManager{
		rdb:               rdb,
		localConnCounts:   make(map[uint]int),
		offlineTimers:     make(map[uint]*time.Timer),
		offlineNotified:   make(map[uint]bool),
		onlineSetKey:      defaultPresenceOnlineSetKey,
		lastSeenKeyPrefix: defaultPresenceLastSeenKeyNS,
		lastSeenTTL:       defaultPresenceTTL,
		offlineGrace:      defaultOfflineGrace,
		reaperInterval:    defaultReaperInterval,
		onUserOnline:      cfg.OnUserOnline,
		onUserOffline:     cfg.OnUserOffline,
		stopCh:            make(chan struct{}),
	}

	if cfg.OnlineSetKey != "" {
		m.onlineSetKey = cfg.OnlineSetKey
	}
	if cfg.LastSeenKeyPrefix != "" {
		m.lastSeenKeyPrefix = cfg.LastSeenKeyPrefix
	}
	if cfg.LastSeenTTL > 0 {
		m.lastSeenTTL = cfg.LastSeenTTL
	}
	if cfg.OfflineGracePeriod > 0 {
		m.offlineGrace = cfg.OfflineGracePeriod
	}
	if cfg.ReaperInterval > 0 {
		m.reaperInterval = cfg.ReaperInterval
	}

	if m.rdb != nil && m.reaperInterval > 0 {
		go m.reaperLoop()
	}

	return m
}

// SetCallbacks registers callbacks invoked when a user is considered online or offline.
func (m *ConnectionManager) SetCallbacks(onOnline, onOffline func(userID uint)) {
	m.mu.Lock()
	m.onUserOnline = onOnline
	m.onUserOffline = onOffline
	m.mu.Unlock()
}

// AddListener registers an additional online/offline listener. Callbacks are
// invoked in registration order for each transition.
func (m *ConnectionManager) AddListener(onOnline, onOffline func(userID uint)) {
	m.mu.Lock()
	m.listeners = append(m.listeners, struct {
		onOnline  func(userID uint)
		onOffline func(userID uint)
	}{onOnline, onOffline})
	m.mu.Unlock()
}

// SetOfflineGracePeriod sets the delay before a user is marked offline after disconnect.
func (m *ConnectionManager) SetOfflineGracePeriod(d time.Duration) {
	if d <= 0 {
		return
	}
	m.mu.Lock()
	m.offlineGrace = d
	m.mu.Unlock()
}

// SetReaperInterval sets the interval at which the reaper runs to clean stale presence.
func (m *ConnectionManager) SetReaperInterval(d time.Duration) {
	if d <= 0 {
		return
	}
	m.mu.Lock()
	m.reaperInterval = d
	m.mu.Unlock()
}

// Stop shuts down the connection manager and stops the reaper.
func (m *ConnectionManager) Stop() {
	m.stopOnce.Do(func() {
		close(m.stopCh)
		m.mu.Lock()
		for userID, timer := range m.offlineTimers {
			if timer != nil {
				timer.Stop()
			}
			delete(m.offlineTimers, userID)
		}
		m.mu.Unlock()
	})
}

// Register records a new connection for the user and updates presence.
func (m *ConnectionManager) Register(ctx context.Context, userID uint) {
	wasOnline := m.IsOnline(ctx, userID)

	m.mu.Lock()
	if t, ok := m.offlineTimers[userID]; ok {
		t.Stop()
		delete(m.offlineTimers, userID)
	}
	m.localConnCounts[userID]++
	m.offlineNotified[userID] = false
	m.mu.Unlock()

	m.Touch(ctx, userID)
	if !wasOnline {
		m.emitOnline(userID)
	}
}

// Touch updates the last-seen timestamp for the user in the presence store.
func (m *ConnectionManager) Touch(ctx context.Context, userID uint) {
	if m.rdb == nil {
		return
	}
	uid := strconv.FormatUint(uint64(userID), 10)
	if err := m.rdb.SAdd(ctx, m.onlineSetKey, uid).Err(); err != nil {
		log.Printf("presence touch SADD failed for user %d: %v", userID, err)
	}
	if err := m.rdb.Set(ctx, m.lastSeenKey(userID), strconv.FormatInt(time.Now().Unix(), 10), m.lastSeenTTL).Err(); err != nil {
		log.Printf("presence touch SET failed for user %d: %v", userID, err)
	}
}

// Unregister removes one connection for the user; after grace period the user is marked offline.
func (m *ConnectionManager) Unregister(_ context.Context, userID uint) {
	m.mu.Lock()
	if n, ok := m.localConnCounts[userID]; ok {
		n--
		if n > 0 {
			m.localConnCounts[userID] = n
			m.mu.Unlock()
			return
		}
		delete(m.localConnCounts, userID)
	}

	if t, ok := m.offlineTimers[userID]; ok {
		t.Stop()
	}
	grace := m.offlineGrace
	m.offlineTimers[userID] = time.AfterFunc(grace, func() {
		m.finalizeOffline(context.Background(), userID)
	})
	m.mu.Unlock()
}

// IsOnline returns whether the user has at least one registered connection or is in the presence set.
func (m *ConnectionManager) IsOnline(ctx context.Context, userID uint) bool {
	m.mu.RLock()
	if m.localConnCounts[userID] > 0 {
		m.mu.RUnlock()
		return true
	}
	m.mu.RUnlock()

	if m.rdb == nil {
		return false
	}

	exists, err := m.rdb.Exists(ctx, m.lastSeenKey(userID)).Result()
	if err != nil {
		return false
	}
	return exists > 0
}

// GetOnlineUserIDs returns online user IDs from Redis (with stale filtering),
// unioned with local connections as a fallback safety net.
func (m *ConnectionManager) GetOnlineUserIDs(ctx context.Context) []uint {
	local := m.localUserIDs()
	if m.rdb == nil {
		return local
	}

	members, err := m.rdb.SMembers(ctx, m.onlineSetKey).Result()
	if err != nil {
		return local
	}

	seen := make(map[uint]struct{}, len(members)+len(local))
	result := make([]uint, 0, len(members)+len(local))

	for _, raw := range members {
		id64, parseErr := strconv.ParseUint(raw, 10, 32)
		if parseErr != nil {
			continue
		}
		userID := uint(id64)
		exists, existsErr := m.rdb.Exists(ctx, m.lastSeenKey(userID)).Result()
		if existsErr != nil {
			continue
		}
		if exists == 0 {
			_ = m.rdb.SRem(ctx, m.onlineSetKey, raw).Err()
			continue
		}
		if _, ok := seen[userID]; ok {
			continue
		}
		seen[userID] = struct{}{}
		result = append(result, userID)
	}

	for _, userID := range local {
		if _, ok := seen[userID]; ok {
			continue
		}
		seen[userID] = struct{}{}
		result = append(result, userID)
	}

	return result
}

// reapOnce is test-visible and performs one cleanup pass.
func (m *ConnectionManager) reapOnce(ctx context.Context) {
	if m.rdb == nil {
		return
	}

	members, err := m.rdb.SMembers(ctx, m.onlineSetKey).Result()
	if err != nil {
		return
	}

	for _, raw := range members {
		id64, parseErr := strconv.ParseUint(raw, 10, 32)
		if parseErr != nil {
			continue
		}
		userID := uint(id64)
		exists, existsErr := m.rdb.Exists(ctx, m.lastSeenKey(userID)).Result()
		if existsErr != nil {
			continue
		}
		if exists > 0 {
			continue
		}

		_ = m.rdb.SRem(ctx, m.onlineSetKey, raw).Err()

		m.mu.RLock()
		hasLocal := m.localConnCounts[userID] > 0
		m.mu.RUnlock()
		if !hasLocal {
			m.emitOffline(userID)
		}
	}
}

func (m *ConnectionManager) reaperLoop() {
	interval := m.reaperInterval
	if interval <= 0 {
		return
	}
	ctx := context.Background()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-m.stopCh:
			return
		case <-ticker.C:
			m.reapOnce(ctx)
		}
	}
}

func (m *ConnectionManager) finalizeOffline(ctx context.Context, userID uint) {
	m.mu.Lock()
	if m.localConnCounts[userID] > 0 {
		delete(m.offlineTimers, userID)
		m.mu.Unlock()
		return
	}
	delete(m.offlineTimers, userID)
	m.mu.Unlock()

	if m.rdb != nil {
		exists, err := m.rdb.Exists(ctx, m.lastSeenKey(userID)).Result()
		if err == nil && exists > 0 {
			// Another process likely refreshed presence. Keep user online.
			return
		}
		_ = m.rdb.SRem(ctx, m.onlineSetKey, strconv.FormatUint(uint64(userID), 10)).Err()
	}

	m.emitOffline(userID)
}

func (m *ConnectionManager) emitOnline(userID uint) {
	m.mu.Lock()
	m.offlineNotified[userID] = false
	cb := m.onUserOnline
	listeners := make([]struct {
		onOnline  func(userID uint)
		onOffline func(userID uint)
	}, len(m.listeners))
	copy(listeners, m.listeners)
	m.mu.Unlock()
	if cb != nil {
		cb(userID)
	}
	for _, l := range listeners {
		if l.onOnline != nil {
			l.onOnline(userID)
		}
	}
}

func (m *ConnectionManager) emitOffline(userID uint) {
	m.mu.Lock()
	if m.offlineNotified[userID] {
		m.mu.Unlock()
		return
	}
	m.offlineNotified[userID] = true
	cb := m.onUserOffline
	listeners := make([]struct {
		onOnline  func(userID uint)
		onOffline func(userID uint)
	}, len(m.listeners))
	copy(listeners, m.listeners)
	m.mu.Unlock()
	if cb != nil {
		cb(userID)
	}
	for _, l := range listeners {
		if l.onOffline != nil {
			l.onOffline(userID)
		}
	}
}

func (m *ConnectionManager) localUserIDs() []uint {
	m.mu.RLock()
	defer m.mu.RUnlock()
	ids := make([]uint, 0, len(m.localConnCounts))
	for userID, count := range m.localConnCounts {
		if count > 0 {
			ids = append(ids, userID)
		}
	}
	return ids
}

func (m *ConnectionManager) lastSeenKey(userID uint) string {
	return m.lastSeenKeyPrefix + strconv.FormatUint(uint64(userID), 10)
}
