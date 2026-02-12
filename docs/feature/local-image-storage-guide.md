# Local Image Storage Architecture for Sanctum

Best practices for storing user-uploaded images on your local NVMe drive.

---

## 🎯 Quick Answer: Filesystem + Database Metadata

**Recommended approach:**
- Images → Filesystem (NVMe)
- Metadata → PostgreSQL
- Serving → Direct file serving with caching
- Processing → On-upload optimization

**Why this works:**
- ✅ Fast (NVMe is faster than any database blob storage)
- ✅ Simple (no S3, no CDN complexity)
- ✅ Cheap (your own hardware)
- ✅ Scalable (to thousands of images easily)
- ✅ Easy backup (just rsync a directory)

---

## 📁 File Organization Strategy

### Option 1: Hash-Based (Recommended)

**Structure:**
```
/var/sanctum/uploads/
├── images/
│   ├── original/
│   │   ├── ab/
│   │   │   ├── cd/
│   │   │   │   └── abcdef123456.jpg
│   │   ├── 12/
│   │   │   ├── 34/
│   │   │   │   └── 123456abcdef.jpg
│   ├── thumbnails/
│   │   ├── ab/
│   │   │   ├── cd/
│   │   │   │   └── abcdef123456_thumb.jpg
│   ├── medium/
│   │   ├── ab/
│   │   │   ├── cd/
│   │   │   │   └── abcdef123456_medium.jpg
```

**Benefits:**
- Evenly distributed (no single directory with 10,000 files)
- Fast lookups (filesystem hashing works well)
- Prevents name collisions (hash is unique)
- No user-controlled paths (security)

**Naming scheme:**
```
Hash: SHA256(file content + timestamp + user_id)
First 2 chars: Directory level 1
Next 2 chars: Directory level 2
Full hash: Filename
```

---

### Option 2: Date-Based (Alternative)

**Structure:**
```
/var/sanctum/uploads/
├── images/
│   ├── 2026/
│   │   ├── 02/
│   │   │   ├── 11/
│   │   │   │   ├── uuid-v4.jpg
│   │   │   │   ├── uuid-v4.jpg
```

**Benefits:**
- Easy to find recent uploads
- Natural partitioning by time
- Simple cleanup of old files

**Drawbacks:**
- Uneven distribution (today's folder grows huge)
- Harder to scale

**Verdict: Use hash-based for better distribution**

---

## 🗄️ Database Schema

```sql
-- backend/internal/database/migrations/000010_images.up.sql

CREATE TABLE images (
    id BIGSERIAL PRIMARY KEY,
    
    -- Identification
    hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA256 hash
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- File info
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(50) NOT NULL,
    size_bytes BIGINT NOT NULL,
    width INTEGER,
    height INTEGER,
    
    -- Storage paths (relative to base directory)
    original_path VARCHAR(512) NOT NULL,
    thumbnail_path VARCHAR(512),
    medium_path VARCHAR(512),
    
    -- Metadata
    alt_text TEXT,
    caption TEXT,
    
    -- Processing status
    processed BOOLEAN DEFAULT FALSE,
    processing_error TEXT,
    
    -- Usage tracking
    post_id BIGINT REFERENCES posts(id) ON DELETE SET NULL,
    comment_id BIGINT REFERENCES comments(id) ON DELETE SET NULL,
    
    -- Timestamps
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ,
    
    -- Indexes
    INDEX idx_images_user (user_id),
    INDEX idx_images_hash (hash),
    INDEX idx_images_post (post_id),
    INDEX idx_images_uploaded (uploaded_at DESC)
);

-- Track image views for analytics
CREATE TABLE image_views (
    id BIGSERIAL PRIMARY KEY,
    image_id BIGINT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    viewer_ip INET,
    viewed_at TIMESTAMPTZ DEFAULT NOW(),
    INDEX idx_image_views_image (image_id),
    INDEX idx_image_views_time (viewed_at DESC)
);
```

---

## 📤 Upload Handler (Go)

```go
// backend/internal/server/image_handlers.go
package server

import (
	"crypto/sha256"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/nfnt/resize"
)

const (
	MaxUploadSize     = 10 * 1024 * 1024  // 10MB
	BaseUploadDir     = "/var/sanctum/uploads/images"
	ThumbnailSize     = 200
	MediumSize        = 800
)

type ImageUploadResponse struct {
	ID           int64  `json:"id"`
	Hash         string `json:"hash"`
	URL          string `json:"url"`
	ThumbnailURL string `json:"thumbnail_url"`
	MediumURL    string `json:"medium_url"`
	Width        int    `json:"width"`
	Height       int    `json:"height"`
	Size         int64  `json:"size_bytes"`
}

func (s *Server) UploadImage(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(int64)

	// Get file from form
	file, err := c.FormFile("image")
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "No file uploaded")
	}

	// Check size
	if file.Size > MaxUploadSize {
		return fiber.NewError(fiber.StatusBadRequest, "File too large (max 10MB)")
	}

	// Check content type
	if !isValidImageType(file.Header.Get("Content-Type")) {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid image type")
	}

	// Open uploaded file
	src, err := file.Open()
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer src.Close()

	// Read file content for hashing
	content, err := io.ReadAll(src)
	if err != nil {
		return fmt.Errorf("failed to read file: %w", err)
	}

	// Generate hash
	hash := generateHash(content, userID)

	// Check if already uploaded (deduplication)
	existingImage, err := s.imageRepo.GetByHash(c.Context(), hash)
	if err == nil {
		// Image already exists, return existing
		return c.JSON(imageToResponse(existingImage))
	}

	// Decode image to get dimensions
	img, format, err := image.Decode(bytes.NewReader(content))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid image file")
	}

	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()

	// Generate file paths
	originalPath := generateFilePath(hash, "original", format)
	thumbnailPath := generateFilePath(hash, "thumbnail", format)
	mediumPath := generateFilePath(hash, "medium", format)

	// Save original
	if err := saveFile(content, filepath.Join(BaseUploadDir, originalPath)); err != nil {
		return fmt.Errorf("failed to save original: %w", err)
	}

	// Generate and save thumbnail
	thumbnail := resize.Thumbnail(ThumbnailSize, ThumbnailSize, img, resize.Lanczos3)
	if err := saveImage(thumbnail, filepath.Join(BaseUploadDir, thumbnailPath), format); err != nil {
		s.logger.Error("Failed to create thumbnail", "error", err)
	}

	// Generate and save medium size (if original is large enough)
	if width > MediumSize || height > MediumSize {
		medium := resize.Thumbnail(MediumSize, MediumSize, img, resize.Lanczos3)
		if err := saveImage(medium, filepath.Join(BaseUploadDir, mediumPath), format); err != nil {
			s.logger.Error("Failed to create medium", "error", err)
		}
	}

	// Save to database
	imageRecord := &models.Image{
		Hash:             hash,
		UserID:           userID,
		OriginalFilename: file.Filename,
		MimeType:         file.Header.Get("Content-Type"),
		SizeBytes:        file.Size,
		Width:            width,
		Height:           height,
		OriginalPath:     originalPath,
		ThumbnailPath:    thumbnailPath,
		MediumPath:       mediumPath,
		Processed:        true,
	}

	if err := s.imageRepo.Create(c.Context(), imageRecord); err != nil {
		// Clean up files on DB error
		os.Remove(filepath.Join(BaseUploadDir, originalPath))
		os.Remove(filepath.Join(BaseUploadDir, thumbnailPath))
		os.Remove(filepath.Join(BaseUploadDir, mediumPath))
		return fmt.Errorf("failed to save image metadata: %w", err)
	}

	return c.JSON(imageToResponse(imageRecord))
}

func generateHash(content []byte, userID int64) string {
	h := sha256.New()
	h.Write(content)
	h.Write([]byte(fmt.Sprintf("%d-%d", userID, time.Now().UnixNano())))
	return fmt.Sprintf("%x", h.Sum(nil))
}

func generateFilePath(hash, size, format string) string {
	// Hash-based directory structure: ab/cd/abcdef123456.jpg
	dir1 := hash[:2]
	dir2 := hash[2:4]
	filename := fmt.Sprintf("%s_%s.%s", hash, size, format)
	return filepath.Join(size, dir1, dir2, filename)
}

func saveFile(content []byte, path string) error {
	// Ensure directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	// Write file
	return os.WriteFile(path, content, 0644)
}

func saveImage(img image.Image, path string, format string) error {
	// Ensure directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	// Create file
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	// Encode based on format
	switch format {
	case "jpeg", "jpg":
		return jpeg.Encode(f, img, &jpeg.Options{Quality: 85})
	case "png":
		return png.Encode(f, img)
	case "gif":
		return gif.Encode(f, img, nil)
	default:
		return jpeg.Encode(f, img, &jpeg.Options{Quality: 85})
	}
}

func isValidImageType(contentType string) bool {
	validTypes := []string{
		"image/jpeg",
		"image/jpg",
		"image/png",
		"image/gif",
		"image/webp",
	}
	for _, t := range validTypes {
		if t == contentType {
			return true
		}
	}
	return false
}
```

---

## 📥 Serving Images

```go
// backend/internal/server/image_handlers.go

func (s *Server) ServeImage(c *fiber.Ctx) error {
	hash := c.Params("hash")
	size := c.Query("size", "original") // original, thumbnail, medium

	// Get image metadata
	img, err := s.imageRepo.GetByHash(c.Context(), hash)
	if err != nil {
		return fiber.ErrNotFound
	}

	// Determine which file to serve
	var filePath string
	switch size {
	case "thumbnail":
		filePath = img.ThumbnailPath
	case "medium":
		filePath = img.MediumPath
	default:
		filePath = img.OriginalPath
	}

	fullPath := filepath.Join(BaseUploadDir, filePath)

	// Check if file exists
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		return fiber.ErrNotFound
	}

	// Update last accessed (async)
	go s.imageRepo.UpdateLastAccessed(context.Background(), img.ID)

	// Serve file with caching headers
	c.Set("Cache-Control", "public, max-age=31536000") // 1 year
	c.Set("Content-Type", img.MimeType)
	
	return c.SendFile(fullPath)
}

// Setup routes
func (s *Server) setupImageRoutes() {
	api := s.app.Group("/api")

	// Upload (requires auth)
	api.Post("/images/upload", middleware.RequireAuth(), s.UploadImage)

	// Serve (public, but could add auth if needed)
	api.Get("/images/:hash", s.ServeImage)
}
```

**URLs will look like:**
```
https://sanctum.com/api/images/abcdef123456?size=thumbnail
https://sanctum.com/api/images/abcdef123456?size=medium
https://sanctum.com/api/images/abcdef123456  (original)
```

---

## 🎨 Image Processing (On Upload)

**Generate multiple sizes automatically:**

```go
type ImageSize struct {
	Name      string
	MaxWidth  int
	MaxHeight int
	Quality   int
}

var imageSizes = []ImageSize{
	{Name: "thumbnail", MaxWidth: 200, MaxHeight: 200, Quality: 80},
	{Name: "medium", MaxWidth: 800, MaxHeight: 800, Quality: 85},
	{Name: "large", MaxWidth: 1920, MaxHeight: 1920, Quality: 90},
}

func processImage(img image.Image, originalFormat string) map[string][]byte {
	results := make(map[string][]byte)

	for _, size := range imageSizes {
		resized := resize.Thumbnail(size.MaxWidth, size.MaxHeight, img, resize.Lanczos3)
		
		var buf bytes.Buffer
		switch originalFormat {
		case "jpeg", "jpg":
			jpeg.Encode(&buf, resized, &jpeg.Options{Quality: size.Quality})
		case "png":
			png.Encode(&buf, resized)
		default:
			jpeg.Encode(&buf, resized, &jpeg.Options{Quality: size.Quality})
		}
		
		results[size.Name] = buf.Bytes()
	}

	return results
}
```

---

## 🔒 Security Considerations

### 1. Validate File Content (Not Just Extension)

```go
func validateImageContent(content []byte) error {
	// Decode to ensure it's really an image
	_, format, err := image.Decode(bytes.NewReader(content))
	if err != nil {
		return fmt.Errorf("not a valid image")
	}

	// Check format is allowed
	allowed := map[string]bool{
		"jpeg": true,
		"jpg":  true,
		"png":  true,
		"gif":  true,
		"webp": true,
	}

	if !allowed[format] {
		return fmt.Errorf("image format not allowed: %s", format)
	}

	return nil
}
```

### 2. Strip EXIF Data (Privacy)

```go
import "github.com/rwcarlsen/goexif/exif"

func stripEXIF(content []byte) ([]byte, error) {
	img, format, err := image.Decode(bytes.NewReader(content))
	if err != nil {
		return nil, err
	}

	// Re-encode without EXIF
	var buf bytes.Buffer
	switch format {
	case "jpeg", "jpg":
		jpeg.Encode(&buf, img, &jpeg.Options{Quality: 95})
	case "png":
		png.Encode(&buf, img)
	default:
		return content, nil // Not stripping for other formats
	}

	return buf.Bytes(), nil
}
```

### 3. Rate Limiting

```go
// Limit uploads per user
func (s *Server) UploadImage(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(int64)

	// Check upload count in last hour
	count, err := s.imageRepo.CountRecentUploads(c.Context(), userID, 1*time.Hour)
	if err != nil {
		return err
	}

	if count >= 20 { // Max 20 uploads per hour
		return fiber.NewError(fiber.StatusTooManyRequests, "Upload limit exceeded")
	}

	// ... continue with upload
}
```

### 4. Disk Quota Per User

```go
func (s *Server) checkUserQuota(ctx context.Context, userID int64, newFileSize int64) error {
	const MaxQuota = 100 * 1024 * 1024 // 100MB per user

	totalSize, err := s.imageRepo.GetUserTotalSize(ctx, userID)
	if err != nil {
		return err
	}

	if totalSize+newFileSize > MaxQuota {
		return fmt.Errorf("quota exceeded")
	}

	return nil
}
```

---

## 🗑️ Image Deletion

```go
func (s *Server) DeleteImage(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(int64)
	imageID := c.Params("id")

	// Get image
	img, err := s.imageRepo.GetByID(c.Context(), imageID)
	if err != nil {
		return fiber.ErrNotFound
	}

	// Check ownership
	if img.UserID != userID {
		return fiber.ErrForbidden
	}

	// Check if image is in use
	if img.PostID != nil || img.CommentID != nil {
		return fiber.NewError(fiber.StatusConflict, "Image is in use")
	}

	// Delete files
	os.Remove(filepath.Join(BaseUploadDir, img.OriginalPath))
	os.Remove(filepath.Join(BaseUploadDir, img.ThumbnailPath))
	os.Remove(filepath.Join(BaseUploadDir, img.MediumPath))

	// Delete from database
	if err := s.imageRepo.Delete(c.Context(), img.ID); err != nil {
		return err
	}

	return c.SendStatus(fiber.StatusNoContent)
}
```

---

## 🔄 Background Cleanup Job

```go
// backend/cmd/cleanup/main.go
package main

func cleanupOrphanedImages() {
	// Find images not attached to any post/comment for 30+ days
	orphans, err := imageRepo.FindOrphaned(context.Background(), 30*24*time.Hour)
	if err != nil {
		log.Fatal(err)
	}

	for _, img := range orphans {
		// Delete files
		os.Remove(filepath.Join(BaseUploadDir, img.OriginalPath))
		os.Remove(filepath.Join(BaseUploadDir, img.ThumbnailPath))
		os.Remove(filepath.Join(BaseUploadDir, img.MediumPath))

		// Delete record
		imageRepo.Delete(context.Background(), img.ID)
		
		log.Printf("Cleaned up orphaned image: %s", img.Hash)
	}
}

// Run weekly
// 0 2 * * 0 /usr/local/bin/sanctum-cleanup
```

---

## 💾 Backup Strategy

```bash
#!/bin/bash
# scripts/backup-images.sh

BACKUP_DIR="/mnt/backup/sanctum/images"
SOURCE_DIR="/var/sanctum/uploads/images"

# Incremental backup with rsync
rsync -av --delete \
    --exclude='*.tmp' \
    "$SOURCE_DIR/" \
    "$BACKUP_DIR/$(date +%Y-%m-%d)/"

# Keep only last 7 days of backups
find "$BACKUP_DIR" -type d -mtime +7 -exec rm -rf {} +
```

**Schedule daily:**
```bash
0 3 * * * /path/to/scripts/backup-images.sh
```

---

## 📊 Performance Optimizations

### 1. Nginx for Static Files (Better than Go)

```nginx
# /etc/nginx/sites-available/sanctum

server {
    listen 80;
    server_name sanctum.com;

    # Images served directly by nginx (faster than Go)
    location /images/ {
        alias /var/sanctum/uploads/images/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        
        # Security
        add_header X-Content-Type-Options "nosniff";
        
        # CORS if needed
        add_header Access-Control-Allow-Origin "*";
    }

    # API requests go to Go backend
    location /api/ {
        proxy_pass http://localhost:8375;
        # ... proxy settings
    }
}
```

**Performance gain: 3-5x faster than serving through Go**

### 2. WebP Conversion (Modern Format)

```go
import "github.com/chai2010/webp"

func convertToWebP(img image.Image) ([]byte, error) {
	var buf bytes.Buffer
	if err := webp.Encode(&buf, img, &webp.Options{Quality: 80}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// Serve WebP to supporting browsers
func (s *Server) ServeImage(c *fiber.Ctx) error {
	// Check if browser supports WebP
	acceptHeader := c.Get("Accept")
	supportsWebP := strings.Contains(acceptHeader, "image/webp")

	// Serve WebP version if available and supported
	if supportsWebP && img.WebPPath != "" {
		return c.SendFile(filepath.Join(BaseUploadDir, img.WebPPath))
	}

	// Fallback to original
	return c.SendFile(filepath.Join(BaseUploadDir, img.OriginalPath))
}
```

**Size savings: 25-35% smaller than JPEG**

---

## 📈 Monitoring & Analytics

```go
// Track popular images
func (s *Server) trackImageView(imageID int64, ip string) {
	go func() {
		s.db.Exec(`
			INSERT INTO image_views (image_id, viewer_ip)
			VALUES ($1, $2)
		`, imageID, ip)
	}()
}

// Get most viewed images
func (s *Server) GetPopularImages(c *fiber.Ctx) error {
	rows, err := s.db.Query(`
		SELECT i.*, COUNT(v.id) as view_count
		FROM images i
		LEFT JOIN image_views v ON i.id = v.image_id
		WHERE v.viewed_at > NOW() - INTERVAL '7 days'
		GROUP BY i.id
		ORDER BY view_count DESC
		LIMIT 10
	`)
	// ...
}
```

---

## 🎯 Summary: Recommended Setup

**File Structure:**
```
/var/sanctum/uploads/images/
├── original/ab/cd/abcdef123456.jpg
├── thumbnail/ab/cd/abcdef123456_thumb.jpg
├── medium/ab/cd/abcdef123456_medium.jpg
```

**Database:** Metadata only (paths, dimensions, ownership)

**Serving:** Nginx for static files (fast!)

**Processing:** On-upload (thumbnail + medium size)

**Security:**
- Validate file content
- Strip EXIF data
- Rate limiting
- User quotas

**Backup:** Daily rsync to backup drive

**Cleanup:** Weekly job to remove orphaned images

**This handles:**
- ✅ Fast uploads and serving
- ✅ Automatic resizing
- ✅ Deduplication (same image = one file)
- ✅ Security and quotas
- ✅ Easy backups
- ✅ Scalable to 100K+ images

**Total complexity:** Medium (but worth it for local storage) 🎯
