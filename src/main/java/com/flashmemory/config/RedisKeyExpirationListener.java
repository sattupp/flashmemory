package com.flashmemory.config;

import com.flashmemory.model.MemoryEvent;
import com.flashmemory.service.EventPublisher;
import com.flashmemory.service.MemoryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Instant;

@Component
public class RedisKeyExpirationListener implements MessageListener {

    private static final Logger log = LoggerFactory.getLogger(RedisKeyExpirationListener.class);

    private static final String PREFIX = "flashmemory:";
    private static final String MEM_MARKER = ":mem:";

    private final MemoryService memoryService;
    private final EventPublisher eventPublisher;

    public RedisKeyExpirationListener(MemoryService memoryService, EventPublisher eventPublisher) {
        this.memoryService = memoryService;
        this.eventPublisher = eventPublisher;
    }

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            String expiredKey = new String(message.getBody(), StandardCharsets.UTF_8);
            if (!expiredKey.startsWith(PREFIX)) return;

            int memIdx = expiredKey.lastIndexOf(MEM_MARKER);
            if (memIdx < 0) return;

            String namespace = expiredKey.substring(PREFIX.length(), memIdx);
            String id = expiredKey.substring(memIdx + MEM_MARKER.length());
            if (namespace.isBlank() || id.isBlank()) return;

            memoryService.removeAllReferences(namespace, id);

            eventPublisher.publish(MemoryEvent.builder()
                    .type(MemoryEvent.EventType.MEMORY_EXPIRED)
                    .namespace(namespace)
                    .memoryId(id)
                    .timestamp(Instant.now())
                    .details("Memory expired (TTL elapsed)")
                    .build());

            log.debug("Expired cleanup for ns={} id={}", namespace, id);
        } catch (Exception e) {
            log.error("Failed handling Redis expired key notification", e);
        }
    }
}
