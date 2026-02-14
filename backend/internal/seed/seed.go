package seed

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"os"
	"strings"
	"time"

	"sanctum/internal/models"

	"gorm.io/gorm"
)

// Seeder provides high-level methods to populate the database with
// representative demo and test data. Methods are safe for local/dev use.
type Seeder struct {
	db      *gorm.DB
	factory *Factory
}

// Options configures seeding behavior (dev ergonomics).
type Options struct {
	SkipBcrypt bool
	DryRun     bool
	BatchSize  int
	Fast       bool
	// MaxDays controls how far back CreatedAt may be spread
	MaxDays int
}

// Distribution describes fractional weights for post types.
type Distribution struct {
	Text  float64
	Media float64
	Link  float64
	Video float64
}

// CategoryDistributions allows per‑sanctum overrides by slug. Values are
// fractional weights and will be normalized when computing integer counts.
var CategoryDistributions = map[string]Distribution{
	// Example: PC Gaming favors link and video content
	"pc-gaming": {Text: 0.4, Media: 0.0, Link: 0.4, Video: 0.2},
}

var defaultDistribution = Distribution{Text: 0.5, Media: 0.3, Link: 0.1, Video: 0.1}

// per-category vocabulary for richer, category-aware content
var categoryVocab = map[string]map[string][]string{
	"pc-gaming": {
		"names":  {"Cyberpunk 2077", "Doom Eternal", "Stardew Valley", "Hades", "Baldur's Gate 3"},
		"tags":   {"fps", "rpg", "indie", "singleplayer", "multiplayer"},
		"stores": {"https://store.steampowered.com", "https://www.gog.com"},
		"yt":     {"review", "gameplay", "first impressions", "walkthrough"},
	},
	"photography": {
		"names": {"portrait", "landscape", "astrophotography", "street", "macro"},
		"tags":  {"photography", "dslr", "mirrorless", "composition", "lens"},
		"yt":    {"tutorial", "editing", "gear review"},
	},
	"cooking": {
		"names": {"sourdough", "pasta", "vegan", "bbq", "dessert"},
		"tags":  {"recipe", "cooking", "baking", "easy", "mealprep"},
		"yt":    {"recipe", "tutorial", "taste test"},
	},
	"music": {
		"names": {"lofi beats", "synthwave", "classical", "indie rock", "hip hop"},
		"tags":  {"music", "playlist", "album", "review"},
		"yt":    {"full album", "live", "review"},
	},
	"programming": {
		"names": {"Go", "Rust", "TypeScript", "React", "Docker"},
		"tags":  {"programming", "devops", "backend", "frontend", "tutorial"},
		"yt":    {"tutorial", "deep dive", "best practices"},
	},
	"books": {
		"names": {"Dune", "The Hobbit", "1984", "The Pragmatic Programmer", "Clean Code"},
		"tags":  {"bookclub", "review", "fiction", "nonfiction"},
		"yt":    {"review", "summary"},
	},
}

func categoryOverrideForSlug(slug string, r *rand.Rand) func(*models.Post) {
	vocab, ok := categoryVocab[slug]
	if !ok || len(vocab) == 0 {
		return nil
	}

	names := vocab["names"]
	tags := vocab["tags"]
	stores := vocab["stores"]
	yths := vocab["yt"]

	name := names[r.Intn(len(names))]

	return func(p *models.Post) {
		// Prepend the category-specific name into title and content.
		p.Title = fmt.Sprintf("%s — %s", name, p.Title)

		// Add a store link when available (for games/physical goods)
		if len(stores) > 0 {
			store := stores[r.Intn(len(stores))]
			p.Content = fmt.Sprintf("%s\n\nBuy: %s/search/?q=%s\n\n%s", name, store, urlQueryEscape(name), p.Content)
		}

		// Add suggested YouTube search terms to content
		if len(yths) > 0 {
			yt := yths[r.Intn(len(yths))]
			p.Content = fmt.Sprintf("%s\n\nYouTube: https://www.youtube.com/results?search_query=%s+%s\n\n%s", name, urlQueryEscape(name), urlQueryEscape(yt), p.Content)
		}

		// Inject 1-3 hashtags from tag list into the end of content
		if len(tags) > 0 {
			tagCount := 1 + r.Intn(3)
			var chosen []string
			for i := 0; i < tagCount; i++ {
				chosen = append(chosen, tags[r.Intn(len(tags))])
			}
			// create hashtag string
			hs := ""
			for _, t := range chosen {
				hs += "#" + strings.ReplaceAll(t, " ", "") + " "
			}
			p.Content = fmt.Sprintf("%s\n\n%s", p.Content, strings.TrimSpace(hs))
		}

		// Category-specific thumbnail seed (helps frontend grids)
		p.ImageURL = fmt.Sprintf("https://picsum.photos/seed/%s-%s/800/600", slug, urlQueryEscape(name))
	}
}

// urlQueryEscape provides a minimal placeholder for escaping spaces to +
func urlQueryEscape(s string) string {
	// very small escape: replace spaces with + and remove apostrophes
	var b strings.Builder
	for _, r := range s {
		switch r {
		case ' ':
			b.WriteByte('+')
		case '\'':
			// skip
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// computeCounts converts a total count and fractional distribution into
// integer counts per type. Any rounding remainder is applied to text posts.
func computeCounts(total int, dist Distribution) (text, media, link, video int) {
	if total <= 0 {
		return 0, 0, 0, 0
	}
	sum := dist.Text + dist.Media + dist.Link + dist.Video
	if sum <= 0 {
		dist = defaultDistribution
		sum = 1.0
	}
	t := float64(total) * (dist.Text / sum)
	m := float64(total) * (dist.Media / sum)
	l := float64(total) * (dist.Link / sum)
	v := float64(total) * (dist.Video / sum)

	text = int(math.Round(t))
	media = int(math.Round(m))
	link = int(math.Round(l))
	video = int(math.Round(v))

	got := text + media + link + video
	if got != total {
		text += total - got
		if text < 0 {
			text = 0
		}
	}
	return
}

// NewSeeder creates a Seeder for the given Gorm DB.
func NewSeeder(db *gorm.DB, opts Options) *Seeder {
	return &Seeder{
		db:      db,
		factory: NewFactory(db, opts),
	}
}

// ParseCountsFile reads a JSON file mapping sanctum slug to desired counts.
// Example shape: { "pc-gaming": { "total": 10, "text":4, "link":4, "video":2 } }
func ParseCountsFile(path string) (map[string]map[string]int, error) {
	// #nosec G304: path comes from CLI flags in a dev tool
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var out map[string]map[string]int
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// SeedSanctumWithExactCounts seeds one sanctum using an exact counts map.
// Entry may contain keys: "total", or "text","media","link","video".
func (s *Seeder) SeedSanctumWithExactCounts(users []*models.User, sanctum *models.Sanctum, entry map[string]int) error {
	// If explicit per-type counts provided, honor them, otherwise use total with distribution
	var textCount, mediaCount, linkCount, videoCount int
	if _, ok := entry["text"]; ok {
		textCount = entry["text"]
		mediaCount = entry["media"]
		linkCount = entry["link"]
		videoCount = entry["video"]
	} else if total, ok := entry["total"]; ok {
		dist := defaultDistribution
		if d, ok := CategoryDistributions[sanctum.Slug]; ok {
			dist = d
		}
		textCount, mediaCount, linkCount, videoCount = computeCounts(total, dist)
	} else {
		return fmt.Errorf("no counts provided for sanctum %s", sanctum.Slug)
	}

	// #nosec G404: Non-cryptographic randomness is acceptable for seeding test data
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	pickUser := func() *models.User { return users[r.Intn(len(users))] }

	for i := 0; i < textCount; i++ {
		creator := pickUser()
		overrides := []func(*models.Post){
			func(p *models.Post) {
				p.SanctumID = &sanctum.ID
				p.Title = fmt.Sprintf("[%s] %s", sanctum.Name, p.Title)
			},
		}
		if co := categoryOverrideForSlug(sanctum.Slug, r); co != nil {
			overrides = append(overrides, co)
		}
		_, _ = s.factory.CreatePostWithTemplate(creator, models.PostTypeText, overrides...)
	}
	for i := 0; i < mediaCount; i++ {
		creator := pickUser()
		overrides := []func(*models.Post){
			func(p *models.Post) {
				p.SanctumID = &sanctum.ID
				p.Title = fmt.Sprintf("[%s] %s", sanctum.Name, p.Title)
			},
		}
		if co := categoryOverrideForSlug(sanctum.Slug, r); co != nil {
			overrides = append(overrides, co)
		}
		_, _ = s.factory.CreatePostWithTemplate(creator, models.PostTypeMedia, overrides...)
	}
	for i := 0; i < linkCount; i++ {
		creator := pickUser()
		overrides := []func(*models.Post){
			func(p *models.Post) {
				p.SanctumID = &sanctum.ID
				p.Title = fmt.Sprintf("[%s] %s", sanctum.Name, p.Title)
			},
		}
		if co := categoryOverrideForSlug(sanctum.Slug, r); co != nil {
			overrides = append(overrides, co)
		}
		_, _ = s.factory.CreatePostWithTemplate(creator, models.PostTypeLink, overrides...)
	}
	for i := 0; i < videoCount; i++ {
		creator := pickUser()
		overrides := []func(*models.Post){
			func(p *models.Post) {
				p.SanctumID = &sanctum.ID
				p.Title = fmt.Sprintf("[%s] %s", sanctum.Name, p.Title)
			},
		}
		if co := categoryOverrideForSlug(sanctum.Slug, r); co != nil {
			overrides = append(overrides, co)
		}
		_, _ = s.factory.CreatePostWithTemplate(creator, models.PostTypeVideo, overrides...)
	}
	return nil
}

// ClearAll truncates application tables and resets sequences. Intended
// for test/setup workflows only.
func (s *Seeder) ClearAll() error {
	log.Println("🗑️  Clearing all existing data...")
	sql := `TRUNCATE TABLE comments, likes, posts, conversation_participants, messages, conversations, sanctum_memberships, sanctum_requests, sanctums, users, friendships, game_rooms, game_moves RESTART IDENTITY CASCADE;`
	return s.db.Exec(sql).Error
}

// SeedSocialMesh creates a number of users and random friendships
// to simulate a social graph for testing and local development.
func (s *Seeder) SeedSocialMesh(userCount int) ([]*models.User, error) {
	log.Printf("🕸️  Seeding social mesh with %d users...", userCount)
	users := make([]*models.User, 0, userCount)

	// Admin and system users
	baseUsers := []string{"corey", "cburns", "test"}
	for _, username := range baseUsers {
		u, err := s.factory.CreateUser(func(u *models.User) {
			u.Username = username
			u.Email = username + "@example.com"
		})
		if err == nil {
			users = append(users, u)
		}
	}

	// Random users
	for i := len(users); i < userCount; i++ {
		u, err := s.factory.CreateUser()
		if err == nil {
			users = append(users, u)
		}
	}

	// Friendships
	// #nosec G404: Non-cryptographic randomness is acceptable for seeding test data
	// #nosec G404: Non-cryptographic randomness is acceptable for seeding test data
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	existingFriendships := make(map[string]bool)
	for _, u1 := range users {
		targets := r.Intn(5) + 1
		for i := 0; i < targets; i++ {
			u2 := users[r.Intn(len(users))]
			if u1.ID == u2.ID {
				continue
			}

			// Avoid duplicates
			pairKey := fmt.Sprintf("%d-%d", u1.ID, u2.ID)
			if existingFriendships[pairKey] {
				continue
			}

			status := models.FriendshipStatusAccepted
			if r.Float32() < 0.2 {
				status = models.FriendshipStatusPending
			}
			if err := s.factory.CreateFriendship(u1, u2, status); err == nil {
				existingFriendships[pairKey] = true
			}
		}
	}

	return users, nil
}

// SeedEngagement creates posts, likes and comments to generate feed
// activity for testing and local development.
func (s *Seeder) SeedEngagement(users []*models.User, postCount int) ([]*models.Post, error) {
	log.Printf("🔥 Seeding engagement for %d posts...", postCount)
	posts := make([]*models.Post, 0, postCount)
	// #nosec G404: Non-cryptographic randomness is acceptable for seeding test data
	// #nosec G404: Non-cryptographic randomness is acceptable for seeding test data
	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	for i := 0; i < postCount; i++ {
		creator := users[r.Intn(len(users))]
		p, err := s.factory.CreatePost(creator)
		if err != nil {
			continue
		}
		posts = append(posts, p)

		// Random likes
		likersCount := r.Intn(len(users) / 2)
		likedBy := make(map[uint]bool)
		for j := 0; j < likersCount; j++ {
			liker := users[r.Intn(len(users))]
			if likedBy[liker.ID] {
				continue
			}
			if err := s.factory.CreateLike(liker, p); err == nil {
				likedBy[liker.ID] = true
			}
		}

		// Random comments
		commentersCount := r.Intn(5)
		for j := 0; j < commentersCount; j++ {
			commenter := users[r.Intn(len(users))]
			_, _ = s.factory.CreateComment(commenter, p)
		}
	}

	return posts, nil
}

// SeedActiveGames creates sample game rooms in a mix of states.
func (s *Seeder) SeedActiveGames(users []*models.User) error {
	log.Println("🎮 Seeding active games...")
	// #nosec G404: Non-cryptographic randomness is acceptable for seeding test data
	// #nosec G404: Non-cryptographic randomness is acceptable for seeding test data
	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	gameTypes := []models.GameType{models.TicTacToe, models.ConnectFour}

	for _, gType := range gameTypes {
		// One pending, one active, one finished
		creator := users[r.Intn(len(users))]
		_, _ = s.factory.CreateGame(creator, gType, models.GamePending)

		creator = users[r.Intn(len(users))]
		opponent := users[r.Intn(len(users))]
		for creator.ID == opponent.ID {
			opponent = users[r.Intn(len(users))]
		}
		_, _ = s.factory.CreateGame(creator, gType, models.GameActive, func(g *models.GameRoom) {
			oID := opponent.ID
			g.OpponentID = &oID
		})
	}

	return nil
}

// SeedSanctumWithDistributionSingle seeds a single sanctum with the same
// category-accurate distribution used by SeedSanctumsWithDistribution.
func (s *Seeder) SeedSanctumWithDistributionSingle(users []*models.User, sanctum *models.Sanctum, countPerSanctum int) error {
	// Determine distribution for this sanctum (per-slug override if present)
	dist := defaultDistribution
	if d, ok := CategoryDistributions[sanctum.Slug]; ok {
		dist = d
	}
	textCount, mediaCount, linkCount, videoCount := computeCounts(countPerSanctum, dist)

	// #nosec G404: Non-cryptographic randomness is acceptable for seeding test data
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	pickUser := func() *models.User { return users[r.Intn(len(users))] }

	for i := 0; i < textCount; i++ {
		creator := pickUser()
		overrides := []func(*models.Post){
			func(p *models.Post) {
				p.SanctumID = &sanctum.ID
				p.Title = fmt.Sprintf("[%s] %s", sanctum.Name, p.Title)
			},
		}
		if co := categoryOverrideForSlug(sanctum.Slug, r); co != nil {
			overrides = append(overrides, co)
		}
		_, _ = s.factory.CreatePostWithTemplate(creator, models.PostTypeText, overrides...)
	}
	for i := 0; i < mediaCount; i++ {
		creator := pickUser()
		overrides := []func(*models.Post){
			func(p *models.Post) {
				p.SanctumID = &sanctum.ID
				p.Title = fmt.Sprintf("[%s] %s", sanctum.Name, p.Title)
			},
		}
		if co := categoryOverrideForSlug(sanctum.Slug, r); co != nil {
			overrides = append(overrides, co)
		}
		_, _ = s.factory.CreatePostWithTemplate(creator, models.PostTypeMedia, overrides...)
	}
	for i := 0; i < linkCount; i++ {
		creator := pickUser()
		overrides := []func(*models.Post){
			func(p *models.Post) {
				p.SanctumID = &sanctum.ID
				p.Title = fmt.Sprintf("[%s] %s", sanctum.Name, p.Title)
			},
		}
		if co := categoryOverrideForSlug(sanctum.Slug, r); co != nil {
			overrides = append(overrides, co)
		}
		_, _ = s.factory.CreatePostWithTemplate(creator, models.PostTypeLink, overrides...)
	}
	for i := 0; i < videoCount; i++ {
		creator := pickUser()
		overrides := []func(*models.Post){
			func(p *models.Post) {
				p.SanctumID = &sanctum.ID
				p.Title = fmt.Sprintf("[%s] %s", sanctum.Name, p.Title)
			},
		}
		if co := categoryOverrideForSlug(sanctum.Slug, r); co != nil {
			overrides = append(overrides, co)
		}
		_, _ = s.factory.CreatePostWithTemplate(creator, models.PostTypeVideo, overrides...)
	}
	return nil
}

// SeedDMs creates sample direct message conversations and messages.
func (s *Seeder) SeedDMs(users []*models.User) error {
	log.Println("💬 Seeding DM history...")
	// #nosec G404: Non-cryptographic randomness is acceptable for seeding test data
	// #nosec G404: Non-cryptographic randomness is acceptable for seeding test data
	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	for i := 0; i < 10; i++ {
		u1 := users[r.Intn(len(users))]
		u2 := users[r.Intn(len(users))]
		if u1.ID == u2.ID {
			continue
		}

		conv := &models.Conversation{
			IsGroup:   false,
			CreatedBy: u1.ID,
		}
		if err := s.db.Create(conv).Error; err != nil {
			continue
		}
		_ = s.db.Model(conv).Association("Participants").Append(u1, u2)

		msgCount := r.Intn(10) + 5
		for j := 0; j < msgCount; j++ {
			sender := u1
			if j%2 == 0 {
				sender = u2
			}
			_, _ = s.factory.CreateMessage(conv, sender)
		}
	}

	return nil
}

// SeedSanctumPosts creates 50 posts for each existing sanctum, with random
// engagement from the provided users.
func (s *Seeder) SeedSanctumPosts(users []*models.User) error {
	log.Println("🏰 Seeding sanctum-specific posts...")
	var sanctums []*models.Sanctum
	if err := s.db.Find(&sanctums).Error; err != nil {
		return err
	}

	// #nosec G404: Non-cryptographic randomness is acceptable for seeding test data
	// #nosec G404: Non-cryptographic randomness is acceptable for seeding test data
	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	for _, sanctum := range sanctums {
		log.Printf("  📍 Seeding 50 posts for sanctum: %s", sanctum.Name)
		for i := 0; i < 50; i++ {
			creator := users[r.Intn(len(users))]
			p, err := s.factory.CreatePost(creator, func(p *models.Post) {
				p.SanctumID = &sanctum.ID
				p.Title = fmt.Sprintf("[%s] %s", sanctum.Name, p.Title)
			})
			if err != nil {
				continue
			}

			// Random likes
			likersCount := r.Intn(len(users) / 3)
			likedBy := make(map[uint]bool)
			for j := 0; j < likersCount; j++ {
				liker := users[r.Intn(len(users))]
				if likedBy[liker.ID] {
					continue
				}
				if err := s.factory.CreateLike(liker, p); err == nil {
					likedBy[liker.ID] = true
				}
			}

			// Random comments
			commentersCount := r.Intn(5) + 2 // At least 2 comments
			for j := 0; j < commentersCount; j++ {
				commenter := users[r.Intn(len(users))]
				_, _ = s.factory.CreateComment(commenter, p)
			}
		}
	}

	return nil
}

// SeedSanctumsWithDistribution seeds each sanctum with a fixed number of
// posts distributed across post types. Distribution used: 50% text,
// 30% media, 10% link, 10% video. countPerSanctum controls total posts per
// sanctum.
func (s *Seeder) SeedSanctumsWithDistribution(users []*models.User, countPerSanctum int) error {
	log.Printf("🏰 Seeding %d posts per sanctum with category-accurate distribution...", countPerSanctum)
	var sanctums []*models.Sanctum
	if err := s.db.Find(&sanctums).Error; err != nil {
		return err
	}

	// Compute counts per type using integer math with remainder going to text
	for _, sanctum := range sanctums {

		log.Printf("  📍 Seeding %d posts for sanctum: %s", countPerSanctum, sanctum.Name)
		// choose per‑sanctum distribution if present, otherwise use default
		dist := defaultDistribution
		if d, ok := CategoryDistributions[sanctum.Slug]; ok {
			dist = d
		}
		textCount, mediaCount, linkCount, videoCount := computeCounts(countPerSanctum, dist)

		// #nosec G404: Non-cryptographic randomness is acceptable for seeding test data
		// #nosec G404: Non-cryptographic randomness is acceptable for seeding test data
		r := rand.New(rand.NewSource(time.Now().UnixNano()))

		// helper to pick a random user
		pickUser := func() *models.User {
			return users[r.Intn(len(users))]
		}

		// create text posts
		var batch []*models.Post
		flushBatch := func() error {
			if len(batch) == 0 {
				return nil
			}
			// persist batch via factory helper
			if err := s.factory.CreatePostsBatch(batch); err != nil {
				return err
			}
			batch = batch[:0]
			return nil
		}

		for i := 0; i < textCount; i++ {
			creator := pickUser()
			overrides := []func(*models.Post){
				func(p *models.Post) {
					p.SanctumID = &sanctum.ID
					p.Title = fmt.Sprintf("[%s] %s", sanctum.Name, p.Title)
				},
			}
			if co := categoryOverrideForSlug(sanctum.Slug, r); co != nil {
				overrides = append(overrides, co)
			}
			if s.factory.opts.BatchSize > 0 {
				p := s.factory.BuildPostWithTemplate(creator, models.PostTypeText, overrides...)
				batch = append(batch, p)
				if len(batch) >= s.factory.opts.BatchSize {
					if err := flushBatch(); err != nil {
						return err
					}
				}
			} else {
				_, _ = s.factory.CreatePostWithTemplate(creator, models.PostTypeText, overrides...)
			}
		}
		if err := flushBatch(); err != nil {
			return err
		}

		// media posts
		for i := 0; i < mediaCount; i++ {
			creator := pickUser()
			overrides := []func(*models.Post){
				func(p *models.Post) {
					p.SanctumID = &sanctum.ID
					p.Title = fmt.Sprintf("[%s] %s", sanctum.Name, p.Title)
				},
			}
			if co := categoryOverrideForSlug(sanctum.Slug, r); co != nil {
				overrides = append(overrides, co)
			}
			if s.factory.opts.BatchSize > 0 {
				p := s.factory.BuildPostWithTemplate(creator, models.PostTypeMedia, overrides...)
				batch = append(batch, p)
				if len(batch) >= s.factory.opts.BatchSize {
					if err := flushBatch(); err != nil {
						return err
					}
				}
			} else {
				_, _ = s.factory.CreatePostWithTemplate(creator, models.PostTypeMedia, overrides...)
			}
		}
		if err := flushBatch(); err != nil {
			return err
		}

		// link posts
		for i := 0; i < linkCount; i++ {
			creator := pickUser()
			overrides := []func(*models.Post){
				func(p *models.Post) {
					p.SanctumID = &sanctum.ID
					p.Title = fmt.Sprintf("[%s] %s", sanctum.Name, p.Title)
				},
			}
			if co := categoryOverrideForSlug(sanctum.Slug, r); co != nil {
				overrides = append(overrides, co)
			}
			if s.factory.opts.BatchSize > 0 {
				p := s.factory.BuildPostWithTemplate(creator, models.PostTypeLink, overrides...)
				batch = append(batch, p)
				if len(batch) >= s.factory.opts.BatchSize {
					if err := flushBatch(); err != nil {
						return err
					}
				}
			} else {
				_, _ = s.factory.CreatePostWithTemplate(creator, models.PostTypeLink, overrides...)
			}
		}
		if err := flushBatch(); err != nil {
			return err
		}

		// video posts
		for i := 0; i < videoCount; i++ {
			creator := pickUser()
			overrides := []func(*models.Post){
				func(p *models.Post) {
					p.SanctumID = &sanctum.ID
					p.Title = fmt.Sprintf("[%s] %s", sanctum.Name, p.Title)
				},
			}
			if co := categoryOverrideForSlug(sanctum.Slug, r); co != nil {
				overrides = append(overrides, co)
			}
			if s.factory.opts.BatchSize > 0 {
				p := s.factory.BuildPostWithTemplate(creator, models.PostTypeVideo, overrides...)
				batch = append(batch, p)
				if len(batch) >= s.factory.opts.BatchSize {
					if err := flushBatch(); err != nil {
						return err
					}
				}
			} else {
				_, _ = s.factory.CreatePostWithTemplate(creator, models.PostTypeVideo, overrides...)
			}
		}
		if err := flushBatch(); err != nil {
			return err
		}
	}

	return nil
}

// ApplyPreset runs a named seeder preset (e.g. "MegaPopulated").
func (s *Seeder) ApplyPreset(name string) error {
	log.Printf("🌟 Applying seeder preset: %s", name)
	switch name {
	case "MegaPopulated":
		users, err := s.SeedSocialMesh(50)
		if err != nil {
			return err
		}
		_, _ = s.SeedEngagement(users, 50)
		_ = s.SeedSanctumPosts(users)
		_ = s.SeedActiveGames(users)
		_ = s.SeedDMs(users)
	case "CategoryAccurate":
		// Seed a smaller social mesh and then seed each sanctum with a
		// category-accurate distribution of posts (default 10 per sanctum).
		users, err := s.SeedSocialMesh(20)
		if err != nil {
			return err
		}
		_ = s.SeedSanctumsWithDistribution(users, 10)
	default:
		log.Printf("⚠️ Unknown preset: %s", name)
	}
	return nil
}
