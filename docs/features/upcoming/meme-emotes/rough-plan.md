Perfect. On a single VPS with Go + Fiber, the sweet spot is:

* **Your backend** fetches provider APIs (7TV/BTTV/FFZ) and caches results
* **Your frontend** only ever talks to *your* `/api/emotes/*`
* Cache uses **stale-while-revalidate** so chat loads instantly, and updates happen quietly 🧊➡️🔥

Below is a solid “drop-in” skeleton you can adapt.

---

## Architecture that covers all bases (single VPS edition)

### What you cache

* **Global catalog**: BTTV global + FFZ global (refresh weekly)
* **Room catalogs**: 7TV emote set per room (refresh weekly, plus refresh immediately if the room changes set)

### Where you cache

* **SQLite file** on disk (simple, persistent, perfect for VPS)
* **In-memory** hot cache for fast reads

### How clients use it

* `GET /api/emotes/global` → returns merged emotes
* `GET /api/emotes/rooms/:roomId` → returns merged (global + room)

Return a `version` and `ttlSeconds` so the client can skip rebuilding maps if unchanged.

---

## Go code (Fiber + SQLite + cron + stale-while-revalidate)

### 1) Models + DB init (SQLite)

```go
// emotes/store.go
package emotes

import (
 "context"
 "database/sql"
 "encoding/json"
 "time"
)

type CatalogKey struct {
 Provider string // "global"
 Scope    string // "global" | "room"
 ScopeID  string // "" for global, or roomId/setId
}

type CatalogRow struct {
 Provider  string
 Scope     string
 ScopeID   string
 FetchedAt time.Time
 Version   string
 JSONBlob  []byte
}

type Store struct{ DB *sql.DB }

func (s *Store) Init(ctx context.Context) error {
 _, err := s.DB.ExecContext(ctx, `
CREATE TABLE IF NOT EXISTS emote_catalog (
  provider TEXT NOT NULL,
  scope TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  version TEXT NOT NULL,
  json_blob BLOB NOT NULL,
  PRIMARY KEY(provider, scope, scope_id)
);`)
 return err
}

func (s *Store) Get(ctx context.Context, key CatalogKey) (*CatalogRow, error) {
 row := s.DB.QueryRowContext(ctx, `
SELECT provider, scope, scope_id, fetched_at, version, json_blob
FROM emote_catalog WHERE provider=? AND scope=? AND scope_id=?`,
  key.Provider, key.Scope, key.ScopeID,
 )

 var r CatalogRow
 var fetchedAtStr string
 if err := row.Scan(&r.Provider, &r.Scope, &r.ScopeID, &fetchedAtStr, &r.Version, &r.JSONBlob); err != nil {
  if err == sql.ErrNoRows {
   return nil, nil
  }
  return nil, err
 }
 t, err := time.Parse(time.RFC3339, fetchedAtStr)
 if err != nil {
  return nil, err
 }
 r.FetchedAt = t
 return &r, nil
}

func (s *Store) Upsert(ctx context.Context, key CatalogKey, version string, payload any) error {
 b, err := json.Marshal(payload)
 if err != nil {
  return err
 }
 now := time.Now().UTC().Format(time.RFC3339)
 _, err = s.DB.ExecContext(ctx, `
INSERT INTO emote_catalog(provider, scope, scope_id, fetched_at, version, json_blob)
VALUES(?,?,?,?,?,?)
ON CONFLICT(provider, scope, scope_id) DO UPDATE SET
  fetched_at=excluded.fetched_at,
  version=excluded.version,
  json_blob=excluded.json_blob;
`, key.Provider, key.Scope, key.ScopeID, now, version, b)
 return err
}
```

---

### 2) Provider fetchers (BTTV + FFZ + 7TV set)

```go
// emotes/providers.go
package emotes

import (
 "context"
 "encoding/json"
 "fmt"
 "net/http"
 "time"
)

type Emote struct {
 Name     string `json:"name"`
 URL      string `json:"url"`
 Provider string `json:"provider"` // "7tv"|"bttv"|"ffz"
}

func httpGetJSON(ctx context.Context, url string, out any) error {
 req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
 client := &http.Client{Timeout: 10 * time.Second}
 res, err := client.Do(req)
 if err != nil {
  return err
 }
 defer res.Body.Close()
 if res.StatusCode < 200 || res.StatusCode >= 300 {
  return fmt.Errorf("GET %s -> %d", url, res.StatusCode)
 }
 return json.NewDecoder(res.Body).Decode(out)
}

func FetchBTTVGlobal(ctx context.Context) ([]Emote, error) {
 var data []struct {
  ID   string `json:"id"`
  Code string `json:"code"`
 }
 if err := httpGetJSON(ctx, "https://api.betterttv.net/3/cached/emotes/global", &data); err != nil {
  return nil, err
 }
 out := make([]Emote, 0, len(data))
 for _, e := range data {
  out = append(out, Emote{
   Name:     e.Code,
   URL:      fmt.Sprintf("https://cdn.betterttv.net/emote/%s/3x", e.ID),
   Provider: "bttv",
  })
 }
 return out, nil
}

func FetchFFZGlobal(ctx context.Context) ([]Emote, error) {
 var data struct {
  DefaultSets []int `json:"default_sets"`
  Sets        map[string]struct {
   Emoticons []struct {
    Name string            `json:"name"`
    Urls map[string]string `json:"urls"`
   } `json:"emoticons"`
  } `json:"sets"`
 }
 if err := httpGetJSON(ctx, "https://api.frankerfacez.com/v1/set/global", &data); err != nil {
  return nil, err
 }

 out := []Emote{}
 for _, setID := range data.DefaultSets {
  set := data.Sets[fmt.Sprintf("%d", setID)]
  for _, emo := range set.Emoticons {
   u := emo.Urls["4"]
   if u == "" {
    u = emo.Urls["2"]
   }
   if u == "" {
    u = emo.Urls["1"]
   }
   if u == "" {
    continue
   }
   if len(u) >= 2 && u[:2] == "//" {
    u = "https:" + u
   }
   out = append(out, Emote{Name: emo.Name, URL: u, Provider: "ffz"})
  }
 }
 return out, nil
}

func Fetch7TVSet(ctx context.Context, setID string) ([]Emote, error) {
 var data struct {
  Emotes []struct {
   Name string `json:"name"`
   Data struct {
    Host struct {
     URL   string `json:"url"` // often //cdn.7tv.app/emote/<id>
     Files []struct {
      Name   string `json:"name"`
      Format string `json:"format"`
     } `json:"files"`
    } `json:"host"`
   } `json:"data"`
  } `json:"emotes"`
 }
 if err := httpGetJSON(ctx, fmt.Sprintf("https://7tv.io/v3/emote-sets/%s", setID), &data); err != nil {
  return nil, err
 }

 out := []Emote{}
 for _, e := range data.Emotes {
  host := e.Data.Host.URL
  if len(host) >= 2 && host[:2] == "//" {
   host = "https:" + host
  }
  // prefer 4x WEBP, else 4x, else last
  pick := ""
  for _, f := range e.Data.Host.Files {
   if f.Format == "WEBP" && (contains(f.Name, "4x")) {
    pick = f.Name
    break
   }
  }
  if pick == "" {
   for _, f := range e.Data.Host.Files {
    if contains(f.Name, "4x") {
     pick = f.Name
     break
    }
   }
  }
  if pick == "" && len(e.Data.Host.Files) > 0 {
   pick = e.Data.Host.Files[len(e.Data.Host.Files)-1].Name
  }
  if pick == "" {
   continue
  }

  out = append(out, Emote{
   Name:     e.Name,
   URL:      fmt.Sprintf("%s/%s", host, pick),
   Provider: "7tv",
  })
 }
 return out, nil
}

func contains(s, sub string) bool {
 return len(sub) == 0 || (len(s) >= len(sub) && (func() bool { return (stringIndex(s, sub) >= 0) })())
}

// minimal strings.Index to keep snippet self-contained
func stringIndex(s, sub string) int {
 for i := 0; i+len(sub) <= len(s); i++ {
  if s[i:i+len(sub)] == sub {
   return i
  }
 }
 return -1
}
```

---

### 3) Merge + priority (7TV > BTTV > FFZ)

```go
// emotes/merge.go
package emotes

var priority = map[string]int{"7tv": 3, "bttv": 2, "ffz": 1}

func MergeEmotes(lists ...[]Emote) []Emote {
 index := map[string]Emote{}
 for _, list := range lists {
  for _, e := range list {
   existing, ok := index[e.Name]
   if !ok || priority[e.Provider] > priority[existing.Provider] {
    index[e.Name] = e
   }
  }
 }
 out := make([]Emote, 0, len(index))
 for _, e := range index {
  out = append(out, e)
 }
 return out
}
```

---

### 4) Cache manager (stale-while-revalidate)

```go
// emotes/cache.go
package emotes

import (
 "context"
 "encoding/json"
 "sync"
 "time"
)

type Cache struct {
 store *Store
 ttl   time.Duration

 mu   sync.RWMutex
 mem  map[CatalogKey]*CatalogRow
 busy map[CatalogKey]bool
}

func NewCache(store *Store, ttl time.Duration) *Cache {
 return &Cache{
  store: store,
  ttl:   ttl,
  mem:   map[CatalogKey]*CatalogRow{},
  busy:  map[CatalogKey]bool{},
 }
}

type Payload struct {
 Version    string  `json:"version"`
 TTLSeconds int     `json:"ttlSeconds"`
 Emotes     []Emote `json:"emotes"`
}

func (c *Cache) GetPayload(ctx context.Context, key CatalogKey, refresh func(context.Context) (*Payload, error)) (*Payload, error) {
 // 1) memory
 c.mu.RLock()
 row := c.mem[key]
 c.mu.RUnlock()

 // 2) disk if miss
 if row == nil {
  dbRow, err := c.store.Get(ctx, key)
  if err != nil {
   return nil, err
  }
  if dbRow != nil {
   c.mu.Lock()
   c.mem[key] = dbRow
   row = dbRow
   c.mu.Unlock()
  }
 }

 // 3) serve cache if fresh
 if row != nil && time.Since(row.FetchedAt) < c.ttl {
  return decodePayload(row)
 }

 // 4) stale-while-revalidate:
 // if stale exists, serve it immediately and refresh in background
 if row != nil {
  c.kickRefresh(key, refresh)
  return decodePayload(row)
 }

 // 5) no cache at all: fetch now (blocking)
 p, err := refresh(ctx)
 if err != nil {
  return nil, err
 }
 _ = c.store.Upsert(ctx, key, p.Version, p)
 // reload row from store for consistent timestamps
 newRow, _ := c.store.Get(ctx, key)
 c.mu.Lock()
 c.mem[key] = newRow
 c.mu.Unlock()
 return p, nil
}

func (c *Cache) kickRefresh(key CatalogKey, refresh func(context.Context) (*Payload, error)) {
 c.mu.Lock()
 if c.busy[key] {
  c.mu.Unlock()
  return
 }
 c.busy[key] = true
 c.mu.Unlock()

 go func() {
  defer func() {
   c.mu.Lock()
   delete(c.busy, key)
   c.mu.Unlock()
  }()

  ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
  defer cancel()

  p, err := refresh(ctx)
  if err != nil {
   return
  }
  _ = c.store.Upsert(ctx, key, p.Version, p)
  newRow, _ := c.store.Get(ctx, key)
  if newRow != nil {
   c.mu.Lock()
   c.mem[key] = newRow
   c.mu.Unlock()
  }
 }()
}

func decodePayload(row *CatalogRow) (*Payload, error) {
 var p Payload
 if err := json.Unmarshal(row.JSONBlob, &p); err != nil {
  return nil, err
 }
 return &p, nil
}
```

---

### 5) Fiber routes: global + room (global merged into room)

```go
// main.go (relevant bits)
package main

import (
 "context"
 "database/sql"
 "time"

 _ "github.com/mattn/go-sqlite3"
 "github.com/gofiber/fiber/v2"

 "yourapp/emotes"
)

func main() {
 db, _ := sql.Open("sqlite3", "./data.db")
 store := &emotes.Store{DB: db}
 _ = store.Init(context.Background())

 cache := emotes.NewCache(store, 7*24*time.Hour) // weekly TTL

 app := fiber.New()

 app.Get("/api/emotes/global", func(c *fiber.Ctx) error {
  key := emotes.CatalogKey{Provider: "global", Scope: "global", ScopeID: ""}
  payload, err := cache.GetPayload(c.Context(), key, func(ctx context.Context) (*emotes.Payload, error) {
   bttv, err := emotes.FetchBTTVGlobal(ctx)
   if err != nil {
    return nil, err
   }
   ffz, err := emotes.FetchFFZGlobal(ctx)
   if err != nil {
    return nil, err
   }
   merged := emotes.MergeEmotes(bttv, ffz)
   return &emotes.Payload{
    Version:    time.Now().UTC().Format(time.RFC3339),
    TTLSeconds: int((7 * 24 * time.Hour).Seconds()),
    Emotes:     merged,
   }, nil
  })
  if err != nil {
   return fiber.NewError(500, err.Error())
  }
  return c.JSON(payload)
 })

 // You decide how you store/get the room's 7TV set id.
 // Here: pretend you have a function getRoom7TVSetID(roomID) (from DB).
 app.Get("/api/emotes/rooms/:roomId", func(c *fiber.Ctx) error {
  roomID := c.Params("roomId")
  setID := getRoom7TVSetID(roomID) // implement for your app

  globalKey := emotes.CatalogKey{Provider: "global", Scope: "global", ScopeID: ""}
  roomKey := emotes.CatalogKey{Provider: "global", Scope: "room", ScopeID: roomID}

  globalPayload, err := cache.GetPayload(c.Context(), globalKey, func(ctx context.Context) (*emotes.Payload, error) {
   bttv, err := emotes.FetchBTTVGlobal(ctx)
   if err != nil {
    return nil, err
   }
   ffz, err := emotes.FetchFFZGlobal(ctx)
   if err != nil {
    return nil, err
   }
   merged := emotes.MergeEmotes(bttv, ffz)
   return &emotes.Payload{
    Version:    time.Now().UTC().Format(time.RFC3339),
    TTLSeconds: int((7 * 24 * time.Hour).Seconds()),
    Emotes:     merged,
   }, nil
  })
  if err != nil {
   return fiber.NewError(500, err.Error())
  }

  roomPayload, err := cache.GetPayload(c.Context(), roomKey, func(ctx context.Context) (*emotes.Payload, error) {
   var seven []emotes.Emote
   if setID != "" {
    s, err := emotes.Fetch7TVSet(ctx, setID)
    if err != nil {
     return nil, err
    }
    seven = s
   }
   merged := emotes.MergeEmotes(seven, globalPayload.Emotes)
   return &emotes.Payload{
    Version:    time.Now().UTC().Format(time.RFC3339),
    TTLSeconds: int((7 * 24 * time.Hour).Seconds()),
    Emotes:     merged,
   }, nil
  })
  if err != nil {
   return fiber.NewError(500, err.Error())
  }

  return c.JSON(roomPayload)
 })

 app.Listen(":3000")
}

// stub
func getRoom7TVSetID(roomID string) string { return "" }
```

---

## Weekly refresh “check for new ones”

You already have it: TTL = 7 days.
And because we used stale-while-revalidate, users get fast responses even on refresh day.

If you also want a **cron job** that refreshes proactively (so nobody triggers the update), add `robfig/cron` and call the refresh funcs on schedule. On a single VPS this is totally fine.

---

## Biggest win: don’t “download all images”

Even if you fetch lists weekly, **let the CDN host images** and let browsers cache them. Your server just stores catalogs (JSON), not a mountain of GIFs 🏔️🫠

---

If you want, paste (or describe) your current room table schema and how you store “emote set id per room”, and I’ll adapt the `getRoom7TVSetID` + add an “invalidate room cache when set changes” endpoint so updates are instant.
