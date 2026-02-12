// Package main provides a stress testing tool for the chat WebSocket server.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
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

	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt, syscall.SIGTERM)

	var wg sync.WaitGroup
	stopChan := make(chan struct{})

	// Start clients
	for i := 0; i < *clients; i++ {
		wg.Add(1)
		go runClient(*host, token, i, stopChan, &wg)
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

	resp, err := http.Post(loginURL, "application/json", bytes.NewBuffer(body))
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
	req, _ := http.NewRequest("POST", ticketURL, nil)
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
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

func runClient(host, token string, id int, stopChan <-chan struct{}, wg *sync.WaitGroup) {
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
	u := url.URL{Scheme: "ws", Host: host, Path: "/ws/1", RawQuery: "ticket=" + ticket}

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
				"content":      fmt.Sprintf("Stress test message from client %d", id),
				"message_type": "text",
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
