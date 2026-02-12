// Package models contains data structures for the application's domain models.
package models

import (
	"time"

	"gorm.io/gorm"
)

// FriendshipStatus represents the status of a friendship request.
type FriendshipStatus string

const (
	// FriendshipStatusPending indicates a pending friendship request.
	FriendshipStatusPending FriendshipStatus = "pending"
	// FriendshipStatusAccepted indicates an accepted friendship request.
	FriendshipStatusAccepted FriendshipStatus = "accepted"
	// FriendshipStatusBlocked indicates a blocked friendship.
	FriendshipStatusBlocked FriendshipStatus = "blocked"
)

// Friendship represents a friendship relationship between two users.
type Friendship struct {
	ID          uint             `gorm:"primaryKey" json:"id"`
	RequesterID uint             `gorm:"not null;uniqueIndex:idx_friendship_users" json:"requester_id"`
	AddresseeID uint             `gorm:"not null;uniqueIndex:idx_friendship_users" json:"addressee_id"`
	Status      FriendshipStatus `gorm:"type:varchar(20);default:'pending';index:idx_friendships_status" json:"status"`
	CreatedAt   time.Time        `json:"created_at"`
	UpdatedAt   time.Time        `json:"updated_at"`

	// Relationships
	Requester User `gorm:"foreignKey:RequesterID" json:"requester,omitempty"`
	Addressee User `gorm:"foreignKey:AddresseeID" json:"addressee,omitempty"`
}

// TableName specifies the table name for GORM
func (Friendship) TableName() string {
	return "friendships"
}

// BeforeCreate preserves requester/addressee direction.
// Direction is required to distinguish sent vs received pending requests.
func (f *Friendship) BeforeCreate(_ *gorm.DB) error {
	return nil
}
