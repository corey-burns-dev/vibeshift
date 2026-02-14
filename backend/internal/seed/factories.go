// Package seed provides helpers to create test and demo data for the
// application database. These helpers are intended for development and
// testing only.
package seed

import (
	"fmt"
	"log"
	"math/rand"
	"time"

	"sanctum/internal/models"

	"github.com/brianvoe/gofakeit/v6"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// Factory builds domain entities and persists them to the database.
// It is a thin helper used by seed presets and tests.
type Factory struct {
	db   *gorm.DB
	opts SeedOptions
	// synthetic ID counter when running in DryRun mode
	nextID uint
}

// NewFactory creates a new Factory bound to the provided Gorm DB.
func NewFactory(db *gorm.DB, opts SeedOptions) *Factory {
	// seed gofakeit for richer content
	gofakeit.Seed(time.Now().UnixNano())
	rand.Seed(time.Now().UnixNano())
	return &Factory{db: db, opts: opts, nextID: 1000}
}

// BuildPostWithTemplate constructs a post struct populated like CreatePostWithTemplate
// but does not persist it. Useful for batching.
func (f *Factory) BuildPostWithTemplate(user *models.User, postType string, overrides ...func(*models.Post)) *models.Post {
	post := &models.Post{
		Title:    gofakeit.Sentence(5),
		Content:  gofakeit.Paragraph(1, 3, 5, "\n"),
		UserID:   user.ID,
		PostType: postType,
	}

	// realistic created_at spread
	maxDays := f.opts.MaxDays
	if maxDays <= 0 {
		maxDays = 90
	}
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	daysBack := r.Intn(maxDays)
	hoursBack := r.Intn(24)
	minsBack := r.Intn(60)
	post.CreatedAt = time.Now().Add(-time.Duration(daysBack)*24*time.Hour - time.Duration(hoursBack)*time.Hour - time.Duration(minsBack)*time.Minute)

	switch postType {
	case models.PostTypeMedia:
		post.ImageURL = fmt.Sprintf("https://picsum.photos/seed/%s/800/800", gofakeit.UUID())
	case models.PostTypeLink:
		post.LinkURL = gofakeit.URL()
		post.Title = fmt.Sprintf("%s — %s", gofakeit.DomainName(), post.Title)
		post.ImageURL = fmt.Sprintf("https://picsum.photos/seed/link-%s/600/400", gofakeit.UUID())
		post.Content = fmt.Sprintf("[preview] %s\n\n%s", post.Title, post.Content)
	case models.PostTypeVideo:
		youtubeIDs := []string{"dQw4w9WgXcQ", "9bZkp7q19f0", "3JZ_D3ELwOQ", "L_jWHffIx5E", "kXYiU_JCYtU"}
		id := youtubeIDs[r.Intn(len(youtubeIDs))]
		post.YoutubeURL = fmt.Sprintf("https://www.youtube.com/watch?v=%s", id)
		post.ImageURL = fmt.Sprintf("https://img.youtube.com/vi/%s/hqdefault.jpg", id)
	default:
		post.ImageURL = fmt.Sprintf("https://picsum.photos/seed/%s/800/800", gofakeit.UUID())
	}

	for _, override := range overrides {
		override(post)
	}
	return post
}

// CreatePostsBatch persists multiple posts in a single DB call when possible.
func (f *Factory) CreatePostsBatch(posts []*models.Post) error {
	if f.opts.DryRun {
		for _, p := range posts {
			f.nextID++
			p.ID = f.nextID
		}
		log.Printf("[dry-run] CreatePostsBatch: %d posts (no DB write)", len(posts))
		return nil
	}
	return f.db.Create(&posts).Error
}

// CreateUser constructs and persists a sample `models.User`.
// Optional override functions may modify the generated user before saving.
func (f *Factory) CreateUser(overrides ...func(*models.User)) (*models.User, error) {
	user := &models.User{
		Username: gofakeit.Username() + fmt.Sprintf("%d", gofakeit.Number(100, 999)),
		Email:    gofakeit.Email(),
		Bio:      gofakeit.Sentence(10),
		Avatar:   fmt.Sprintf("https://i.pravatar.cc/150?u=%s", gofakeit.UUID()),
	}

	// Password handling: allow skipping bcrypt in dev fast mode
	if f.opts.SkipBcrypt {
		user.Password = "password123"
	} else {
		hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
		user.Password = string(hashedPassword)
	}

	for _, override := range overrides {
		override(user)
	}

	if f.opts.DryRun {
		f.nextID++
		user.ID = f.nextID
		log.Printf("[dry-run] CreateUser: %+v", user)
		return user, nil
	}

	if err := f.db.Create(user).Error; err != nil {
		return nil, err
	}
	return user, nil
}

// CreatePost constructs and persists a sample `models.Post` for the given user.
func (f *Factory) CreatePost(user *models.User, overrides ...func(*models.Post)) (*models.Post, error) {
	post := &models.Post{
		Title:    gofakeit.Sentence(5),
		Content:  gofakeit.Paragraph(1, 3, 5, "\n"),
		UserID:   user.ID,
		ImageURL: fmt.Sprintf("https://picsum.photos/seed/%s/800/800", gofakeit.UUID()),
	}

	for _, override := range overrides {
		override(post)
	}

	if f.opts.DryRun {
		f.nextID++
		post.ID = f.nextID
		log.Printf("[dry-run] CreatePost: type=%s user=%d title=%q", post.PostType, post.UserID, post.Title)
		return post, nil
	}

	if err := f.db.Create(post).Error; err != nil {
		return nil, err
	}
	return post, nil
}

// CreatePostWithTemplate creates a post for the given user of a specific
// post type (text, media, link, video). This preserves the original
// CreatePost behaviour while allowing callers to request link/video posts
// with valid URL fields populated.
func (f *Factory) CreatePostWithTemplate(user *models.User, postType string, overrides ...func(*models.Post)) (*models.Post, error) {
	post := &models.Post{
		Title:    gofakeit.Sentence(5),
		Content:  gofakeit.Paragraph(1, 3, 5, "\n"),
		UserID:   user.ID,
		PostType: postType,
	}

	// realistic created_at spread
	maxDays := f.opts.MaxDays
	if maxDays <= 0 {
		maxDays = 90
	}
	// #nosec G404: acceptable for seeding
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	daysBack := r.Intn(maxDays)
	hoursBack := r.Intn(24)
	minsBack := r.Intn(60)
	post.CreatedAt = time.Now().Add(-time.Duration(daysBack)*24*time.Hour - time.Duration(hoursBack)*time.Hour - time.Duration(minsBack)*time.Minute)

	switch postType {
	case models.PostTypeMedia:
		post.ImageURL = fmt.Sprintf("https://picsum.photos/seed/%s/800/800", gofakeit.UUID())
	case models.PostTypeLink:
		post.LinkURL = gofakeit.URL()
		post.Title = fmt.Sprintf("%s — %s", gofakeit.DomainName(), post.Title)
		// Attach a thumbnail to link posts so frontend can render previews
		post.ImageURL = fmt.Sprintf("https://picsum.photos/seed/link-%s/600/400", gofakeit.UUID())
		post.Content = fmt.Sprintf("[preview] %s\n\n%s", post.Title, post.Content)
	case models.PostTypeVideo:
		// pick from a small curated set of public YouTube IDs
		youtubeIDs := []string{"dQw4w9WgXcQ", "9bZkp7q19f0", "3JZ_D3ELwOQ", "L_jWHffIx5E", "kXYiU_JCYtU"}
		id := youtubeIDs[r.Intn(len(youtubeIDs))]
		post.YoutubeURL = fmt.Sprintf("https://www.youtube.com/watch?v=%s", id)
		// set a thumbnail for the video post
		post.ImageURL = fmt.Sprintf("https://img.youtube.com/vi/%s/hqdefault.jpg", id)
	default:
		// text/default
		post.ImageURL = fmt.Sprintf("https://picsum.photos/seed/%s/800/800", gofakeit.UUID())
	}

	for _, override := range overrides {
		override(post)
	}

	if err := f.db.Create(post).Error; err != nil {
		return nil, err
	}
	return post, nil
}

// CreateComment constructs and persists a sample `models.Comment` on the
// provided post authored by the provided user.
func (f *Factory) CreateComment(user *models.User, post *models.Post, overrides ...func(*models.Comment)) (*models.Comment, error) {
	comment := &models.Comment{
		Content: gofakeit.Sentence(8),
		UserID:  user.ID,
		PostID:  post.ID,
	}

	for _, override := range overrides {
		override(comment)
	}

	if err := f.db.Create(comment).Error; err != nil {
		return nil, err
	}
	return comment, nil
}

// CreateLike persists a like from `user` on `post`.
func (f *Factory) CreateLike(user *models.User, post *models.Post) error {
	like := &models.Like{
		UserID: user.ID,
		PostID: post.ID,
	}
	return f.db.Create(like).Error
}

// CreateFriendship persists a friendship relationship between two users.
func (f *Factory) CreateFriendship(requester, addressee *models.User, status models.FriendshipStatus) error {
	friendship := &models.Friendship{
		RequesterID: requester.ID,
		AddresseeID: addressee.ID,
		Status:      status,
	}
	return f.db.Create(friendship).Error
}

// CreateMessage constructs and persists a sample `models.Message` in the
// provided conversation from the provided sender.
func (f *Factory) CreateMessage(conversation *models.Conversation, sender *models.User, overrides ...func(*models.Message)) (*models.Message, error) {
	message := &models.Message{
		ConversationID: conversation.ID,
		SenderID:       sender.ID,
		Content:        gofakeit.Sentence(10),
		MessageType:    "text",
	}

	for _, override := range overrides {
		override(message)
	}

	if err := f.db.Create(message).Error; err != nil {
		return nil, err
	}
	return message, nil
}

// CreateGame constructs and persists a `models.GameRoom` with the given
// creator, type and status.
func (f *Factory) CreateGame(creator *models.User, gameType models.GameType, status models.GameStatus, overrides ...func(*models.GameRoom)) (*models.GameRoom, error) {
	game := &models.GameRoom{
		Type:      gameType,
		Status:    status,
		CreatorID: &creator.ID,
	}

	for _, override := range overrides {
		override(game)
	}

	if err := f.db.Create(game).Error; err != nil {
		return nil, err
	}
	return game, nil
}
