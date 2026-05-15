package com.flashmemory.controller;

import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class HealthController {

    private final RedisConnectionFactory connectionFactory;

    public HealthController(RedisConnectionFactory connectionFactory) {
        this.connectionFactory = connectionFactory;
    }

    @GetMapping("/api/health")
    public ResponseEntity<Map<String, Object>> health() {
        try (var conn = connectionFactory.getConnection()) {
            String pong = conn.ping();
            return ResponseEntity.ok(Map.of("status", "ok", "redis", pong == null ? "unknown" : pong));
        } catch (Exception e) {
            return ResponseEntity.status(503).body(Map.of("status", "down", "redis", "down"));
        }
    }
}

