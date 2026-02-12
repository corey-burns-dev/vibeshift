# Local AI Queue Performance & Capacity Planning

Understanding exactly what your local LLM can handle and how to design queues around it.

---

## 🎯 Quick Answer: Performance Numbers

**Llama 3.1 8B on a Good GPU (RTX 3080/4070 level):**

| Metric | Value |
|--------|-------|
| **Tokens per second** | 50-100 tokens/s |
| **Average response time** | 1-3 seconds |
| **Concurrent requests** | 1 (sequential by default) |
| **VRAM usage** | ~6GB |
| **Requests per minute** | ~20-40 |
| **Requests per hour** | ~1,200-2,400 |

**What this means practically:**
- ✅ Can handle moderation checks during post creation (1-2s delay)
- ✅ Can process 100-200 posts/hour for batch scanning
- ✅ Can analyze site health every 6 hours easily
- ⚠️ Can't handle 1000 simultaneous moderation requests
- ⚠️ Need smart queuing for high-traffic spikes

---

## 📊 Real-World Capacity Analysis

### Scenario 1: Small/Medium Site (Your Likely Case)

**Your probable stats:**
- 100-500 active users
- 50-200 posts/day
- 200-500 comments/day
- Peak traffic: 10-20 posts/hour

**AI workload:**
```
Moderation checks per hour (peak): 20-30
Time per check: 2 seconds
Total AI time needed: 40-60 seconds per hour
Utilization: ~1-2%
```

**Verdict: Massive overcapacity!** ✅

You can handle this easily with a simple queue.

---

### Scenario 2: Growing Site

**Stats:**
- 1,000-5,000 active users
- 500-2,000 posts/day
- 2,000-5,000 comments/day
- Peak: 50-100 posts/hour

**AI workload:**
```
Moderation checks per hour (peak): 100-150
Time per check: 2 seconds
Total AI time: 200-300 seconds per hour
Utilization: ~5-8%
```

**Verdict: Still very comfortable** ✅

---

### Scenario 3: Large Site (Future Planning)

**Stats:**
- 10,000+ active users
- 5,000+ posts/day
- 20,000+ comments/day
- Peak: 200-300 posts/hour

**AI workload:**
```
Moderation checks per hour (peak): 300-400
Time per check: 2 seconds
Total AI time: 600-800 seconds per hour
Utilization: ~16-22%
```

**Verdict: Need queue optimization** ⚠️

This is where you'd implement smart batching and prioritization.

---

## 🔧 Queue System Design

### Option 1: Simple FIFO Queue (Recommended to Start)

**For most use cases, this is perfect:**

```python
# ai-service/queue.py
import queue
import threading
import time

class AIQueue:
    def __init__(self):
        self.queue = queue.Queue()
        self.processing = False
        self.start_worker()
    
    def start_worker(self):
        """Single worker thread processes queue"""
        def worker():
            while True:
                try:
                    task = self.queue.get(timeout=1)
                    self.process_task(task)
                    self.queue.task_done()
                except queue.Empty:
                    continue
        
        thread = threading.Thread(target=worker, daemon=True)
        thread.start()
    
    def add_task(self, task_type, data, callback):
        """Add task to queue"""
        self.queue.put({
            'type': task_type,
            'data': data,
            'callback': callback,
            'timestamp': time.time()
        })
    
    def process_task(self, task):
        """Process one task"""
        if task['type'] == 'moderate':
            result = moderate_content(task['data']['text'])
        elif task['type'] == 'analyze_user':
            result = analyze_user_behavior(task['data']['user_id'])
        elif task['type'] == 'health_check':
            result = analyze_health()
        
        # Call callback with result
        task['callback'](result)
    
    def get_queue_size(self):
        return self.queue.qsize()
    
    def get_average_wait_time(self):
        # Track and return average wait time
        pass

# Global queue instance
ai_queue = AIQueue()
```

**Usage in your API:**

```python
from flask import Flask, request, jsonify
from queue_system import ai_queue

app = Flask(__name__)

@app.route('/moderate', methods=['POST'])
def moderate():
    text = request.json.get('text')
    
    # Check queue size
    queue_size = ai_queue.get_queue_size()
    
    if queue_size > 100:
        # Queue is backed up - maybe skip AI for now
        return jsonify({
            'queued': True,
            'estimated_wait': queue_size * 2  # ~2s per item
        })
    
    # Add to queue
    result = {'status': 'pending'}
    
    def callback(ai_result):
        result['status'] = 'complete'
        result['data'] = ai_result
    
    ai_queue.add_task('moderate', {'text': text}, callback)
    
    # Wait for result (with timeout)
    timeout = 5  # seconds
    start = time.time()
    while result['status'] == 'pending' and time.time() - start < timeout:
        time.sleep(0.1)
    
    if result['status'] == 'complete':
        return jsonify(result['data'])
    else:
        # Timeout - return default
        return jsonify({
            'safe': True,  # Default to safe if AI times out
            'queued': True,
            'note': 'Will be reviewed in background'
        })
```

**Performance:**
- Sequential processing: ~30-60 requests/minute
- Queue can hold thousands of items
- Simple, reliable, easy to monitor

---

### Option 2: Priority Queue (For High Traffic)

**When you have different priorities:**

```python
import heapq
import time

class PriorityAIQueue:
    def __init__(self):
        self.queue = []
        self.counter = 0  # For stable ordering
        self.lock = threading.Lock()
        self.start_worker()
    
    def add_task(self, task_type, data, callback, priority=1):
        """
        Priority levels:
        0 = Critical (auto-moderation of new posts)
        1 = High (ban requests, admin actions)
        2 = Medium (background scans)
        3 = Low (health checks, analytics)
        """
        with self.lock:
            heapq.heappush(self.queue, (
                priority,
                self.counter,
                {
                    'type': task_type,
                    'data': data,
                    'callback': callback,
                    'timestamp': time.time()
                }
            ))
            self.counter += 1
    
    def get_next_task(self):
        """Get highest priority task"""
        with self.lock:
            if self.queue:
                return heapq.heappop(self.queue)[2]
        return None
```

**Usage:**

```python
# Critical: User posting content - needs fast response
ai_queue.add_task('moderate', data, callback, priority=0)

# High: Admin reviewing ban request - important but not blocking user
ai_queue.add_task('review_ban', data, callback, priority=1)

# Medium: Nightly content scan - can wait
ai_queue.add_task('scan_content', data, callback, priority=2)

# Low: Health check - informational only
ai_queue.add_task('health_check', data, callback, priority=3)
```

---

### Option 3: Batch Processing (For Max Throughput)

**When you can group similar tasks:**

```python
class BatchAIQueue:
    def __init__(self, batch_size=10, max_wait=2.0):
        self.batch_size = batch_size
        self.max_wait = max_wait
        self.pending = []
        self.lock = threading.Lock()
        self.start_batch_worker()
    
    def start_batch_worker(self):
        def worker():
            while True:
                time.sleep(0.5)  # Check every 500ms
                
                with self.lock:
                    if not self.pending:
                        continue
                    
                    # Process batch if:
                    # 1. We have enough items, or
                    # 2. Oldest item is too old
                    should_process = (
                        len(self.pending) >= self.batch_size or
                        time.time() - self.pending[0]['timestamp'] > self.max_wait
                    )
                    
                    if should_process:
                        batch = self.pending[:self.batch_size]
                        self.pending = self.pending[self.batch_size:]
                        self.process_batch(batch)
        
        threading.Thread(target=worker, daemon=True).start()
    
    def process_batch(self, batch):
        """Process multiple items at once"""
        if batch[0]['type'] == 'moderate':
            # Combine all texts into one prompt
            texts = [item['data']['text'] for item in batch]
            
            prompt = f"""Moderate these {len(texts)} posts. For each, respond with JSON:
            
Post 1: {texts[0]}
Post 2: {texts[1]}
...

Return array of results: [{{"safe": true/false, "violations": [...]}}, ...]
"""
            
            results = query_ollama_batch(prompt)
            
            # Call each callback with its result
            for i, item in enumerate(batch):
                item['callback'](results[i])
```

**Benefit:**
- Can process 10 items in ~3 seconds instead of 10×2=20 seconds
- 3-4x throughput improvement
- Good for background scanning

---

## ⚡ Performance Optimization Strategies

### 1. Cache Common Checks

```python
import hashlib
from functools import lru_cache

class CachedModerator:
    def __init__(self):
        self.cache = {}
    
    def moderate(self, text):
        # Hash the content
        content_hash = hashlib.sha256(text.encode()).hexdigest()
        
        # Check cache
        if content_hash in self.cache:
            return self.cache[content_hash]
        
        # Call AI
        result = moderate_content(text)
        
        # Cache result (with TTL)
        self.cache[content_hash] = result
        
        return result

# If someone posts the same spam 10 times, only call AI once!
```

### 2. Fast-Path for Obvious Cases

```python
def smart_moderate(text):
    """Skip AI for obvious safe/unsafe content"""
    
    # Fast path: Very short content
    if len(text) < 10:
        return {'safe': True, 'fast_path': True}
    
    # Fast path: Known bad words (regex)
    if contains_obvious_slurs(text):
        return {
            'safe': False,
            'violations': ['hate_speech'],
            'fast_path': True
        }
    
    # Fast path: Repeated character spam
    if is_obvious_spam(text):
        return {
            'safe': False,
            'violations': ['spam'],
            'fast_path': True
        }
    
    # Needs AI analysis
    return ai_moderate(text)
```

**Performance gain:**
- ~50% of content can skip AI
- Those items process in <10ms instead of 2s
- AI queue stays clearer for complex cases

### 3. Async Processing for Non-Blocking

```python
from fastapi import FastAPI, BackgroundTasks

app = FastAPI()

@app.post('/posts/create')
async def create_post(
    content: str,
    user_id: int,
    background_tasks: BackgroundTasks
):
    # Fast-path check
    quick_check = smart_moderate(content)
    
    if not quick_check['safe'] and quick_check.get('fast_path'):
        # Definitely bad - reject immediately
        return {'error': 'Content violates guidelines'}
    
    if quick_check.get('fast_path') and quick_check['safe']:
        # Definitely safe - create immediately
        post = create_post_in_db(content, user_id)
        return {'post': post}
    
    # Borderline - create post but flag for AI review
    post = create_post_in_db(content, user_id, pending_review=True)
    
    # AI check in background
    background_tasks.add_task(
        deep_ai_check,
        post_id=post.id,
        content=content
    )
    
    return {'post': post, 'pending_review': True}

async def deep_ai_check(post_id, content):
    """Run AI check in background"""
    result = await ai_moderate(content)
    
    if not result['safe']:
        # Remove post and notify user
        remove_post(post_id)
        notify_user("Your post was removed after review")
```

**User experience:**
- Post appears immediately (fast!)
- AI checks it within 2-3 seconds
- If bad, gets removed quickly
- User doesn't wait for AI

---

## 📈 Scaling Strategies

### When You Outgrow Single GPU

**Option 1: Multiple Ollama Instances**

```yaml
# docker-compose.yml
services:
  ollama-1:
    image: ollama/ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              device_ids: ['0']  # First GPU
              capabilities: [gpu]
  
  ollama-2:
    image: ollama/ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              device_ids: ['1']  # Second GPU (if you have it)
              capabilities: [gpu]
  
  ai-service:
    # Round-robin between ollama instances
    environment:
      - OLLAMA_URLS=http://ollama-1:11434,http://ollama-2:11434
```

**Load balancer:**

```python
class LoadBalancedAI:
    def __init__(self, urls):
        self.urls = urls
        self.current = 0
    
    def get_next_url(self):
        url = self.urls[self.current]
        self.current = (self.current + 1) % len(self.urls)
        return url
    
    def query(self, prompt):
        url = self.get_next_url()
        return requests.post(f"{url}/api/generate", json={
            'model': 'llama3.1:8b',
            'prompt': prompt,
            'stream': False
        })
```

**Capacity: 2x-3x throughput**

---

**Option 2: Smaller Model for Simple Tasks**

```python
class TieredAI:
    """Use different models based on complexity"""
    
    def moderate(self, text):
        # Simple check with tiny model (1-2GB VRAM)
        quick_result = self.query_model('phi-3-mini', f"Is this safe? {text[:200]}")
        
        if quick_result['confidence'] > 0.9:
            # High confidence - use this result
            return quick_result
        
        # Low confidence - use bigger model
        return self.query_model('llama3.1:8b', f"Detailed analysis: {text}")
    
    def query_model(self, model, prompt):
        # ...
```

**Models you could run simultaneously:**
- Phi-3 Mini (3.8B) - 2GB VRAM - Fast simple checks
- Llama 3.1 8B - 6GB VRAM - Complex analysis
- **Total: 8GB VRAM - can run both!**

---

**Option 3: Cloud Burst for Spikes**

```python
class HybridAI:
    """Use local AI normally, cloud for spikes"""
    
    def moderate(self, text):
        queue_size = ai_queue.get_queue_size()
        
        if queue_size < 50:
            # Normal - use local
            return local_ai.moderate(text)
        else:
            # Backed up - use cloud API
            return anthropic_api.moderate(text)
```

**Cost:**
- Normal traffic: $0 (local)
- Spike traffic: $0.01-0.02 per request (cloud)
- Total: Maybe $5-10/month for spikes

---

## 🎯 Recommended Setup by Traffic Level

### Small Site (<1K active users)

```python
# Simple FIFO queue
# Single Llama 3.1 8B instance
# No special optimization needed

Queue capacity: 1000+ items
Processing rate: 30-60/minute
Expected load: <5/minute
Headroom: 10x+
```

**Cost: $0**
**Complexity: Low**
**Performance: Excellent**

---

### Medium Site (1K-10K active users)

```python
# Priority queue
# Fast-path optimization
# Caching for duplicates

Queue capacity: 5000+ items
Processing rate: 40-80/minute (with optimizations)
Expected load: 10-30/minute
Headroom: 3-5x
```

**Cost: $0**
**Complexity: Medium**
**Performance: Good**

---

### Large Site (10K+ active users)

```python
# Priority queue + batching
# Multiple models (tiered)
# Cloud burst for spikes
# Aggressive caching

Queue capacity: 10000+ items
Processing rate: 100-200/minute
Expected load: 50-100/minute
Headroom: 2-3x
```

**Cost: $10-50/month (for cloud burst)**
**Complexity: High**
**Performance: Scales well**

---

## 📊 Monitoring Your Queue

**Track these metrics:**

```python
class QueueMetrics:
    def __init__(self):
        self.requests_processed = 0
        self.total_wait_time = 0
        self.max_queue_size = 0
    
    def log_request(self, wait_time, queue_size):
        self.requests_processed += 1
        self.total_wait_time += wait_time
        self.max_queue_size = max(self.max_queue_size, queue_size)
    
    def get_stats(self):
        return {
            'requests_per_minute': self.requests_processed / 60,
            'avg_wait_time': self.total_wait_time / self.requests_processed,
            'max_queue_size': self.max_queue_size,
            'p95_wait_time': self.calculate_p95()
        }
```

**Alert if:**
- Queue size > 100 (getting backed up)
- Average wait time > 5s (too slow)
- Requests per minute approaching capacity (need scaling)

---

## 💡 Real-World Example: Content Moderation Flow

```python
def moderate_post_with_queue(content, user_id):
    """Complete flow with smart queueing"""
    
    # Step 1: Fast-path checks (~10ms)
    quick_check = fast_path_moderate(content)
    if quick_check['definitive']:
        return quick_check['result']
    
    # Step 2: Check cache (~1ms)
    cached = check_cache(content)
    if cached:
        return cached
    
    # Step 3: Check queue size
    queue_size = ai_queue.get_queue_size()
    
    if queue_size > 100:
        # Queue backed up - async review
        create_post(content, user_id, pending=True)
        ai_queue.add_task('moderate', content, 
                         callback=lambda r: handle_late_review(r),
                         priority=2)  # Lower priority
        return {'posted': True, 'pending_review': True}
    
    # Step 4: Normal AI check (2-3s)
    result = ai_queue.process_sync('moderate', content, priority=0)
    
    # Step 5: Cache result
    cache_result(content, result)
    
    return result
```

**Performance:**
- 50% skip AI entirely (fast-path) - <10ms
- 30% use cache - <1ms
- 15% normal AI - 2-3s
- 5% async review - instant post, reviewed later

**Average response time: ~500ms**
**AI utilization: ~20% of theoretical max**

---

## 🎯 Summary & Recommendations

**Your Situation (Most Likely):**
- Small/medium site
- <100 posts/hour peak
- Good GPU (6GB+ VRAM)

**Recommendation:**
1. Start with simple FIFO queue
2. Add fast-path optimization
3. Monitor queue size and wait times
4. If queue ever backs up, add priority levels

**You'll be fine with:**
- Single Llama 3.1 8B instance
- Simple Python queue
- 90%+ headroom for growth

**When to worry:**
- Queue consistently >20 items
- Wait times >3 seconds average
- Processing <30 req/minute
- Then optimize with batching/caching

**Bottom line:** Your local GPU can easily handle a site with thousands of users. You're overthinking it (in a good way!). Start simple, monitor, scale when needed. 🎯
