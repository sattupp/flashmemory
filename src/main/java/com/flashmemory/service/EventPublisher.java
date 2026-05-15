package com.flashmemory.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flashmemory.model.MemoryEvent;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class EventPublisher {

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    public EventPublisher(StringRedisTemplate redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    public void publish(MemoryEvent event) {
        try {
            String namespace = event.getNamespace();

            if (namespace == null || namespace.isBlank()) {
                throw new IllegalArgumentException("Namespace cannot be null");
            }

            String channel = "flashmemory:" + namespace + ":events";

            String payload = objectMapper.writeValueAsString(event);

            redisTemplate.convertAndSend(channel, payload);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize MemoryEvent", e);
        }
    }
}
