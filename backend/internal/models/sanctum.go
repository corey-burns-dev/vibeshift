package models

import "time"

// SanctumStatus defines the moderation state of a sanctum.
type SanctumStatus string

const (
	// SanctumStatusActive indicates a sanctum is visible and usable.
	SanctumStatusActive SanctumStatus = "active"
	// SanctumStatusPending indicates a sanctum is awaiting moderation.
	SanctumStatusPending SanctumStatus = "pending"
	// SanctumStatusRejected indicates a sanctum request was declined.
	SanctumStatusRejected SanctumStatus = "rejected"
	// SanctumStatusBanned indicates a sanctum is disabled by moderation.
	SanctumStatusBanned SanctumStatus = "banned"
)

// Sanctum represents a branded community namespace.
type Sanctum struct {
	ID              uint          `gorm:"primaryKey" json:"id"`
	Name            string        `gorm:"size:120;not null" json:"name"`
	Slug            string        `gorm:"size:24;not null;uniqueIndex" json:"slug"`
	Description     string        `gorm:"type:text" json:"description"`
	CreatedByUserID *uint         `json:"created_by_user_id"`
	CreatedByUser   *User         `gorm:"foreignKey:CreatedByUserID" json:"created_by_user,omitempty"`
	Status          SanctumStatus `gorm:"type:varchar(20);not null;default:'active'" json:"status"`
	CreatedAt       time.Time     `json:"created_at"`
	UpdatedAt       time.Time     `json:"updated_at"`
}

// TableName specifies the table name for GORM.
func (Sanctum) TableName() string {
	return "sanctums"
}
