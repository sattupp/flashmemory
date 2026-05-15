package com.flashmemory.controller;

import org.springframework.data.redis.connection.DataType;
import org.springframework.data.redis.connection.RedisGeoCommands.DistanceUnit;
import org.springframework.data.redis.connection.ReturnType;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.geo.Distance;
import org.springframework.data.geo.Point;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;

@RestController
@RequestMapping("/api/game")
@CrossOrigin(origins = "*")
public class RedisGameController {

    private static final Set<String> ALLOWED = Set.of(
            "SET", "GET", "DEL", "EXISTS", "EXPIRE", "TTL", "INCR", "DECR",
            "MSET", "MGET", "SETNX", "APPEND", "STRLEN", "GETSET",
            "LPUSH", "RPUSH", "LPOP", "RPOP", "LRANGE", "LLEN", "LINDEX", "LTRIM",
            "SADD", "SMEMBERS", "SREM", "SCARD", "SINTER", "SUNION", "SDIFF", "SISMEMBER",
            "HSET", "HGET", "HMGET", "HGETALL", "HDEL", "HLEN", "HINCRBY",
            "ZADD", "ZRANGE", "ZREVRANGE", "ZREM", "ZCARD", "ZRANGEBYSCORE", "ZSCORE", "ZRANK", "ZREVRANK", "ZINCRBY", "ZCOUNT", "ZPOPMIN",
            "XADD", "XRANGE", "XLEN", "XDEL",
            "PFADD", "PFCOUNT", "PFMERGE",
            "SETBIT", "GETBIT", "BITCOUNT",
            "GEOADD", "GEODIST", "GEOPOS",
            "TYPE", "KEYS", "SCAN", "INFO", "DBSIZE", "PUBLISH", "EVAL"
    );

    private final StringRedisTemplate redis;

    public RedisGameController(StringRedisTemplate redis) {
        this.redis = redis;
    }

    @GetMapping("/lessons")
    public ResponseEntity<List<Lesson>> lessons() {
        return ResponseEntity.ok(List.of(
                new Lesson("string", "String", "SET player:score 10", "Strings power cache values, counters, feature flags, locks, and session tokens."),
                new Lesson("ttl", "TTL", "EXPIRE player:score 60", "TTL turns Redis into a time-aware memory system for sessions, OTPs, rate limits, and temporary context."),
                new Lesson("list", "List", "LPUSH queue:jobs email", "Lists model queues, stacks, timelines, and recent activity feeds."),
                new Lesson("set", "Set", "SADD room:online satya", "Sets model uniqueness, membership, intersections, tags, and online users."),
                new Lesson("hash", "Hash", "HSET user:1 name Satya role engineer", "Hashes model objects without serializing an entire JSON blob on every update."),
                new Lesson("zset", "Sorted Set", "ZADD leaderboard 900 satya", "Sorted sets power rankings, leaderboards, priority queues, rate limit windows, and relevance scoring."),
                new Lesson("stream", "Stream", "XADD events * type signup user satya", "Streams are durable event logs with replay and consumer-group patterns."),
                new Lesson("pubsub", "Pub/Sub", "PUBLISH alerts deploy_done", "Pub/Sub broadcasts live messages but does not persist them."),
                new Lesson("scan", "SCAN mindset", "KEYS player:*", "In production, prefer SCAN over KEYS because KEYS blocks Redis while scanning large keyspaces.")
        ));
    }

    @PostMapping("/command")
    public ResponseEntity<GameCommandResponse> run(@RequestBody GameCommandRequest request) {
        String player = sanitizePlayer(request.player());
        List<String> parts = tokenize(request.command());
        if (parts.isEmpty()) {
            return ResponseEntity.badRequest().body(GameCommandResponse.error("Type a Redis command to run."));
        }

        String command = parts.get(0).toUpperCase(Locale.ROOT);
        if (!ALLOWED.contains(command)) {
            return ResponseEntity.badRequest().body(GameCommandResponse.error("Command is locked in game mode: " + command));
        }

        try {
            Object result = execute(player, command, parts);
            return ResponseEntity.ok(new GameCommandResponse(true, command, result, explain(command), scopedKeys(player), teach(command, parts, result)));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(GameCommandResponse.error(e.getMessage()));
        }
    }

    @PostMapping("/reset")
    public ResponseEntity<Map<String, Object>> reset(@RequestBody GameResetRequest request) {
        String player = sanitizePlayer(request.player());
        Set<String> keys = redis.keys(prefix(player) + "*");
        if (keys != null && !keys.isEmpty()) {
            redis.delete(keys);
        }
        return ResponseEntity.ok(Map.of("ok", true, "player", player));
    }

    private Object execute(String player, String command, List<String> parts) {
        return switch (command) {
            case "SET" -> {
                require(parts, 3, "SET key value [EX seconds] [NX|XX]");
                String redisKey = key(player, parts.get(1));
                String value = parts.get(2);
                Duration ttl = null;
                boolean nx = false;
                boolean xx = false;
                for (int i = 3; i < parts.size(); i++) {
                    String option = parts.get(i).toUpperCase(Locale.ROOT);
                    if ("EX".equals(option)) {
                        if (i + 1 >= parts.size()) throw new IllegalArgumentException("SET EX needs seconds.");
                        ttl = Duration.ofSeconds(asLong(parts.get(++i)));
                    } else if ("NX".equals(option)) {
                        nx = true;
                    } else if ("XX".equals(option)) {
                        xx = true;
                    } else {
                        throw new IllegalArgumentException("Unsupported SET option in game mode: " + option);
                    }
                }
                if (nx && xx) throw new IllegalArgumentException("SET cannot use NX and XX together.");
                Boolean ok;
                if (nx) {
                    ok = ttl == null ? redis.opsForValue().setIfAbsent(redisKey, value) : redis.opsForValue().setIfAbsent(redisKey, value, ttl);
                } else if (xx) {
                    ok = Boolean.FALSE;
                    if (Boolean.TRUE.equals(redis.hasKey(redisKey))) {
                        if (ttl == null) redis.opsForValue().set(redisKey, value);
                        else redis.opsForValue().set(redisKey, value, ttl);
                        ok = Boolean.TRUE;
                    }
                } else {
                    if (ttl == null) redis.opsForValue().set(redisKey, value);
                    else redis.opsForValue().set(redisKey, value, ttl);
                    ok = Boolean.TRUE;
                }
                yield Boolean.TRUE.equals(ok) ? "OK" : null;
            }
            case "MSET" -> {
                require(parts, 3, "MSET key value [key value ...]");
                if ((parts.size() - 1) % 2 != 0) throw new IllegalArgumentException("MSET needs key/value pairs.");
                Map<String, String> values = new LinkedHashMap<>();
                for (int i = 1; i < parts.size(); i += 2) values.put(key(player, parts.get(i)), parts.get(i + 1));
                redis.opsForValue().multiSet(values);
                yield "OK";
            }
            case "MGET" -> {
                require(parts, 2, "MGET key [key ...]");
                yield redis.opsForValue().multiGet(parts.subList(1, parts.size()).stream().map(k -> key(player, k)).toList());
            }
            case "SETNX" -> {
                require(parts, 3, "SETNX key value");
                yield Boolean.TRUE.equals(redis.opsForValue().setIfAbsent(key(player, parts.get(1)), parts.get(2))) ? 1 : 0;
            }
            case "APPEND" -> {
                require(parts, 3, "APPEND key value");
                yield redis.opsForValue().append(key(player, parts.get(1)), parts.get(2));
            }
            case "STRLEN" -> {
                require(parts, 2, "STRLEN key");
                Long size = redis.execute((RedisCallback<Long>) connection -> connection.stringCommands().strLen(bytes(key(player, parts.get(1)))));
                yield size == null ? 0 : size;
            }
            case "GETSET" -> {
                require(parts, 3, "GETSET key value");
                yield redis.opsForValue().getAndSet(key(player, parts.get(1)), parts.get(2));
            }
            case "GET" -> {
                require(parts, 2, "GET key");
                yield redis.opsForValue().get(key(player, parts.get(1)));
            }
            case "DEL" -> {
                require(parts, 2, "DEL key [key ...]");
                List<String> keys = parts.subList(1, parts.size()).stream().map(k -> key(player, k)).toList();
                yield redis.delete(keys);
            }
            case "EXISTS" -> {
                require(parts, 2, "EXISTS key");
                yield Boolean.TRUE.equals(redis.hasKey(key(player, parts.get(1)))) ? 1 : 0;
            }
            case "EXPIRE" -> {
                require(parts, 3, "EXPIRE key seconds");
                yield Boolean.TRUE.equals(redis.expire(key(player, parts.get(1)), Duration.ofSeconds(asLong(parts.get(2))))) ? 1 : 0;
            }
            case "TTL" -> {
                require(parts, 2, "TTL key");
                yield redis.getExpire(key(player, parts.get(1)));
            }
            case "INCR" -> {
                require(parts, 2, "INCR key");
                yield redis.opsForValue().increment(key(player, parts.get(1)));
            }
            case "DECR" -> {
                require(parts, 2, "DECR key");
                yield redis.opsForValue().decrement(key(player, parts.get(1)));
            }
            case "LPUSH" -> {
                require(parts, 3, "LPUSH key value [value ...]");
                yield redis.opsForList().leftPushAll(key(player, parts.get(1)), parts.subList(2, parts.size()));
            }
            case "RPUSH" -> {
                require(parts, 3, "RPUSH key value [value ...]");
                yield redis.opsForList().rightPushAll(key(player, parts.get(1)), parts.subList(2, parts.size()));
            }
            case "LPOP" -> {
                require(parts, 2, "LPOP key");
                yield redis.opsForList().leftPop(key(player, parts.get(1)));
            }
            case "RPOP" -> {
                require(parts, 2, "RPOP key");
                yield redis.opsForList().rightPop(key(player, parts.get(1)));
            }
            case "LRANGE" -> {
                require(parts, 4, "LRANGE key start stop");
                yield redis.opsForList().range(key(player, parts.get(1)), asLong(parts.get(2)), asLong(parts.get(3)));
            }
            case "LINDEX" -> {
                require(parts, 3, "LINDEX key index");
                yield redis.opsForList().index(key(player, parts.get(1)), asLong(parts.get(2)));
            }
            case "LTRIM" -> {
                require(parts, 4, "LTRIM key start stop");
                redis.opsForList().trim(key(player, parts.get(1)), asLong(parts.get(2)), asLong(parts.get(3)));
                yield "OK";
            }
            case "LLEN" -> {
                require(parts, 2, "LLEN key");
                yield redis.opsForList().size(key(player, parts.get(1)));
            }
            case "SADD" -> {
                require(parts, 3, "SADD key member [member ...]");
                yield redis.opsForSet().add(key(player, parts.get(1)), parts.subList(2, parts.size()).toArray(String[]::new));
            }
            case "SMEMBERS" -> {
                require(parts, 2, "SMEMBERS key");
                yield redis.opsForSet().members(key(player, parts.get(1)));
            }
            case "SREM" -> {
                require(parts, 3, "SREM key member [member ...]");
                yield redis.opsForSet().remove(key(player, parts.get(1)), parts.subList(2, parts.size()).toArray());
            }
            case "SCARD" -> {
                require(parts, 2, "SCARD key");
                yield redis.opsForSet().size(key(player, parts.get(1)));
            }
            case "SISMEMBER" -> {
                require(parts, 3, "SISMEMBER key member");
                yield Boolean.TRUE.equals(redis.opsForSet().isMember(key(player, parts.get(1)), parts.get(2))) ? 1 : 0;
            }
            case "SINTER" -> {
                require(parts, 3, "SINTER key [key ...]");
                yield redis.opsForSet().intersect(key(player, parts.get(1)), parts.subList(2, parts.size()).stream().map(k -> key(player, k)).toList());
            }
            case "SUNION" -> {
                require(parts, 3, "SUNION key [key ...]");
                yield redis.opsForSet().union(key(player, parts.get(1)), parts.subList(2, parts.size()).stream().map(k -> key(player, k)).toList());
            }
            case "SDIFF" -> {
                require(parts, 3, "SDIFF key [key ...]");
                yield redis.opsForSet().difference(key(player, parts.get(1)), parts.subList(2, parts.size()).stream().map(k -> key(player, k)).toList());
            }
            case "HSET" -> {
                require(parts, 4, "HSET key field value [field value ...]");
                if ((parts.size() - 2) % 2 != 0) throw new IllegalArgumentException("HSET needs field/value pairs.");
                Map<String, String> map = new LinkedHashMap<>();
                for (int i = 2; i < parts.size(); i += 2) map.put(parts.get(i), parts.get(i + 1));
                redis.opsForHash().putAll(key(player, parts.get(1)), map);
                yield map.size();
            }
            case "HGET" -> {
                require(parts, 3, "HGET key field");
                yield redis.opsForHash().get(key(player, parts.get(1)), parts.get(2));
            }
            case "HMGET" -> {
                require(parts, 3, "HMGET key field [field ...]");
                yield redis.opsForHash().multiGet(key(player, parts.get(1)), new ArrayList<>(parts.subList(2, parts.size())));
            }
            case "HGETALL" -> {
                require(parts, 2, "HGETALL key");
                yield redis.opsForHash().entries(key(player, parts.get(1)));
            }
            case "HDEL" -> {
                require(parts, 3, "HDEL key field [field ...]");
                yield redis.opsForHash().delete(key(player, parts.get(1)), parts.subList(2, parts.size()).toArray());
            }
            case "HLEN" -> {
                require(parts, 2, "HLEN key");
                yield redis.opsForHash().size(key(player, parts.get(1)));
            }
            case "HINCRBY" -> {
                require(parts, 4, "HINCRBY key field increment");
                yield redis.opsForHash().increment(key(player, parts.get(1)), parts.get(2), asLong(parts.get(3)));
            }
            case "ZADD" -> {
                require(parts, 4, "ZADD key score member [score member ...]");
                if ((parts.size() - 2) % 2 != 0) throw new IllegalArgumentException("ZADD needs score/member pairs.");
                long added = 0;
                for (int i = 2; i < parts.size(); i += 2) {
                    Boolean ok = redis.opsForZSet().add(key(player, parts.get(1)), parts.get(i + 1), asDouble(parts.get(i)));
                    if (Boolean.TRUE.equals(ok)) added++;
                }
                yield added;
            }
            case "ZRANGE" -> {
                require(parts, 4, "ZRANGE key start stop");
                yield redis.opsForZSet().range(key(player, parts.get(1)), asLong(parts.get(2)), asLong(parts.get(3)));
            }
            case "ZREVRANGE" -> {
                require(parts, 4, "ZREVRANGE key start stop");
                yield redis.opsForZSet().reverseRange(key(player, parts.get(1)), asLong(parts.get(2)), asLong(parts.get(3)));
            }
            case "ZREM" -> {
                require(parts, 3, "ZREM key member [member ...]");
                yield redis.opsForZSet().remove(key(player, parts.get(1)), parts.subList(2, parts.size()).toArray());
            }
            case "ZCARD" -> {
                require(parts, 2, "ZCARD key");
                yield redis.opsForZSet().size(key(player, parts.get(1)));
            }
            case "ZRANGEBYSCORE" -> {
                require(parts, 4, "ZRANGEBYSCORE key min max");
                yield redis.opsForZSet().rangeByScore(key(player, parts.get(1)), asDouble(parts.get(2)), asDouble(parts.get(3)));
            }
            case "ZSCORE" -> {
                require(parts, 3, "ZSCORE key member");
                yield redis.opsForZSet().score(key(player, parts.get(1)), parts.get(2));
            }
            case "ZRANK" -> {
                require(parts, 3, "ZRANK key member");
                yield redis.opsForZSet().rank(key(player, parts.get(1)), parts.get(2));
            }
            case "ZREVRANK" -> {
                require(parts, 3, "ZREVRANK key member");
                yield redis.opsForZSet().reverseRank(key(player, parts.get(1)), parts.get(2));
            }
            case "ZINCRBY" -> {
                require(parts, 4, "ZINCRBY key increment member");
                yield redis.opsForZSet().incrementScore(key(player, parts.get(1)), parts.get(3), asDouble(parts.get(2)));
            }
            case "ZCOUNT" -> {
                require(parts, 4, "ZCOUNT key min max");
                yield redis.opsForZSet().count(key(player, parts.get(1)), asDouble(parts.get(2)), asDouble(parts.get(3)));
            }
            case "ZPOPMIN" -> {
                require(parts, 2, "ZPOPMIN key [count]");
                long count = parts.size() > 2 ? asLong(parts.get(2)) : 1;
                var popped = redis.opsForZSet().popMin(key(player, parts.get(1)), count);
                yield popped == null ? List.of() : popped.stream()
                        .map(tuple -> Map.of("value", tuple.getValue(), "score", tuple.getScore()))
                        .toList();
            }
            case "XADD" -> {
                require(parts, 5, "XADD key * field value [field value ...]");
                if (!"*".equals(parts.get(2))) throw new IllegalArgumentException("Game mode supports XADD key * field value.");
                if ((parts.size() - 3) % 2 != 0) throw new IllegalArgumentException("XADD needs field/value pairs.");
                Map<String, String> map = new LinkedHashMap<>();
                for (int i = 3; i < parts.size(); i += 2) map.put(parts.get(i), parts.get(i + 1));
                yield redis.opsForStream().add(key(player, parts.get(1)), map).getValue();
            }
            case "XRANGE" -> {
                require(parts, 4, "XRANGE key - +");
                yield redis.opsForStream().range(key(player, parts.get(1)), org.springframework.data.domain.Range.unbounded());
            }
            case "XLEN" -> {
                require(parts, 2, "XLEN key");
                yield redis.opsForStream().size(key(player, parts.get(1)));
            }
            case "XDEL" -> {
                require(parts, 3, "XDEL key id [id ...]");
                yield redis.opsForStream().delete(key(player, parts.get(1)), parts.subList(2, parts.size()).toArray(String[]::new));
            }
            case "PFADD" -> {
                require(parts, 3, "PFADD key element [element ...]");
                yield redis.opsForHyperLogLog().add(key(player, parts.get(1)), parts.subList(2, parts.size()).toArray(String[]::new));
            }
            case "PFCOUNT" -> {
                require(parts, 2, "PFCOUNT key [key ...]");
                yield redis.opsForHyperLogLog().size(parts.subList(1, parts.size()).stream().map(k -> key(player, k)).toArray(String[]::new));
            }
            case "PFMERGE" -> {
                require(parts, 3, "PFMERGE destkey sourcekey [sourcekey ...]");
                redis.opsForHyperLogLog().union(key(player, parts.get(1)), parts.subList(2, parts.size()).stream().map(k -> key(player, k)).toArray(String[]::new));
                yield "OK";
            }
            case "SETBIT" -> {
                require(parts, 4, "SETBIT key offset value");
                long bit = asLong(parts.get(3));
                if (bit != 0 && bit != 1) throw new IllegalArgumentException("SETBIT value must be 0 or 1.");
                yield Boolean.TRUE.equals(redis.opsForValue().setBit(key(player, parts.get(1)), asLong(parts.get(2)), bit == 1)) ? 1 : 0;
            }
            case "GETBIT" -> {
                require(parts, 3, "GETBIT key offset");
                yield Boolean.TRUE.equals(redis.opsForValue().getBit(key(player, parts.get(1)), asLong(parts.get(2)))) ? 1 : 0;
            }
            case "BITCOUNT" -> {
                require(parts, 2, "BITCOUNT key");
                Long count = redis.execute((RedisCallback<Long>) connection -> connection.stringCommands().bitCount(bytes(key(player, parts.get(1)))));
                yield count == null ? 0 : count;
            }
            case "GEOADD" -> {
                require(parts, 5, "GEOADD key longitude latitude member [longitude latitude member ...]");
                if ((parts.size() - 2) % 3 != 0) throw new IllegalArgumentException("GEOADD needs longitude latitude member triples.");
                long added = 0;
                for (int i = 2; i < parts.size(); i += 3) {
                    Long ok = redis.opsForGeo().add(key(player, parts.get(1)), new Point(asDouble(parts.get(i)), asDouble(parts.get(i + 1))), parts.get(i + 2));
                    added += ok == null ? 0 : ok;
                }
                yield added;
            }
            case "GEODIST" -> {
                require(parts, 4, "GEODIST key member1 member2 [m|km|mi]");
                DistanceUnit metric = parts.size() > 4 ? metric(parts.get(4)) : DistanceUnit.METERS;
                Distance distance = redis.opsForGeo().distance(key(player, parts.get(1)), parts.get(2), parts.get(3), metric);
                yield distance == null ? null : distance.getValue() + " " + distance.getMetric().getAbbreviation();
            }
            case "GEOPOS" -> {
                require(parts, 3, "GEOPOS key member [member ...]");
                List<Point> positions = redis.opsForGeo().position(key(player, parts.get(1)), parts.subList(2, parts.size()).toArray(String[]::new));
                yield positions == null ? List.of() : positions.stream()
                        .map(point -> point == null ? null : Map.of("longitude", point.getX(), "latitude", point.getY()))
                        .toList();
            }
            case "TYPE" -> {
                require(parts, 2, "TYPE key");
                DataType type = redis.type(key(player, parts.get(1)));
                yield type == null ? "none" : type.code();
            }
            case "KEYS" -> {
                require(parts, 2, "KEYS pattern");
                Set<String> keys = redis.keys(key(player, parts.get(1)));
                if (keys == null) yield List.of();
                yield keys.stream().map(k -> k.replace(prefix(player), "")).sorted().toList();
            }
            case "SCAN" -> {
                String pattern = "*";
                if (parts.size() >= 4 && "MATCH".equalsIgnoreCase(parts.get(2))) {
                    pattern = parts.get(3);
                } else if (parts.size() >= 2 && !"0".equals(parts.get(1))) {
                    pattern = parts.get(1);
                }
                ScanOptions options = ScanOptions.scanOptions().match(key(player, pattern)).count(50).build();
                List<String> found = new ArrayList<>();
                try (var cursor = redis.scan(options)) {
                    cursor.forEachRemaining(k -> found.add(k.replace(prefix(player), "")));
                }
                yield found.stream().sorted().toList();
            }
            case "INFO" -> {
                String section = parts.size() > 1 ? parts.get(1).toLowerCase(Locale.ROOT) : "server";
                Properties info = redis.execute((RedisCallback<Properties>) connection -> connection.serverCommands().info(section));
                if (info == null) yield Map.of();
                Map<String, String> sample = new LinkedHashMap<>();
                info.stringPropertyNames().stream().sorted().limit(18).forEach(name -> sample.put(name, info.getProperty(name)));
                yield sample;
            }
            case "DBSIZE" -> {
                Long size = redis.execute((RedisCallback<Long>) connection -> connection.serverCommands().dbSize());
                yield size == null ? 0 : size;
            }
            case "PUBLISH" -> {
                require(parts, 3, "PUBLISH channel message");
                yield redis.convertAndSend(key(player, parts.get(1)), parts.get(2));
            }
            case "EVAL" -> {
                require(parts, 4, "EVAL script numkeys key [key ...] [arg ...]");
                String script = parts.get(1);
                long numKeys = asLong(parts.get(2));
                if (numKeys < 0 || parts.size() < 3 + numKeys) throw new IllegalArgumentException("EVAL numkeys does not match provided keys.");
                List<byte[]> keysAndArgs = new ArrayList<>();
                for (int i = 3; i < parts.size(); i++) {
                    String value = i < 3 + numKeys ? key(player, parts.get(i)) : parts.get(i);
                    keysAndArgs.add(bytes(value));
                }
                Object value = redis.execute((RedisCallback<Object>) connection -> connection.scriptingCommands().eval(bytes(script), ReturnType.VALUE, (int) numKeys, keysAndArgs.toArray(byte[][]::new)));
                yield value instanceof byte[] bytes ? new String(bytes, StandardCharsets.UTF_8) : value;
            }
            default -> throw new IllegalArgumentException("Unsupported command.");
        };
    }

    private List<Map<String, Object>> scopedKeys(String player) {
        Set<String> keys = redis.keys(prefix(player) + "*");
        if (keys == null || keys.isEmpty()) return List.of();
        return keys.stream().sorted().map(k -> {
            String visible = k.replace(prefix(player), "");
            DataType type = redis.type(k);
            Long ttl = redis.getExpire(k);
            return Map.<String, Object>of(
                    "key", visible,
                    "type", type == null ? "none" : type.code(),
                    "ttl", ttl == null ? -1 : ttl
            );
        }).toList();
    }

    private String explain(String command) {
        return switch (command) {
            case "SET", "GET", "MSET", "MGET", "SETNX", "INCR", "DECR", "APPEND", "STRLEN", "GETSET" -> "String model: simple values, counters, flags, locks, tokens, and retry-safe primitives.";
            case "EXPIRE", "TTL" -> "Expiration model: temporary state for sessions, OTPs, cooldowns, and rate limits.";
            case "LPUSH", "RPUSH", "LPOP", "RPOP", "LRANGE", "LLEN", "LINDEX", "LTRIM" -> "List model: ordered queues, stacks, feeds, and recent events.";
            case "SADD", "SMEMBERS", "SREM", "SCARD", "SINTER", "SUNION", "SDIFF", "SISMEMBER" -> "Set model: uniqueness, membership, tags, intersections, and online users.";
            case "HSET", "HGET", "HMGET", "HGETALL", "HDEL", "HLEN", "HINCRBY" -> "Hash model: field-level object storage.";
            case "ZADD", "ZRANGE", "ZREVRANGE", "ZREM", "ZCARD", "ZRANGEBYSCORE", "ZSCORE", "ZRANK", "ZREVRANK", "ZINCRBY", "ZCOUNT", "ZPOPMIN" -> "Sorted set model: rankings, priorities, leaderboards, and scored retrieval.";
            case "XADD", "XRANGE", "XLEN", "XDEL" -> "Stream model: durable event log with replay semantics.";
            case "PFADD", "PFCOUNT", "PFMERGE" -> "HyperLogLog model: approximate unique counting with tiny fixed memory.";
            case "SETBIT", "GETBIT", "BITCOUNT" -> "Bitmap model: compact bit-level flags and activity tracking.";
            case "GEOADD", "GEODIST", "GEOPOS" -> "Geospatial model: longitude/latitude indexing backed by sorted sets.";
            case "PUBLISH" -> "Pub/Sub model: live broadcast without persistence.";
            case "KEYS", "SCAN", "INFO", "DBSIZE" -> "Keyspace and operations model: inspect Redis carefully, and prefer incremental production-safe patterns.";
            case "TYPE" -> "Type introspection: check the Redis model behind a key.";
            case "EVAL" -> "Lua scripting model: run a small server-side script atomically.";
            default -> "Redis command executed.";
        };
    }

    private CommandTeaching teach(String command, List<String> parts, Object result) {
        String keyName = parts.size() > 1 ? parts.get(1) : "key";
        String output = prettyResult(result);
        return switch (command) {
            case "MSET" -> new CommandTeaching(
                    "MSET key value [key value ...]",
                    "Writes many string keys in one network round trip.",
                    List.of(
                            "Redis reads the command as alternating key/value pairs.",
                            "Each key is scoped to your player, so " + keyName + " is stored under " + prefixPreview(keyName) + ".",
                            "All values are stored as Redis strings."
                    ),
                    "The output is OK because Redis accepted the multi-key write. MSET does not print each stored value; use MGET to read them back.",
                    List.of("MGET " + joinKeys(parts, 1, 2), "TYPE " + keyName, "TTL " + keyName),
                    List.of("MSET needs complete key/value pairs.", "MSET overwrites existing string values without asking.")
            );
            case "SET" -> new CommandTeaching("SET key value [EX seconds] [NX|XX]", "Stores one string value at one key.", List.of("Redis creates or replaces the key.", "EX attaches a countdown timer when present.", "NX writes only if the key is missing; XX writes only if the key already exists."), "OK means the write happened. nil means an NX/XX condition blocked the write.", List.of("GET " + keyName, "TTL " + keyName, "SET " + keyName + " locked EX 30 NX"), List.of("Plain SET overwrites old values.", "Large JSON strings are rewritten completely on every update."));
            case "GET" -> new CommandTeaching("GET key", "Reads one string value.", List.of("Redis looks up the key in memory.", "If the key exists and is a string, Redis returns the stored value.", "If the key is missing, Redis returns nil."), output + " is the value currently stored at that key, or nil if the key does not exist.", List.of("SET " + keyName + " demo", "TYPE " + keyName), List.of("GET only works on string keys. Hashes, lists, sets, and sorted sets need their own read commands."));
            case "MGET" -> new CommandTeaching("MGET key [key ...]", "Reads many string keys in one round trip.", List.of("Redis checks each requested key in order.", "It returns an array matching the key order in your command.", "Missing keys appear as nil in their array position."), "The output is an array because you requested multiple keys. Each slot belongs to the key in the same position in your command.", List.of("MSET hero:role engineer hero:city redisland", "MGET hero:role hero:city"), List.of("MGET does not search by prefix; you must name the keys."));
            case "SETNX" -> new CommandTeaching("SETNX key value", "Set if not exists: a simple lock or idempotency primitive.", List.of("Redis checks whether the key already exists.", "If missing, it stores the value.", "If present, it leaves the old value untouched."), "1 means Redis created the key. 0 means the key already existed, so nothing changed.", List.of("GET " + keyName, "EXPIRE " + keyName + " 30"), List.of("SETNX without TTL can leave stuck locks. Prefer SET key value EX seconds NX."));
            case "INCR", "DECR" -> new CommandTeaching(command + " key", "Atomically changes an integer string by one.", List.of("Redis reads the string value as an integer.", "It increments or decrements inside Redis as one atomic operation.", "The new number is stored back at the same key."), "The output is the new counter value after the change.", List.of(command + " " + keyName, "GET " + keyName), List.of("This fails if the current value is not an integer-like string."));
            case "EXPIRE" -> new CommandTeaching("EXPIRE key seconds", "Adds or replaces a countdown timer for a key.", List.of("Redis checks whether the key exists.", "If it exists, Redis stores expiry metadata beside it.", "After the timer passes, the key becomes eligible for removal."), "1 means Redis attached the TTL. 0 means the key was missing, so there was nothing to expire.", List.of("TTL " + keyName, "GET " + keyName), List.of("Expiry is not an exact scheduler; deletion is lazy plus active background cleanup."));
            case "TTL" -> new CommandTeaching("TTL key", "Shows how many seconds remain before a key expires.", List.of("Redis checks the key and its expiry metadata.", "A positive number means seconds remaining.", "-1 means the key exists but has no TTL. -2 means it does not exist."), "The number in the output is the remaining TTL state for this key.", List.of("EXPIRE " + keyName + " 60", "TTL " + keyName), List.of("TTL is key-level. Individual hash fields cannot have separate TTLs."));
            case "LPUSH", "RPUSH" -> new CommandTeaching(command + " key value [value ...]", "Pushes one or more values into a list.", List.of("Redis creates the list if it is missing.", command.equals("LPUSH") ? "Values are inserted at the left/head side." : "Values are inserted at the right/tail side.", "Redis returns the list length after insertion."), "The output is the new length of the list, not the inserted value.", List.of("LRANGE " + keyName + " 0 -1", "LLEN " + keyName, "LTRIM " + keyName + " 0 99"), List.of("Unbounded lists can grow forever. Trim queues and feeds intentionally."));
            case "LRANGE" -> new CommandTeaching("LRANGE key start stop", "Reads a slice of a list by index.", List.of("Redis finds the list.", "Start and stop are zero-based indexes.", "-1 means the last item."), "The output is an array of list values in the selected range.", List.of("LPUSH " + keyName + " item1 item2", "LINDEX " + keyName + " 0"), List.of("LRANGE 0 -1 on a huge list can return too much data."));
            case "SADD" -> new CommandTeaching("SADD key member [member ...]", "Adds unique members to a set.", List.of("Redis creates the set if needed.", "Duplicate members are ignored.", "Only new members increase the count."), "The output is how many new members were added. Existing duplicates are not counted.", List.of("SMEMBERS " + keyName, "SISMEMBER " + keyName + " nova", "SCARD " + keyName), List.of("Sets are unordered. Use sorted sets when ranking matters."));
            case "SINTER", "SUNION", "SDIFF" -> new CommandTeaching(command + " key [key ...]", "Compares multiple sets.", List.of("Redis loads membership from the provided sets.", "Intersection keeps common members, union combines members, and difference subtracts later sets from the first.", "This command returns the computed result without creating a new key."), "The output is the set result of that comparison.", List.of("SADD team:a nova kai", "SADD team:b nova", "SINTER team:a team:b"), List.of("Set algebra on very large sets can be expensive."));
            case "HSET" -> new CommandTeaching("HSET key field value [field value ...]", "Stores fields inside one hash key.", List.of("Redis creates the hash if missing.", "Each field is updated independently.", "The hash key appears as one key in the keyspace."), "The output is the number of fields written by this call in the game. Use HGETALL to inspect the object.", List.of("HGETALL " + keyName, "HGET " + keyName + " name", "HINCRBY " + keyName + " views 1"), List.of("Hash TTL applies to the whole hash key, not individual fields."));
            case "HGETALL" -> new CommandTeaching("HGETALL key", "Reads every field and value from a hash.", List.of("Redis checks the hash key.", "It returns all field/value pairs currently stored.", "The result looks like an object because hashes are field maps."), "The output is the complete hash at this moment.", List.of("HMGET " + keyName + " name role", "HLEN " + keyName), List.of("Avoid HGETALL on huge hashes in hot production paths."));
            case "ZADD" -> new CommandTeaching("ZADD key score member [score member ...]", "Adds or updates scored members in a sorted set.", List.of("Redis stores each member once.", "The numeric score decides ordering.", "Updating a member changes its rank."), "The output is how many new members were inserted. Updating an existing member may return 0.", List.of("ZREVRANGE " + keyName + " 0 10", "ZSCORE " + keyName + " nova", "ZRANK " + keyName + " nova"), List.of("Define what score means before using sorted sets: rank, time, priority, or relevance."));
            case "ZREVRANGE", "ZRANGE", "ZRANGEBYSCORE" -> new CommandTeaching(command + " key range", "Reads sorted-set members by rank or score.", List.of("Redis uses the sorted-set ordering.", "ZRANGE returns low to high by rank.", "ZREVRANGE returns high to low, useful for leaderboards."), "The output is the members that match your requested range.", List.of("ZADD " + keyName + " 900 nova 750 kai", "ZCOUNT " + keyName + " 700 1000"), List.of("Plain range commands return members only here. Scores can be fetched with ZSCORE."));
            case "XADD" -> new CommandTeaching("XADD key * field value [field value ...]", "Appends an event to a Redis Stream.", List.of("Redis creates the stream if missing.", "The * asks Redis to generate the event ID.", "Fields become the event body."), "The output is the generated stream entry ID. It encodes time plus sequence.", List.of("XRANGE " + keyName + " - +", "XLEN " + keyName), List.of("Streams need trimming and consumer-lag monitoring in production."));
            case "XRANGE" -> new CommandTeaching("XRANGE key - +", "Reads stream events by ID range.", List.of("- means the first possible ID.", "+ means the last possible ID.", "Redis returns entries in append order."), "The output is a list of stream events, each with ID and fields.", List.of("XADD " + keyName + " * type signup user nova", "XLEN " + keyName), List.of("XRANGE over a huge stream should be bounded with limits in real systems."));
            case "PFADD", "PFCOUNT", "PFMERGE" -> new CommandTeaching(command + " ...", "Works with HyperLogLog approximate unique counts.", List.of("Redis stores a probabilistic sketch, not every raw element.", "The memory stays tiny even for many unique values.", "Counts are approximate, usually with small error."), "PFADD returns whether the sketch changed. PFCOUNT returns the estimated unique count. PFMERGE returns OK after combining sketches.", List.of("PFADD visits nova kai nova", "PFCOUNT visits"), List.of("HyperLogLog cannot list the original elements."));
            case "SETBIT", "GETBIT", "BITCOUNT" -> new CommandTeaching(command + " ...", "Uses a string value as a compact array of bits.", List.of("Redis treats offsets as bit positions.", "SETBIT flips one position.", "BITCOUNT counts all 1 bits."), "SETBIT returns the previous bit. GETBIT returns the current bit. BITCOUNT returns how many bits are set to 1.", List.of("SETBIT active:today 42 1", "GETBIT active:today 42", "BITCOUNT active:today"), List.of("Very high offsets can allocate memory up to that position."));
            case "GEOADD", "GEODIST", "GEOPOS" -> new CommandTeaching(command + " ...", "Stores and queries longitude/latitude points.", List.of("Redis encodes geo points into a sorted set internally.", "Members are place names or IDs.", "Distance and position commands read from that index."), "GEOADD returns added members. GEODIST returns distance. GEOPOS returns stored coordinates.", List.of("GEOADD places 77.5946 12.9716 bengaluru", "GEOPOS places bengaluru"), List.of("Longitude comes before latitude in Redis commands."));
            case "SCAN" -> new CommandTeaching("SCAN cursor [MATCH pattern]", "Incrementally scans keys instead of blocking the server.", List.of("The game scopes the pattern to your player.", "Redis returns a batch-like list here for learning.", "In real Redis, SCAN uses cursors and must be looped until cursor 0."), "The output is matching keys in your game namespace.", List.of("SCAN 0 MATCH hero:*", "TYPE hero:name"), List.of("SCAN can return duplicates in real usage; client code must tolerate that."));
            case "KEYS" -> new CommandTeaching("KEYS pattern", "Finds matching keys by scanning the entire keyspace.", List.of("Redis checks keys against the pattern.", "The game scope keeps this small.", "Production Redis can block while KEYS runs."), "The output is the matching key names inside your game namespace.", List.of("SCAN 0 MATCH *", "TYPE " + keyName), List.of("Avoid KEYS in production. Prefer SCAN."));
            case "TYPE" -> new CommandTeaching("TYPE key", "Checks which Redis data type lives at a key.", List.of("Redis checks metadata for the key.", "It returns string, list, set, hash, zset, stream, or none."), "The output names the data structure Redis sees for this key.", List.of("GET " + keyName, "HGETALL " + keyName, "LRANGE " + keyName + " 0 -1"), List.of("Using the wrong read command for a type causes WRONGTYPE errors in real Redis."));
            case "PUBLISH" -> new CommandTeaching("PUBLISH channel message", "Broadcasts a message to currently subscribed clients.", List.of("Redis sends the message to active subscribers on the channel.", "It does not store the message.", "Disconnected subscribers miss it."), "The output is the number of subscribers that received the message. 0 is normal when nobody is listening.", List.of("PUBLISH alerts hello", "XADD events * type alert message hello"), List.of("Do not use Pub/Sub as a durable job queue."));
            case "EVAL" -> new CommandTeaching("EVAL script numkeys key [key ...] [arg ...]", "Runs a Lua script atomically inside Redis.", List.of("Redis receives the script and declared keys.", "The script runs server-side as one atomic operation.", "The game scopes keys before executing it."), "The output is whatever the Lua script returns.", List.of("EVAL \"return redis.call('GET', KEYS[1])\" 1 hero:name"), List.of("Long scripts block Redis. Keep scripts short and deterministic."));
            default -> new CommandTeaching(command + " ...", explain(command), List.of("Redis validates the command.", "It performs the operation against your scoped keyspace.", "The live keyspace panel shows resulting keys."), "The output is Redis' direct response for this command: " + output + ".", List.of("TYPE " + keyName, "KEYS *"), List.of("Use the command-specific academy card to understand production tradeoffs."));
        };
    }

    private String prettyResult(Object result) {
        if (result == null) return "nil";
        if (result instanceof Collection<?> collection) return collection.size() + " item(s)";
        if (result instanceof Map<?, ?> map) return map.size() + " field(s)";
        return String.valueOf(result);
    }

    private String joinKeys(List<String> parts, int start, int step) {
        List<String> keys = new ArrayList<>();
        for (int i = start; i < parts.size(); i += step) keys.add(parts.get(i));
        return keys.isEmpty() ? "key" : String.join(" ", keys);
    }

    private String prefixPreview(String key) {
        return "redisgame:<player>:" + key;
    }

    private byte[] bytes(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }

    private DistanceUnit metric(String value) {
        return switch (value.toLowerCase(Locale.ROOT)) {
            case "km" -> DistanceUnit.KILOMETERS;
            case "mi" -> DistanceUnit.MILES;
            case "ft" -> DistanceUnit.FEET;
            default -> DistanceUnit.METERS;
        };
    }

    private String key(String player, String key) {
        if (key.startsWith("redisgame:")) {
            throw new IllegalArgumentException("Use plain keys in game mode. The API scopes them automatically.");
        }
        return prefix(player) + key;
    }

    private String prefix(String player) {
        return "redisgame:" + player + ":";
    }

    private String sanitizePlayer(String value) {
        String player = value == null || value.isBlank() ? "guest" : value.trim().toLowerCase(Locale.ROOT);
        player = player.replaceAll("[^a-z0-9:_-]", "-");
        return player.isBlank() ? "guest" : player;
    }

    private List<String> tokenize(String command) {
        if (command == null || command.isBlank()) return List.of();
        List<String> out = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean quote = false;
        for (int i = 0; i < command.length(); i++) {
            char c = command.charAt(i);
            if (c == '"') {
                quote = !quote;
            } else if (Character.isWhitespace(c) && !quote) {
                if (!current.isEmpty()) {
                    out.add(current.toString());
                    current.setLength(0);
                }
            } else {
                current.append(c);
            }
        }
        if (!current.isEmpty()) out.add(current.toString());
        return out;
    }

    private void require(List<String> parts, int min, String usage) {
        if (parts.size() < min) throw new IllegalArgumentException("Usage: " + usage);
    }

    private long asLong(String value) {
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Expected integer, got: " + value);
        }
    }

    private double asDouble(String value) {
        try {
            return Double.parseDouble(value);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Expected number, got: " + value);
        }
    }

    public record GameCommandRequest(String player, String command) {}

    public record GameResetRequest(String player) {}

    public record Lesson(String id, String title, String command, String interview) {}

    public record CommandTeaching(String syntax, String plainEnglish, List<String> steps, String outputMeaning, List<String> tryNext, List<String> mistakes) {}

    public record GameCommandResponse(boolean ok, String command, Object result, String explanation, Object keys, CommandTeaching teaching) {
        static GameCommandResponse error(String message) {
            return new GameCommandResponse(false, null, message, null, List.of(), null);
        }
    }
}
