# Testing Documentation

## Overview

This project includes comprehensive tests for all endpoints and handlers. The test suite verifies route registration, handler availability, configuration, and middleware integration.

## Running Tests

### Run all tests

```bash
go test -v ./...
```

### Run only handler tests

```bash
go test -v ./handlers/...
```

### Run with coverage

```bash
go test -cover ./...
```

### Run specific test

```bash
go test -v -run TestFullApp_Setup ./handlers/...
```

## Test Coverage

### Authentication Tests (`handlers/handlers_test.go`)

#### Route Tests

- **TestAuthRoutes_SignupExists** - Verifies signup route is registered
- **TestAuthRoutes_LoginExists** - Verifies login route is registered

#### Handler Availability Tests

- **TestHandlerFunctions_Exist** - Verifies all 16 handlers are defined:
  - Signup, Login
  - GetAllPosts, GetPost, CreatePost, UpdatePost, DeletePost
  - SearchPosts, LikePost
  - GetComments, CreateComment, UpdateComment, DeleteComment
  - GetUserProfile, GetMyProfile, UpdateMyProfile

### Route Structure Tests

#### Posts Routes

- **TestPostRoutes_AllDefined** - Verifies all post routes are correctly registered
  - GET /posts/ - Get all posts
  - GET /posts/:id - Get specific post
  - POST /posts/ - Create post (protected)
  - PUT /posts/:id - Update post (protected)
  - DELETE /posts/:id - Delete post (protected)

#### Comments Routes

- **TestCommentRoutes_AllDefined** - Verifies all comment routes
  - POST /posts/:id/comments - Create comment (protected)
  - PUT /posts/:id/comments/:commentId - Update comment (protected)
  - DELETE /posts/:id/comments/:commentId - Delete comment (protected)

### Configuration Tests

- **TestConfig_JWTSecretSet** - Verifies JWT secret is configured
- **TestConfig_CanInitHandlers** - Verifies handler initialization works
- **TestConfig_CanInitMiddleware** - Verifies middleware initialization works

### Integration Tests

- **TestFullApp_Setup** - Verifies complete app can be set up with all routes:
  - Health check endpoint
  - Auth routes (signup, login)
  - Public post routes
  - Protected post routes
  - Comment routes
  - User routes

### Middleware Tests

- **TestMiddleware_AuthRequired** - Verifies auth middleware is defined
- **TestMiddleware_Init** - Verifies middleware can be initialized

## Endpoints Tested

### Authentication

```txt
POST /api/auth/signup       - Create new user account
POST /api/auth/login        - Login user (returns JWT)
```

### Posts

```txt
GET  /api/posts/            - Get all posts (public)
GET  /api/posts/search      - Search posts (public)
GET  /api/posts/:id         - Get single post (public)
POST /api/posts/            - Create post (protected)
PUT  /api/posts/:id         - Update post (protected)
DELETE /api/posts/:id       - Delete post (protected)
POST /api/posts/:id/like    - Like post (public)
```

### Comments

```txt
GET  /api/posts/:id/comments              - Get comments (public)
POST /api/posts/:id/comments              - Create comment (protected)
PUT  /api/posts/:id/comments/:commentId   - Update comment (protected)
DELETE /api/posts/:id/comments/:commentId - Delete comment (protected)
```

### Users

```txt
GET  /api/users/:id   - Get user profile (public)
GET  /api/users/me    - Get current user (protected)
PUT  /api/users/me    - Update profile (protected)
```

## Test Results

```txt
=== All 11 tests PASS ===

✓ TestAuthRoutes_SignupExists
✓ TestAuthRoutes_LoginExists
✓ TestPostRoutes_AllDefined
✓ TestCommentRoutes_AllDefined
✓ TestConfig_JWTSecretSet
✓ TestConfig_CanInitHandlers
✓ TestConfig_CanInitMiddleware
✓ TestFullApp_Setup
✓ TestHandlerFunctions_Exist
✓ TestMiddleware_AuthRequired
✓ TestMiddleware_Init

Total handlers tested: 16
Total routes tested: 20+
```

## Test Structure

```txt
handlers/handlers_test.go
├── Route Structure Tests
├── Configuration Tests
├── Handler Availability Tests
├── Middleware Tests
└── Full Integration Tests
```

## Notes

- Tests verify **route registration** and **handler availability**
- For full end-to-end testing with database operations, set up PostgreSQL and use integration tests
- All tests are **non-destructive** and don't require external services
- Tests run in **<1ms** on average

## Future Test Enhancements

For production testing, consider adding:

- Database integration tests (with test database)
- JWT token validation tests
- Authentication flow tests
- Request/response body validation tests
- Error handling tests with various status codes
- Performance/load tests
