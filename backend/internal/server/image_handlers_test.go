package server

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"sanctum/internal/config"
	"sanctum/internal/service"
	"sanctum/internal/testutil"

	"github.com/gofiber/fiber/v2"
)

func TestUploadAndServeImage(t *testing.T) {
	cfg := &config.Config{ImageUploadDir: t.TempDir(), ImageMaxUploadSizeMB: 10}
	repo := testutil.NewImageRepoStub()
	svc := service.NewImageService(repo, cfg)
	s := &Server{config: cfg, imageRepo: repo, imageService: svc}

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", uint(1))
		return c.Next()
	})
	app.Post("/api/images/upload", s.UploadImage)
	app.Get("/api/images/:hash", s.ServeImage)

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("image", "img.png")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, writeErr := part.Write(testutil.TinyPNG(t, 40, 40)); writeErr != nil {
		t.Fatalf("write image bytes: %v", writeErr)
	}
	if closeErr := writer.Close(); closeErr != nil {
		t.Fatalf("close writer: %v", closeErr)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/images/upload", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	resp, reqErr := app.Test(req)
	if reqErr != nil {
		t.Fatalf("upload request failed: %v", reqErr)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var uploaded ImageUploadResponse
	if decodeErr := json.NewDecoder(resp.Body).Decode(&uploaded); decodeErr != nil {
		t.Fatalf("decode upload response: %v", decodeErr)
	}
	if uploaded.Hash == "" || uploaded.URL == "" {
		t.Fatalf("unexpected upload response: %+v", uploaded)
	}
	if !strings.HasPrefix(uploaded.URL, "/media/i/") {
		t.Fatalf("expected relative image URL, got %q", uploaded.URL)
	}

	serveReq := httptest.NewRequest(http.MethodGet, "/api/images/"+uploaded.Hash, nil)
	serveResp, err := app.Test(serveReq)
	if err != nil {
		t.Fatalf("serve request failed: %v", err)
	}
	defer func() { _ = serveResp.Body.Close() }()
	if serveResp.StatusCode != http.StatusMovedPermanently {
		t.Fatalf("expected serve 301, got %d", serveResp.StatusCode)
	}
}

func TestUploadImageMissingFile(t *testing.T) {
	cfg := &config.Config{ImageUploadDir: t.TempDir(), ImageMaxUploadSizeMB: 10}
	repo := testutil.NewImageRepoStub()
	s := &Server{config: cfg, imageRepo: repo, imageService: service.NewImageService(repo, cfg)}

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", uint(1))
		return c.Next()
	})
	app.Post("/api/images/upload", s.UploadImage)

	req := httptest.NewRequest(http.MethodPost, "/api/images/upload", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("upload request failed: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}
