package repository

import (
	"sanctum/internal/database"

	"gorm.io/gorm"
)

func readDB(primary *gorm.DB) *gorm.DB {
	if db := database.GetReadDB(); db != nil {
		return db
	}
	return primary
}
