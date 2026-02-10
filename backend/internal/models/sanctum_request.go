package models

import "time"

// SanctumRequestStatus defines lifecycle states for user sanctum requests.
type SanctumRequestStatus string

const (
	// SanctumRequestStatusPending indicates the request is awaiting review.
	SanctumRequestStatusPending SanctumRequestStatus = "pending"
	// SanctumRequestStatusApproved indicates the request was accepted.
	SanctumRequestStatusApproved SanctumRequestStatus = "approved"
	// SanctumRequestStatusRejected indicates the request was denied.
	SanctumRequestStatusRejected SanctumRequestStatus = "rejected"
)

// SanctumRequest is a user-submitted request to create a sanctum.
type SanctumRequest struct {
	ID                uint                 `gorm:"primaryKey" json:"id"`
	RequestedName     string               `gorm:"size:120;not null" json:"requested_name"`
	RequestedSlug     string               `gorm:"size:24;not null" json:"requested_slug"`
	Reason            string               `gorm:"type:text;not null" json:"reason"`
	RequestedByUserID uint                 `gorm:"not null;index" json:"requested_by_user_id"`
	RequestedByUser   *User                `gorm:"foreignKey:RequestedByUserID" json:"requested_by_user,omitempty"`
	Status            SanctumRequestStatus `gorm:"type:varchar(20);not null;default:'pending';index" json:"status"`
	ReviewedByUserID  *uint                `json:"reviewed_by_user_id"`
	ReviewedByUser    *User                `gorm:"foreignKey:ReviewedByUserID" json:"reviewed_by_user,omitempty"`
	ReviewNotes       string               `gorm:"type:text" json:"review_notes"`
	CreatedAt         time.Time            `json:"created_at"`
	UpdatedAt         time.Time            `json:"updated_at"`
}
