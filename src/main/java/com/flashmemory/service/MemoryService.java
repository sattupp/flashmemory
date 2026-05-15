package com.flashmemory.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flashmemory.model.Memory;
import com.flashmemory.model.MemoryEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.ZSetOperations;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class MemoryService {

    private static final Logger log = LoggerFactory.getLogger(MemoryService.class);

    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;
    private final EventPublisher eventPublisher;

    @Value("${flashmemory.max-memories-per-namespace:1000}")
    private int maxMemoriesPerNamespace;

    public MemoryService(RedisTemplate<String, Object> redisTemplate,
                         ObjectMapper objectMapper,
                         EventPublisher eventPublisher) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.eventPublisher = eventPublisher;
    }

    private String hashKey(String namespace, String id) {
        return "flashmemory:" + namespace + ":mem:" + id;
    }

    private String indexKey(String namespace) {
        return "flashmemory:" + namespace + ":index";
    }

    private String tagKey(String namespace, String tag) {
        return "flashmemory:" + namespace + ":tag:" + tag;
    }

    private String memTagsKey(String namespace, String id) {
        return "flashmemory:" + namespace + ":memtags:" + id;
    }

    private String idempotencyKey(String namespace, String key) {
        return "flashmemory:" + namespace + ":idem:" + key;
    }

    public Memory store(Memory memory) {
        if (memory.getNamespace() == null || memory.getNamespace().isBlank()) {
            throw new IllegalArgumentException("Namespace cannot be null or blank");
        }
        if (memory.getValue() == null || memory.getValue().isBlank()) {
            throw new IllegalArgumentException("Memory value cannot be null or blank");
        }

        memory.setCreatedAt(Instant.now());
        memory.setLastAccessedAt(Instant.now());
        memory.setUsageCount(0L);
        memory.setRelevanceScore(computeInitialScore(memory));

        Memory existing = findById(memory.getNamespace(), memory.getId()).orElse(null);
        if (existing != null) {
            memory = resolveConflict(existing, memory);
        }

        evictIfAtCapacity(memory.getNamespace());

        String hKey = hashKey(memory.getNamespace(), memory.getId());
        Map<String, Object> fields = toHashFields(memory);

        redisTemplate.opsForHash().putAll(hKey, fields);
        redisTemplate.expire(hKey, Duration.ofSeconds(memory.getTtlSeconds()));

        redisTemplate.opsForZSet().add(
                indexKey(memory.getNamespace()),
                memory.getId(),
                memory.getRelevanceScore()
        );

        if (memory.getTags() != null) {
            for (String tag : memory.getTags()) {
                redisTemplate.opsForSet().add(tagKey(memory.getNamespace(), tag), memory.getId());
                redisTemplate.expire(tagKey(memory.getNamespace(), tag),
                        Duration.ofSeconds(memory.getTtlSeconds()));
            }

            if (!memory.getTags().isEmpty()) {
                String reverseKey = memTagsKey(memory.getNamespace(), memory.getId());
                redisTemplate.delete(reverseKey);
                redisTemplate.opsForSet().add(reverseKey, memory.getTags().toArray(new String[0]));
                redisTemplate.expire(reverseKey, Duration.ofSeconds(memory.getTtlSeconds() + 300));
            }
        }

        eventPublisher.publish(MemoryEvent.builder()
                .type(MemoryEvent.EventType.MEMORY_ADDED)
                .namespace(memory.getNamespace())
                .memoryId(memory.getId())
                .memory(memory)
                .timestamp(Instant.now())
                .details("Stored with score " + String.format("%.3f", memory.getRelevanceScore()))
                .build());

        log.debug("Stored memory {} in ns {} score={}",
                memory.getId(), memory.getNamespace(), memory.getRelevanceScore());

        return memory;
    }

    public Memory storeIdempotent(Memory memory, String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            return store(memory);
        }

        String key = idempotencyKey(memory.getNamespace(), idempotencyKey.trim());
        Object existingId = redisTemplate.opsForValue().get(key);
        if (existingId != null) {
            return findById(memory.getNamespace(), existingId.toString())
                    .orElseGet(() -> store(memory));
        }

        Memory stored = store(memory);
        redisTemplate.opsForValue().set(
                key,
                stored.getId(),
                Duration.ofSeconds(Math.max(60, stored.getTtlSeconds()))
        );
        return stored;
    }

    public List<Memory> getTopMemories(String namespace, int limit, List<String> tagFilter) {
        Set<String> candidateIds;

        if (tagFilter != null && !tagFilter.isEmpty()) {
            String[] tagKeys = tagFilter.stream()
                    .map(t -> tagKey(namespace, t))
                    .toArray(String[]::new);

            Set<Object> intersect = (tagKeys.length == 1)
                    ? redisTemplate.opsForSet().members(tagKeys[0])
                    : redisTemplate.opsForSet().intersect(
                    tagKeys[0],
                    List.of(Arrays.copyOfRange(tagKeys, 1, tagKeys.length))
            );

            if (intersect == null) return List.of();

            candidateIds = intersect.stream()
                    .map(Object::toString)
                    .collect(Collectors.toSet());
        } else {
            Set<ZSetOperations.TypedTuple<Object>> tuples = redisTemplate.opsForZSet()
                    .reverseRangeWithScores(indexKey(namespace), 0, (long) limit * 2);

            if (tuples == null || tuples.isEmpty()) return List.of();

            candidateIds = tuples.stream()
                    .map(t -> t.getValue().toString())
                    .collect(Collectors.toCollection(LinkedHashSet::new));
        }

        return candidateIds.stream()
                .limit((long) limit * 2)
                .map(id -> findById(namespace, id).orElse(null))
                .filter(Objects::nonNull)
                .sorted(Comparator.comparingDouble(Memory::getRelevanceScore).reversed())
                .limit(limit)
                .collect(Collectors.toList());
    }

    public Optional<Memory> retrieve(String namespace, String id) {
        return findById(namespace, id).map(m -> {
            boost(m, namespace);
            return m;
        });
    }

    public double computeScore(Memory memory) {
        double priorityWeight = memory.getPriority() / 10.0;
        long secondsSinceCreated = Instant.now().getEpochSecond() - memory.getCreatedAt().getEpochSecond();
        double hoursSinceCreated = secondsSinceCreated / 3600.0;
        double recencyFactor = 1.0 / (1.0 + hoursSinceCreated * 0.1);
        double frequencyFactor = Math.log1p(memory.getUsageCount());
        return priorityWeight * recencyFactor * (1.0 + frequencyFactor);
    }

    private double computeInitialScore(Memory memory) {
        return memory.getPriority() / 10.0;
    }

    private Memory boost(Memory memory, String namespace) {
        memory.setUsageCount(memory.getUsageCount() + 1);
        memory.setLastAccessedAt(Instant.now());
        memory.setRelevanceScore(computeScore(memory));

        String hKey = hashKey(namespace, memory.getId());

        redisTemplate.opsForHash().put(hKey, "usageCount", String.valueOf(memory.getUsageCount()));
        redisTemplate.opsForHash().put(hKey, "lastAccessedAt", memory.getLastAccessedAt().toString());
        redisTemplate.opsForHash().put(hKey, "relevanceScore", String.valueOf(memory.getRelevanceScore()));

        redisTemplate.opsForZSet().add(
                indexKey(namespace),
                memory.getId(),
                memory.getRelevanceScore()
        );

        eventPublisher.publish(MemoryEvent.builder()
                .type(MemoryEvent.EventType.MEMORY_BOOSTED)
                .namespace(namespace)
                .memoryId(memory.getId())
                .memory(memory)
                .timestamp(Instant.now())
                .details("Boosted to " + String.format("%.3f", memory.getRelevanceScore()))
                .build());

        return memory;
    }

    public Optional<Memory> findById(String namespace, String id) {
        Map<Object, Object> fields = redisTemplate.opsForHash().entries(hashKey(namespace, id));
        if (fields == null || fields.isEmpty()) return Optional.empty();
        return Optional.of(fromHashFields(fields));
    }

    private Memory resolveConflict(Memory existing, Memory incoming) {
        switch (incoming.getConflictStrategy()) {
            case LATEST_WINS:
                return incoming;

            case PRIORITY_WINS:
                return incoming.getPriority() >= existing.getPriority() ? incoming : existing;

            case MANUAL_MERGE:
                eventPublisher.publish(MemoryEvent.builder()
                        .type(MemoryEvent.EventType.CONFLICT_DETECTED)
                        .namespace(existing.getNamespace())
                        .memoryId(existing.getId())
                        .timestamp(Instant.now())
                        .details("Conflict detected — manual merge required")
                        .build());
                return existing;

            default:
                return incoming;
        }
    }

    private void evictIfAtCapacity(String namespace) {
        Long size = redisTemplate.opsForZSet().size(indexKey(namespace));
        if (size != null && size >= maxMemoriesPerNamespace) {
            Set<ZSetOperations.TypedTuple<Object>> lowest =
                    redisTemplate.opsForZSet().popMin(indexKey(namespace), 1);

            if (lowest != null && !lowest.isEmpty()) {
                String evictedId = lowest.iterator().next().getValue().toString();
                removeAllReferences(namespace, evictedId);
                log.info("Evicted low-score memory {} from {}", evictedId, namespace);
            }
        }
    }

    public Optional<Memory> deleteMemory(String namespace, String id) {
        Optional<Memory> existing = findById(namespace, id);
        if (existing.isEmpty()) return Optional.empty();

        removeAllReferences(namespace, id);

        eventPublisher.publish(MemoryEvent.builder()
                .type(MemoryEvent.EventType.MEMORY_DELETED)
                .namespace(namespace)
                .memoryId(id)
                .timestamp(Instant.now())
                .details("Deleted by API request")
                .build());

        return existing;
    }

    public void removeAllReferences(String namespace, String id) {
        removeFromIndex(namespace, id);
        redisTemplate.delete(hashKey(namespace, id));
        String reverseKey = memTagsKey(namespace, id);
        Set<Object> tags = redisTemplate.opsForSet().members(reverseKey);
        if (tags != null && !tags.isEmpty()) {
            for (Object t : tags) {
                String tag = t.toString();
                redisTemplate.opsForSet().remove(tagKey(namespace, tag), id);
            }
        }
        redisTemplate.delete(reverseKey);
    }

    private Map<String, Object> toHashFields(Memory memory) {
        Map<String, Object> f = new HashMap<>();
        f.put("id", memory.getId());
        f.put("namespace", memory.getNamespace());
        f.put("value", memory.getValue());
        f.put("priority", String.valueOf(memory.getPriority()));
        f.put("ttlSeconds", String.valueOf(memory.getTtlSeconds()));
        f.put("usageCount", String.valueOf(memory.getUsageCount()));
        f.put("relevanceScore", String.valueOf(memory.getRelevanceScore()));

        if (memory.getCreatedAt() != null) {
            f.put("createdAt", memory.getCreatedAt().toString());
        }
        if (memory.getLastAccessedAt() != null) {
            f.put("lastAccessedAt", memory.getLastAccessedAt().toString());
        }
        if (memory.getConflictStrategy() != null) {
            f.put("conflictStrategy", memory.getConflictStrategy().name());
        }

        try {
            f.put("tags", objectMapper.writeValueAsString(memory.getTags()));
        } catch (JsonProcessingException e) {
            f.put("tags", "[]");
        }

        return f;
    }

    private Memory fromHashFields(Map<Object, Object> fields) {
        Memory m = new Memory();

        m.setId(stringField(fields, "id", m.getId()));
        m.setNamespace(stringField(fields, "namespace", ""));
        m.setValue(stringField(fields, "value", ""));
        m.setPriority(intField(fields, "priority", 5));
        m.setTtlSeconds(longField(fields, "ttlSeconds", 3600L));
        m.setUsageCount(longField(fields, "usageCount", 0L));
        m.setRelevanceScore(doubleField(fields, "relevanceScore", 0.0));

        String createdAt = stringField(fields, "createdAt", null);
        if (createdAt != null && !createdAt.isBlank()) {
            try {
                m.setCreatedAt(Instant.parse(createdAt));
            } catch (Exception ignored) {
                m.setCreatedAt(Instant.now());
            }
        } else {
            m.setCreatedAt(Instant.now());
        }

        String lastAccessedAt = stringField(fields, "lastAccessedAt", null);
        if (lastAccessedAt != null && !lastAccessedAt.isBlank()) {
            try {
                m.setLastAccessedAt(Instant.parse(lastAccessedAt));
            } catch (Exception ignored) {
                m.setLastAccessedAt(Instant.now());
            }
        } else {
            m.setLastAccessedAt(Instant.now());
        }

        String strategy = stringField(fields, "conflictStrategy", Memory.ConflictStrategy.LATEST_WINS.name());
        try {
            m.setConflictStrategy(Memory.ConflictStrategy.valueOf(strategy));
        } catch (Exception ignored) {
            m.setConflictStrategy(Memory.ConflictStrategy.LATEST_WINS);
        }

        String tagsJson = stringField(fields, "tags", "[]");
        try {
            m.setTags(objectMapper.readValue(tagsJson, new TypeReference<List<String>>() {}));
        } catch (Exception e) {
            m.setTags(new ArrayList<>());
        }

        return m;
    }

    public long removeFromIndex(String namespace, String id) {
        Long removed = redisTemplate.opsForZSet().remove(indexKey(namespace), id);
        return removed == null ? 0L : removed;
    }

    public Set<String> getAllIdsInNamespace(String namespace) {
        Set<Object> members = redisTemplate.opsForZSet().range(indexKey(namespace), 0, -1);
        if (members == null) return Set.of();
        return members.stream().map(Object::toString).collect(Collectors.toSet());
    }

    public Set<String> getReverseTags(String namespace, String id) {
        Set<Object> members = redisTemplate.opsForSet().members(memTagsKey(namespace, id));
        if (members == null) return Set.of();
        return members.stream().map(Object::toString).collect(Collectors.toSet());
    }

    public Set<String> listNamespaces() {
        Set<String> keys = redisTemplate.execute((RedisCallback<Set<String>>) connection -> {
            Set<String> out = new HashSet<>();
            try (var cursor = connection.scan(ScanOptions.scanOptions().match("flashmemory:*:index").count(1000).build())) {
                cursor.forEachRemaining(raw -> out.add(new String(raw, StandardCharsets.UTF_8)));
            }
            return out;
        });

        if (keys == null || keys.isEmpty()) return Set.of();

        Set<String> namespaces = new TreeSet<>();
        for (String k : keys) {
            if (!k.startsWith("flashmemory:") || !k.endsWith(":index")) continue;
            String withoutPrefix = k.substring("flashmemory:".length());
            namespaces.add(withoutPrefix.substring(0, withoutPrefix.length() - ":index".length()));
        }
        return namespaces;
    }

    private String stringField(Map<Object, Object> fields, String key, String defaultValue) {
        Object v = fields.get(key);
        return v == null ? defaultValue : v.toString();
    }

    private int intField(Map<Object, Object> fields, String key, int defaultValue) {
        Object v = fields.get(key);
        if (v == null) return defaultValue;
        try {
            return Integer.parseInt(v.toString());
        } catch (Exception e) {
            return defaultValue;
        }
    }

    private long longField(Map<Object, Object> fields, String key, long defaultValue) {
        Object v = fields.get(key);
        if (v == null) return defaultValue;
        try {
            return Long.parseLong(v.toString());
        } catch (Exception e) {
            return defaultValue;
        }
    }

    private double doubleField(Map<Object, Object> fields, String key, double defaultValue) {
        Object v = fields.get(key);
        if (v == null) return defaultValue;
        try {
            return Double.parseDouble(v.toString());
        } catch (Exception e) {
            return defaultValue;
        }
    }
}
