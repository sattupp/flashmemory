# ⚡ FlashMemory

<div align="center">

![Java](https://img.shields.io/badge/Java-17-orange?style=flat-square&logo=openjdk)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-3.2-green?style=flat-square&logo=springboot)
![Redis](https://img.shields.io/badge/Redis-7-red?style=flat-square&logo=redis)
![React](https://img.shields.io/badge/React-18-blue?style=flat-square&logo=react)
![WebSocket](https://img.shields.io/badge/WebSocket-STOMP-purple?style=flat-square)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker)

**A Redis-powered adaptive memory engine that stores, ranks, decays, and streams context in real time for users, teams, and AI agents.**

[Features](#-features) • [Use Cases](#-use-cases) • [Architecture](#-architecture) • [Quick Start](#-quick-start) • [API Reference](#-api-reference) • [How It Works](#-how-it-works)

</div>

---

## 🧠 What is FlashMemory?

Most apps use Redis as a dumb cache — store a key, get a key, expire a key. **FlashMemory makes Redis the core product.**

It is an intelligent memory layer where:
- Every piece of stored information has a **relevance score** that changes over time
- Data that is accessed frequently **rises** in relevance
- Data that is ignored **fades** automatically — like human memory
- All changes are **streamed live** to connected clients via WebSocket

Think of it as: **Redis + relevance scoring + memory decay + real-time updates**

```
"What should I remember about this user right now?"
→ FlashMemory answers that question intelligently.
```

---

## ✨ Features

| Feature | Description |
|---|---|
| **Priority-based storage** | Every memory has a priority (1–10) that influences its relevance score |
| **Automatic decay** | Background scheduler lowers scores over time — stale data fades out |
| **Smart retrieval** | Top-N memories ranked by recency × frequency × priority |
| **TTL expiry** | Memories auto-delete after configurable durations (5 min to 7 days) |
| **Tag filtering** | Store and query memories by tags using Redis Set intersection |
| **Real-time events** | Redis Pub/Sub → WebSocket pushes live updates to the dashboard |
| **Conflict resolution** | Three strategies: Latest Wins, Priority Wins, Manual Merge |
| **Namespace isolation** | Memories grouped by `user:id`, `team:name`, `agent:id`, `session:id` |
| **Capacity eviction** | Lowest-scoring memories auto-evicted when namespace hits capacity |
| **Live dashboard** | React UI showing memories, scores, and live event feed |

---

## 🎯 Use Cases

### 1. 🤖 AI Agent Working Memory
AI agents need short-term context that expires when a session ends.

```json
POST /api/memories
{
  "namespace": "agent:gpt-session-42",
  "value": "User is building a Spring Boot app, prefers Java 17, asked about Redis",
  "priority": 9,
  "ttlSeconds": 1800,
  "tags": ["context", "preferences"]
}
```

The agent queries `GET /api/memories/agent:gpt-session-42/top` before every
response to surface the most relevant context. Old context fades out automatically —
the agent never gets confused by stale information from hours ago.

---

### 2. 👤 Personalized User Context
Instead of re-fetching user preferences from a database on every request, store
them as memories with long TTLs. High-priority preferences (dark mode, language)
stay relevant longer than low-priority ones (last search term).

```json
POST /api/memories
{
  "namespace": "user:satya",
  "value": "Prefers dark mode UI",
  "priority": 9,
  "ttlSeconds": 604800,
  "tags": ["ui", "preference"]
}
```

Query — *"What does this user care about right now?"*
```
GET /api/memories/user:satya/top?limit=5
```

---

### 3. 👥 Team Decision Memory
Teams make decisions in chat tools that get buried in message history.
FlashMemory surfaces them when needed.

```json
POST /api/memories
{
  "namespace": "team:backend",
  "value": "Decided to use PostgreSQL over MongoDB for orders service — owner: Ravi",
  "priority": 10,
  "ttlSeconds": 2592000,
  "tags": ["decision", "database", "orders"]
}
```

Query — *"What are the current blockers?"*
```
GET /api/memories/team:backend/search?keyword=blocker
```

---

### 4. 🛒 Smart Session Cache
Instead of just caching what a user viewed, FlashMemory tracks *what matters* —
frequently accessed items score higher, ignored items fade out automatically.

```json
POST /api/memories
{
  "namespace": "session:checkout-abc123",
  "value": "User viewed iPhone 15 Pro three times — high purchase intent",
  "priority": 8,
  "ttlSeconds": 1800,
  "tags": ["product", "intent"]
}
```

Every retrieval increments `usageCount` and boosts the relevance score.
The recommendation engine always gets the *most relevant* session context.

---

### 5. 📋 Interview Preparation Tracker
```json
POST /api/memories
{
  "namespace": "user:satya:interview-prep",
  "value": "Weak area: System Design — CAP theorem, needs more practice",
  "priority": 9,
  "ttlSeconds": 2592000,
  "tags": ["weak-area", "system-design"]
}
```

Query before a study session: `GET /api/memories/user:satya:interview-prep/top`
→ Weak areas surface first. Strengths fade to the bottom naturally.

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT APPS                          │
│         Web App │ Mobile App │ AI Agent │ CLI               │
└──────────────────────────┬──────────────────────────────────┘
                           │  REST API / WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│              API GATEWAY  (Spring Boot :8080)                │
│         Auth · Rate Limiting · Routing · Validation         │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    MEMORY ENGINE                             │
│   Store    → Hash + Sorted Set + TTL + Tag indexes          │
│   Retrieve → ZREVRANGEBYSCORE → fetch Hashes → boost score  │
│   Conflict → LATEST_WINS / PRIORITY_WINS / MANUAL_MERGE     │
│   Evict    → ZPOPMIN when namespace hits capacity           │
└──────┬─────────────────────────────────┬────────────────────┘
       │                                 │
┌──────▼──────────────┐     ┌────────────▼───────────────────┐
│   REDIS DATA LAYER  │     │         EVENT BUS              │
│                     │     │                                │
│  Hash               │     │  Redis Pub/Sub                 │
│  flashmemory:       │     │  flashmemory:{ns}:events       │
│  {ns}:mem:{id}      │     │          │                     │
│                     │     │          ▼                     │
│  Sorted Set         │     │  RedisEventListener            │
│  flashmemory:       │     │  (Spring @Component)           │
│  {ns}:index         │     │          │                     │
│                     │     │          ▼                     │
│  Set  (tags)        │     │  WebSocket STOMP               │
│  flashmemory:       │     │  /topic/memories/{ns}          │
│  {ns}:tag:{tag}     │     │          │                     │
└─────────────────────┘     │          ▼                     │
                            │  React Dashboard :3000         │
                            └────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────────────┐
│                     DECAY WORKER                            │
│  @Scheduled every 30s · Recalculates scores                 │
│  Cleans stale Sorted Set entries · Publishes decay events   │
└─────────────────────────────────────────────────────────────┘
```

### Redis Key Design

| Purpose | Key Pattern | Redis Type |
|---|---|---|
| Memory data | `flashmemory:user:123:mem:abc` | Hash |
| Relevance index | `flashmemory:user:123:index` | Sorted Set |
| Tag index | `flashmemory:user:123:tag:java` | Set |
| Event channel | `flashmemory:user:123:events` | Pub/Sub channel |

### Relevance Score Formula

```
score = (priority / 10) × recency_factor × (1 + log(1 + usageCount))

where:
  recency_factor = 1 / (1 + hoursSinceCreated × 0.1)
```

| Scenario | Score |
|---|---|
| Just stored, priority 10, 0 accesses | 1.000 |
| 10 hours old, priority 10, 0 accesses | ~0.500 |
| 10 hours old, priority 10, accessed 5 times | ~0.895 |
| 48 hours old, priority 3, 0 accesses | ~0.058 |

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version | Check command |
|---|---|---|
| Java JDK | 17+ | `java -version` |
| Maven | 3.8+ | `mvn -version` |
| Node.js | 18+ | `node -version` |
| Docker | 20+ | `docker -version` |

---

### Option A — Docker Compose (One command)

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/flashmemory.git
cd flashmemory

# 2. Start everything (Redis + Backend + Frontend)
docker-compose up

# 3. Open the dashboard
open http://localhost:3000
```

All three services start with correct wiring automatically.

---

### Option B — Run Locally (Step by step)

#### Step 1 — Start Redis

```bash
# Using Docker
docker run -d \
  --name flashmemory-redis \
  -p 6379:6379 \
  redis:7-alpine

# Verify it's running
docker exec flashmemory-redis redis-cli ping
# Expected: PONG
```

> Already have Redis installed locally? Just run `redis-server` instead.

---

#### Step 2 — Start the Spring Boot Backend

```bash
# From the project root
mvn spring-boot:run
```

Expected output:
```
Started FlashMemoryApplication in 2.341 seconds
Tomcat started on port(s): 8080 (http)
```

Verify it works:
```bash
curl http://localhost:8080/api/memories/user:1/top
# Expected: {"memories":[],"total":0,"namespace":"user:1","averageScore":0.0}
```

**Custom Redis host:**
```bash
REDIS_HOST=your-redis-host REDIS_PORT=6379 mvn spring-boot:run
```

---

#### Step 3 — Start the React Frontend

```bash
cd frontend

# Install dependencies (first time only)
npm install

# Start dev server
npm run dev
```

Expected output:
```
  VITE v5.x.x  ready in 312 ms
  ➜  Local:   http://localhost:3000/
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

### Option C — Test with cURL only (No frontend)

```bash
# 1. Store a memory
curl -X POST http://localhost:8080/api/memories \
  -H "Content-Type: application/json" \
  -d '{
    "namespace": "user:1",
    "value": "I prefer dark mode",
    "priority": 8,
    "ttlSeconds": 86400,
    "tags": ["ui", "preference"]
  }'

# 2. Store another
curl -X POST http://localhost:8080/api/memories \
  -H "Content-Type: application/json" \
  -d '{
    "namespace": "user:1",
    "value": "Currently preparing for SDE-1 interviews",
    "priority": 9,
    "ttlSeconds": 604800,
    "tags": ["career", "interview"]
  }'

# 3. Get top memories (ranked by relevance)
curl http://localhost:8080/api/memories/user:1/top

# 4. Search by keyword
curl "http://localhost:8080/api/memories/user:1/search?keyword=interview"

# 5. Filter by tag
curl "http://localhost:8080/api/memories/user:1/top?tags=ui"
```

---

## 📡 API Reference

Base URL: `http://localhost:8080`

### POST `/api/memories` — Store a memory

**Request body:**
```json
{
  "namespace": "user:123",
  "value": "Prefers dark mode",
  "priority": 8,
  "ttlSeconds": 86400,
  "tags": ["ui", "preference"],
  "conflictStrategy": "LATEST_WINS"
}
```

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `namespace` | string | ✅ | — | Format: `user:id`, `team:name`, `agent:id` |
| `value` | string | ✅ | — | Max 10KB |
| `priority` | int | ❌ | 5 | Range: 1–10 |
| `ttlSeconds` | long | ❌ | 3600 | Range: 60–604800 |
| `tags` | string[] | ❌ | [] | For filtering |
| `conflictStrategy` | enum | ❌ | LATEST_WINS | `LATEST_WINS` \| `PRIORITY_WINS` \| `MANUAL_MERGE` |

**Response `201 Created`:**
```json
{
  "id": "3f9a2c1d-abcd-...",
  "namespace": "user:123",
  "value": "Prefers dark mode",
  "relevanceScore": 0.8,
  "priority": 8,
  "usageCount": 0,
  "ttlSeconds": 86400,
  "tags": ["ui", "preference"],
  "createdAt": "2026-05-12T10:30:00Z",
  "lastAccessedAt": "2026-05-12T10:30:00Z"
}
```

---

### GET `/api/memories/{namespace}/top` — Smart retrieval

```
GET /api/memories/user:123/top?limit=10&tags=ui,preference
```

| Param | Type | Default | Notes |
|---|---|---|---|
| `limit` | int | 10 | Capped at 100 |
| `tags` | string[] | — | AND logic — must have ALL listed tags |

Each retrieval **boosts** the memory: increments `usageCount` and raises relevance score.

---

### GET `/api/memories/{namespace}/search` — Keyword + tag search

```
GET /api/memories/user:123/search?keyword=dark&tags=ui&limit=20
```

---

### GET `/api/memories/{namespace}/{id}` — Single memory

```
GET /api/memories/user:123/3f9a2c1d-abcd-...
```

---

### DELETE `/api/memories/{namespace}/{id}` — Delete a memory

```
DELETE /api/memories/user:123/3f9a2c1d-abcd-...
```

---

### WebSocket — Real-time events

**Endpoint:** `ws://localhost:8080/ws` (SockJS + STOMP)

**Subscribe:**
```javascript
// Namespace-specific events
stompClient.subscribe('/topic/memories/user:123', (msg) => {
  const event = JSON.parse(msg.body);
  // { type, namespace, memoryId, memory, timestamp, details }
});

// All events — for dashboard
stompClient.subscribe('/topic/memories/all', callback);
```

**Event types:**

| Type | When fired |
|---|---|
| `MEMORY_ADDED` | New memory stored via POST |
| `MEMORY_BOOSTED` | Memory retrieved — usageCount incremented, score rose |
| `MEMORY_DECAYED` | Decay worker lowered the score significantly |
| `MEMORY_EXPIRED` | TTL elapsed — memory deleted from Redis |
| `CONFLICT_DETECTED` | Two writers hit same ID with `MANUAL_MERGE` strategy |

---

## 🗂 Project Structure

```
flashmemory/
│
├── src/main/java/com/flashmemory/
│   ├── FlashMemoryApplication.java       # Entry point (@SpringBootApplication)
│   │
│   ├── model/
│   │   ├── Memory.java                   # Core entity with relevance fields
│   │   └── MemoryEvent.java              # Pub/Sub event payload
│   │
│   ├── dto/
│   │   └── MemoryDtos.java               # StoreRequest, MemoryResponse, MemoryPage
│   │
│   ├── service/
│   │   ├── MemoryService.java            # Redis operations + scoring logic
│   │   └── EventPublisher.java           # Publishes events to Redis channels
│   │
│   ├── controller/
│   │   └── MemoryController.java         # REST endpoints (@RestController)
│   │
│   ├── scheduler/
│   │   └── DecayScheduler.java           # @Scheduled decay + cleanup job
│   │
│   └── config/
│       ├── RedisConfig.java              # RedisTemplate + Pub/Sub container
│       ├── WebSocketConfig.java          # STOMP WebSocket broker config
│       └── RedisEventListener.java       # Redis Pub/Sub → WebSocket bridge
│
├── src/main/resources/
│   └── application.properties
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx                      # React entry point
│   │   └── App.jsx                       # Live memory dashboard
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── Dockerfile.backend
├── frontend/Dockerfile.frontend
├── docker-compose.yml
└── pom.xml
```

---

## ⚙️ Configuration

`src/main/resources/application.properties`:

```properties
# Redis connection
spring.data.redis.host=${REDIS_HOST:localhost}
spring.data.redis.port=${REDIS_PORT:6379}
spring.data.redis.password=${REDIS_PASSWORD:}

# Decay worker
flashmemory.decay.interval-seconds=30        # Run every 30 seconds
flashmemory.decay.factor=0.95                # Score multiplier per cycle

# Capacity
flashmemory.max-memories-per-namespace=1000  # Auto-evict after this limit
```

---

## 🛠 Tech Stack

| Layer | Technology | Why chosen |
|---|---|---|
| Language | Java 17 | LTS, modern features |
| Framework | Spring Boot 3.2 | Production-grade, autoconfiguration |
| Cache / DB | Redis 7 | Hash, Sorted Set, Pub/Sub, TTL native |
| Redis client | Lettuce | Non-blocking (Netty-based), excellent Pub/Sub |
| Real-time | WebSocket + STOMP | Pub/Sub semantics over WebSocket |
| Frontend | React 18 + Vite | Fast HMR, hooks-based state |
| Containers | Docker Compose | One-command local dev |
| Build | Maven | Standard Java build tool |

---

## 🔭 Roadmap

- [ ] JWT authentication with namespace-level access control
- [ ] Redis `INCR + EXPIRE` rate limiting per client
- [ ] Redis Streams to replace Pub/Sub (persistent events, consumer groups)
- [ ] RediSearch full-text search integration
- [ ] Redis Cluster support for horizontal sharding
- [ ] Prometheus metrics endpoint (score distributions, decay rates)
- [ ] Bulk import API (seed memories from JSON/CSV)
- [ ] Memory versioning (track value changes over time)

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

Built with ☕ Java + ❤️ Redis

*"Most projects use Redis as a backend tool. This one makes Redis the product."*

</div>
