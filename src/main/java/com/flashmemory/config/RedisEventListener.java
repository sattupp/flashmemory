package com.flashmemory.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.flashmemory.model.MemoryEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

@Component
public class RedisEventListener implements MessageListener {

    private static final Logger log = LoggerFactory.getLogger(RedisEventListener.class);

    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;

    public RedisEventListener(SimpMessagingTemplate messagingTemplate, ObjectMapper objectMapper) {
        this.messagingTemplate = messagingTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            String payload = new String(message.getBody(), StandardCharsets.UTF_8);
            String channel = new String(message.getChannel(), StandardCharsets.UTF_8);

            MemoryEvent event = objectMapper.readValue(payload, MemoryEvent.class);

            String topic = "/topic/memories/" + event.getNamespace();
            messagingTemplate.convertAndSend(topic, event);
            messagingTemplate.convertAndSend("/topic/memories/all", event);

            log.debug("Forwarded {} from channel {} to topic {}", event.getType(), channel, topic);
        } catch (Exception e) {
            log.error("Failed to process Redis Pub/Sub message", e);
        }
    }
}