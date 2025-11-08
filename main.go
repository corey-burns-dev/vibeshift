package main

import (
	"log"
	"net/http"
)

var healthResponse = []byte(`{"status": "ok","service": "ai-chat"}`)
var pingResponse = []byte(`{"message": "pong"}`)

func healthCheckHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write(healthResponse)
}

func pingHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write(pingResponse)
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthCheckHandler)
	mux.HandleFunc("/ping", pingHandler)
	mux.Handle("/", http.NotFoundHandler())
	log.Println("Server starting on port :8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}
