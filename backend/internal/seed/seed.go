package seed

import (
	"fmt"
	"log"
	"math/rand"
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

// NewSeeder creates a Seeder for the given Gorm DB.
func NewSeeder(db *gorm.DB) *Seeder {
	return &Seeder{
		db:      db,
		factory: NewFactory(db),
	}
}

// ClearAll truncates application tables and resets sequences. Intended
// for test/setup workflows only.
func (s *Seeder) ClearAll() error {
	log.Println("🗑️  Clearing all existing data...")
	sql := `TRUNCATE TABLE comments, likes, posts, conversation_participants, messages, conversations, sanctum_memberships, sanctum_requests, sanctums, stream_messages, streams, users, friendships, game_rooms, game_moves RESTART IDENTITY CASCADE;`
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
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	for _, u1 := range users {
		targets := r.Intn(5) + 1
		for i := 0; i < targets; i++ {
			u2 := users[r.Intn(len(users))]
			if u1.ID == u2.ID {
				continue
			}
			status := models.FriendshipStatusAccepted
			if r.Float32() < 0.2 {
				status = models.FriendshipStatusPending
			}
			_ = s.factory.CreateFriendship(u1, u2, status)
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
		for j := 0; j < likersCount; j++ {
			liker := users[r.Intn(len(users))]
			_ = s.factory.CreateLike(liker, p)
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

// SeedDMs creates sample direct message conversations and messages.
func (s *Seeder) SeedDMs(users []*models.User) error {
	log.Println("💬 Seeding DM history...")
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
			for j := 0; j < likersCount; j++ {
				liker := users[r.Intn(len(users))]
				_ = s.factory.CreateLike(liker, p)
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
	default:
		log.Printf("⚠️ Unknown preset: %s", name)
	}
	return nil
}
