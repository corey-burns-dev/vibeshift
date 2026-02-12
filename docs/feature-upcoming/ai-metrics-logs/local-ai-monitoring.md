# Local AI Monitoring with Your Own GPU

You're absolutely right - you don't need cloud APIs! Let's use your local GPU for monitoring. This is actually BETTER and CHEAPER.

---

## 🎯 Why Local is Better for You

**Advantages:**
- ✅ **Zero API costs** - Run unlimited queries
- ✅ **No data leaves your server** - Total privacy
- ✅ **Faster responses** - No network latency
- ✅ **No rate limits** - Check as often as you want
- ✅ **Works offline** - No internet dependency

**Your Setup:**
- Local server with good GPU ✓
- Already running monitoring stack ✓
- Want simple, automated monitoring ✓

**Perfect use case for local LLM!**

---

## 🚀 Recommended Approach: Ollama + Llama 3.1 8B

### Why This Stack?

**Ollama:**
- Dead simple to install and run
- Manages models automatically
- REST API built-in
- Runs as a service
- Very lightweight

**Llama 3.1 8B:**
- Great at log analysis and summarization
- Fits easily in 6-8GB VRAM
- Fast inference (perfect for monitoring)
- Good at following instructions
- Free and unrestricted use

**Alternative models:**
- Mistral 7B (also excellent)
- Gemma 2 9B (if you have more VRAM)
- Qwen 2.5 7B (great at code/structured data)

---

## 📦 Step 1: Install Ollama (2 minutes)

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama service
sudo systemctl start ollama
sudo systemctl enable ollama

# Pull the model (one-time, ~4.7GB download)
ollama pull llama3.1:8b

# Test it
ollama run llama3.1:8b "Hello, can you analyze logs?"
```

**That's it!** Ollama is now running on `http://localhost:11434`

---

## 🔧 Step 2: Simplified Monitoring Script

Since you're running locally, we can make this MUCH simpler:

```python
#!/usr/bin/env python3
# scripts/local-ai-monitor.py

import requests
import json
from datetime import datetime, timedelta
import subprocess

OLLAMA_URL = "http://localhost:11434/api/generate"
PROMETHEUS_URL = "http://localhost:9090"
LOKI_URL = "http://localhost:3100"

def query_ollama(prompt, model="llama3.1:8b"):
    """Query local Ollama instance"""
    response = requests.post(
        OLLAMA_URL,
        json={
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.3,  # Lower = more focused
                "num_predict": 1000   # Max tokens
            }
        }
    )
    return response.json()['response']

def get_prometheus_metrics():
    """Fetch key metrics from Prometheus"""
    metrics = {}
    
    queries = {
        "request_rate": "rate(http_requests_total[5m])",
        "error_rate": "rate(http_requests_total{status=~'5..'}[5m])",
        "p95_latency": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
        "active_websockets": "websocket_connections_active",
        "memory_usage": "container_memory_usage_bytes{name='sanctum-backend'}",
        "cpu_usage": "rate(container_cpu_usage_seconds_total{name='sanctum-backend'}[5m])",
        "db_connections": "pg_stat_database_numbackends"
    }
    
    for name, query in queries.items():
        try:
            response = requests.get(
                f"{PROMETHEUS_URL}/api/v1/query",
                params={"query": query}
            )
            result = response.json()['data']['result']
            if result:
                metrics[name] = result[0]['value'][1]
            else:
                metrics[name] = "N/A"
        except:
            metrics[name] = "Error fetching"
    
    return metrics

def get_recent_errors():
    """Fetch recent errors from Loki"""
    end = datetime.now()
    start = end - timedelta(hours=1)
    
    try:
        response = requests.get(
            f"{LOKI_URL}/loki/api/v1/query_range",
            params={
                "query": '{job="sanctum-backend"} |= "ERROR"',
                "start": int(start.timestamp() * 1e9),
                "end": int(end.timestamp() * 1e9),
                "limit": 20
            }
        )
        
        logs = []
        for result in response.json()['data']['result']:
            for value in result['values']:
                logs.append(value[1])
        
        return "\n".join(logs) if logs else "No errors in last hour"
    except:
        return "Could not fetch logs"

def get_system_stats():
    """Get basic system stats"""
    try:
        # Docker stats
        stats = subprocess.check_output(
            "docker stats --no-stream --format 'table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}'",
            shell=True
        ).decode()
        return stats
    except:
        return "Could not fetch Docker stats"

def analyze_health():
    """Main monitoring function"""
    print("🔍 Gathering metrics...")
    
    # Collect data
    metrics = get_prometheus_metrics()
    errors = get_recent_errors()
    system = get_system_stats()
    
    # Build prompt for local LLM
    prompt = f"""You are a DevOps engineer monitoring the Sanctum social platform.
Analyze the following metrics and provide a concise health report.

Current Metrics (last 5 minutes):
- Request Rate: {metrics.get('request_rate', 'N/A')} req/s
- Error Rate: {metrics.get('error_rate', 'N/A')} errors/s
- P95 Latency: {metrics.get('p95_latency', 'N/A')}s
- Active WebSockets: {metrics.get('active_websockets', 'N/A')}
- Memory Usage: {metrics.get('memory_usage', 'N/A')} bytes
- CPU Usage: {metrics.get('cpu_usage', 'N/A')} %
- DB Connections: {metrics.get('db_connections', 'N/A')}

Recent Errors (last hour):
{errors}

System Stats:
{system}

Provide a brief report with:
1. Overall Status (HEALTHY/WARNING/CRITICAL)
2. Any Issues Found (list or "None")
3. Recommendations (if any)

Keep it concise and actionable."""

    print("🤖 Analyzing with local LLM...")
    
    # Get analysis from local LLM
    analysis = query_ollama(prompt)
    
    # Format and display
    report = f"""
{'='*60}
SANCTUM MONITORING REPORT
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
{'='*60}

{analysis}

{'='*60}
"""
    
    print(report)
    
    # Save report
    with open(f"/tmp/sanctum-report-{datetime.now().strftime('%Y%m%d_%H%M')}.txt", "w") as f:
        f.write(report)
    
    # Optional: Send to Discord/Slack if issues detected
    if "CRITICAL" in analysis.upper() or "WARNING" in analysis.upper():
        send_notification(report)
    
    return report

def send_notification(report):
    """Send notification if configured"""
    import os
    webhook = os.getenv("DISCORD_WEBHOOK_URL")
    if webhook:
        requests.post(webhook, json={"content": f"```\n{report}\n```"})

if __name__ == "__main__":
    analyze_health()
```

**Make it executable:**
```bash
chmod +x scripts/local-ai-monitor.py
```

**Test it:**
```bash
python3 scripts/local-ai-monitor.py
```

---

## ⏰ Step 3: Schedule It

```bash
# Add to crontab
crontab -e

# Check every hour
0 * * * * cd /path/to/sanctum && /usr/bin/python3 scripts/local-ai-monitor.py

# Or every 30 minutes
*/30 * * * * cd /path/to/sanctum && /usr/bin/python3 scripts/local-ai-monitor.py

# Or every 6 hours (recommended to start)
0 */6 * * * cd /path/to/sanctum && /usr/bin/python3 scripts/local-ai-monitor.py
```

---

## 🎯 Even Simpler: Docker Compose Integration

Add Ollama directly to your compose stack:

```yaml
# Add to your compose.yml
services:
  # ... your existing services ...
  
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    volumes:
      - ollama-data:/root/.ollama
    ports:
      - "11434:11434"
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    restart: unless-stopped

  # AI Monitoring Service (runs the script)
  ai-monitor:
    build:
      context: .
      dockerfile: Dockerfile.monitor
    depends_on:
      - ollama
      - prometheus
      - loki
    environment:
      - OLLAMA_URL=http://ollama:11434
      - PROMETHEUS_URL=http://prometheus:9090
      - LOKI_URL=http://loki:3100
    volumes:
      - ./scripts:/scripts
    restart: unless-stopped

volumes:
  ollama-data:
```

**Dockerfile.monitor:**
```dockerfile
FROM python:3.11-slim

RUN pip install requests

COPY scripts/local-ai-monitor.py /app/monitor.py

# Run every hour
CMD while true; do \
    python /app/monitor.py; \
    sleep 3600; \
done
```

**Now it's fully automated and self-contained!**

---

## 🔥 Advanced: Interactive Monitoring Chat

Want to ask questions? Create a simple web interface:

```python
# scripts/monitor-chat.py
#!/usr/bin/env python3

from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

OLLAMA_URL = "http://localhost:11434/api/generate"

@app.route('/ask', methods=['POST'])
def ask():
    question = request.json.get('question')
    
    # Fetch current metrics
    metrics = get_current_metrics()
    
    # Build context-aware prompt
    prompt = f"""You are monitoring the Sanctum platform. Current metrics:
{metrics}

User question: {question}

Answer specifically based on the current data."""
    
    # Query local LLM
    response = requests.post(
        OLLAMA_URL,
        json={"model": "llama3.1:8b", "prompt": prompt, "stream": False}
    )
    
    return jsonify({"answer": response.json()['response']})

if __name__ == '__main__':
    app.run(port=5000)
```

**Usage:**
```bash
# Start the chat server
python3 scripts/monitor-chat.py

# Ask questions via curl
curl -X POST http://localhost:5000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Is the site slow right now?"}'

curl -X POST http://localhost:5000/ask \
  -d '{"question": "Why are there errors on /api/posts?"}'
```

**Or create a simple web UI:**
```html
<!-- monitoring-chat.html -->
<!DOCTYPE html>
<html>
<head>
    <title>Sanctum Monitor Chat</title>
    <style>
        body { font-family: monospace; max-width: 800px; margin: 50px auto; }
        #chat { height: 400px; overflow-y: scroll; border: 1px solid #ccc; padding: 10px; }
        #input { width: 100%; padding: 10px; margin-top: 10px; }
    </style>
</head>
<body>
    <h1>🤖 Sanctum AI Monitor</h1>
    <div id="chat"></div>
    <input id="input" placeholder="Ask about your site's health..." />
    
    <script>
        const chat = document.getElementById('chat');
        const input = document.getElementById('input');
        
        input.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                const question = input.value;
                chat.innerHTML += `<p><strong>You:</strong> ${question}</p>`;
                input.value = '';
                
                const response = await fetch('http://localhost:5000/ask', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({question})
                });
                
                const data = await response.json();
                chat.innerHTML += `<p><strong>AI:</strong> ${data.answer}</p>`;
                chat.scrollTop = chat.scrollHeight;
            }
        });
    </script>
</body>
</html>
```

---

## 📊 Alternative: No Code at All - Use Langfuse

If you want even simpler, use an observability tool built for LLMs:

```yaml
# Add to compose.yml
services:
  langfuse:
    image: langfuse/langfuse:latest
    environment:
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/langfuse
    ports:
      - "3001:3000"
```

**Then wrap your monitoring in Langfuse:**
```python
from langfuse import Langfuse

langfuse = Langfuse()

# Automatically logs all LLM calls
@langfuse.observe()
def analyze_health():
    # Your monitoring code
    pass
```

**You get:**
- Dashboard of all LLM calls
- Token usage tracking
- Performance metrics
- Cost tracking (even for local!)

---

## 🎛️ Model Comparison for Monitoring

| Model | VRAM | Speed | Quality | Best For |
|-------|------|-------|---------|----------|
| **Llama 3.1 8B** | 6GB | Fast | Great | General monitoring ⭐ |
| **Mistral 7B** | 6GB | Faster | Good | Quick checks |
| **Gemma 2 9B** | 8GB | Medium | Great | Detailed analysis |
| **Qwen 2.5 7B** | 6GB | Fast | Great | Code/structured data |
| **Llama 3.1 70B** | 40GB+ | Slow | Excellent | Critical analysis only |

**Recommendation:** Start with **Llama 3.1 8B** - perfect balance.

---

## 💡 Super Simple Daily Digest

Want just a morning summary? Ultra-simple version:

```bash
#!/bin/bash
# scripts/morning-digest.sh

# Collect yesterday's stats
ERRORS=$(curl -s "http://localhost:9090/api/v1/query?query=increase(http_errors_total[24h])" | jq -r '.data.result[0].value[1]')
REQUESTS=$(curl -s "http://localhost:9090/api/v1/query?query=increase(http_requests_total[24h])" | jq -r '.data.result[0].value[1]')

# Ask local LLM for summary
PROMPT="Yesterday's stats: $REQUESTS total requests, $ERRORS errors. Give me a one-line health summary."

SUMMARY=$(curl -s http://localhost:11434/api/generate -d "{
  \"model\": \"llama3.1:8b\",
  \"prompt\": \"$PROMPT\",
  \"stream\": false
}" | jq -r '.response')

# Send to Discord
curl -X POST "$DISCORD_WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -d "{\"content\": \"☀️ **Morning Digest**\n$SUMMARY\"}"
```

**Schedule for 8 AM:**
```bash
0 8 * * * /path/to/scripts/morning-digest.sh
```

---

## 🔋 Resource Usage

**Ollama + Llama 3.1 8B:**
- VRAM: ~6GB during inference
- Idle VRAM: ~2GB (model loaded)
- CPU: Minimal
- Response time: 1-3 seconds (local network)

**Tips to reduce usage:**
1. Unload model when not in use: `ollama stop llama3.1:8b`
2. Use smaller model: `ollama pull mistral:7b`
3. Quantized models: `ollama pull llama3.1:8b-q4_0` (uses less VRAM)

---

## 📝 Complete Setup (10 minutes)

```bash
# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. Pull model
ollama pull llama3.1:8b

# 3. Install Python deps
pip install requests

# 4. Create monitoring script
nano scripts/local-ai-monitor.py
# (paste the script from above)

# 5. Make executable
chmod +x scripts/local-ai-monitor.py

# 6. Test it
python3 scripts/local-ai-monitor.py

# 7. Schedule it
crontab -e
# Add: 0 */6 * * * cd /path/to/sanctum && python3 scripts/local-ai-monitor.py

# 8. Optional: Set up notifications
export DISCORD_WEBHOOK_URL="your-webhook-here"
```

**Done!** You now have free, unlimited, local AI monitoring.

---

## 🆚 Comparison: Cloud vs Local

| Feature | Cloud (Anthropic) | Local (Ollama) |
|---------|------------------|----------------|
| **Cost** | $3-15/month | $0 (electricity) |
| **Speed** | 2-5 seconds | 1-3 seconds |
| **Privacy** | Data sent to API | 100% local |
| **Quality** | Excellent | Very Good |
| **Limits** | Rate limited | Unlimited |
| **Setup** | 2 minutes | 10 minutes |
| **Offline** | ❌ Requires internet | ✅ Works offline |
| **VRAM** | None | 6GB |

**For your setup:** Local is the clear winner! ✅

---

## 🎯 Recommended Configuration

**Start with this:**
```bash
# 1. Ollama running as service
sudo systemctl enable ollama

# 2. Morning digest (lightweight)
0 8 * * * /path/to/morning-digest.sh

# 3. Full analysis twice a day
0 9,21 * * * /path/to/local-ai-monitor.py

# 4. Optional: Interactive chat for ad-hoc queries
python3 scripts/monitor-chat.py
```

**This gives you:**
- Morning summary in Discord
- Detailed analysis morning & evening
- Ability to ask questions anytime
- **Total cost: $0**

---

## 🚀 Next Level: Automatic Issue Detection

```python
# Add to local-ai-monitor.py

def detect_anomalies():
    """Use LLM to detect anomalies by comparing to historical data"""
    
    current = get_prometheus_metrics()
    yesterday = get_historical_metrics(hours=24)
    last_week = get_historical_metrics(hours=168)
    
    prompt = f"""Compare these metrics and identify anomalies:

Current (now): {current}
Yesterday (same time): {yesterday}
Last week (same time): {last_week}

List any metrics that are significantly different (>50% change) and explain why it might matter.
Keep it brief - just the concerning changes."""

    return query_ollama(prompt)
```

---

## 💬 Summary

**You don't need cloud APIs at all!**

**Your setup:**
1. Install Ollama (1 command)
2. Download Llama 3.1 8B (1 command)
3. Run monitoring script (works out of the box)
4. Schedule with cron

**You get:**
- Unlimited queries
- Zero cost
- Full privacy
- Faster responses
- Works offline
- Can ask questions anytime

**Much better than cloud for your use case!**

Want me to help you set up any specific part of this?
