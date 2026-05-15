package com.flashmemory.dto;

import com.flashmemory.model.Memory;
import jakarta.validation.constraints.*;

import java.util.List;

public class MemoryDtos {

    public static class StoreRequest {

        @NotBlank(message = "namespace is required (e.g. user:123, team:backend)")
        @Pattern(regexp = "^[a-zA-Z0-9:_-]+$", message = "namespace: only alphanumeric, colon, underscore, hyphen allowed")
        private String namespace;

        @NotBlank(message = "value cannot be empty")
        @Size(max = 10000, message = "value too large (max 10KB)")
        private String value;

        private List<@NotBlank String> tags;

        @Min(value = 1, message = "priority must be between 1 and 10")
        @Max(value = 10, message = "priority must be between 1 and 10")
        private int priority = 5;

        @Min(value = 60, message = "ttlSeconds must be at least 60")
        @Max(value = 604800, message = "ttlSeconds cannot exceed 7 days (604800)")
        private long ttlSeconds = 3600;

        private Memory.ConflictStrategy conflictStrategy = Memory.ConflictStrategy.LATEST_WINS;

        public String getNamespace()                             { return namespace; }
        public void setNamespace(String namespace)               { this.namespace = namespace; }

        public String getValue()                                 { return value; }
        public void setValue(String value)                       { this.value = value; }

        public List<String> getTags()                            { return tags; }
        public void setTags(List<String> tags)                   { this.tags = tags; }

        public int getPriority()                                 { return priority; }
        public void setPriority(int priority)                    { this.priority = priority; }

        public long getTtlSeconds()                              { return ttlSeconds; }
        public void setTtlSeconds(long ttlSeconds)               { this.ttlSeconds = ttlSeconds; }

        public Memory.ConflictStrategy getConflictStrategy()     { return conflictStrategy; }
        public void setConflictStrategy(Memory.ConflictStrategy cs) { this.conflictStrategy = cs; }
    }

    public static class MemoryResponse {
        private String id;
        private String namespace;
        private String value;
        private List<String> tags;
        private int priority;
        private long ttlSeconds;
        private long usageCount;
        private double relevanceScore;
        private String createdAt;
        private String lastAccessedAt;

        public String getId()                                    { return id; }
        public void setId(String id)                             { this.id = id; }

        public String getNamespace()                             { return namespace; }
        public void setNamespace(String namespace)               { this.namespace = namespace; }

        public String getValue()                                 { return value; }
        public void setValue(String value)                       { this.value = value; }

        public List<String> getTags()                            { return tags; }
        public void setTags(List<String> tags)                   { this.tags = tags; }

        public int getPriority()                                 { return priority; }
        public void setPriority(int priority)                    { this.priority = priority; }

        public long getTtlSeconds()                              { return ttlSeconds; }
        public void setTtlSeconds(long ttlSeconds)               { this.ttlSeconds = ttlSeconds; }

        public long getUsageCount()                              { return usageCount; }
        public void setUsageCount(long usageCount)               { this.usageCount = usageCount; }

        public double getRelevanceScore()                        { return relevanceScore; }
        public void setRelevanceScore(double relevanceScore)     { this.relevanceScore = relevanceScore; }

        public String getCreatedAt()                             { return createdAt; }
        public void setCreatedAt(String createdAt)               { this.createdAt = createdAt; }

        public String getLastAccessedAt()                        { return lastAccessedAt; }
        public void setLastAccessedAt(String lastAccessedAt)     { this.lastAccessedAt = lastAccessedAt; }
    }

    public static class MemoryPage {
        private List<MemoryResponse> memories;
        private int total;
        private String namespace;
        private double averageScore;

        public List<MemoryResponse> getMemories()                { return memories; }
        public void setMemories(List<MemoryResponse> memories)   { this.memories = memories; }

        public int getTotal()                                    { return total; }
        public void setTotal(int total)                          { this.total = total; }

        public String getNamespace()                             { return namespace; }
        public void setNamespace(String namespace)               { this.namespace = namespace; }

        public double getAverageScore()                          { return averageScore; }
        public void setAverageScore(double averageScore)         { this.averageScore = averageScore; }
    }

    public static class QueryRequest {
        private List<String> tags;
        private int limit = 10;
        private double minScore = 0.0;
        private String keyword;

        public List<String> getTags()                            { return tags; }
        public void setTags(List<String> tags)                   { this.tags = tags; }

        public int getLimit()                                    { return limit; }
        public void setLimit(int limit)                          { this.limit = limit; }

        public double getMinScore()                              { return minScore; }
        public void setMinScore(double minScore)                 { this.minScore = minScore; }

        public String getKeyword()                               { return keyword; }
        public void setKeyword(String keyword)                   { this.keyword = keyword; }
    }
}
