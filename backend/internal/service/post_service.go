package service

import (
	"context"
	"net/url"
	"strings"

	"sanctum/internal/cache"
	"sanctum/internal/models"
	"sanctum/internal/repository"
)

type PostService struct {
	postRepo repository.PostRepository
	pollRepo repository.PollRepository
	isAdmin  func(ctx context.Context, userID uint) (bool, error)
}

// CreatePostPollInput is the poll payload when creating a poll post.
type CreatePostPollInput struct {
	Question string   `json:"question"`
	Options  []string `json:"options"`
}

type CreatePostInput struct {
	UserID     uint
	Title      string
	Content    string
	ImageURL   string
	PostType   string
	LinkURL    string
	YoutubeURL string
	SanctumID  *uint
	Poll       *CreatePostPollInput
}

type ListPostsInput struct {
	Limit         int
	Offset        int
	CurrentUserID uint
	SanctumID     *uint
}

type UpdatePostInput struct {
	UserID     uint
	PostID     uint
	Title      string
	Content    string
	ImageURL   string
	LinkURL    string
	YoutubeURL string
}

type DeletePostInput struct {
	UserID uint
	PostID uint
}

func NewPostService(
	postRepo repository.PostRepository,
	pollRepo repository.PollRepository,
	isAdmin func(ctx context.Context, userID uint) (bool, error),
) *PostService {
	return &PostService{
		postRepo: postRepo,
		pollRepo: pollRepo,
		isAdmin:  isAdmin,
	}
}

func (s *PostService) SearchPosts(ctx context.Context, query string, limit, offset int, currentUserID uint) ([]*models.Post, error) {
	if query == "" {
		return nil, models.NewValidationError("Search query is required")
	}
	posts, err := s.postRepo.Search(ctx, query, limit, offset, currentUserID)
	if err != nil {
		return nil, err
	}
	for _, p := range posts {
		if err := s.enrichPollIfPresent(ctx, p, currentUserID); err != nil {
			return nil, err
		}
	}
	return posts, nil
}

func (s *PostService) CreatePost(ctx context.Context, in CreatePostInput) (*models.Post, error) {
	postType := in.PostType
	if postType == "" {
		postType = models.PostTypeText
	}
	switch postType {
	case models.PostTypeText, models.PostTypeMedia, models.PostTypeVideo, models.PostTypeLink, models.PostTypePoll:
		// valid
	default:
		return nil, models.NewValidationError("Invalid post_type")
	}

	const maxTitleLen = 300
	const maxContentLen = 50000 // 50K characters

	if in.Title == "" {
		return nil, models.NewValidationError("Title is required")
	}
	if len(in.Title) > maxTitleLen {
		return nil, models.NewValidationError("Title too long (max 300 characters)")
	}
	if len(in.Content) > maxContentLen {
		return nil, models.NewValidationError("Content too long (max 50000 characters)")
	}
	// Content required for text posts.
	if postType == models.PostTypeText {
		if in.Content == "" {
			return nil, models.NewValidationError("Content is required")
		}
	}

	switch postType {
	case models.PostTypeMedia:
		if strings.TrimSpace(in.ImageURL) == "" {
			return nil, models.NewValidationError("image_url is required for media posts")
		}
	case models.PostTypeVideo:
		if in.YoutubeURL == "" {
			return nil, models.NewValidationError("youtube_url is required for video posts")
		}
		if !isYouTubeURL(in.YoutubeURL) {
			return nil, models.NewValidationError("youtube_url must be a valid YouTube URL")
		}
	case models.PostTypeLink:
		if in.LinkURL == "" {
			return nil, models.NewValidationError("link_url is required for link posts")
		}
		if _, err := url.ParseRequestURI(in.LinkURL); err != nil {
			return nil, models.NewValidationError("link_url must be a valid URL")
		}
	case models.PostTypePoll:
		if in.Poll == nil || in.Poll.Question == "" {
			return nil, models.NewValidationError("Poll question is required")
		}
		if len(in.Poll.Options) < 2 {
			return nil, models.NewValidationError("Poll must have at least two options")
		}
		if len(in.Poll.Options) > 20 {
			return nil, models.NewValidationError("Poll cannot have more than 20 options")
		}
		// trim empty options
		var opts []string
		for _, o := range in.Poll.Options {
			if strings.TrimSpace(o) != "" {
				opts = append(opts, strings.TrimSpace(o))
			}
		}
		if len(opts) < 2 {
			return nil, models.NewValidationError("Poll must have at least two non-empty options")
		}
		in.Poll.Options = opts
	}

	content := in.Content
	if postType == models.PostTypePoll {
		content = in.Poll.Question
	}

	post := &models.Post{
		Title:      in.Title,
		Content:    content,
		ImageURL:   in.ImageURL,
		ImageHash:  extractImageHash(in.ImageURL),
		PostType:   postType,
		LinkURL:    in.LinkURL,
		YoutubeURL: in.YoutubeURL,
		UserID:     in.UserID,
		SanctumID:  in.SanctumID,
	}
	if err := s.postRepo.Create(ctx, post); err != nil {
		return nil, err
	}

	if postType == models.PostTypePoll && s.pollRepo != nil {
		if _, err := s.pollRepo.Create(ctx, post.ID, in.Poll.Question, in.Poll.Options); err != nil {
			return nil, err
		}
	}

	return s.getPostWithPollEnriched(ctx, post.ID, in.UserID)
}

func (s *PostService) ListPosts(ctx context.Context, in ListPostsInput) ([]*models.Post, error) {
	var posts []*models.Post
	var err error

	if in.SanctumID == nil && in.Offset == 0 && in.Limit <= 20 {
		key := cache.PostsListKey(ctx)
		err = cache.Aside(ctx, key, &posts, cache.ListTTL, func() error {
			var fetchErr error
			posts, fetchErr = s.postRepo.List(ctx, in.Limit, in.Offset, 0)
			return fetchErr
		})
		if err != nil {
			return nil, err
		}

		// Re-enrich with current user's liked status if they are logged in
		if in.CurrentUserID != 0 && len(posts) > 0 {
			// We need to work on a shallow copy of the slice to avoid modifying cached objects if they are shared
			// Although Aside/Unmarshal should provide fresh objects.
			postIDs := make([]uint, len(posts))
			for i, p := range posts {
				postIDs[i] = p.ID
			}

			likedIDs, err := s.postRepo.GetLikedPostIDs(ctx, in.CurrentUserID, postIDs)
			if err == nil {
				likedMap := make(map[uint]bool, len(likedIDs))
				for _, id := range likedIDs {
					likedMap[id] = true
				}
				for _, p := range posts {
					p.Liked = likedMap[p.ID]
				}
			}
		}
	} else if in.SanctumID != nil {
		posts, err = s.postRepo.GetBySanctumID(ctx, *in.SanctumID, in.Limit, in.Offset, in.CurrentUserID)
	} else {
		posts, err = s.postRepo.List(ctx, in.Limit, in.Offset, in.CurrentUserID)
	}

	if err != nil {
		return nil, err
	}
	for _, p := range posts {
		if err := s.enrichPollIfPresent(ctx, p, in.CurrentUserID); err != nil {
			return nil, err
		}
	}
	return posts, nil
}

func (s *PostService) GetPost(ctx context.Context, id uint, currentUserID uint) (*models.Post, error) {
	post, err := s.postRepo.GetByID(ctx, id, currentUserID)
	if err != nil {
		return nil, err
	}
	if err := s.enrichPollIfPresent(ctx, post, currentUserID); err != nil {
		return nil, err
	}
	return post, nil
}

func (s *PostService) getPostWithPollEnriched(ctx context.Context, postID, currentUserID uint) (*models.Post, error) {
	post, err := s.postRepo.GetByID(ctx, postID, currentUserID)
	if err != nil {
		return nil, err
	}
	if err := s.enrichPollIfPresent(ctx, post, currentUserID); err != nil {
		return nil, err
	}
	return post, nil
}

func (s *PostService) enrichPollIfPresent(ctx context.Context, post *models.Post, currentUserID uint) error {
	if post.Poll != nil && s.pollRepo != nil {
		return s.pollRepo.EnrichWithResults(ctx, post.Poll, currentUserID)
	}
	return nil
}

// isYouTubeURL returns true if u is a YouTube watch or embed URL.
func isYouTubeURL(u string) bool {
	parsed, err := url.Parse(u)
	if err != nil {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return strings.Contains(host, "youtube.com") || strings.Contains(host, "youtu.be")
}

// VotePoll records or updates the current user's vote on a poll.
func (s *PostService) VotePoll(ctx context.Context, userID, postID, pollOptionID uint) (*models.Post, error) {
	post, err := s.postRepo.GetByID(ctx, postID, userID)
	if err != nil {
		return nil, err
	}
	if post.PostType != models.PostTypePoll || post.Poll == nil {
		return nil, models.NewValidationError("Post is not a poll")
	}
	var optionBelongs bool
	for _, opt := range post.Poll.Options {
		if opt.ID == pollOptionID {
			optionBelongs = true
			break
		}
	}
	if !optionBelongs {
		return nil, models.NewValidationError("Invalid poll option")
	}
	if s.pollRepo == nil {
		return nil, models.NewValidationError("Poll voting is not available")
	}
	if err := s.pollRepo.Vote(ctx, userID, post.Poll.ID, pollOptionID); err != nil {
		return nil, err
	}
	cache.Invalidate(ctx, cache.PostKey(postID))
	return s.getPostWithPollEnriched(ctx, postID, userID)
}

func (s *PostService) GetUserPosts(ctx context.Context, userID uint, limit, offset int, currentUserID uint) ([]*models.Post, error) {
	posts, err := s.postRepo.GetByUserID(ctx, userID, limit, offset, currentUserID)
	if err != nil {
		return nil, err
	}
	for _, p := range posts {
		if err := s.enrichPollIfPresent(ctx, p, currentUserID); err != nil {
			return nil, err
		}
	}
	return posts, nil
}

func (s *PostService) UpdatePost(ctx context.Context, in UpdatePostInput) (*models.Post, error) {
	post, err := s.postRepo.GetByID(ctx, in.PostID, in.UserID)
	if err != nil {
		return nil, err
	}

	if post.UserID != in.UserID {
		return nil, models.NewUnauthorizedError("You can only update your own posts")
	}

	if in.Title != "" {
		post.Title = in.Title
	}
	if in.Content != "" {
		post.Content = in.Content
	}
	if in.ImageURL != "" {
		post.ImageURL = in.ImageURL
		post.ImageHash = extractImageHash(in.ImageURL)
	}
	if in.LinkURL != "" {
		post.LinkURL = in.LinkURL
	}
	if in.YoutubeURL != "" {
		post.YoutubeURL = in.YoutubeURL
	}

	if err := s.postRepo.Update(ctx, post); err != nil {
		return nil, err
	}
	return post, nil
}

func (s *PostService) DeletePost(ctx context.Context, in DeletePostInput) error {
	post, err := s.postRepo.GetByID(ctx, in.PostID, in.UserID)
	if err != nil {
		return err
	}

	if post.UserID != in.UserID {
		if s.isAdmin == nil {
			return models.NewUnauthorizedError("You can only delete your own posts")
		}
		admin, err := s.isAdmin(ctx, in.UserID)
		if err != nil {
			return err
		}
		if !admin {
			return models.NewUnauthorizedError("You can only delete your own posts")
		}
	}

	return s.postRepo.Delete(ctx, in.PostID)
}

func (s *PostService) ToggleLike(ctx context.Context, userID, postID uint) (*models.Post, error) {
	isLiked, err := s.postRepo.IsLiked(ctx, userID, postID)
	if err != nil {
		return nil, err
	}

	if isLiked {
		if err := s.postRepo.Unlike(ctx, userID, postID); err != nil {
			return nil, err
		}
	} else {
		if err := s.postRepo.Like(ctx, userID, postID); err != nil {
			return nil, err
		}
	}

	return s.getPostWithPollEnriched(ctx, postID, userID)
}

func (s *PostService) UnlikePost(ctx context.Context, userID, postID uint) (*models.Post, error) {
	if err := s.postRepo.Unlike(ctx, userID, postID); err != nil {
		return nil, err
	}
	return s.getPostWithPollEnriched(ctx, postID, userID)
}

func extractImageHash(rawURL string) string {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return ""
	}

	path := trimmed
	if parsed, err := url.Parse(trimmed); err == nil && parsed.Path != "" {
		path = parsed.Path
	}

	if strings.HasPrefix(path, "/media/i/") {
		parts := strings.Split(strings.TrimPrefix(path, "/media/i/"), "/")
		if len(parts) > 0 && isLikelySHA256(parts[0]) {
			return parts[0]
		}
	}
	if strings.HasPrefix(path, "/api/images/") {
		rest := strings.TrimPrefix(path, "/api/images/")
		parts := strings.Split(rest, "/")
		if len(parts) > 0 && isLikelySHA256(parts[0]) {
			return parts[0]
		}
	}
	return ""
}

func isLikelySHA256(v string) bool {
	if len(v) != 64 {
		return false
	}
	for _, r := range v {
		if (r < '0' || r > '9') && (r < 'a' || r > 'f') {
			return false
		}
	}
	return true
}
