# Redis Best Practices for Vibeshift Backend

## Current Redis Usage

### ✅ Already Implemented

1. **Rate Limiting** (`middleware/rate_limit.go`)
   - Login endpoint: 5 requests/minute
   - Send message endpoint: 30 requests/minute
   - Pattern: `rl:{route}:user:{id}` or `rl:{route}:ip:{ip}`

2. **User Profile Caching** (`server/example_handlers.go`)
   - Cache-aside pattern for `/users/:id/cached`
   - Key: `user:profile:{id}`
   - TTL: 5 minutes

3. **Pub/Sub for Notifications** (`notifications/notifier.go`, `notifications/hub.go`)
   - User notifications: `notifications:user:{id}`
   - Pattern subscription for broadcasting

4. **Pub/Sub for Chat** (NEW - just implemented)
   - Chat messages: `chat:conv:{id}`
   - Typing indicators: `typing:conv:{id}`
   - Presence: `presence:conv:{id}`

---

## Recommended Redis Strategies

### 1. Message Caching (High Priority)

**Use Case**: Reduce database queries for recent messages

**Implementation**:
```go
// In GetMessages handler
func (s *Server) GetMessages(c *fiber.Ctx) error {
    ctx := c.Context()
    convID := c.ParamsInt("id")
    
    // Try cache first
    cacheKey := fmt.Sprintf("chat:conv:%d:messages:recent", convID)
    var cachedMessages []*models.Message
    
    err := cache.CacheAside(ctx, cacheKey, &cachedMessages, 5*time.Minute, func() error {
        // On cache miss, fetch from database
        messages, err := s.chatRepo.GetMessages(ctx, uint(convID), 50, 0)
        if err != nil {
            return err
        }
        cachedMessages = messages
        return nil
    })
    
    if err != nil {
        return models.RespondWithError(c, fiber.StatusInternalServerError, err)
    }
    
    return c.JSON(cachedMessages)
}
```

**Benefits**:
- 80-90% reduction in database queries for active conversations
- Sub-millisecond response times for cached data
- Automatic cache invalidation after 5 minutes

**Invalidation Strategy**:
```go
// After creating a new message, invalidate cache
func (s *Server) SendMessage(c *fiber.Ctx) error {
    // ... create message ...
    
    // Invalidate cache
    cacheKey := fmt.Sprintf("chat:conv:%d:messages:recent", convID)
    s.redis.Del(ctx, cacheKey)
    
    // ... broadcast via Redis ...
}
```

### 2. Conversation List Caching (High Priority)

**Use Case**: Speed up conversation list loading

**Key Pattern**: `chat:user:{userID}:conversations`  
**TTL**: 2 minutes  
**Value**: JSON array of conversations with last message

**Implementation**:
```go
func (s *Server) GetConversations(c *fiber.Ctx) error {
    ctx := c.Context()
    userID := c.Locals("userID").(uint)
    
    cacheKey := fmt.Sprintf("chat:user:%d:conversations", userID)
    var conversations []*models.Conversation
    
    err := cache.CacheAside(ctx, cacheKey, &conversations, 2*time.Minute, func() error {
        convs, err := s.chatRepo.GetUserConversations(ctx, userID)
        if err != nil {
            return err
        }
        conversations = convs
        return nil
    })
    
    return c.JSON(conversations)
}
```

### 3. Unread Count Tracking (Medium Priority)

**Use Case**: Fast unread message counts without database queries

**Key Pattern**: `chat:unread:{userID}:{convID}`  
**TTL**: None (persist)  
**Value**: Integer count

**Implementation**:
```go
// Increment unread count when message is sent
func (s *Server) SendMessage(c *fiber.Ctx) error {
    // ... create message ...
    
    // Increment unread count for all participants except sender
    for _, participant := range conv.Participants {
        if participant.ID != userID {
            key := fmt.Sprintf("chat:unread:%d:%d", participant.ID, convID)
            s.redis.Incr(ctx, key)
        }
    }
}

// Reset unread count when user reads messages
func (s *Server) MarkAsRead(c *fiber.Ctx) error {
    userID := c.Locals("userID").(uint)
    convID := c.ParamsInt("id")
    
    key := fmt.Sprintf("chat:unread:%d:%d", userID, convID)
    s.redis.Del(ctx, key)
    
    // Also update database
    s.chatRepo.UpdateLastRead(ctx, uint(convID), userID)
}

// Get unread count
func (s *Server) GetUnreadCount(c *fiber.Ctx) error {
    userID := c.Locals("userID").(uint)
    convID := c.ParamsInt("id")
    
    key := fmt.Sprintf("chat:unread:%d:%d", userID, convID)
    count, _ := s.redis.Get(ctx, key).Int()
    
    return c.JSON(fiber.Map{"unread_count": count})
}
```

### 4. Online Presence Tracking (Medium Priority)

**Use Case**: Show who's online in a conversation

**Key Pattern**: `presence:conv:{id}`  
**TTL**: 30 seconds (auto-expire)  
**Value**: Redis Set of userIDs

**Implementation**:
```go
// Add user to presence set when they join
func (h *ChatHub) JoinConversation(userID, conversationID uint) {
    // ... existing code ...
    
    // Add to Redis presence set with TTL
    key := fmt.Sprintf("presence:conv:%d", conversationID)
    h.redis.SAdd(ctx, key, userID)
    h.redis.Expire(ctx, key, 30*time.Second)
}

// Heartbeat to refresh presence
func (s *Server) SendHeartbeat(c *fiber.Ctx) error {
    userID := c.Locals("userID").(uint)
    convID := c.ParamsInt("id")
    
    key := fmt.Sprintf("presence:conv:%d", convID)
    s.redis.SAdd(ctx, key, userID)
    s.redis.Expire(ctx, key, 30*time.Second)
    
    return c.SendStatus(fiber.StatusOK)
}

// Get online users
func (s *Server) GetOnlineUsers(c *fiber.Ctx) error {
    convID := c.ParamsInt("id")
    
    key := fmt.Sprintf("presence:conv:%d", convID)
    userIDs, _ := s.redis.SMembers(ctx, key).Result()
    
    return c.JSON(fiber.Map{"online_users": userIDs})
}
```

### 5. Post Feed Caching (Low Priority)

**Use Case**: Cache recent posts for faster feed loading

**Key Pattern**: `post:list:page:{page}`  
**TTL**: 60 seconds  
**Value**: JSON array of posts

**Implementation**: Similar to message caching above

---

## Redis Key Naming Conventions

Follow these patterns for consistency:

| Resource | Pattern | Example | TTL |
|----------|---------|---------|-----|
| User profile | `user:profile:{id}` | `user:profile:123` | 5m |
| Post detail | `post:detail:{id}` | `post:detail:456` | 2m |
| Post list | `post:list:page:{page}` | `post:list:page:1` | 60s |
| Chat messages | `chat:conv:{id}:messages:recent` | `chat:conv:789:messages:recent` | 5m |
| Conversation list | `chat:user:{id}:conversations` | `chat:user:123:conversations` | 2m |
| Unread count | `chat:unread:{userID}:{convID}` | `chat:unread:123:789` | None |
| Presence | `presence:conv:{id}` | `presence:conv:789` | 30s |
| Typing | `typing:conv:{id}:{userID}` | `typing:conv:789:123` | 5s |
| Rate limit | `rl:{route}:user:{id}` | `rl:login:user:123` | 1m |
| Pub/Sub channels | `chat:conv:{id}` | `chat:conv:789` | N/A |

---

## Memory Management

### Current Configuration

Check your Redis configuration:
```bash
redis-cli CONFIG GET maxmemory
redis-cli CONFIG GET maxmemory-policy
```

### Recommended Settings

```bash
# Set max memory (e.g., 256MB for development, 2GB for production)
redis-cli CONFIG SET maxmemory 256mb

# Set eviction policy
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

**Eviction Policies**:
- `allkeys-lru`: Evict least recently used keys (recommended for cache)
- `volatile-lru`: Only evict keys with TTL set
- `allkeys-lfu`: Evict least frequently used keys (Redis 4.0+)

### Monitoring

```bash
# Check memory usage
redis-cli INFO memory

# Check keyspace stats
redis-cli INFO keyspace

# Monitor cache hit rate
redis-cli INFO stats | grep keyspace
```

**Key Metrics**:
- `used_memory_human`: Current memory usage
- `keyspace_hits`: Number of successful key lookups
- `keyspace_misses`: Number of failed key lookups
- **Hit Rate** = `keyspace_hits / (keyspace_hits + keyspace_misses)`

**Target**: 80%+ hit rate for cached data

---

## Connection Pooling

Your current setup uses a single Redis client (good for most cases):

```go
// In cache/redis.go
var client *redis.Client

func InitRedis(addr string) {
    client = redis.NewClient(&redis.Options{
        Addr: addr,
        // Connection pool settings (defaults are usually fine)
        PoolSize:     10,  // Max connections
        MinIdleConns: 5,   // Min idle connections
    })
}
```

**For high traffic**, consider increasing pool size:
```go
PoolSize: 50,
MinIdleConns: 10,
```

---

## Best Practices Summary

### ✅ Do's

1. **Use TTLs** for all cached data
2. **Keep values small** (< 1MB per key)
3. **Use namespaced keys** (`resource:entity:id`)
4. **Monitor hit rates** regularly
5. **Invalidate on writes** (write-through pattern)
6. **Use pub/sub for real-time** events
7. **Set maxmemory** and eviction policy
8. **Use Redis Sets** for presence tracking
9. **Use Redis Sorted Sets** for leaderboards/rankings
10. **Batch operations** when possible (MGET, MSET)

### ❌ Don'ts

1. **Don't store large blobs** (use S3/object storage)
2. **Don't use Redis as primary database** (use PostgreSQL)
3. **Don't forget TTLs** on ephemeral data
4. **Don't use blocking operations** in production
5. **Don't ignore memory limits**
6. **Don't use KEYS command** in production (use SCAN)
7. **Don't store sensitive data** without encryption
8. **Don't use long-running Lua scripts**

---

## Performance Tips

### 1. Pipeline Commands

For multiple operations:
```go
pipe := s.redis.Pipeline()
pipe.Set(ctx, "key1", "value1", 0)
pipe.Set(ctx, "key2", "value2", 0)
pipe.Set(ctx, "key3", "value3", 0)
_, err := pipe.Exec(ctx)
```

### 2. Use Transactions

For atomic operations:
```go
err := s.redis.Watch(ctx, func(tx *redis.Tx) error {
    count, _ := tx.Get(ctx, "counter").Int()
    _, err := tx.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
        pipe.Set(ctx, "counter", count+1, 0)
        return nil
    })
    return err
}, "counter")
```

### 3. Compression

For large values, compress before storing:
```go
import "compress/gzip"

// Compress
var buf bytes.Buffer
gz := gzip.NewWriter(&buf)
gz.Write([]byte(largeData))
gz.Close()
s.redis.Set(ctx, key, buf.Bytes(), ttl)

// Decompress
data, _ := s.redis.Get(ctx, key).Bytes()
reader, _ := gzip.NewReader(bytes.NewReader(data))
decompressed, _ := io.ReadAll(reader)
```

---

## Next Steps

1. **Implement message caching** (highest impact)
2. **Add conversation list caching**
3. **Implement unread count tracking**
4. **Add presence tracking with heartbeat**
5. **Monitor cache hit rates**
6. **Tune TTLs based on usage patterns**

---

## Useful Redis Commands

```bash
# Monitor real-time commands
redis-cli MONITOR

# Get all keys matching pattern (DEV ONLY)
redis-cli KEYS "chat:conv:*"

# Scan keys safely (PRODUCTION)
redis-cli SCAN 0 MATCH "chat:conv:*" COUNT 100

# Check TTL
redis-cli TTL "chat:conv:123:messages:recent"

# Delete pattern (DEV ONLY)
redis-cli KEYS "chat:conv:*" | xargs redis-cli DEL

# Flush all data (DANGEROUS)
redis-cli FLUSHALL
```

---

## Summary

Redis is being used effectively for:
- ✅ Real-time pub/sub (notifications, chat)
- ✅ Rate limiting
- ✅ Basic caching (user profiles)

**High-impact additions**:
1. Message caching (5min TTL)
2. Conversation list caching (2min TTL)
3. Unread count tracking (no TTL)
4. Presence tracking (30s TTL)

These will significantly improve performance and user experience!
