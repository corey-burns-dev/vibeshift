package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/draw"
	"image/jpeg"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"sanctum/internal/config"
	"sanctum/internal/models"
	"sanctum/internal/repository"

	"github.com/chai2010/webp"
	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp" // Register WebP decoder
	"gorm.io/gorm"
)

const (
	DefaultImageUploadDir       = "/tmp/sanctum/uploads/images"
	DefaultImageMaxUploadSizeMB = 10
	MasterMaxSize               = 2048
	OriginalMaxSize             = MasterMaxSize
	JPEGQuality                 = 82
	WebPQuality                 = 70
)

const (
	ImageSizeOriginal  = "original"
	ImageSizeThumbnail = "thumbnail"
	ImageSizeMedium    = "medium"
)

var sizeLadder = []int{256, 640, 1080, 1440, 2048}

var allowedRatios = []struct {
	name  string
	ratio float64
}{
	{name: "landscape", ratio: 1.91},
	{name: "square", ratio: 1.0},
	{name: "portrait", ratio: 0.8},
}

type UploadImageInput struct {
	UserID      uint
	Filename    string
	ContentType string
	Content     []byte
}

type ImageService struct {
	repo               repository.ImageRepository
	uploadDir          string
	maxUploadSizeBytes int64
	workerOnce         sync.Once
}

func NewImageService(repo repository.ImageRepository, cfg *config.Config) *ImageService {
	uploadDir := DefaultImageUploadDir
	maxUploadSizeMB := DefaultImageMaxUploadSizeMB

	if cfg != nil {
		if cfg.ImageUploadDir != "" {
			uploadDir = cfg.ImageUploadDir
		}
		if cfg.ImageMaxUploadSizeMB > 0 {
			maxUploadSizeMB = cfg.ImageMaxUploadSizeMB
		}
	}

	return &ImageService{
		repo:               repo,
		uploadDir:          uploadDir,
		maxUploadSizeBytes: int64(maxUploadSizeMB) * 1024 * 1024,
	}
}

func (s *ImageService) StartBackgroundWorker(ctx context.Context) {
	if s.repo == nil {
		return
	}
	s.workerOnce.Do(func() {
		go s.workerLoop(ctx)
	})
}

func (s *ImageService) Upload(ctx context.Context, in UploadImageInput) (*models.Image, error) {
	if in.UserID == 0 {
		return nil, models.NewValidationError("Invalid user")
	}
	if len(in.Content) == 0 {
		return nil, models.NewValidationError("No file uploaded")
	}
	if int64(len(in.Content)) > s.maxUploadSizeBytes {
		return nil, models.NewValidationError(fmt.Sprintf("File too large (max %dMB)", s.maxUploadSizeBytes/(1024*1024)))
	}

	detectedType := http.DetectContentType(in.Content)
	if !isAllowedImageMIME(detectedType) {
		return nil, models.NewValidationError("Invalid image type")
	}

	decoded, format, err := image.Decode(bytes.NewReader(in.Content))
	if err != nil {
		return nil, models.NewValidationError("Invalid image file")
	}
	if !isSupportedDecodedFormat(format) {
		return nil, models.NewValidationError("Unsupported image format")
	}

	sourceMimeType := decodedFormatToMime(format)
	if provided := normalizeContentType(in.ContentType); strings.HasPrefix(provided, "image/") && !isMatchingContentType(provided, sourceMimeType) {
		return nil, models.NewValidationError("Image content type mismatch")
	}

	b := decoded.Bounds()
	cropMode, cropX, cropY, cropW, cropH := selectCropMode(b.Dx(), b.Dy())
	cropped := cropToRect(decoded, cropX, cropY, cropW, cropH)
	master := resizeToFit(cropped, MasterMaxSize, MasterMaxSize)

	encodedMasterJPG, err := encodeJPEG(master, JPEGQuality)
	if err != nil {
		return nil, models.NewInternalError(err)
	}
	encodedMasterWebP, err := encodeWebP(master, WebPQuality)
	if err != nil {
		return nil, models.NewInternalError(err)
	}

	hash := buildDeterministicImageHash(in.UserID, encodedMasterJPG)
	if s.repo != nil {
		existing, getErr := s.repo.GetByHashWithVariants(ctx, hash)
		if getErr == nil {
			return existing, nil
		}
		if !errors.Is(getErr, gorm.ErrRecordNotFound) {
			return nil, models.NewInternalError(getErr)
		}
	}

	masterJPGRel := filepath.ToSlash(filepath.Join(hash, "master.jpg"))
	masterWebPRel := filepath.ToSlash(filepath.Join(hash, "master.webp"))
	masterJPGAbs := filepath.Join(s.uploadDir, masterJPGRel)
	masterWebPAbs := filepath.Join(s.uploadDir, masterWebPRel)
	writtenPaths := []string{masterJPGAbs, masterWebPAbs}

	if err := writeBytesToFile(masterJPGAbs, encodedMasterJPG); err != nil {
		return nil, models.NewInternalError(err)
	}
	if err := writeBytesToFile(masterWebPAbs, encodedMasterWebP); err != nil {
		cleanupImageFiles(writtenPaths)
		return nil, models.NewInternalError(err)
	}

	masterBounds := master.Bounds()
	record := &models.Image{
		Hash:               hash,
		UserID:             in.UserID,
		OriginalFilename:   in.Filename,
		MimeType:           "image/jpeg",
		SizeBytes:          int64(len(encodedMasterJPG)),
		Width:              masterBounds.Dx(),
		Height:             masterBounds.Dy(),
		OriginalPath:       masterJPGRel,
		ThumbnailPath:      masterJPGRel,
		MediumPath:         masterJPGRel,
		Status:             repository.ImageStatusQueued,
		CropMode:           cropMode,
		CropX:              cropX,
		CropY:              cropY,
		CropW:              cropW,
		CropH:              cropH,
		UploadedAt:         time.Now().UTC(),
		ProcessingAttempts: 0,
	}
	if s.repo != nil {
		if err := s.repo.Create(ctx, record); err != nil {
			cleanupImageFiles(writtenPaths)
			return nil, models.NewInternalError(err)
		}
	}

	return record, nil
}

func (s *ImageService) GetByHashWithVariants(ctx context.Context, hash string) (*models.Image, error) {
	if strings.TrimSpace(hash) == "" {
		return nil, models.NewValidationError("Invalid image hash")
	}
	if s.repo == nil {
		return nil, models.NewInternalError(errors.New("image repository not configured"))
	}
	img, err := s.repo.GetByHashWithVariants(ctx, hash)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, models.NewNotFoundError("Image", hash)
		}
		return nil, models.NewInternalError(err)
	}
	return img, nil
}

func (s *ImageService) BuildMasterImageURL(hash string) string {
	return fmt.Sprintf("/media/i/%s/master.jpg", hash)
}

func (s *ImageService) BuildVariantURL(hash string, size int, format string) string {
	return fmt.Sprintf("/media/i/%s/%d.%s", hash, size, format)
}

func (s *ImageService) BuildVariantsMap(hash string, variants []models.ImageVariant) map[string]string {
	m := make(map[string]string, len(variants))
	for _, v := range variants {
		key := fmt.Sprintf("%d_%s", v.SizePx, v.Format)
		m[key] = s.BuildVariantURL(hash, v.SizePx, v.Format)
	}
	return m
}

// BuildImageURL is retained for compatibility and always returns the canonical master URL.
func (s *ImageService) BuildImageURL(hash, size string) string {
	url := fmt.Sprintf("/api/images/%s", hash)
	variant := NormalizeImageSize(size)
	if variant == ImageSizeOriginal {
		return url
	}
	return fmt.Sprintf("%s?size=%s", url, variant)
}

// isValidImageHash checks that the hash is strictly lowercase hex (SHA-256 style).
// This prevents path traversal attacks via crafted hash parameters.
func isValidImageHash(hash string) bool {
	if len(hash) == 0 || len(hash) > 128 {
		return false
	}
	for _, c := range hash {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return false
		}
	}
	return true
}

// ResolveForServing is retained for compatibility and resolves to the master image on disk.
func (s *ImageService) ResolveForServing(_ context.Context, hash string, _ string) (*models.Image, string, error) {
	if !isValidImageHash(hash) {
		return nil, "", models.NewValidationError("Invalid image hash")
	}
	img, err := s.repo.GetByHash(context.Background(), hash)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, "", models.NewNotFoundError("Image", hash)
		}
		return nil, "", models.NewInternalError(err)
	}
	fullPath := filepath.Join(s.uploadDir, hash, "master.jpg")
	if _, err := os.Stat(fullPath); err != nil {
		if os.IsNotExist(err) {
			return nil, "", models.NewNotFoundError("Image", hash)
		}
		return nil, "", models.NewInternalError(err)
	}
	return img, fullPath, nil
}

func (s *ImageService) UpdateLastAccessed(ctx context.Context, imageID uint) {
	if s.repo == nil || imageID == 0 {
		return
	}
	_ = s.repo.UpdateLastAccessed(ctx, imageID)
}

func NormalizeImageSize(size string) string {
	s := strings.ToLower(strings.TrimSpace(size))
	switch s {
	case ImageSizeThumbnail, ImageSizeMedium:
		return s
	default:
		return ImageSizeOriginal
	}
}

func (s *ImageService) workerLoop(ctx context.Context) {
	const staleDuration = 15 * time.Minute
	const idleSleep = 750 * time.Millisecond

	_, _ = s.repo.RequeueStaleProcessing(ctx, staleDuration)
	lastRequeue := time.Now().UTC()

	for {
		if ctx.Err() != nil {
			return
		}
		if time.Since(lastRequeue) >= time.Minute {
			_, _ = s.repo.RequeueStaleProcessing(ctx, staleDuration)
			lastRequeue = time.Now().UTC()
		}

		img, err := s.repo.ClaimNextQueued(ctx)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				if !sleepContext(ctx, idleSleep) {
					return
				}
				continue
			}
			if !sleepContext(ctx, time.Second) {
				return
			}
			continue
		}

		if err := s.processQueuedImage(ctx, img); err != nil {
			if ferr := s.repo.MarkFailed(ctx, img.ID, err.Error()); ferr != nil {
				log.Printf("ERROR: failed to mark image %d as failed: %v (original error: %v)", img.ID, ferr, err)
			}
		}
	}
}

func (s *ImageService) processQueuedImage(ctx context.Context, img *models.Image) error {
	masterPath := filepath.Join(s.uploadDir, img.Hash, "master.jpg")
	// #nosec G304: masterPath is constructed from validated hash
	f, err := os.Open(masterPath)
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()

	master, _, err := image.Decode(f)
	if err != nil {
		return err
	}
	b := master.Bounds()

	for _, size := range sizeLadder {
		if b.Dx() < size || b.Dy() < size {
			continue
		}
		resized := resizeToFit(master, size, size)
		rb := resized.Bounds()
		sizeName := sizeNameFor(size)

		webpBytes, err := encodeWebP(resized, WebPQuality)
		if err != nil {
			return err
		}
		webpRel := filepath.ToSlash(filepath.Join(img.Hash, fmt.Sprintf("%d.webp", size)))
		if writeErr := writeBytesToFile(filepath.Join(s.uploadDir, webpRel), webpBytes); writeErr != nil {
			return writeErr
		}
		if upsertErr := s.repo.UpsertVariant(ctx, &models.ImageVariant{
			ImageID:  img.ID,
			SizeName: sizeName,
			SizePx:   size,
			Format:   "webp",
			Path:     webpRel,
			Width:    rb.Dx(),
			Height:   rb.Dy(),
			Bytes:    int64(len(webpBytes)),
		}); upsertErr != nil {
			return upsertErr
		}

		jpgBytes, err := encodeJPEG(resized, JPEGQuality)
		if err != nil {
			return err
		}
		jpgRel := filepath.ToSlash(filepath.Join(img.Hash, fmt.Sprintf("%d.jpg", size)))
		if writeErr := writeBytesToFile(filepath.Join(s.uploadDir, jpgRel), jpgBytes); writeErr != nil {
			return writeErr
		}
		if upsertErr := s.repo.UpsertVariant(ctx, &models.ImageVariant{
			ImageID:  img.ID,
			SizeName: sizeName,
			SizePx:   size,
			Format:   "jpg",
			Path:     jpgRel,
			Width:    rb.Dx(),
			Height:   rb.Dy(),
			Bytes:    int64(len(jpgBytes)),
		}); upsertErr != nil {
			return upsertErr
		}
	}

	return s.repo.MarkReady(ctx, img.ID)
}

func selectCropMode(w, h int) (mode string, cropX, cropY, cropW, cropH int) {
	if w <= 0 || h <= 0 {
		return "free", 0, 0, w, h
	}
	ratio := float64(w) / float64(h)
	bestMode := "square"
	bestRatio := 1.0
	bestDist := absFloat(ratio - 1.0)
	for _, r := range allowedRatios {
		d := absFloat(ratio - r.ratio)
		if d < bestDist {
			bestDist = d
			bestRatio = r.ratio
			bestMode = r.name
		}
	}

	if ratio > bestRatio {
		cropH = h
		cropW = int(float64(h) * bestRatio)
		cropX = (w - cropW) / 2
		cropY = 0
	} else {
		cropW = w
		cropH = int(float64(w) / bestRatio)
		cropX = 0
		cropY = (h - cropH) / 2
	}
	if cropW < 1 {
		cropW = 1
	}
	if cropH < 1 {
		cropH = 1
	}
	return bestMode, cropX, cropY, cropW, cropH
}

func cropToRect(src image.Image, x, y, w, h int) image.Image {
	if w <= 0 || h <= 0 {
		return src
	}
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.Draw(dst, dst.Bounds(), src, image.Point{X: x, Y: y}, draw.Src)
	return dst
}

func resizeToFit(src image.Image, maxWidth, maxHeight int) image.Image {
	bounds := src.Bounds()
	w := bounds.Dx()
	h := bounds.Dy()
	if w <= 0 || h <= 0 {
		return src
	}
	if w <= maxWidth && h <= maxHeight {
		return src
	}

	scaleW := float64(maxWidth) / float64(w)
	scaleH := float64(maxHeight) / float64(h)
	scale := scaleW
	if scaleH < scale {
		scale = scaleH
	}
	newW := int(float64(w) * scale)
	newH := int(float64(h) * scale)
	if newW < 1 {
		newW = 1
	}
	if newH < 1 {
		newH = 1
	}

	dst := image.NewRGBA(image.Rect(0, 0, newW, newH))
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), src, bounds, xdraw.Over, nil)
	return dst
}

func sizeNameFor(size int) string {
	switch size {
	case 256:
		return "thumb"
	case 640:
		return "sm"
	case 1080:
		return "md"
	case 1440:
		return "lg"
	case 2048:
		return "xl"
	default:
		return "custom"
	}
}

func encodeJPEG(img image.Image, quality int) ([]byte, error) {
	buf := bytes.NewBuffer(nil)
	if err := jpeg.Encode(buf, img, &jpeg.Options{Quality: quality}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func encodeWebP(img image.Image, quality int) ([]byte, error) {
	buf := bytes.NewBuffer(nil)
	if err := webp.Encode(buf, img, &webp.Options{Quality: float32(quality)}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func isAllowedImageMIME(contentType string) bool {
	switch normalizeContentType(contentType) {
	case "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp":
		return true
	default:
		return false
	}
}

func normalizeContentType(contentType string) string {
	if contentType == "" {
		return ""
	}
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		return strings.ToLower(strings.TrimSpace(contentType))
	}
	return strings.ToLower(strings.TrimSpace(mediaType))
}

func isMatchingContentType(provided, detected string) bool {
	p := normalizeContentType(provided)
	d := normalizeContentType(detected)
	if p == d {
		return true
	}
	return (p == "image/jpg" && d == "image/jpeg") || (p == "image/jpeg" && d == "image/jpg")
}

func isSupportedDecodedFormat(format string) bool {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "jpeg", "jpg", "png", "gif", "webp":
		return true
	default:
		return false
	}
}

func decodedFormatToMime(format string) string {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "jpeg", "jpg":
		return "image/jpeg"
	case "png":
		return "image/png"
	case "gif":
		return "image/gif"
	case "webp":
		return "image/webp"
	default:
		return ""
	}
}

func buildDeterministicImageHash(userID uint, content []byte) string {
	h := sha256.New()
	_, _ = fmt.Fprintf(h, "%d:", userID)
	h.Write(content)
	return hex.EncodeToString(h.Sum(nil))
}

func writeBytesToFile(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

func cleanupImageFiles(paths []string) {
	for _, p := range paths {
		_ = os.Remove(p)
	}
}

func sleepContext(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}

func absFloat(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}
