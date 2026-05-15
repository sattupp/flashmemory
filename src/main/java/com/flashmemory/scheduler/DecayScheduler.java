package com.flashmemory.scheduler;

import com.flashmemory.model.Memory;
import com.flashmemory.model.MemoryEvent;
import com.flashmemory.service.EventPublisher;
import com.flashmemory.service.MemoryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;

@Component
@EnableScheduling
public class DecayScheduler {

    private static final Logger log = LoggerFactory.getLogger(DecayScheduler.class);

    private final RedisTemplate<String, Object> redisTemplate;
    private final MemoryService memoryService;
    private final EventPublisher eventPublisher;

    @Value("${flashmemory.decay.factor:0.95}")
    private double decayFactor;

    public DecayScheduler(RedisTemplate<String, Object> redisTemplate,
                          MemoryService memoryService,
                          EventPublisher eventPublisher) {
        this.redisTemplate = redisTemplate;
        this.memoryService = memoryService;
        this.eventPublisher = eventPublisher;
    }

    @Scheduled(fixedDelayString = "${flashmemory.decay.interval-seconds:30}000")
    public void runDecayCycle() {
        log.debug("Starting decay cycle...");

        Set<String> indexKeys = scanKeys("flashmemory:*:index");
        if (indexKeys == null || indexKeys.isEmpty()) return;

        int decayed = 0;
        int staleRemoved = 0;

        for (String indexKey : indexKeys) {
            String namespace = extractNamespace(indexKey);
            Set<String> ids = memoryService.getAllIdsInNamespace(namespace);

            for (String id : ids) {
                Optional<Memory> memOpt = memoryService.findById(namespace, id);

                if (memOpt.isEmpty()) {
                    long removed = memoryService.removeFromIndex(namespace, id);
                    memoryService.removeAllReferences(namespace, id);
                    staleRemoved++;
                    if (removed > 0) {
                        eventPublisher.publish(MemoryEvent.builder()
                                .type(MemoryEvent.EventType.MEMORY_EXPIRED)
                                .namespace(namespace)
                                .memoryId(id)
                                .timestamp(Instant.now())
                                .details("Memory expired (TTL elapsed)")
                                .build());
                    }
                    continue;
                }

                Memory memory = memOpt.get();
                double oldScore = memory.getRelevanceScore();
                double newScore = memoryService.computeScore(memory);
                memory.setRelevanceScore(newScore);

                if (newScore < oldScore * 0.01) {
                    memoryService.removeFromIndex(namespace, id);
                    log.debug("Archived near-zero score memory {} in {}", id, namespace);
                } else {
                    redisTemplate.opsForZSet().add(
                            "flashmemory:" + namespace + ":index", id, newScore);
                    decayed++;

                    if (oldScore - newScore > 0.05) {
                        eventPublisher.publish( MemoryEvent.builder()
                                .type(MemoryEvent.EventType.MEMORY_DECAYED)
                                .namespace(namespace)
                                .memoryId(id)
                                .memory(memory)
                                .timestamp(Instant.now())
                                .details(String.format("Score %.3f → %.3f", oldScore, newScore))
                                .build());
                    }
                }
            }
        }

        log.info("Decay cycle complete: {} decayed, {} stale removed", decayed, staleRemoved);
    }

    private String extractNamespace(String indexKey) {
        String withoutPrefix = indexKey.replace("flashmemory:", "");
        return withoutPrefix.substring(0, withoutPrefix.lastIndexOf(":index"));
    }

    private Set<String> scanKeys(String pattern) {
        return redisTemplate.execute((RedisConnection connection) -> {
            Set<String> keys = new HashSet<>();
            try (var cursor = connection.scan(ScanOptions.scanOptions().match(pattern).count(1000).build())) {
                cursor.forEachRemaining(raw -> keys.add(new String(raw, StandardCharsets.UTF_8)));
            }
            return keys;
        });
    }
}
