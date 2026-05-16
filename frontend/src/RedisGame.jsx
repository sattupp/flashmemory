import { Canvas, useFrame } from "@react-three/fiber";
import { Float, OrbitControls, Sparkles as SparkleField, Stars, Text } from "@react-three/drei";
import {
  Activity,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Database,
  Gauge,
  GraduationCap,
  KeyRound,
  Layers3,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trophy,
  Zap,
} from "lucide-react";
import { Component, useEffect, useMemo, useRef, useState } from "react";
import "./RedisGame.css";

const API = import.meta?.env?.VITE_API_BASE || "http://localhost:8080/api";

const MODULES = [
  {
    id: "strings",
    title: "Strings",
    region: "Cache Core",
    level: "Foundations",
    color: "#ef4444",
    commands: ["SET", "GET", "MSET", "MGET", "SETNX", "INCR", "DECR", "APPEND", "STRLEN"],
    starter: "MSET hero:role engineer hero:city redisland",
    verify: ["MSET", "hero:role"],
    simple: "A string is one label on one box. Put a name, score, token, or flag in the box.",
    engineer: "Strings are the base Redis value model for cached payloads, counters, feature flags, tokens, locks, and idempotency markers.",
    interview: "Know atomic `INCR`, `SETNX` lock patterns, `SET key value EX seconds NX`, cache-aside, TTLs, and why large JSON strings can create rewrite pressure.",
    production: "Use clear key prefixes, TTL everything temporary, avoid unbounded values, and track hit ratio plus p95 command latency.",
  },
  {
    id: "ttl",
    title: "Expiration",
    region: "Time Engine",
    level: "Foundations",
    color: "#f97316",
    commands: ["EXPIRE", "TTL"],
    starter: "EXPIRE hero:name 60",
    verify: ["EXPIRE", "hero:name"],
    simple: "TTL is a timer. When the timer ends, Redis forgets the key.",
    engineer: "Expiration supports sessions, OTPs, cooldowns, ephemeral personalization, and rate-limit windows.",
    interview: "Redis expiration is active plus lazy. Expired keys can disappear on access or during active expiry cycles.",
    production: "Model TTL intentionally; never rely only on app cleanup jobs for temporary state.",
  },
  {
    id: "lists",
    title: "Lists",
    region: "Queue Rail",
    level: "Data Structures",
    color: "#22c55e",
    commands: ["LPUSH", "RPUSH", "LPOP", "RPOP", "LRANGE", "LLEN", "LINDEX", "LTRIM"],
    starter: "LPUSH queue:jobs email",
    verify: ["LPUSH", "queue:jobs"],
    simple: "A list is a line. Add items to one side and take them from the other.",
    engineer: "Lists model queues, stacks, recent activity, lightweight task buffers, and ordered feeds.",
    interview: "Lists are fine for simple queues; Streams are better for replay, consumer groups, and delivery tracking.",
    production: "Avoid infinite lists. Trim feeds and define retry/dead-letter behavior outside the basic list.",
  },
  {
    id: "sets",
    title: "Sets",
    region: "Membership Field",
    level: "Data Structures",
    color: "#7ddf64",
    commands: ["SADD", "SMEMBERS", "SREM", "SCARD", "SINTER", "SUNION", "SDIFF", "SISMEMBER"],
    starter: "SADD room:online nova",
    verify: ["SADD", "room:online"],
    simple: "A set is a club list. A member can only be listed once.",
    engineer: "Sets solve uniqueness, deduplication, permissions, tags, online users, and intersections.",
    interview: "Set operations can be powerful but expensive on huge sets. Know cardinality and memory tradeoffs.",
    production: "Keep high-cardinality sets monitored. For huge probabilistic membership, consider Bloom filters in Redis Stack.",
  },
  {
    id: "hashes",
    title: "Hashes",
    region: "Object Lab",
    level: "Data Structures",
    color: "#f8d08a",
    commands: ["HSET", "HGET", "HMGET", "HGETALL", "HDEL", "HLEN", "HINCRBY"],
    starter: "HSET user:1 name Nova role engineer",
    verify: ["HSET", "user:1"],
    simple: "A hash is a card with small fields: name, role, score.",
    engineer: "Hashes store object fields without rewriting the entire object for one field change.",
    interview: "Hashes are useful for object-like data, but you still need ownership, TTL policy, and schema discipline.",
    production: "Avoid massive hashes with unbounded fields. Prefer predictable field names and explicit migration strategy.",
  },
  {
    id: "zsets",
    title: "Sorted Sets",
    region: "Ranking Arena",
    level: "Advanced Structures",
    color: "#f97316",
    commands: ["ZADD", "ZRANGE", "ZREVRANGE", "ZRANGEBYSCORE", "ZCARD", "ZREM", "ZSCORE", "ZRANK", "ZINCRBY"],
    starter: "ZADD leaderboard 900 nova",
    verify: ["ZADD", "leaderboard"],
    simple: "A sorted set is a scoreboard. Every player has a score.",
    engineer: "Sorted sets power leaderboards, ranked feeds, priority queues, sliding windows, and relevance indexes.",
    interview: "Great Redis candidates explain why sorted sets are ideal for rate limiting and top-N retrieval.",
    production: "Use score semantics carefully: timestamps, priorities, compound scores, and bounded retention.",
  },
  {
    id: "streams",
    title: "Streams",
    region: "Event River",
    level: "Event Systems",
    color: "#06b6d4",
    commands: ["XADD", "XRANGE", "XLEN", "XDEL"],
    starter: "XADD events * type signup user nova",
    verify: ["XADD", "events"],
    simple: "A stream is a diary. Every event gets a new line.",
    engineer: "Streams are durable append-only logs with IDs, replay, and consumer-group architecture.",
    interview: "Streams beat Pub/Sub when consumers can disconnect and later catch up.",
    production: "Plan trimming, consumer lag, pending entries, retry ownership, and stream partitioning.",
  },
  {
    id: "pubsub",
    title: "Pub/Sub",
    region: "Broadcast Tower",
    level: "Realtime",
    color: "#f59e0b",
    commands: ["PUBLISH"],
    starter: "PUBLISH alerts level_complete",
    verify: ["PUBLISH", "alerts"],
    simple: "Pub/Sub is shouting into a room. Only listeners in the room hear it.",
    engineer: "Pub/Sub is good for live dashboards and fanout signals where missed messages are acceptable.",
    interview: "Pub/Sub is fire-and-forget. Use Streams, Kafka, or a queue if durability matters.",
    production: "Do not use Pub/Sub as a job queue unless message loss is acceptable.",
  },
  {
    id: "hll",
    title: "HyperLogLog",
    region: "Cardinality Lab",
    level: "Probabilistic",
    color: "#84cc16",
    commands: ["PFADD", "PFCOUNT", "PFMERGE"],
    starter: "PFADD visitors nova kai nova",
    verify: ["PFADD", "visitors"],
    simple: "HyperLogLog counts unique things without storing every thing.",
    engineer: "HyperLogLog is built for approximate distinct counts such as daily visitors, unique searches, or unique IPs with tiny memory.",
    interview: "Know that PFCOUNT is approximate and that HyperLogLog cannot list members back.",
    production: "Use it when a small counting error is acceptable and memory predictability matters more than exact membership.",
  },
  {
    id: "bitmaps",
    title: "Bitmaps",
    region: "Bit Grid",
    level: "Compact State",
    color: "#ec4899",
    commands: ["SETBIT", "GETBIT", "BITCOUNT"],
    starter: "SETBIT active:today 42 1",
    verify: ["SETBIT", "active:today"],
    simple: "A bitmap is a long row of tiny yes/no switches.",
    engineer: "Bitmaps use Redis strings as compact bit arrays for attendance, feature exposure, activity flags, and boolean timelines.",
    interview: "Mention memory depends on highest offset, not number of set bits.",
    production: "Keep offset strategy bounded and predictable; a huge accidental offset can allocate a large sparse string.",
  },
  {
    id: "geo",
    title: "Geospatial",
    region: "Location Index",
    level: "Applied Structures",
    color: "#10b981",
    commands: ["GEOADD", "GEODIST", "GEOPOS"],
    starter: "GEOADD places 77.5946 12.9716 bengaluru",
    verify: ["GEOADD", "places"],
    simple: "Geo commands store places and ask where they are or how far apart they are.",
    engineer: "Redis stores geospatial points with sorted-set encoding, useful for nearby-store, driver, asset, or city-distance features.",
    interview: "Redis geo uses longitude first, then latitude, and is not a full GIS database.",
    production: "Use it for fast proximity primitives, but keep complex route planning and polygon analysis outside Redis.",
  },
  {
    id: "scripting",
    title: "Lua Scripting",
    region: "Atomic Forge",
    level: "Advanced Atomicity",
    color: "#f43f5e",
    commands: ["EVAL"],
    starter: "EVAL \"return redis.call('GET', KEYS[1])\" 1 hero:name",
    verify: ["EVAL"],
    simple: "Lua lets Redis run a tiny program without another network round trip.",
    engineer: "Scripts package read-check-write logic into one atomic server-side operation.",
    interview: "Explain that Lua scripts block Redis while running, so they must be short and deterministic.",
    production: "Use scripts for small atomic workflows, not long computation or unbounded loops.",
  },
  {
    id: "ops",
    title: "Operations",
    region: "Reliability Deck",
    level: "Senior Systems",
    color: "#64748b",
    commands: ["TYPE", "KEYS", "SCAN", "INFO", "DBSIZE"],
    starter: "SCAN 0 MATCH *",
    verify: ["SCAN"],
    simple: "Ask Redis what kind of key you are looking at.",
    engineer: "Operational Redis skill means knowing key patterns, memory growth, latency, eviction, persistence, and safe scanning.",
    interview: "A senior answer mentions SCAN over KEYS, eviction policy, hot keys, persistence tradeoffs, and observability.",
    production: "Track memory fragmentation, command latency, slowlog, blocked clients, hit rate, evictions, and replication lag.",
  },
];

const TOPIC_DETAILS = {
  strings: {
    mentalModel: "One Redis key points to one binary-safe value. Redis does not care whether that value is text, JSON, a token, or a number-like string.",
    dataModel: "Internally this is the simplest access path: key lookup, value read or write, optional TTL metadata, and optional atomic numeric mutation.",
    whenToUse: [
      "Cache one computed response or serialized object behind a stable key.",
      "Store short-lived session tokens, OTPs, feature flags, lock markers, or idempotency records.",
      "Count events with atomic INCR/DECR without round trips through a relational database.",
    ],
    commandNotes: [
      "SET key value EX seconds NX is the practical form for one-shot locks and idempotency guards.",
      "MSET/MGET reduce network round trips when the app needs many independent simple values.",
      "INCR works only when the current value can be parsed as an integer.",
    ],
    pitfalls: [
      "Large JSON blobs make every small field update rewrite the entire value.",
      "SETNX without TTL can leave permanent lock keys after process failure.",
      "Caching without an invalidation plan usually creates stale reads.",
    ],
    productionChecklist: [
      "Use namespace prefixes such as app:user:123:profile.",
      "Put TTLs on temporary values and alerts on keys with unexpected no-TTL state.",
      "Measure hit ratio, value size, and p95 latency for hot paths.",
    ],
    interviewAngles: [
      "Explain cache-aside versus write-through.",
      "Explain why Redis counters are atomic on a single shard.",
      "Mention stale cache, thundering herd, and lock expiry problems.",
    ],
    exampleFlow: ["SET profile:42 '{\"name\":\"Nova\"}' EX 300", "GET profile:42", "INCR metrics:login:2026-05-15"],
  },
  ttl: {
    mentalModel: "Expiration turns Redis from a key-value store into a time-aware state system. The key owns a timer; when the timer is gone, the value should be treated as gone.",
    dataModel: "Redis stores expiry metadata separately from the value. Expired keys are removed lazily on access and actively by background expiry sampling.",
    whenToUse: [
      "Sessions, OTPs, password reset links, cooldowns, and short-lived auth challenges.",
      "Cache entries where freshness matters more than perfect consistency.",
      "Sliding or fixed windows for rate limits and abuse controls.",
    ],
    commandNotes: [
      "EXPIRE sets a TTL on an existing key; SET with EX creates value and TTL together.",
      "TTL returns remaining seconds, -1 for no expiry, and -2 when the key does not exist.",
      "Refreshing TTL on every read creates session-style idle timeout behavior.",
    ],
    pitfalls: [
      "A write can accidentally remove TTL if the command replaces the key without preserving expiry.",
      "Relying on exact deletion timing is unsafe; expiry is eventual, not a hard scheduler.",
      "Very large waves of same-second expirations can create latency spikes.",
    ],
    productionChecklist: [
      "Add jitter to cache TTLs to avoid synchronized expiry storms.",
      "Choose TTLs from product semantics, not random convenience.",
      "Track expired keys, evictions, and latency during expiry-heavy periods.",
    ],
    interviewAngles: [
      "Describe lazy plus active expiration.",
      "Differentiate expiration from maxmemory eviction.",
      "Explain why TTL is useful for distributed locks but not sufficient alone.",
    ],
    exampleFlow: ["SET otp:phone:999 482901 EX 120", "TTL otp:phone:999", "EXPIRE session:abc 1800"],
  },
  lists: {
    mentalModel: "A list is an ordered sequence where pushing or popping at either end is cheap. It feels like a queue, stack, or recent-items rail.",
    dataModel: "Redis lists are optimized for head and tail operations. Access by wide ranges or deep indexes becomes less attractive as the list grows.",
    whenToUse: [
      "Simple FIFO/LIFO queues where replay and consumer tracking are not required.",
      "Recent activity feeds that are aggressively trimmed.",
      "Small ordered buffers for lightweight workflows.",
    ],
    commandNotes: [
      "LPUSH with RPOP gives queue behavior; LPUSH with LPOP gives stack behavior.",
      "LRANGE key 0 -1 is convenient in a lab but dangerous for very long lists.",
      "LLEN is useful for queue depth but should be paired with age/lag metrics.",
    ],
    pitfalls: [
      "Lists do not provide durable consumer groups or acknowledgement tracking.",
      "Unbounded lists become memory leaks.",
      "One slow consumer pattern is hard to manage with plain lists.",
    ],
    productionChecklist: [
      "Trim list-backed feeds with LTRIM or explicit retention rules.",
      "Define retry and dead-letter behavior at the application layer.",
      "Prefer Streams when jobs must be replayed or acknowledged.",
    ],
    interviewAngles: [
      "Compare list queues with Streams.",
      "Explain blocking pops and worker behavior.",
      "Mention bounded retention and backpressure.",
    ],
    exampleFlow: ["LPUSH queue:email welcome-user-42", "RPOP queue:email", "LRANGE feed:42 0 20"],
  },
  sets: {
    mentalModel: "A set is an unordered bag of unique members. It answers membership and relationship questions quickly.",
    dataModel: "Redis stores each member once per set. Operations such as intersection and union combine membership across keys.",
    whenToUse: [
      "Deduplicate IDs, request IDs, tags, permissions, or online users.",
      "Find overlap between groups with SINTER.",
      "Represent many-to-many relationships with predictable key prefixes.",
    ],
    commandNotes: [
      "SADD returns how many new members were actually inserted.",
      "SCARD gives cardinality without returning every member.",
      "SINTER is elegant for tag filters but can be expensive on very large sets.",
    ],
    pitfalls: [
      "Huge SMEMBERS calls can block app response paths and move lots of data over the network.",
      "High-cardinality sets need memory budgets.",
      "Set members have no score or order; choose sorted sets when rank matters.",
    ],
    productionChecklist: [
      "Use SCARD and sampling for observability instead of dumping huge sets.",
      "Shard very large logical sets when ownership or access pattern allows it.",
      "Consider Bloom filters when approximate membership is acceptable.",
    ],
    interviewAngles: [
      "Explain uniqueness and set algebra.",
      "Discuss tag filtering with SINTER.",
      "Call out memory tradeoffs and probabilistic alternatives.",
    ],
    exampleFlow: ["SADD room:online nova kai", "SISMEMBER room:online nova", "SINTER tag:redis tag:backend"],
  },
  hashes: {
    mentalModel: "A hash is a small field map under one Redis key. It is useful when the app owns an object and updates individual fields.",
    dataModel: "Redis stores fields and values inside one top-level key. The top-level key can have a TTL, but individual fields cannot have independent TTLs.",
    whenToUse: [
      "User profiles, carts, small configuration objects, and counters grouped by entity.",
      "Partial updates where rewriting one big JSON string would be wasteful.",
      "Object-like state that has clear ownership and stable field names.",
    ],
    commandNotes: [
      "HSET can set one field or many field/value pairs.",
      "HGETALL is fine for small hashes; targeted HGET/HMGET is better for hot paths.",
      "HLEN gives field count and can catch runaway field growth.",
    ],
    pitfalls: [
      "No per-field TTL means expiring one field requires a different model.",
      "Huge hashes become hard to migrate and inspect safely.",
      "Schema drift happens quickly if every service invents fields.",
    ],
    productionChecklist: [
      "Document field names and ownership.",
      "Keep hashes bounded and monitor field count.",
      "Version schema when field meaning changes.",
    ],
    interviewAngles: [
      "Compare hashes with JSON strings.",
      "Mention top-level TTL only.",
      "Explain when a relational row should not be moved into Redis.",
    ],
    exampleFlow: ["HSET user:1 name Nova role engineer", "HGET user:1 role", "HGETALL user:1"],
  },
  zsets: {
    mentalModel: "A sorted set is a unique-member set plus a numeric score. Redis keeps members ordered by that score.",
    dataModel: "Each member is unique, and score changes move it within the ordering. This makes top-N, ranges, and rank-like workflows efficient.",
    whenToUse: [
      "Leaderboards, relevance indexes, priority queues, and ranked feeds.",
      "Sliding-window rate limits using timestamps as scores.",
      "Scheduling where due time is the score and job ID is the member.",
    ],
    commandNotes: [
      "ZADD inserts or updates scores.",
      "ZREVRANGE gives highest scores first for leaderboards.",
      "ZRANGEBYSCORE selects by numeric score range, often timestamps.",
    ],
    pitfalls: [
      "Scores are floating-point numbers; encode compound rank carefully.",
      "Old members must be trimmed in sliding-window designs.",
      "Hot leaderboards can concentrate traffic on one key.",
    ],
    productionChecklist: [
      "Define what score means: rank, time, priority, or weighted relevance.",
      "Bound retention with ZREMRANGEBYSCORE or rank trimming.",
      "Watch cardinality and command latency on large sorted sets.",
    ],
    interviewAngles: [
      "Use sorted sets for top-N retrieval.",
      "Explain sliding-window rate limiting with timestamps.",
      "Discuss hot keys and sharding high-traffic rankings.",
    ],
    exampleFlow: ["ZADD leaderboard 900 nova", "ZREVRANGE leaderboard 0 9", "ZRANGEBYSCORE requests:ip 1710000000 1710000060"],
  },
  streams: {
    mentalModel: "A stream is an append-only event log. Each event has an ID and fields, so consumers can read history instead of only live messages.",
    dataModel: "Redis assigns monotonic IDs and stores entries in order. Consumer groups let multiple workers share processing while tracking pending messages.",
    whenToUse: [
      "Durable event ingestion where consumers may disconnect and catch up.",
      "Job pipelines that need acknowledgement, retry, or pending-entry inspection.",
      "Audit-style event trails with bounded retention.",
    ],
    commandNotes: [
      "XADD appends an event; XRANGE reads by ID range.",
      "Consumer groups add delivery tracking with XREADGROUP, XACK, and pending entries.",
      "MAXLEN trimming keeps streams from growing forever.",
    ],
    pitfalls: [
      "Streams are not Kafka; very large distributed log workloads need careful limits.",
      "Unacked pending entries can pile up after worker failure.",
      "No retention policy means event logs become memory problems.",
    ],
    productionChecklist: [
      "Use max length or time-based trimming.",
      "Track consumer lag and pending entries.",
      "Design retry ownership and poison-message handling.",
    ],
    interviewAngles: [
      "Contrast Streams with Pub/Sub.",
      "Explain consumer groups and acknowledgements.",
      "Mention trimming, lag, and retry semantics.",
    ],
    exampleFlow: ["XADD events * type signup user nova", "XRANGE events - +", "XREADGROUP GROUP workers a COUNT 10 STREAMS events >"],
  },
  pubsub: {
    mentalModel: "Pub/Sub is live broadcast. Publishers send to a channel, and only clients currently subscribed receive the message.",
    dataModel: "Messages are not stored. Redis routes the payload to active subscribers and then forgets it.",
    whenToUse: [
      "Live dashboards, invalidation signals, lightweight notifications, and fanout hints.",
      "Events where missing a message is acceptable because state can be refreshed.",
      "Development tools and operational broadcasts.",
    ],
    commandNotes: [
      "PUBLISH returns how many subscribers received the message.",
      "SUBSCRIBE blocks the connection for message delivery.",
      "Pattern subscriptions can match multiple channels but should be used with discipline.",
    ],
    pitfalls: [
      "Disconnected consumers miss messages permanently.",
      "There is no acknowledgement, replay, or delivery guarantee.",
      "Using Pub/Sub as a job queue creates silent loss during worker restarts.",
    ],
    productionChecklist: [
      "Use Pub/Sub only for lossy realtime signals.",
      "Pair invalidation messages with cache refresh from source of truth.",
      "Use Streams or a broker when delivery matters.",
    ],
    interviewAngles: [
      "State clearly that Pub/Sub is fire-and-forget.",
      "Choose Streams for durable event processing.",
      "Explain why it fits WebSocket dashboard updates.",
    ],
    exampleFlow: ["PUBLISH alerts deploy_done", "PUBLISH cache:invalidate user:42", "XADD events * type alert message deploy_done"],
  },
  hll: {
    mentalModel: "HyperLogLog is a tiny sketch that estimates how many unique things it has seen. It is for counting, not storing members.",
    dataModel: "Redis keeps probabilistic registers under one key. Adding the same element again usually does not change the estimate.",
    whenToUse: [
      "Count unique visitors, unique searches, unique API users, or unique campaign viewers.",
      "Keep daily or hourly uniqueness metrics without storing every ID.",
      "Merge uniqueness across windows or regions with PFMERGE.",
    ],
    commandNotes: [
      "PFADD adds elements to the sketch and returns whether the sketch changed.",
      "PFCOUNT returns an approximate distinct count.",
      "PFMERGE combines multiple sketches into a destination sketch.",
    ],
    pitfalls: [
      "You cannot ask HyperLogLog to list the original elements.",
      "The count is approximate, not exact.",
      "It is wrong for billing or correctness-critical counts.",
    ],
    productionChecklist: [
      "Use it only where approximate counts are acceptable.",
      "Name keys by time window, such as hll:visits:2026-05-15.",
      "Keep exact auditing data elsewhere if the business needs proof.",
    ],
    interviewAngles: [
      "Explain approximate cardinality.",
      "Mention fixed small memory.",
      "State clearly that members cannot be recovered.",
    ],
    exampleFlow: ["PFADD visitors nova kai nova", "PFCOUNT visitors", "PFMERGE visitors:all visitors"],
  },
  bitmaps: {
    mentalModel: "A bitmap is a compact row of 0/1 flags. Redis stores it as a string but lets you manipulate individual bits.",
    dataModel: "Each offset is a bit position. The highest offset controls memory allocation because Redis must represent the string up to that bit.",
    whenToUse: [
      "Daily active user flags where user IDs map to bit offsets.",
      "Feature exposure tracking, attendance, completion flags, and binary timelines.",
      "Fast counts of yes/no states with BITCOUNT.",
    ],
    commandNotes: [
      "SETBIT returns the previous bit at that offset.",
      "GETBIT returns the current bit.",
      "BITCOUNT counts how many bits are set to 1.",
    ],
    pitfalls: [
      "A huge accidental offset can allocate a large value.",
      "Offsets need a stable mapping strategy.",
      "Bitmaps are not good when IDs are sparse and extremely large.",
    ],
    productionChecklist: [
      "Bound offset ranges.",
      "Use date-windowed keys for time-series flags.",
      "Document the ID-to-offset mapping.",
    ],
    interviewAngles: [
      "Explain why bitmaps are memory efficient.",
      "Mention highest-offset allocation risk.",
      "Give daily active user as the classic example.",
    ],
    exampleFlow: ["SETBIT active:today 42 1", "GETBIT active:today 42", "BITCOUNT active:today"],
  },
  geo: {
    mentalModel: "Geospatial Redis stores named points and lets you ask position and distance questions.",
    dataModel: "Redis encodes longitude/latitude into sorted-set scores internally. Members are still unique strings.",
    whenToUse: [
      "Nearby stores, driver locations, city lookup demos, or location-tagged assets.",
      "Simple distance checks between known points.",
      "Fast geospatial primitives without a full GIS database.",
    ],
    commandNotes: [
      "GEOADD uses longitude first, latitude second.",
      "GEOPOS returns stored coordinates.",
      "GEODIST returns distance between two members in a chosen unit.",
    ],
    pitfalls: [
      "Redis geo is not route planning.",
      "It is not a replacement for polygon, road-network, or map-matching systems.",
      "Longitude/latitude order is easy to mix up.",
    ],
    productionChecklist: [
      "Validate coordinate ranges before writing.",
      "Use member IDs that map cleanly to your database entities.",
      "Expire or refresh moving-object locations deliberately.",
    ],
    interviewAngles: [
      "Mention sorted-set-backed geo encoding.",
      "Call out lon/lat ordering.",
      "Know where Redis geo stops and GIS begins.",
    ],
    exampleFlow: ["GEOADD places 77.5946 12.9716 bengaluru", "GEOADD places 72.8777 19.0760 mumbai", "GEODIST places bengaluru mumbai km"],
  },
  scripting: {
    mentalModel: "Lua scripting lets you send a tiny program to Redis so a read-check-write sequence happens atomically.",
    dataModel: "Redis runs the script on the server. Other commands wait while the script executes.",
    whenToUse: [
      "Small atomic workflows that need multiple Redis reads/writes.",
      "Compare-and-set style logic.",
      "Reducing round trips for tightly coupled command sequences.",
    ],
    commandNotes: [
      "EVAL takes script, number of keys, then key names and arguments.",
      "KEYS contains scoped keys; ARGV contains non-key arguments.",
      "The script decides what value is returned.",
    ],
    pitfalls: [
      "Long scripts block Redis.",
      "Scripts should be deterministic and bounded.",
      "Debugging scripts is harder than ordinary app code.",
    ],
    productionChecklist: [
      "Keep scripts short.",
      "Declare keys explicitly for cluster compatibility.",
      "Prefer simple commands unless atomic multi-step logic is required.",
    ],
    interviewAngles: [
      "Explain atomic server-side execution.",
      "Mention blocking risk.",
      "Know why Redis Cluster cares about declared keys.",
    ],
    exampleFlow: ["EVAL \"return redis.call('GET', KEYS[1])\" 1 hero:name", "EVAL \"return redis.call('INCR', KEYS[1])\" 1 hero:xp"],
  },
  ops: {
    mentalModel: "Redis operations are about keeping an in-memory system predictable: bounded keys, safe commands, observed latency, and known failure modes.",
    dataModel: "The operational model combines keyspace size, command complexity, memory policy, persistence, replication, and client behavior.",
    whenToUse: [
      "Every production Redis use case needs key design, retention, and observability.",
      "Shared Redis clusters require ownership boundaries and command safety.",
      "Latency-sensitive apps need hot-key, big-key, and slow-command controls.",
    ],
    commandNotes: [
      "TYPE tells you what a key currently stores.",
      "KEYS is acceptable in a tiny lab but dangerous in production.",
      "SCAN iterates incrementally and avoids one huge blocking keyspace walk.",
    ],
    pitfalls: [
      "No maxmemory policy turns memory growth into outage risk.",
      "Hot keys overload a shard even when total cluster capacity looks fine.",
      "AOF/RDB settings change durability, throughput, and recovery time.",
    ],
    productionChecklist: [
      "Track used memory, evictions, fragmentation, latency, slowlog, blocked clients, and replication lag.",
      "Document eviction policy, persistence mode, and restore procedure.",
      "Block or review dangerous commands in shared production environments.",
    ],
    interviewAngles: [
      "Prefer SCAN over KEYS.",
      "Discuss RDB versus AOF tradeoffs.",
      "Mention hot keys, clustering slots, Sentinel, and maxmemory eviction.",
    ],
    exampleFlow: ["TYPE leaderboard", "SCAN 0 MATCH app:* COUNT 100", "INFO memory"],
  },
};

const COMMAND_PALETTE = [
  "SET hero:name Nova EX 120",
  "SET hero:name Nova",
  "GET hero:name",
  "MSET hero:role engineer hero:city redisland",
  "MGET hero:name hero:role",
  "SETNX lock:deploy owner",
  "INCR hero:xp",
  "APPEND hero:name _redis",
  "STRLEN hero:name",
  "EXPIRE hero:name 60",
  "TTL hero:name",
  "LPUSH queue:jobs email",
  "RPUSH queue:jobs report",
  "LRANGE queue:jobs 0 -1",
  "LINDEX queue:jobs 0",
  "LTRIM queue:jobs 0 9",
  "SADD room:online nova kai",
  "SISMEMBER room:online nova",
  "SINTER room:online room:online",
  "SDIFF room:online room:offline",
  "HSET user:1 name Nova role engineer",
  "HMGET user:1 name role",
  "HINCRBY user:1 views 1",
  "HGETALL user:1",
  "ZADD leaderboard 900 nova 750 kai",
  "ZREVRANGE leaderboard 0 5",
  "ZRANGEBYSCORE leaderboard 700 1000",
  "ZSCORE leaderboard nova",
  "ZINCRBY leaderboard 25 nova",
  "XADD events * type signup user nova",
  "XRANGE events - +",
  "XLEN events",
  "PFADD visitors nova kai nova",
  "PFCOUNT visitors",
  "SETBIT active:today 42 1",
  "GETBIT active:today 42",
  "BITCOUNT active:today",
  "GEOADD places 77.5946 12.9716 bengaluru",
  "GEOADD places 72.8777 19.0760 mumbai",
  "GEODIST places bengaluru mumbai km",
  "GEOPOS places bengaluru",
  "EVAL \"return redis.call('GET', KEYS[1])\" 1 hero:name",
  "TYPE leaderboard",
  "SCAN 0 MATCH *",
  "INFO memory",
  "DBSIZE",
  "KEYS *",
  "PUBLISH alerts level_complete",
];

const COMMAND_GUIDES = {
  SET: ["Writes one string key.", "Output is OK when the write happens. With NX/XX, nil means the condition blocked the write."],
  GET: ["Reads one string key.", "Output is the stored value, or nil when the key does not exist."],
  MSET: ["Writes multiple string keys in one command.", "Output is OK because Redis accepted all key/value pairs; it does not echo the stored values."],
  MGET: ["Reads multiple string keys in the same order you typed them.", "Output is an array; missing keys appear as nil positions."],
  SETNX: ["Writes only if the key does not already exist.", "Output 1 means created; 0 means the key already existed."],
  INCR: ["Atomically adds 1 to an integer string.", "Output is the new number after Redis updates it."],
  DECR: ["Atomically subtracts 1 from an integer string.", "Output is the new number after Redis updates it."],
  APPEND: ["Adds text to the end of an existing string value.", "Output is the new string length."],
  STRLEN: ["Measures the byte length of a string value.", "Output is the length; missing keys return 0."],
  EXPIRE: ["Adds a countdown timer to an existing key.", "Output 1 means TTL was attached; 0 means the key was missing."],
  TTL: ["Checks the remaining lifetime of a key.", "Positive output is seconds left; -1 means no TTL; -2 means missing key."],
  LPUSH: ["Pushes values onto the left side of a list.", "Output is the list length after the push."],
  RPUSH: ["Pushes values onto the right side of a list.", "Output is the list length after the push."],
  LRANGE: ["Reads a range of list indexes.", "Output is an array of list values in that range."],
  LINDEX: ["Reads one list item by index.", "Output is that item, or nil if the index is outside the list."],
  LTRIM: ["Keeps only a selected list range and removes the rest.", "Output is OK after Redis trims the list."],
  SADD: ["Adds unique members to a set.", "Output is how many new members were added, not counting duplicates."],
  SISMEMBER: ["Checks if one value is a member of a set.", "Output 1 means yes; 0 means no."],
  SINTER: ["Returns members common to all provided sets.", "Output is the intersection result."],
  SUNION: ["Combines members from all provided sets.", "Output is the union result with duplicates removed."],
  SDIFF: ["Subtracts later sets from the first set.", "Output is what remains from the first set."],
  HSET: ["Writes fields into a hash object.", "Output is the number of fields written in this game response."],
  HGET: ["Reads one field from a hash.", "Output is that field value, or nil when missing."],
  HMGET: ["Reads several hash fields in order.", "Output is an array matching the requested fields."],
  HINCRBY: ["Atomically increments a numeric hash field.", "Output is the new field value."],
  HGETALL: ["Reads every field/value pair in a hash.", "Output is an object-like map."],
  ZADD: ["Adds members with numeric scores to a sorted set.", "Output is how many new members were inserted."],
  ZREVRANGE: ["Reads sorted-set members from highest rank downward.", "Output is the leaderboard-style ordered list."],
  ZSCORE: ["Reads one member's score.", "Output is that numeric score, or nil if missing."],
  ZINCRBY: ["Adds to one member's sorted-set score.", "Output is the new score."],
  XADD: ["Appends an event to a stream.", "Output is the generated stream event ID."],
  XRANGE: ["Reads stream events by ID range.", "Output is the event list with IDs and fields."],
  XLEN: ["Counts events in a stream.", "Output is the stream length."],
  PFADD: ["Adds values to a HyperLogLog unique-count sketch.", "Output tells whether the sketch changed."],
  PFCOUNT: ["Estimates unique count from a HyperLogLog.", "Output is approximate cardinality."],
  SETBIT: ["Sets one bit offset to 0 or 1.", "Output is the previous bit value at that offset."],
  GETBIT: ["Reads one bit offset.", "Output is 0 or 1."],
  BITCOUNT: ["Counts all bits set to 1.", "Output is the compact yes-count."],
  GEOADD: ["Stores longitude, latitude, and member name.", "Output is how many new geo members were added."],
  GEODIST: ["Calculates distance between two geo members.", "Output is the distance in the requested unit."],
  GEOPOS: ["Reads stored coordinates for members.", "Output is longitude and latitude."],
  EVAL: ["Runs a Lua script atomically inside Redis.", "Output is whatever the script returns."],
  TYPE: ["Checks the data type at a key.", "Output is string, list, set, hash, zset, stream, or none."],
  SCAN: ["Incrementally finds keys by pattern.", "Output is matching keys in your scoped lab keyspace."],
  INFO: ["Reads Redis server diagnostics.", "Output is a small sample of server metrics for the requested section."],
  DBSIZE: ["Counts keys in the selected Redis database.", "Output is the database key count."],
  KEYS: ["Finds keys by pattern by scanning the keyspace.", "Output is matching keys; learn it, but prefer SCAN in production."],
  PUBLISH: ["Broadcasts a message to active subscribers.", "Output is subscriber count; 0 is normal if nobody is listening."],
};

const DRILLS = [
  {
    q: "When should you choose Streams over Pub/Sub?",
    a: "Choose Streams when messages need durability, replay, consumer groups, or recovery after consumers disconnect.",
  },
  {
    q: "Why is KEYS dangerous in production?",
    a: "KEYS scans the keyspace synchronously and can block Redis. Use SCAN for incremental iteration.",
  },
  {
    q: "What Redis model fits a leaderboard?",
    a: "Sorted Set. Members are players and scores determine rank.",
  },
  {
    q: "How do you build a retry-safe write?",
    a: "Use an idempotency key stored with SETNX or SET with NX and TTL, then return the original result on retry.",
  },
  {
    q: "What metrics would you watch for Redis?",
    a: "Memory, evictions, hit ratio, p95/p99 latency, connected clients, slowlog, blocked clients, replication lag, and command mix.",
  },
  {
    q: "What is Redis best used for?",
    a: "Redis is best for low-latency in-memory data access: caching, counters, queues, leaderboards, sessions, rate limits, locks, and realtime coordination.",
  },
  {
    q: "Is Redis a database or a cache?",
    a: "It can be both. Redis is an in-memory data store with optional persistence, but many systems use it as a cache in front of a durable primary database.",
  },
  {
    q: "What is cache-aside?",
    a: "The app checks Redis first. On miss, it reads the database, writes the result into Redis with TTL, then returns the value.",
  },
  {
    q: "What is write-through caching?",
    a: "The app writes to the cache and backing store as part of the same write path, so cache stays warmer but writes become more expensive.",
  },
  {
    q: "What is write-behind caching?",
    a: "The app writes to cache first and asynchronously flushes to the database later. It improves write latency but increases data-loss risk.",
  },
  {
    q: "What is a cache stampede?",
    a: "Many clients miss the same expired key at once and overwhelm the database. Use locking, request coalescing, prewarming, or TTL jitter.",
  },
  {
    q: "Why add jitter to TTLs?",
    a: "Jitter spreads expirations across time so many hot keys do not expire simultaneously and spike database traffic.",
  },
  {
    q: "What is a hot key?",
    a: "A key receiving disproportionate traffic. It can overload one Redis shard even when overall cluster capacity looks fine.",
  },
  {
    q: "How do you handle hot keys?",
    a: "Replicate reads, split the key, local-cache carefully, add request coalescing, or redesign the data model to distribute load.",
  },
  {
    q: "What is a big key?",
    a: "A key whose value or collection is too large. Big keys increase latency, memory fragmentation, network transfer, and operational risk.",
  },
  {
    q: "How do you find big keys?",
    a: "Use redis-cli --bigkeys in safe environments, MEMORY USAGE samples, SCAN-based inspection, and latency/slowlog clues.",
  },
  {
    q: "Why is Redis fast?",
    a: "It keeps data in memory, uses efficient data structures, has a simple protocol, and executes commands in an event-loop model with minimal locking.",
  },
  {
    q: "Is Redis single-threaded?",
    a: "Command execution is mostly single-threaded in classic Redis, while modern Redis can use threads for I/O and background tasks.",
  },
  {
    q: "What does atomic mean in Redis?",
    a: "A single Redis command runs completely before another command modifies the same server state. Lua scripts also execute atomically.",
  },
  {
    q: "How would you implement a distributed lock?",
    a: "Use SET lockKey uniqueToken NX EX seconds, release only if the token matches, and keep lock TTL short. Understand Redlock tradeoffs before using it broadly.",
  },
  {
    q: "Why is DEL lockKey unsafe for lock release?",
    a: "A process might delete a lock it no longer owns if the TTL expired and another client acquired it. Release must verify an ownership token.",
  },
  {
    q: "What is Redlock?",
    a: "A Redis-based distributed lock algorithm using multiple independent Redis nodes. It is debated; use only when you understand failure assumptions.",
  },
  {
    q: "What are Redis persistence options?",
    a: "RDB snapshots, AOF append-only logs, or both. RDB is compact and fast to restore; AOF can reduce data loss but costs more write I/O.",
  },
  {
    q: "RDB vs AOF?",
    a: "RDB periodically snapshots memory, so recent writes can be lost. AOF logs write commands and can be fsynced more often for stronger durability.",
  },
  {
    q: "What is AOF rewrite?",
    a: "Redis compacts the append-only log by rewriting current state into a smaller equivalent log, reducing disk usage.",
  },
  {
    q: "What is maxmemory?",
    a: "The memory ceiling Redis uses before applying an eviction policy or rejecting writes, depending on configuration.",
  },
  {
    q: "Name common eviction policies.",
    a: "noeviction, allkeys-lru, volatile-lru, allkeys-lfu, volatile-lfu, allkeys-random, volatile-random, and volatile-ttl.",
  },
  {
    q: "LRU vs LFU eviction?",
    a: "LRU evicts least recently used keys. LFU evicts least frequently used keys and better protects repeatedly popular keys.",
  },
  {
    q: "What happens with noeviction?",
    a: "Redis returns errors for writes that need more memory after maxmemory is reached, while reads can continue.",
  },
  {
    q: "How do Redis expirations work?",
    a: "Redis uses lazy expiration when keys are accessed and active expiration cycles that sample keys with TTLs in the background.",
  },
  {
    q: "What does TTL return?",
    a: "Seconds remaining, -1 if the key exists without expiry, and -2 if the key does not exist.",
  },
  {
    q: "What is the difference between DEL and UNLINK?",
    a: "DEL frees memory synchronously. UNLINK unlinks keys and frees memory asynchronously, reducing blocking for large values.",
  },
  {
    q: "Why use hashes instead of JSON strings?",
    a: "Hashes allow field-level reads and writes without rewriting a whole serialized object, but they still need schema and size discipline.",
  },
  {
    q: "Can individual hash fields have TTL?",
    a: "Traditional Redis TTL applies to the top-level key, not individual hash fields.",
  },
  {
    q: "When are lists appropriate?",
    a: "Simple queues, stacks, and recent item feeds where replay, acknowledgements, and consumer groups are not required.",
  },
  {
    q: "When are Streams better than Lists?",
    a: "Use Streams when you need durable event logs, replay, consumer groups, pending entries, acknowledgements, or consumer recovery.",
  },
  {
    q: "What is a Redis Stream consumer group?",
    a: "A way for multiple consumers to share stream processing while Redis tracks delivered but unacknowledged messages.",
  },
  {
    q: "What is the PEL in Redis Streams?",
    a: "The Pending Entries List stores messages delivered to a consumer group but not yet acknowledged.",
  },
  {
    q: "Why trim streams?",
    a: "Streams grow forever unless trimmed. Use MAXLEN or retention policies to bound memory.",
  },
  {
    q: "What are sorted sets used for?",
    a: "Leaderboards, priority queues, ranking feeds, time windows, schedulers, and relevance indexes.",
  },
  {
    q: "How can sorted sets implement rate limiting?",
    a: "Store request timestamps as scores, remove old timestamps, count recent entries, and reject when count exceeds the limit.",
  },
  {
    q: "How do you model a leaderboard?",
    a: "Use a sorted set where member is user ID and score is points. Read top users with ZREVRANGE and individual rank with ZREVRANK.",
  },
  {
    q: "What is HyperLogLog used for?",
    a: "Approximate distinct counts, such as unique visitors, with tiny memory. It cannot list members.",
  },
  {
    q: "When should you not use HyperLogLog?",
    a: "When exact counts or recoverable member lists are required, such as billing, inventory, or compliance.",
  },
  {
    q: "What are bitmaps useful for?",
    a: "Compact boolean tracking such as daily active users, attendance, feature exposure, and completion flags.",
  },
  {
    q: "What is the bitmap offset risk?",
    a: "Memory allocation depends on the highest offset touched. Accidentally setting a huge offset can allocate a large string.",
  },
  {
    q: "What are Redis geo commands backed by?",
    a: "Redis geo indexes are backed by sorted sets with geohash-like score encoding.",
  },
  {
    q: "What coordinate order does GEOADD use?",
    a: "Longitude first, latitude second.",
  },
  {
    q: "What is Pub/Sub good for?",
    a: "Loss-tolerant realtime notifications, cache invalidation hints, and live dashboard signals.",
  },
  {
    q: "Why not use Pub/Sub as a job queue?",
    a: "Messages are not persisted. Disconnected consumers miss messages permanently.",
  },
  {
    q: "What is Redis replication?",
    a: "A primary Redis node streams data to replicas, allowing read scaling and failover support.",
  },
  {
    q: "What is Redis Sentinel?",
    a: "Sentinel monitors Redis primaries and replicas, detects failures, and coordinates automatic failover.",
  },
  {
    q: "What is Redis Cluster?",
    a: "A sharded Redis deployment that distributes keys across hash slots and supports horizontal scaling.",
  },
  {
    q: "How many hash slots does Redis Cluster use?",
    a: "16,384 hash slots.",
  },
  {
    q: "What are hash tags in Redis Cluster?",
    a: "Text inside braces, such as user:{42}:profile, forces related keys into the same hash slot for multi-key operations.",
  },
  {
    q: "Why can multi-key operations fail in Cluster?",
    a: "If keys are in different hash slots, Redis Cluster cannot run many multi-key commands atomically on one shard.",
  },
  {
    q: "What is pipelining?",
    a: "Sending multiple commands without waiting for each response, reducing network round-trip overhead.",
  },
  {
    q: "Pipelining vs transactions?",
    a: "Pipelining improves network efficiency. Transactions group commands with MULTI/EXEC but do not roll back like SQL transactions.",
  },
  {
    q: "What is WATCH used for?",
    a: "Optimistic locking. Redis aborts EXEC if a watched key changed before the transaction commits.",
  },
  {
    q: "What is Lua scripting used for?",
    a: "Atomic multi-step logic running server-side, such as compare-and-delete locks or conditional counter updates.",
  },
  {
    q: "What is the risk of long Lua scripts?",
    a: "Redis blocks other commands while a script runs, so scripts must be short and bounded.",
  },
  {
    q: "How do you observe Redis latency?",
    a: "Track command latency, SLOWLOG, LATENCY DOCTOR, client-side p95/p99, network RTT, and blocked clients.",
  },
  {
    q: "What is SLOWLOG?",
    a: "A Redis log of commands that exceeded a configured execution-time threshold, useful for finding expensive operations.",
  },
  {
    q: "What is memory fragmentation?",
    a: "Allocated memory can exceed logical used memory due to allocator behavior and object churn, increasing RSS.",
  },
  {
    q: "How do you secure Redis?",
    a: "Bind to private networks, require authentication, use ACLs, TLS where needed, disable dangerous commands, and avoid public exposure.",
  },
  {
    q: "What are Redis ACLs?",
    a: "Access Control Lists define users, passwords, allowed commands, and key patterns.",
  },
  {
    q: "What should be in a Redis production dashboard?",
    a: "Used memory, RSS, fragmentation, hit ratio, evictions, expirations, ops/sec, slowlog, blocked clients, connected clients, replication lag, and CPU.",
  },
  {
    q: "How do you avoid storing sensitive data in Redis?",
    a: "Minimize stored secrets, encrypt sensitive values when required, set TTLs, use ACLs, and avoid logging raw values.",
  },
  {
    q: "What is an idempotency key?",
    a: "A key that records a request ID so retries do not repeat side effects. Redis SET NX EX is commonly used for this.",
  },
  {
    q: "How do you choose Redis key names?",
    a: "Use predictable namespaces, entity IDs, purpose, and time windows, such as app:user:42:session or metric:login:2026-05-15.",
  },
  {
    q: "What is the most common Redis production mistake?",
    a: "Unbounded key or collection growth: no TTL, no trimming, no maxmemory policy, and no cardinality monitoring.",
  },
];

function normalizeCommand(value) {
  return value.trim().replace(/\s+/g, " ");
}

function pretty(value) {
  if (value === null || value === undefined) return "(nil)";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function questDone(command, module) {
  const normalized = normalizeCommand(command).toUpperCase();
  return module.verify.every((part) => normalized.includes(part.toUpperCase()));
}

function commandGuide(command) {
  const op = normalizeCommand(command).split(" ")[0]?.toUpperCase();
  const guide = COMMAND_GUIDES[op];
  if (guide) return { op, does: guide[0], output: guide[1] };
  return {
    op: op || "COMMAND",
    does: "This command will be sent to the safe Redis game API using your scoped player prefix.",
    output: "After execution, the trace will show Redis' response and the teaching notes returned by the backend.",
  };
}

const CITY_DISTRICTS = {
  strings: { label: "String Vault", position: [-3.7, 0, -1.35], color: "#ff6b4a" },
  ttl: { label: "TTL Clock", position: [-1.75, 0, -2.55], color: "#f4b24d" },
  lists: { label: "Queue Rail", position: [1.55, 0, -2.45], color: "#a3e635" },
  sets: { label: "Set Arena", position: [3.65, 0, -1.12], color: "#7ddf64" },
  hashes: { label: "Object Lab", position: [-3.72, 0, 1.18], color: "#f8d08a" },
  zsets: { label: "Rank Tower", position: [-1.25, 0, 2.62], color: "#f97316" },
  streams: { label: "Event River", position: [1.45, 0, 2.55], color: "#38d39f" },
  pubsub: { label: "Signal Tower", position: [3.72, 0, 1.08], color: "#ffcc66" },
  hll: { label: "HLL Observatory", position: [-0.15, 0, -0.25], color: "#d6ff62" },
  bitmaps: { label: "Bit Grid", position: [0.0, 0, -3.95], color: "#d6ff62" },
  geo: { label: "Geo Map", position: [0.1, 0, 3.95], color: "#8fd36a" },
  scripting: { label: "Lua Forge", position: [3.95, 0, -3.55], color: "#fb7185" },
  ops: { label: "Ops Radar", position: [-3.95, 0, 3.55], color: "#cbd5a1" },
};

const COMMAND_DISTRICT = {
  SET: "strings", GET: "strings", MSET: "strings", MGET: "strings", SETNX: "strings", INCR: "strings", DECR: "strings", APPEND: "strings", STRLEN: "strings", GETSET: "strings",
  EXPIRE: "ttl", TTL: "ttl",
  LPUSH: "lists", RPUSH: "lists", LPOP: "lists", RPOP: "lists", LRANGE: "lists", LLEN: "lists", LINDEX: "lists", LTRIM: "lists",
  SADD: "sets", SMEMBERS: "sets", SREM: "sets", SCARD: "sets", SINTER: "sets", SUNION: "sets", SDIFF: "sets", SISMEMBER: "sets",
  HSET: "hashes", HGET: "hashes", HMGET: "hashes", HGETALL: "hashes", HDEL: "hashes", HLEN: "hashes", HINCRBY: "hashes",
  ZADD: "zsets", ZRANGE: "zsets", ZREVRANGE: "zsets", ZREM: "zsets", ZCARD: "zsets", ZRANGEBYSCORE: "zsets", ZSCORE: "zsets", ZRANK: "zsets", ZREVRANK: "zsets", ZINCRBY: "zsets", ZCOUNT: "zsets", ZPOPMIN: "zsets",
  XADD: "streams", XRANGE: "streams", XLEN: "streams", XDEL: "streams",
  PUBLISH: "pubsub",
  PFADD: "hll", PFCOUNT: "hll", PFMERGE: "hll",
  SETBIT: "bitmaps", GETBIT: "bitmaps", BITCOUNT: "bitmaps",
  GEOADD: "geo", GEODIST: "geo", GEOPOS: "geo",
  EVAL: "scripting",
  TYPE: "ops", KEYS: "ops", SCAN: "ops", INFO: "ops", DBSIZE: "ops",
};

function splitCommand(command = "") {
  return normalizeCommand(command).match(/"[^"]*"|\S+/g)?.map((part) => part.replace(/^"|"$/g, "")) || [];
}

function classifyKey(item) {
  if (!item) return "ops";
  if (item.ttl > -1) return "ttl";
  if (item.key?.includes("visitor") || item.key?.includes("hll")) return "hll";
  if (item.key?.includes("active") || item.key?.includes("bitmap")) return "bitmaps";
  if (item.key?.includes("place") || item.key?.includes("geo")) return "geo";
  if (item.type === "list") return "lists";
  if (item.type === "set") return "sets";
  if (item.type === "hash") return "hashes";
  if (item.type === "zset") return item.key?.includes("place") ? "geo" : "zsets";
  if (item.type === "stream") return "streams";
  if (item.type === "string") return "strings";
  return "ops";
}

function stageModel(command = "", trace) {
  const parts = splitCommand(trace?.command || command);
  const op = parts[0]?.toUpperCase() || "READY";
  const type = COMMAND_DISTRICT[op] || "ops";
  const pairs = [];
  if (op === "MSET" || op === "HSET" || op === "ZADD") {
    const start = op === "HSET" ? 2 : 1;
    const step = 2;
    for (let i = start; i < parts.length - 1; i += step) pairs.push([parts[i], parts[i + 1]]);
  }
  return {
    op,
    type,
    key: parts[1] || "key",
    value: parts[2] || "value",
    args: parts.slice(1),
    pairs,
    result: trace?.response?.ok ? pretty(trace.response.result) : trace?.response?.result ? pretty(trace.response.result) : "ready",
  };
}

const STAGE_COPY = {
  strings: ["Cache Stump", "Key-value planks are hidden before the forest catches them"],
  lists: ["Log Queue", "Ordered jobs cross the trail from one side of the list"],
  sets: ["Thorn Gate", "Only unique members pass; duplicates bounce back"],
  hashes: ["Field Cabin", "One Redis key opens a cabin full of named fields"],
  zsets: ["Score Ridge", "Members climb higher when their numeric score grows"],
  streams: ["Event River", "New events float downstream with generated IDs"],
  ttl: ["Fade Timer", "A countdown ring marks keys that will disappear"],
  hll: ["Counting Shrine", "Approximate unique counts without storing every visitor"],
  bitmaps: ["Signal Moss", "Compact yes/no flags light up by offset"],
  geo: ["Trail Map", "Longitude and latitude members appear as map pins"],
  scripting: ["Lua Campfire", "Atomic logic runs inside Redis before anyone interrupts"],
  ops: ["Scout Tower", "Inspect keys, types, and server state"],
  pubsub: ["Signal Nest", "Messages broadcast to active listeners"],
};

function stageCopy(model) {
  const [title, subtitle] = STAGE_COPY[model.type] || ["Redis Stage", "Command visualization"];
  return {
    title: model.op === "READY" ? title : `${model.op} · ${title}`,
    subtitle,
  };
}

function StageLabel({ title, subtitle, color = "#d6ff62" }) {
  return (
    <group position={[0, 1.72, -2.05]}>
      <mesh position={[0, -0.05, -0.03]}>
        <boxGeometry args={[4.3, 0.66, 0.16]} />
        <meshStandardMaterial color="#5b351f" roughness={0.82} metalness={0.04} emissive="#201106" emissiveIntensity={0.22} />
      </mesh>
      <mesh position={[-2.18, -0.52, -0.02]}>
        <cylinderGeometry args={[0.045, 0.065, 0.78, 10]} />
        <meshStandardMaterial color="#351f13" roughness={0.86} />
      </mesh>
      <mesh position={[2.18, -0.52, -0.02]}>
        <cylinderGeometry args={[0.045, 0.065, 0.78, 10]} />
        <meshStandardMaterial color="#351f13" roughness={0.86} />
      </mesh>
      <Text position={[0, 0.07, 0.07]} fontSize={0.2} color="#fff1cf" anchorX="center" anchorY="middle" maxWidth={3.85}>
        {title}
      </Text>
      <Text position={[0, -0.2, 0.07]} fontSize={0.075} color={color} anchorX="center" anchorY="middle" maxWidth={3.9}>
        {subtitle}
      </Text>
    </group>
  );
}

function ResultBadge({ result, color }) {
  return (
    <group position={[2.45, 1.28, 0.42]} rotation={[0, -0.22, 0]}>
      <mesh position={[0, -0.45, -0.04]}>
        <cylinderGeometry args={[0.045, 0.055, 0.78, 10]} />
        <meshStandardMaterial color="#2b190f" roughness={0.85} />
      </mesh>
      <mesh>
        <boxGeometry args={[1.26, 0.55, 0.14]} />
        <meshStandardMaterial color="#4a2a18" roughness={0.74} emissive={color} emissiveIntensity={0.1} />
      </mesh>
      <Text position={[0, 0.04, 0.08]} fontSize={0.16} color="#fff7e7" anchorX="center" anchorY="middle" maxWidth={1.0}>
        {result}
      </Text>
      <Text position={[0, -0.19, 0.08]} fontSize={0.06} color={color} anchorX="center" anchorY="middle">
        RESULT
      </Text>
    </group>
  );
}

function FlyingCommand({ model, color, pulse }) {
  const packet = useRef();
  useFrame(() => {
    if (!packet.current) return;
    const age = Math.min((Date.now() - (pulse || Date.now())) / 1200, 1);
    const ease = 1 - Math.pow(1 - age, 3);
    packet.current.position.set(-3.05 + 3.05 * ease, 0.34 + Math.sin(ease * Math.PI) * 0.62, 1.55 - 1.05 * ease);
    packet.current.rotation.y = 0.16 * Math.sin(Date.now() * 0.009);
  });
  return (
    <group ref={packet}>
      <mesh position={[0, 0.22, 0]}>
        <capsuleGeometry args={[0.12, 0.26, 8, 16]} />
        <meshStandardMaterial color="#e7b15f" roughness={0.62} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.13, 16, 16]} />
        <meshStandardMaterial color="#f8d08a" roughness={0.58} />
      </mesh>
      <mesh position={[0.16, 0.26, 0.02]}>
        <boxGeometry args={[0.16, 0.26, 0.16]} />
        <meshStandardMaterial color="#d8462f" roughness={0.55} emissive="#6b1f15" emissiveIntensity={0.14} />
      </mesh>
      <mesh position={[0, 0.63, 0.02]} rotation={[0, 0, 0.08]}>
        <coneGeometry args={[0.18, 0.18, 4]} />
        <meshStandardMaterial color={color} roughness={0.62} emissive={color} emissiveIntensity={0.18} />
      </mesh>
      <Text position={[0, 0.82, 0.08]} fontSize={0.09} color="#fff7e7" anchorX="center" anchorY="middle" maxWidth={0.75}>
        {model.op}
      </Text>
    </group>
  );
}

function KeyCard({ x, y = 0.65, z = 0, label, value, color, delay = 0 }) {
  const card = useRef();
  useFrame(() => {
    if (!card.current) return;
    card.current.position.y = y + Math.sin(Date.now() * 0.002 + delay) * 0.035;
  });
  return (
    <group ref={card} position={[x, y, z]}>
      <mesh>
        <boxGeometry args={[1.22, 0.64, 0.12]} />
        <meshStandardMaterial color="#4b2b19" roughness={0.76} emissive={color} emissiveIntensity={0.08} />
      </mesh>
      <mesh position={[0, -0.36, -0.02]}>
        <cylinderGeometry args={[0.025, 0.035, 0.42, 8]} />
        <meshStandardMaterial color="#28170e" roughness={0.82} />
      </mesh>
      <Text position={[0, 0.14, 0.08]} fontSize={0.085} color="#fff7e7" anchorX="center" anchorY="middle" maxWidth={0.96}>
        {label}
      </Text>
      <Text position={[0, -0.14, 0.08]} fontSize={0.075} color={color} anchorX="center" anchorY="middle" maxWidth={0.96}>
        {value}
      </Text>
    </group>
  );
}

function StringStage({ model, color }) {
  const cards = model.op === "MSET" && model.pairs.length ? model.pairs.slice(0, 3) : [[model.key, model.value]];
  return (
    <group>
      <mesh position={[0, 0.16, -0.1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.15, 1.0, 0.28, 32]} />
        <meshStandardMaterial color="#56331e" roughness={0.85} emissive="#1a0d06" emissiveIntensity={0.18} />
      </mesh>
      {cards.map(([label, value], index) => (
        <KeyCard key={`${label}-${index}`} x={(index - (cards.length - 1) / 2) * 1.22} y={0.72} z={0.1} label={label} value={value} color={color} delay={index} />
      ))}
    </group>
  );
}

function ListStage({ model, color }) {
  const items = model.args.slice(1, 5);
  return (
    <group>
      {[-1.65, -0.55, 0.55, 1.65].map((x, index) => (
        <mesh key={`log-${x}`} position={[x, 0.38, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.16, 0.16, 0.95, 18]} />
          <meshStandardMaterial color={index % 2 ? "#6d4426" : "#54311c"} roughness={0.82} emissive={color} emissiveIntensity={0.04} />
        </mesh>
      ))}
      {[-1.45, -0.55, 0.35, 1.25].map((x, index) => (
        <KeyCard key={x} x={x} y={0.9} label={`slot ${index + 1}`} value={items[index] || ["email", "report", "sync", "alert"][index]} color={color} delay={index} />
      ))}
    </group>
  );
}

function SetStage({ model, color }) {
  const members = model.args.slice(1);
  const hasDuplicate = new Set(members).size !== members.length && members.length > 1;
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.65, 0]}>
        <torusGeometry args={[1.25, 0.055, 12, 120]} />
        <meshStandardMaterial color="#213715" emissive={color} emissiveIntensity={0.28} />
      </mesh>
      {[-1.15, -0.55, 0.05, 0.65, 1.25].map((x) => (
        <mesh key={x} position={[x, 0.75, -0.65]} rotation={[0.45, 0, 0]}>
          <coneGeometry args={[0.08, 0.42, 8]} />
          <meshStandardMaterial color="#9bd45f" roughness={0.7} />
        </mesh>
      ))}
      {[0, 1, 2].map((n) => {
        const angle = (n / 3) * Math.PI * 2;
        return <KeyCard key={n} x={Math.cos(angle) * 1.05} y={0.72} z={Math.sin(angle) * 0.55} label="member" value={members[n] || ["nova", "kai", "redis"][n]} color={color} delay={n} />;
      })}
      {hasDuplicate ? (
        <Text position={[0, 1.45, 0.08]} fontSize={0.14} color="#ff5f3f" anchorX="center" anchorY="middle">
          duplicate blocked
        </Text>
      ) : null}
    </group>
  );
}

function HashStage({ model, color }) {
  const fields = model.pairs.length ? model.pairs.slice(0, 4) : [["name", "Nova"], ["role", "engineer"], ["views", "1"]];
  return (
    <group>
      <mesh position={[0, 0.75, -0.08]}>
        <boxGeometry args={[3.25, 1.6, 0.22]} />
        <meshStandardMaterial color="#4a2b18" roughness={0.78} emissive={color} emissiveIntensity={0.08} />
      </mesh>
      {fields.map(([field, value], index) => (
        <KeyCard key={field} x={(index % 2) * 1.36 - 0.68} y={1.08 - Math.floor(index / 2) * 0.65} label={field} value={value} color={color} delay={index} />
      ))}
    </group>
  );
}

function ZSetStage({ model, color }) {
  const rows = model.pairs.length ? model.pairs.slice(0, 4) : [["900", "nova"], ["750", "kai"], ["620", "redis"]];
  return (
    <group>
      {rows.map(([score, member], index) => (
        <group key={`${member}-${index}`} position={[(index - 1.5) * 0.72, 0.28 + index * 0.18, 0]}>
          <mesh>
            <boxGeometry args={[0.48, 0.55 + index * 0.33, 0.42]} />
            <meshStandardMaterial color="#5b351f" emissive={color} emissiveIntensity={0.1 + index * 0.04} roughness={0.78} />
          </mesh>
          <Text position={[0, 0.42 + index * 0.18, 0.25]} fontSize={0.105} color="#fff7e7" anchorX="center" anchorY="middle">
            {member}
          </Text>
          <Text position={[0, 0.2 + index * 0.18, 0.25]} fontSize={0.09} color={color} anchorX="center" anchorY="middle">
            {score}
          </Text>
        </group>
      ))}
    </group>
  );
}

function StreamStage({ model, color }) {
  return (
    <group>
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[4.4, 0.12, 0.52]} />
        <meshStandardMaterial color="#1d4d3a" emissive="#38d39f" emissiveIntensity={0.16} roughness={0.5} />
      </mesh>
      {[-1.4, -0.45, 0.5, 1.45].map((x, index) => (
        <group key={x} position={[x, 0.92, 0]}>
          <mesh>
            <capsuleGeometry args={[0.16, 0.52, 8, 18]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.32} />
          </mesh>
          <Text position={[0, 0.42, 0]} fontSize={0.075} color="#fff7e7" anchorX="center" anchorY="middle">
            event {index + 1}
          </Text>
        </group>
      ))}
    </group>
  );
}

function TTLStage({ model, color }) {
  const ring = useRef();
  useFrame((_, delta) => {
    if (ring.current) ring.current.rotation.z -= delta * 0.9;
  });
  return (
    <group>
      <KeyCard x={0} y={0.78} label={model.key} value={model.value || "60s"} color={color} />
      <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.8, 0]}>
        <torusGeometry args={[1.02, 0.035, 12, 120]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.56} />
      </mesh>
    </group>
  );
}

function SpecialtyStage({ model, color }) {
  const copy = STAGE_COPY[model.type] || ["Redis Stage", "Command visualization"];
  return (
    <group>
      <mesh position={[0, 0.75, 0]}>
        <icosahedronGeometry args={[0.9, 1]} />
        <meshStandardMaterial color="#3a2416" roughness={0.64} emissive={color} emissiveIntensity={0.22} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.75, 0]}>
        <torusGeometry args={[1.25, 0.02, 8, 120]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>
      <Text position={[0, 0.72, 0.95]} fontSize={0.16} color="#fff7e7" anchorX="center" anchorY="middle" maxWidth={2.2}>
        {model.args.join(" ") || copy[0]}
      </Text>
    </group>
  );
}

function MiniKeyStrip({ keys }) {
  return (
    <group position={[0, -0.03, 1.9]}>
      <Text position={[0, 0.38, 0]} fontSize={0.08} color="#c2b48a" anchorX="center" anchorY="middle">
        CAMP INVENTORY
      </Text>
      {keys.slice(0, 8).map((item, index) => {
        const color = CITY_DISTRICTS[classifyKey(item)]?.color || "#d6ff62";
        return (
          <group key={`${item.key}-${index}`} position={[(index - 3.5) * 0.48, 0.08, 0]}>
            <mesh>
              <boxGeometry args={[0.38, 0.14, 0.12]} />
              <meshStandardMaterial color="#4b2b19" emissive={color} emissiveIntensity={0.1} />
            </mesh>
            <Text position={[0, 0.13, 0.08]} fontSize={0.04} color="#fff7e7" anchorX="center" anchorY="middle" maxWidth={0.34}>
              {item.key}
            </Text>
          </group>
        );
      })}
    </group>
  );
}

function AngryTree({ x, z, scale = 1, awake = false, color = "#7ddf64" }) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.15, 0.23, 0.9, 10]} />
        <meshStandardMaterial color="#4a2a18" roughness={0.88} />
      </mesh>
      <mesh position={[0, 1.08, 0]}>
        <sphereGeometry args={[0.46, 18, 14]} />
        <meshStandardMaterial color={awake ? "#355b22" : "#29451c"} roughness={0.82} emissive={awake ? color : "#13210d"} emissiveIntensity={awake ? 0.12 : 0.04} />
      </mesh>
      <mesh position={[-0.26, 0.92, 0.06]}>
        <sphereGeometry args={[0.3, 14, 10]} />
        <meshStandardMaterial color="#203715" roughness={0.85} />
      </mesh>
      <mesh position={[0.28, 0.95, 0.04]}>
        <sphereGeometry args={[0.32, 14, 10]} />
        <meshStandardMaterial color="#203715" roughness={0.85} />
      </mesh>
      <mesh position={[-0.1, 1.04, 0.42]}>
        <sphereGeometry args={[0.045, 10, 8]} />
        <meshStandardMaterial color="#fff4cf" emissive="#fff4cf" emissiveIntensity={awake ? 0.25 : 0.08} />
      </mesh>
      <mesh position={[0.11, 1.04, 0.42]}>
        <sphereGeometry args={[0.045, 10, 8]} />
        <meshStandardMaterial color="#fff4cf" emissive="#fff4cf" emissiveIntensity={awake ? 0.25 : 0.08} />
      </mesh>
      <mesh position={[-0.1, 1.04, 0.46]}>
        <sphereGeometry args={[0.018, 8, 6]} />
        <meshStandardMaterial color="#17100b" />
      </mesh>
      <mesh position={[0.11, 1.04, 0.46]}>
        <sphereGeometry args={[0.018, 8, 6]} />
        <meshStandardMaterial color="#17100b" />
      </mesh>
      <mesh position={[0, 0.89, 0.43]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.018, 0.18, 5, 8]} />
        <meshStandardMaterial color={awake ? "#ff6b4a" : "#c28a4a"} />
      </mesh>
    </group>
  );
}

function ForestFloor({ color, activeIndex }) {
  const trees = [
    [-2.65, -1.18, 0.95],
    [-2.9, 0.35, 0.78],
    [-2.25, 1.42, 0.92],
    [2.7, -1.28, 0.86],
    [3.02, 0.18, 0.72],
    [2.35, 1.42, 0.98],
  ];

  return (
    <group>
      <mesh position={[0, -0.1, 0]}>
        <boxGeometry args={[6.1, 0.12, 4.45]} />
        <meshStandardMaterial color="#172412" roughness={0.92} />
      </mesh>
      <mesh position={[0, -0.025, 0.78]} rotation={[0, 0.02, 0]}>
        <boxGeometry args={[4.8, 0.025, 0.82]} />
        <meshStandardMaterial color="#6e5632" roughness={0.88} emissive="#2c1c0d" emissiveIntensity={0.08} />
      </mesh>
      <mesh position={[-1.15, 0.01, 0.52]} rotation={[0, 0.16, 0]}>
        <boxGeometry args={[1.9, 0.035, 0.54]} />
        <meshStandardMaterial color="#8a6a3a" roughness={0.86} />
      </mesh>
      <mesh position={[1.1, 0.01, 0.32]} rotation={[0, -0.18, 0]}>
        <boxGeometry args={[1.9, 0.035, 0.54]} />
        <meshStandardMaterial color="#8a6a3a" roughness={0.86} />
      </mesh>
      {trees.map(([x, z, scale], index) => (
        <AngryTree key={`${x}-${z}`} x={x} z={z} scale={scale} awake={index === activeIndex % trees.length} color={color} />
      ))}
      {[-2.1, -1.25, -0.35, 0.45, 1.3, 2.08].map((x, index) => (
        <mesh key={x} position={[x, 0.05, 1.62 + (index % 2) * 0.1]}>
          <sphereGeometry args={[0.07, 10, 8]} />
          <meshStandardMaterial color={index % 2 ? "#9e7b45" : color} roughness={0.78} emissive={index % 2 ? "#25160a" : color} emissiveIntensity={index % 2 ? 0.05 : 0.18} />
        </mesh>
      ))}
    </group>
  );
}

function CommandStageScene({ activeIndex, completed, pulse, keys = [], latestTrace, command }) {
  const model = useMemo(() => stageModel(command, latestTrace), [command, latestTrace]);
  const district = CITY_DISTRICTS[model.type] || CITY_DISTRICTS.ops;
  const copy = stageCopy(model);

  return (
    <>
      <color attach="background" args={["#0c1309"]} />
      <fog attach="fog" args={["#0c1309", 6.8, 13.5]} />
      <ambientLight intensity={0.62} />
      <directionalLight position={[2.5, 6.5, 4.8]} intensity={2.8} color="#ffe4a8" />
      <pointLight position={[-2.8, 2.4, 2.8]} color="#f2c069" intensity={2.15} />
      <pointLight position={[2.8, 2.2, -1.8]} color={district.color} intensity={2.55} />
      <SparkleField count={34} scale={[5.4, 2.7, 4.2]} size={1.1} speed={0.08} color={district.color} opacity={0.16} />

      <StageLabel title={copy.title} subtitle={copy.subtitle} color={district.color} />

      <group>
        <ForestFloor color={district.color} activeIndex={activeIndex} />

        {model.type === "strings" ? <StringStage model={model} color={district.color} /> : null}
        {model.type === "lists" ? <ListStage model={model} color={district.color} /> : null}
        {model.type === "sets" ? <SetStage model={model} color={district.color} /> : null}
        {model.type === "hashes" ? <HashStage model={model} color={district.color} /> : null}
        {model.type === "zsets" ? <ZSetStage model={model} color={district.color} /> : null}
        {model.type === "streams" ? <StreamStage model={model} color={district.color} /> : null}
        {model.type === "ttl" ? <TTLStage model={model} color={district.color} /> : null}
        {["hll", "bitmaps", "geo", "scripting", "ops", "pubsub"].includes(model.type) ? <SpecialtyStage model={model} color={district.color} /> : null}

        <ResultBadge result={model.result} color={district.color} />
        {pulse ? <FlyingCommand model={model} color={district.color} pulse={pulse} /> : null}
        <MiniKeyStrip keys={keys} />
      </group>

      <Text position={[0, -1.72, 0]} fontSize={0.085} color="#c2b48a" anchorX="center" anchorY="middle">
        {keys.length} camp keys | {completed.size}/{MODULES.length} forest trials cleared
      </Text>
      <OrbitControls enablePan={false} enableZoom={false} enableRotate={false} minPolarAngle={0.82} maxPolarAngle={1.34} autoRotate={false} />
    </>
  );
}

class WorldErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

function RedisForestFallback({ completed, keys = [], latestTrace, command }) {
  const model = stageModel(command, latestTrace);
  const district = CITY_DISTRICTS[model.type] || CITY_DISTRICTS.ops;
  const copy = stageCopy(model);

  return (
    <div className="rg-forest-fallback">
      <div className="rg-fallback-sky" />
      <div className="rg-fallback-title">
        <strong>{copy.title}</strong>
        <span>{copy.subtitle}</span>
      </div>
      <div className="rg-fallback-stage" style={{ "--stage": district.color }}>
        <div className="rg-fallback-tree rg-fallback-tree-left"><span /><i /><i /></div>
        <div className="rg-fallback-path">
          <b>{model.op}</b>
          <small>{model.result}</small>
        </div>
        <div className="rg-fallback-tree rg-fallback-tree-right"><span /><i /><i /></div>
      </div>
      <div className="rg-fallback-inventory">
        <span>{keys.length} camp keys</span>
        <span>{completed.size}/{MODULES.length} trials cleared</span>
      </div>
    </div>
  );
}

function RedisWorld(props) {
  return (
    <WorldErrorBoundary fallback={<RedisForestFallback {...props} />}>
      <Canvas camera={{ position: [0, 3.75, 7.45], fov: 35 }} dpr={[1, 1.7]}>
        <CommandStageScene {...props} />
      </Canvas>
    </WorldErrorBoundary>
  );
}

const FACTORY_COPY = {
  strings: ["String Bins", "Store exact key/value parts in memory bins"],
  ttl: ["Expiry Furnace", "Attach timers so temporary keys burn down"],
  lists: ["Queue Belt", "Push and pop ordered jobs through the belt"],
  sets: ["Uniqueness Gate", "Let one copy of each member through"],
  hashes: ["Object Press", "Pack many fields under one Redis key"],
  zsets: ["Score Elevator", "Lift members by score for ranking"],
  streams: ["Event River", "Append event capsules to an ordered log"],
  pubsub: ["Broadcast Horn", "Send live messages to subscribers"],
  hll: ["Cardinality Meter", "Estimate unique visitors with tiny memory"],
  bitmaps: ["Bit Panel", "Flip compact yes/no positions"],
  geo: ["Map Table", "Store places as indexed coordinates"],
  scripting: ["Lua Reactor", "Run atomic server-side logic"],
  ops: ["Control Desk", "Inspect Redis state and safety signals"],
};

function factoryItems(model) {
  if (model.op === "MSET" && model.pairs.length) {
    return model.pairs.slice(0, 4).map(([key, value]) => ({ key, value }));
  }
  if ((model.op === "HSET" || model.op === "ZADD") && model.pairs.length) {
    return model.pairs.slice(0, 4).map(([key, value]) => ({ key, value }));
  }
  const args = model.args.slice(0, 4);
  if (args.length >= 2) return [{ key: args[0], value: args.slice(1).join(" ") }];
  if (args.length === 1) return [{ key: args[0], value: model.result }];
  return [{ key: model.key, value: model.value }];
}

function FactorySimulator({ module, completed, keys = [], history = [], command, pulse, player }) {
  const latestTrace = history[0];
  const model = stageModel(command, latestTrace);
  const district = CITY_DISTRICTS[model.type] || CITY_DISTRICTS.ops;
  const [machineTitle, machineCopy] = FACTORY_COPY[model.type] || FACTORY_COPY.ops;
  const items = factoryItems(model);
  const isLive = Boolean(pulse);

  return (
    <section className={`rg-factory-stage rg-factory-${model.type} ${isLive ? "is-live" : ""}`} style={{ "--factory": district.color }}>
      <div className="rg-factory-backdrop">
        <span></span><span></span><span></span><span></span>
      </div>

      <div className="rg-factory-banner">
        <p className="rg-eyebrow"><Activity size={14} /> live redis factory</p>
        <h2>{machineTitle}</h2>
        <p>{machineCopy}</p>
        <div className="rg-factory-meta">
          <span>Operator: <strong>{player}</strong></span>
          <span>Scope: <code>redisgame:{player}:*</code></span>
        </div>
      </div>

      <div className="rg-factory-machine">
        <div className="rg-intake">
          <span>Command intake</span>
          <strong>{model.op}</strong>
          <small>{normalizeCommand(command) || "type a command"}</small>
        </div>

        <div className="rg-conveyor" aria-label="Command data flow">
          {items.map((item, index) => (
            <div className="rg-package" key={`${item.key}-${index}`} style={{ "--delay": `${index * 180}ms` }}>
              <b>{item.key}</b>
              <small>{item.value}</small>
            </div>
          ))}
        </div>

        <div className="rg-core-machine">
          <div className="rg-core-dial">
            <span>{model.type.toUpperCase()}</span>
          </div>
          <div className="rg-machine-face">
            <strong>{model.result}</strong>
            <small>Redis response</small>
          </div>
        </div>

        <div className="rg-output-chute">
          <span>Keyspace output</span>
          <strong>{keys.length}</strong>
          <small>{completed.size}/{MODULES.length} modules cleared</small>
        </div>
      </div>

      <div className="rg-factory-machines">
        {MODULES.slice(0, 8).map((item) => (
          <div key={item.id} className={`rg-mini-machine ${item.id === module.id ? "is-active" : ""}`} style={{ "--machine": item.color }}>
            <span></span>
            <strong>{item.title}</strong>
            <small>{item.commands.slice(0, 3).join(" · ")}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function RedisGame() {
  const [player, setPlayer] = useState("nova");
  const [active, setActive] = useState(0);
  const [command, setCommand] = useState(MODULES[0].starter);
  const [history, setHistory] = useState([]);
  const [completed, setCompleted] = useState(new Set());
  const [keys, setKeys] = useState([]);
  const [busy, setBusy] = useState(false);
  const [lens, setLens] = useState("simple");
  const [tab, setTab] = useState("play");
  const [query, setQuery] = useState("");
  const [pulse, setPulse] = useState(0);
  const scopedPlayer = useMemo(() => {
    const normalized = normalizeCommand(player).toLowerCase().replace(/\s+/g, "-");
    return normalized || "nova";
  }, [player]);

  const module = MODULES[active];
  const moduleDetails = TOPIC_DETAILS[module.id];
  const activeGuide = commandGuide(command);
  const progress = Math.round((completed.size / MODULES.length) * 100);
  const xp = completed.size * 250 + history.filter((item) => item.response?.ok).length * 15;

  const filteredPalette = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return COMMAND_PALETTE;
    return COMMAND_PALETTE.filter((item) => item.toLowerCase().includes(needle));
  }, [query]);

  useEffect(() => {
    setKeys([]);
    setHistory([]);
    setPulse(0);
  }, [scopedPlayer]);

  async function runCommand(nextCommand = command) {
    const clean = normalizeCommand(nextCommand);
    if (!clean) return;
    setBusy(true);
    try {
      const res = await fetch(`${API}/game/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player: scopedPlayer, command: clean }),
      });
      const data = await res.json();
      setPulse(Date.now());
      setHistory((prev) => [{ command: clean, response: data, at: new Date().toLocaleTimeString() }, ...prev].slice(0, 12));
      if (Array.isArray(data.keys)) setKeys(data.keys);
      if (data.ok && questDone(clean, module)) {
        setCompleted((prev) => new Set([...prev, module.id]));
        const next = Math.min(active + 1, MODULES.length - 1);
        if (next !== active) {
          setActive(next);
          setCommand(MODULES[next].starter);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function resetGame() {
    await fetch(`${API}/game/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player: scopedPlayer }),
      });
    setCompleted(new Set());
    setHistory([]);
    setKeys([]);
    setActive(0);
    setCommand(MODULES[0].starter);
  }

  function selectModule(index) {
    setActive(index);
    setCommand(MODULES[index].starter);
  }

  return (
    <div className="rg-app">
      <header className="rg-topbar">
        <div className="rg-brand">
          <span><Database size={20} /></span>
          <div>
            <h1>Redis Factory</h1>
            <p>Playable Redis systems simulator</p>
          </div>
        </div>

        <div className="rg-scoreboard">
          <div><strong>{xp}</strong><span>XP</span></div>
          <div><strong>{progress}%</strong><span>Mastery</span></div>
          <div><strong>{keys.length}</strong><span>Keys</span></div>
        </div>

        <div className="rg-tabs">
          {[
            ["play", "Play", GamepadIcon],
            ["academy", "Academy", GraduationCap],
            ["interview", "Interview", Brain],
            ["ops", "Ops", Gauge],
          ].map(([id, label, Icon]) => (
            <button key={id} className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        <div className="rg-player">
          <KeyRound size={16} />
          <input value={player} onChange={(e) => setPlayer(e.target.value)} aria-label="Player" />
          <button onClick={resetGame} title="Reset lab"><RotateCcw size={16} /></button>
        </div>
      </header>

      <main className="rg-main">
        <header className="rg-header">
          <div>
            <p className="rg-eyebrow"><Sparkles size={14} /> Redis factory campaign</p>
            <h2><span>{module.region}</span></h2>
            <p>{module.title}: run a real Redis command, watch the factory route the data, then read why Redis returned that output.</p>
          </div>
        </header>

        <div className="rg-premium-ribbon">
          <span>String bins</span>
          <span>Expiry furnace</span>
          <span>Queue belt</span>
          <span>Uniqueness gate</span>
          <span>Score elevator</span>
          <span>Event river</span>
        </div>

        {tab === "play" ? (
          <section className="rg-factory-layout">
            <FactorySimulator module={module} completed={completed} keys={keys} history={history} command={command} pulse={pulse} player={scopedPlayer} />

            <div className="rg-panel rg-command-panel">
              <div className="rg-panel-head">
                <div>
                  <p className="rg-eyebrow"><Terminal size={14} /> operator console</p>
                  <h3>{module.title}</h3>
                </div>
                <span className="rg-pill" style={{ borderColor: module.color, color: module.color }}>{module.level}</span>
              </div>

              <div className="rg-lenses">
                {["simple", "engineer", "interview", "production"].map((item) => (
                  <button key={item} className={lens === item ? "is-active" : ""} onClick={() => setLens(item)}>{item}</button>
                ))}
              </div>

              <p className="rg-lesson">{module[lens]}</p>

              <div className="rg-deep-dive">
                <div>
                  <span>Mental model</span>
                  <p>{moduleDetails.mentalModel}</p>
                </div>
                <div>
                  <span>Redis shape</span>
                  <p>{moduleDetails.dataModel}</p>
                </div>
              </div>

              <div className="rg-terminal">
                <div className="rg-terminal-top">
                  <span></span><span></span><span></span>
                  <small>redis-cli --safe-game-scope</small>
                </div>
                <div className="rg-command-row">
                  <input
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") runCommand();
                    }}
                  />
                  <button onClick={() => runCommand()} disabled={busy}><Play size={16} /> Run</button>
                </div>
              </div>

              <div className="rg-command-teacher">
                <div>
                  <span>Before you run {activeGuide.op}</span>
                  <p>{activeGuide.does}</p>
                </div>
                <div>
                  <span>Why the output looks like that</span>
                  <p>{activeGuide.output}</p>
                </div>
              </div>

              <div className="rg-search">
                <Search size={15} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search command examples" />
              </div>

              <div className="rg-palette">
                {filteredPalette.slice(0, 28).map((item) => (
                  <button key={item} onClick={() => setCommand(item)}>{item}</button>
                ))}
              </div>
            </div>

            <div className="rg-panel rg-side-panel">
              <div className="rg-panel-title"><Layers3 size={16} /> Factory modules</div>
              <div className="rg-modules">
                {MODULES.map((item, index) => (
                  <button key={item.id} className={index === active ? "is-active" : ""} onClick={() => selectModule(index)}>
                    {completed.has(item.id) ? <CheckCircle2 size={16} /> : <CircleDot size={16} />}
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.commands.join(" · ")}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rg-panel rg-keys-panel">
              <div className="rg-panel-title"><ShieldCheck size={16} /> Warehouse inventory</div>
              <p className="rg-muted">Scoped prefix: <code>redisgame:{scopedPlayer}:</code></p>
              <div className="rg-key-list">
                {keys.length === 0 ? <span className="rg-muted">Run a command to create keys.</span> : keys.map((item) => (
                  <div key={item.key}>
                    <span>{item.key}</span>
                    <small>{item.type} · ttl {item.ttl}</small>
                  </div>
                ))}
              </div>
            </div>

            <div className="rg-panel rg-history">
              <div className="rg-panel-title"><Activity size={16} /> Machine trace</div>
              {history.length === 0 ? (
                <div className="rg-empty"><Zap size={16} /> Execute the suggested command to start the trace.</div>
              ) : history.map((item, index) => (
                <div className="rg-history-item" key={`${item.command}-${index}`}>
                  <div className="rg-trace-top">
                    <div>
                      <code>{item.command}</code>
                      <small>{item.at}</small>
                    </div>
                    <strong>{pretty(item.response?.ok ? item.response.result : item.response?.result)}</strong>
                  </div>
                  {item.response?.teaching ? (
                    <>
                      <p className="rg-trace-summary">{item.response.teaching.outputMeaning}</p>
                      <details className="rg-trace-details" open={index === 0}>
                        <summary>Learn what happened</summary>
                        <div className="rg-trace-teaching">
                          <section>
                            <strong>Command meaning</strong>
                            <p>{item.response.teaching.plainEnglish}</p>
                          </section>
                          <section>
                            <strong>Redis steps</strong>
                            <ul>
                              {item.response.teaching.steps.map((step) => <li key={step}>{step}</li>)}
                            </ul>
                          </section>
                          <section>
                            <strong>Try next</strong>
                            <div className="rg-next-commands">
                              {item.response.teaching.tryNext.map((next) => (
                                <button key={next} onClick={() => setCommand(next)}>{next}</button>
                              ))}
                            </div>
                          </section>
                        </div>
                      </details>
                    </>
                  ) : item.response?.explanation ? <p>{item.response.explanation}</p> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {tab === "academy" ? (
          <section className="rg-panel rg-academy">
            <div className="rg-panel-title"><BookOpen size={16} /> Redis academy</div>
            <div className="rg-academy-shell">
              <nav className="rg-academy-rail" aria-label="Redis academy topics">
                {MODULES.map((item, index) => (
                  <button key={item.id} className={index === active ? "is-active" : ""} onClick={() => selectModule(index)}>
                    <span style={{ background: item.color }}></span>
                    <strong>{item.title}</strong>
                    <small>{item.level}</small>
                  </button>
                ))}
              </nav>

              <article className="rg-academy-stage">
                <div className="rg-stage-hero">
                  <span style={{ color: module.color }}>{module.level}</span>
                  <h3>{module.title}</h3>
                  <p>{moduleDetails.mentalModel}</p>
                </div>

                <div className="rg-topic-columns">
                  <section>
                    <h4>Use it for</h4>
                    <ul>
                      {moduleDetails.whenToUse.map((line) => <li key={line}>{line}</li>)}
                    </ul>
                  </section>
                  <section>
                    <h4>Command feel</h4>
                    <ul>
                      {moduleDetails.commandNotes.map((line) => <li key={line}>{line}</li>)}
                    </ul>
                  </section>
                  <section>
                    <h4>Watch out</h4>
                    <ul>
                      {moduleDetails.pitfalls.map((line) => <li key={line}>{line}</li>)}
                    </ul>
                  </section>
                  <section>
                    <h4>Production</h4>
                    <ul>
                      {moduleDetails.productionChecklist.map((line) => <li key={line}>{line}</li>)}
                    </ul>
                  </section>
                </div>

                <div className="rg-example-flow">
                  {moduleDetails.exampleFlow.map((line) => <code key={line}>{line}</code>)}
                </div>
              </article>
            </div>
          </section>
        ) : null}

        {tab === "interview" ? (
          <section className="rg-panel rg-drills">
            <div className="rg-panel-title"><Trophy size={16} /> Interview simulator · {DRILLS.length} Redis questions</div>
            <div className="rg-interview-grid">
              {MODULES.map((item) => (
                <article key={item.id}>
                  <h3>{item.title}</h3>
                  <ul>
                    {TOPIC_DETAILS[item.id].interviewAngles.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                </article>
              ))}
            </div>
            <div className="rg-drill-bank">
              {DRILLS.map((drill, index) => (
                <details key={drill.q} open={index === 0}>
                  <summary><span>{String(index + 1).padStart(2, "0")}</span>{drill.q}</summary>
                  <p>{drill.a}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        {tab === "ops" ? (
          <section className="rg-panel rg-ops">
            <div className="rg-panel-title"><Gauge size={16} /> Senior Redis operating model</div>
            <div className="rg-ops-grid">
              {[
                ["Key design", "Use predictable prefixes, ownership boundaries, TTL policy, and cardinality limits."],
                ["Memory", "Watch used memory, fragmentation, maxmemory policy, eviction rate, and big keys."],
                ["Latency", "Track p95/p99 command latency, slowlog, network RTT, and blocking commands."],
                ["Durability", "Understand RDB snapshots, AOF, fsync tradeoffs, and recovery time."],
                ["Scale", "Know replication, Sentinel, Cluster slots, hot keys, and client-side sharding."],
                ["Safety", "Prefer SCAN over KEYS, bound list/set/zset growth, and avoid unplanned persistence gaps."],
              ].map(([title, copy]) => (
                <article key={title}>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function GamepadIcon(props) {
  return <Terminal {...props} />;
}
