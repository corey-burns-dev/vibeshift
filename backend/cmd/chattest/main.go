// Package main provides a stress testing tool for the chat WebSocket server.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

// Metrics tracks the test results
type Metrics struct {
	ConnectionsAttempted int64
	ConnectionsSuccess   int64
	ConnectionsFailed    int64
	MessagesSent         int64
	MessagesReceived     int64
	Errors               int64
}

var metrics Metrics

func main() {
	host := flag.String("host", "localhost:8080", "API server host")
	email := flag.String("email", "admin@example.com", "Test user email")
	password := flag.String("password", "password123", "Test user password")
	wsPath := flag.String("ws-path", "/api/ws/chat", "WebSocket path")
	conversationIDFlag := flag.Uint("conversation-id", 0, "Conversation ID to send chat messages to")
	clients := flag.Int("clients", 50, "Number of concurrent clients")
	duration := flag.Duration("duration", 30*time.Second, "Test duration")
	flag.Parse()

	log.Printf("🚀 Starting Chat Stress Test")
	log.Printf("Target: %s", *host)
	log.Printf("Clients: %d", *clients)
	log.Printf("Duration: %v", *duration)

	// Get a token first
	token, err := login(*host, *email, *password)
	if err != nil {
		log.Fatalf("❌ Login failed: %v", err)
	}
	log.Printf("✅ Logged in successfully")
	conversationID := uint(*conversationIDFlag)
	if conversationID == 0 {
		resolvedConversationID, err := ensureConversationWithRetry(*host, token, 12)
		if err != nil {
			log.Fatalf("❌ Conversation setup failed: %v", err)
		}
		conversationID = resolvedConversationID
	}
	log.Printf("✅ Using conversation ID: %d", conversationID)

	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt, syscall.SIGTERM)

	var wg sync.WaitGroup
	stopChan := make(chan struct{})

	// Start clients
	for i := 0; i < *clients; i++ {
		wg.Add(1)
		go runClient(*host, *wsPath, token, conversationID, i, stopChan, &wg)
		time.Sleep(50 * time.Millisecond) // Stagger connections to allow ticket issuance
	}

	// Wait for duration or interrupt
	select {
	case <-time.After(*duration):
		log.Println("⏱️  Test duration reached")
	case <-interrupt:
		log.Println("🛑 Interrupted by user")
	}

	close(stopChan)
	log.Println("Waiting for clients to disconnect...")
	wg.Wait()

	printMetrics()
}

func login(host, email, password string) (string, error) {
	loginURL := fmt.Sprintf("http://%s/api/auth/login", host)
	payload := map[string]string{
		"email":    email,
		"password": password,
	}
	body, _ := json.Marshal(payload)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "POST", loginURL, bytes.NewBuffer(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req) // #nosec G704 -- chattest is a dev CLI that intentionally calls user-provided host
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("login failed with status %d", resp.StatusCode)
	}

	var result struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	return result.Token, nil
}

func getTicket(host, token string) (string, error) {
	ticketURL := fmt.Sprintf("http://%s/api/ws/ticket", host)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "POST", ticketURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{}
	resp, err := client.Do(req) // #nosec G704 -- chattest is a dev CLI that intentionally calls user-provided host
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("ticket issuance failed with status %d", resp.StatusCode)
	}

	var result struct {
		Ticket string `json:"ticket"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	return result.Ticket, nil
}

func authRequest(method, rawURL, token string, body io.Reader) (*http.Response, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, method, rawURL, body)
	if err != nil {
		return nil, err
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return (&http.Client{}).Do(req) // #nosec G704 -- chattest is a dev CLI that intentionally calls user-provided host
}

func ensureConversation(host, token string) (uint, error) {
	joinedURL := fmt.Sprintf("http://%s/api/chatrooms/joined", host)
	resp, err := authRequest(http.MethodGet, joinedURL, token, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("chatrooms/joined failed with status %d", resp.StatusCode)
	}

	var joined []struct {
		ID uint `json:"id"`
	}
	if decodeErr := json.NewDecoder(resp.Body).Decode(&joined); decodeErr != nil {
		return 0, decodeErr
	}
	if len(joined) > 0 {
		return joined[0].ID, nil
	}

	allURL := fmt.Sprintf("http://%s/api/chatrooms", host)
	allResp, err := authRequest(http.MethodGet, allURL, token, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = allResp.Body.Close() }()
	if allResp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("chatrooms failed with status %d", allResp.StatusCode)
	}

	var allRooms []struct {
		ID uint `json:"id"`
	}
	if decodeErr := json.NewDecoder(allResp.Body).Decode(&allRooms); decodeErr != nil {
		return 0, decodeErr
	}
	if len(allRooms) == 0 {
		return 0, fmt.Errorf("no chatrooms available")
	}

	roomID := allRooms[0].ID
	joinURL := fmt.Sprintf("http://%s/api/chatrooms/%d/join", host, roomID)
	joinResp, err := authRequest(http.MethodPost, joinURL, token, bytes.NewBufferString("{}"))
	if err != nil {
		return 0, err
	}
	defer func() { _ = joinResp.Body.Close() }()
	if joinResp.StatusCode != http.StatusOK && joinResp.StatusCode != http.StatusCreated {
		return 0, fmt.Errorf("chatroom join failed with status %d", joinResp.StatusCode)
	}
	return roomID, nil
}

func ensureConversationWithRetry(host, token string, attempts int) (uint, error) {
	if attempts < 1 {
		attempts = 1
	}
	var lastErr error
	for i := 1; i <= attempts; i++ {
		id, err := ensureConversation(host, token)
		if err == nil {
			return id, nil
		}
		lastErr = err
		time.Sleep(time.Duration(i) * 500 * time.Millisecond)
	}
	return 0, fmt.Errorf("conversation setup failed after %d attempts: %w", attempts, lastErr)
}

func runClient(host, wsPath, token string, conversationID uint, id int, stopChan <-chan struct{}, wg *sync.WaitGroup) {
	defer wg.Done()
	atomic.AddInt64(&metrics.ConnectionsAttempted, 1)

	// Get a fresh ticket for this connection
	ticket, err := getTicket(host, token)
	if err != nil {
		atomic.AddInt64(&metrics.ConnectionsFailed, 1)
		atomic.AddInt64(&metrics.Errors, 1)
		return
	}

	// Build WS URL with ticket
	u := url.URL{Scheme: "ws", Host: host, Path: wsPath, RawQuery: "ticket=" + ticket}

	dialer := websocket.DefaultDialer
	c, resp, err := dialer.Dial(u.String(), nil)
	if err != nil {
		atomic.AddInt64(&metrics.ConnectionsFailed, 1)
		atomic.AddInt64(&metrics.Errors, 1)
		return
	}
	if resp != nil && resp.Body != nil {
		defer func() { _ = resp.Body.Close() }()
	}
	defer func() { _ = c.Close() }()

	atomic.AddInt64(&metrics.ConnectionsSuccess, 1)

	joinMsg, _ := json.Marshal(map[string]interface{}{
		"type":            "join",
		"conversation_id": conversationID,
	})
	if err := c.WriteMessage(websocket.TextMessage, joinMsg); err != nil {
		atomic.AddInt64(&metrics.Errors, 1)
		return
	}

	// Read loop
	go func() {
		for {
			_, _, err := c.ReadMessage()
			if err != nil {
				return
			}
			atomic.AddInt64(&metrics.MessagesReceived, 1)
		}
	}()

	ticker := time.NewTicker(time.Second * 5)
	defer ticker.Stop()

	for {
		select {
		case <-stopChan:
			_ = c.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
			return
		case <-ticker.C:
			msg := map[string]interface{}{
				"type":            "message",
				"conversation_id": conversationID,
				"content":         fmt.Sprintf("Stress test message from client %d", id),
			}
			msgJSON, _ := json.Marshal(msg)
			err := c.WriteMessage(websocket.TextMessage, msgJSON)
			if err != nil {
				atomic.AddInt64(&metrics.Errors, 1)
				return
			}
			atomic.AddInt64(&metrics.MessagesSent, 1)
		}
	}
}

func printMetrics() {
	log.Println("\n📊 Test Results")
	log.Println("===============")
	log.Printf("Connections Attempted: %d", atomic.LoadInt64(&metrics.ConnectionsAttempted))
	log.Printf("Connections Successful: %d", atomic.LoadInt64(&metrics.ConnectionsSuccess))
	log.Printf("Connections Failed: %d", atomic.LoadInt64(&metrics.ConnectionsFailed))
	log.Printf("Messages Sent: %d", atomic.LoadInt64(&metrics.MessagesSent))
	log.Printf("Messages Received: %d", atomic.LoadInt64(&metrics.MessagesReceived))
	log.Printf("Total Errors: %d", atomic.LoadInt64(&metrics.Errors))
}
