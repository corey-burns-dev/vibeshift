package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// setupMockDB creates a GORM *gorm.DB backed by sqlmock for unit tests.
func setupMockDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	gormDB, err := gorm.Open(postgres.New(postgres.Config{Conn: db}), &gorm.Config{})
	require.NoError(t, err)
	return gormDB, mock
}

// --- humanizeParam (pure function, no HTTP) ---

func TestHumanizeParam(t *testing.T) {
	tests := []struct {
		param    string
		expected string
	}{
		{"id", "ID"},
		{"userId", "user ID"},
		{"commentId", "comment ID"},
		{"participantId", "participant ID"},
		{"requestId", "request ID"},
		{"roomId", "room ID"},
		{"something", "something"},
	}
	for _, tt := range tests {
		t.Run(tt.param, func(t *testing.T) {
			assert.Equal(t, tt.expected, humanizeParam(tt.param))
		})
	}
}

// --- parsePagination ---

func TestParsePagination_Defaults(t *testing.T) {
	app := fiber.New()
	app.Get("/items", func(c *fiber.Ctx) error {
		p := parsePagination(c, 25)
		return c.JSON(fiber.Map{"limit": p.Limit, "offset": p.Offset})
	})

	req := httptest.NewRequest(http.MethodGet, "/items", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	var body map[string]float64
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))

	assert.Equal(t, float64(25), body["limit"])
	assert.Equal(t, float64(0), body["offset"])
}

func TestParsePagination_Custom(t *testing.T) {
	app := fiber.New()
	app.Get("/items", func(c *fiber.Ctx) error {
		p := parsePagination(c, 25)
		return c.JSON(fiber.Map{"limit": p.Limit, "offset": p.Offset})
	})

	req := httptest.NewRequest(http.MethodGet, "/items?limit=10&offset=30", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	var body map[string]float64
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))

	assert.Equal(t, float64(10), body["limit"])
	assert.Equal(t, float64(30), body["offset"])
}

// --- parseID ---

func TestParseID_ValidID(t *testing.T) {
	app := fiber.New()
	s := &Server{}
	app.Get("/items/:id", func(c *fiber.Ctx) error {
		id, err := s.parseID(c, "id")
		if err != nil {
			return nil
		}
		return c.JSON(fiber.Map{"id": id})
	})

	req := httptest.NewRequest(http.MethodGet, "/items/42", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestParseID_InvalidNonNumeric(t *testing.T) {
	app := fiber.New()
	s := &Server{}
	app.Get("/items/:id", func(c *fiber.Ctx) error {
		_, _ = s.parseID(c, "id")
		return nil
	})

	req := httptest.NewRequest(http.MethodGet, "/items/abc", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

	var body map[string]string
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Contains(t, body["error"], "Invalid ID")
}

func TestParseID_ContextSpecificErrorMessage(t *testing.T) {
	tests := []struct {
		param       string
		expectedMsg string
	}{
		{"id", "Invalid ID"},
		{"userId", "Invalid user ID"},
		{"commentId", "Invalid comment ID"},
	}
	for _, tt := range tests {
		t.Run(tt.param, func(t *testing.T) {
			app := fiber.New()
			s := &Server{}
			app.Get("/items/:"+tt.param, func(c *fiber.Ctx) error {
				_, _ = s.parseID(c, tt.param)
				return nil
			})

			req := httptest.NewRequest(http.MethodGet, "/items/abc", nil)
			resp, err := app.Test(req)
			require.NoError(t, err)
			defer func() { _ = resp.Body.Close() }()

			assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

			var body map[string]string
			require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
			assert.Equal(t, tt.expectedMsg, body["error"])
		})
	}
}

func TestParseID_Zero(t *testing.T) {
	app := fiber.New()
	s := &Server{}
	app.Get("/items/:id", func(c *fiber.Ctx) error {
		id, err := s.parseID(c, "id")
		if err != nil {
			return nil
		}
		return c.JSON(fiber.Map{"id": id})
	})

	req := httptest.NewRequest(http.MethodGet, "/items/0", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	// 0 is a valid non-negative int; returns 200
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

// --- isAdmin ---

func TestIsAdmin_True(t *testing.T) {
	gormDB, mock := setupMockDB(t)
	s := &Server{db: gormDB}

	mock.ExpectQuery(regexp.QuoteMeta(`SELECT "is_admin" FROM "users"`)).
		WithArgs(uint(1), 1).
		WillReturnRows(sqlmock.NewRows([]string{"is_admin"}).AddRow(true))

	app := fiber.New()
	app.Get("/check", func(c *fiber.Ctx) error {
		admin, err := s.isAdmin(c, 1)
		if err != nil {
			return c.SendStatus(fiber.StatusInternalServerError)
		}
		return c.JSON(fiber.Map{"admin": admin})
	})

	req := httptest.NewRequest(http.MethodGet, "/check", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	var body map[string]bool
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.True(t, body["admin"])
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestIsAdmin_False(t *testing.T) {
	gormDB, mock := setupMockDB(t)
	s := &Server{db: gormDB}

	mock.ExpectQuery(regexp.QuoteMeta(`SELECT "is_admin" FROM "users"`)).
		WithArgs(uint(2), 1).
		WillReturnRows(sqlmock.NewRows([]string{"is_admin"}).AddRow(false))

	app := fiber.New()
	app.Get("/check", func(c *fiber.Ctx) error {
		admin, err := s.isAdmin(c, 2)
		if err != nil {
			return c.SendStatus(fiber.StatusInternalServerError)
		}
		return c.JSON(fiber.Map{"admin": admin})
	})

	req := httptest.NewRequest(http.MethodGet, "/check", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	var body map[string]bool
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.False(t, body["admin"])
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestIsAdmin_UserNotFound(t *testing.T) {
	gormDB, mock := setupMockDB(t)
	s := &Server{db: gormDB}

	mock.ExpectQuery(regexp.QuoteMeta(`SELECT "is_admin" FROM "users"`)).
		WithArgs(uint(999), 1).
		WillReturnRows(sqlmock.NewRows([]string{"is_admin"}))

	app := fiber.New()
	app.Get("/check", func(c *fiber.Ctx) error {
		_, err := s.isAdmin(c, 999)
		if err != nil {
			return c.SendStatus(fiber.StatusInternalServerError)
		}
		return c.SendStatus(fiber.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/check", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	assert.NoError(t, mock.ExpectationsWereMet())
}

// --- AdminRequired middleware ---

func TestAdminRequired_AllowsAdmin(t *testing.T) {
	gormDB, mock := setupMockDB(t)
	s := &Server{db: gormDB}

	mock.ExpectQuery(regexp.QuoteMeta(`SELECT "is_admin" FROM "users"`)).
		WithArgs(uint(1), 1).
		WillReturnRows(sqlmock.NewRows([]string{"is_admin"}).AddRow(true))

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", uint(1))
		return c.Next()
	})
	app.Get("/admin", s.AdminRequired(), func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"ok": true})
	})

	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestAdminRequired_RejectsNonAdmin(t *testing.T) {
	gormDB, mock := setupMockDB(t)
	s := &Server{db: gormDB}

	mock.ExpectQuery(regexp.QuoteMeta(`SELECT "is_admin" FROM "users"`)).
		WithArgs(uint(2), 1).
		WillReturnRows(sqlmock.NewRows([]string{"is_admin"}).AddRow(false))

	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", uint(2))
		return c.Next()
	})
	app.Get("/admin", s.AdminRequired(), func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"ok": true})
	})

	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	resp, err := app.Test(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	assert.Equal(t, http.StatusForbidden, resp.StatusCode)

	var body map[string]string
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	assert.Equal(t, "Admin access required", body["error"])
	assert.NoError(t, mock.ExpectationsWereMet())
}
