package com.flashmemory.controller;

import com.flashmemory.dto.MemoryDtos;
import com.flashmemory.model.Memory;
import com.flashmemory.service.MemoryService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/memories")
@CrossOrigin(origins = "*")
public class MemoryController {

    private final MemoryService memoryService;

    public MemoryController(MemoryService memoryService) {
        this.memoryService = memoryService;
    }

    @PostMapping
    public ResponseEntity<MemoryDtos.MemoryResponse> store(
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody MemoryDtos.StoreRequest request) {

        Memory memory = Memory.builder()
                .namespace(request.getNamespace())
                .value(request.getValue())
                .tags(request.getTags())
                .priority(request.getPriority())
                .ttlSeconds(request.getTtlSeconds())
                .conflictStrategy(request.getConflictStrategy())
                .build();

        Memory stored = memoryService.storeIdempotent(memory, idempotencyKey);
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(stored));
    }

    @GetMapping("/namespaces")
    public ResponseEntity<Set<String>> namespaces() {
        return ResponseEntity.ok(memoryService.listNamespaces());
    }

    @GetMapping("/{namespace}/top")
    public ResponseEntity<MemoryDtos.MemoryPage> getTop(
            @PathVariable String namespace,
            @RequestParam(defaultValue = "10") int limit,
            @RequestParam(required = false) List<String> tags) {

        int safeLimit = Math.min(limit, 100);
        List<Memory> memories = memoryService.getTopMemories(namespace, safeLimit, tags);

        double avgScore = memories.stream()
                .mapToDouble(Memory::getRelevanceScore)
                .average()
                .orElse(0.0);

        MemoryDtos.MemoryPage page = new MemoryDtos.MemoryPage();
        page.setMemories(memories.stream().map(this::toResponse).collect(Collectors.toList()));
        page.setTotal(memories.size());
        page.setNamespace(namespace);
        page.setAverageScore(avgScore);

        return ResponseEntity.ok(page);
    }

    @GetMapping("/{namespace}/{id}")
    public ResponseEntity<MemoryDtos.MemoryResponse> getOne(
            @PathVariable String namespace,
            @PathVariable String id) {

        return memoryService.retrieve(namespace, id)
                .map(m -> ResponseEntity.ok(toResponse(m)))
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{namespace}/{id}")
    public ResponseEntity<Void> delete(
            @PathVariable String namespace,
            @PathVariable String id) {

        Optional<Memory> deleted = memoryService.deleteMemory(namespace, id);
        if (deleted.isEmpty()) return ResponseEntity.notFound().build();
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{namespace}/search")
    public ResponseEntity<MemoryDtos.MemoryPage> search(
            @PathVariable String namespace,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) List<String> tags,
            @RequestParam(defaultValue = "20") int limit) {

        List<Memory> memories = memoryService.getTopMemories(namespace, limit * 2, tags);

        if (keyword != null && !keyword.isBlank()) {
            String kw = keyword.toLowerCase();
            memories = memories.stream()
                    .filter(m -> m.getValue().toLowerCase().contains(kw))
                    .collect(Collectors.toList());
        }

        List<Memory> paged = memories.stream().limit(limit).collect(Collectors.toList());

        MemoryDtos.MemoryPage page = new MemoryDtos.MemoryPage();
        page.setMemories(paged.stream().map(this::toResponse).collect(Collectors.toList()));
        page.setTotal(paged.size());
        page.setNamespace(namespace);
        return ResponseEntity.ok(page);
    }

    private MemoryDtos.MemoryResponse toResponse(Memory m) {
        MemoryDtos.MemoryResponse r = new MemoryDtos.MemoryResponse();
        r.setId(m.getId());
        r.setNamespace(m.getNamespace());
        r.setValue(m.getValue());
        r.setTags(m.getTags());
        r.setPriority(m.getPriority());
        r.setTtlSeconds(m.getTtlSeconds());
        r.setUsageCount(m.getUsageCount());
        r.setRelevanceScore(Math.round(m.getRelevanceScore() * 1000.0) / 1000.0);
        r.setCreatedAt(m.getCreatedAt() != null ? m.getCreatedAt().toString() : null);
        r.setLastAccessedAt(m.getLastAccessedAt() != null ? m.getLastAccessedAt().toString() : null);
        return r;
    }
}
