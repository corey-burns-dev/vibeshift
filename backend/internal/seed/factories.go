// Package seed provides helpers to create test and demo data for the
// application database. These helpers are intended for development and
// testing only.
package seed

import (
	"fmt"

	"sanctum/internal/models"

	"github.com/brianvoe/gofakeit/v6"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// Factory builds domain entities and persists them to the database.
// It is a thin helper used by seed presets and tests.
type Factory struct {
	db *gorm.DB
}

// NewFactory creates a new Factory bound to the provided Gorm DB.
func NewFactory(db *gorm.DB) *Factory {
	return &Factory{db: db}
}

// CreateUser constructs and persists a sample `models.User`.
// Optional override functions may modify the generated user before saving.
func (f *Factory) CreateUser(overrides ...func(*models.User)) (*models.User, error) {
	hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)

	user := &models.User{
		Username: gofakeit.Username() + fmt.Sprintf("%d", gofakeit.Number(100, 999)),
		Email:    gofakeit.Email(),
		Password: string(hashedPassword),
		Bio:      gofakeit.Sentence(10),
		Avatar:   fmt.Sprintf("https://i.pravatar.cc/150?u=%s", gofakeit.UUID()),
	}

	for _, override := range overrides {
		override(user)
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
		CreatorID: creator.ID,
	}

	for _, override := range overrides {
		override(game)
	}

	if err := f.db.Create(game).Error; err != nil {
		return nil, err
	}
	return game, nil
}
