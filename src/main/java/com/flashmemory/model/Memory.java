package com.flashmemory.model;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public class Memory {

    private String id = UUID.randomUUID().toString();
    private String namespace;
    private String value;
    private List<String> tags;
    private int priority = 5;
    private long ttlSeconds = 3600L;
    private Instant createdAt;
    private Instant lastAccessedAt;
    private long usageCount = 0;
    private double relevanceScore = 0.0;
    private ConflictStrategy conflictStrategy = ConflictStrategy.LATEST_WINS;

    public enum ConflictStrategy {
        LATEST_WINS,
        PRIORITY_WINS,
        MANUAL_MERGE
    }

    public Memory() {}

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private final Memory m = new Memory();

        public Builder id(String id)                             { m.id = id; return this; }
        public Builder namespace(String namespace)               { m.namespace = namespace; return this; }
        public Builder value(String value)                       { m.value = value; return this; }
        public Builder tags(List<String> tags)                   { m.tags = tags; return this; }
        public Builder priority(int priority)                    { m.priority = priority; return this; }
        public Builder ttlSeconds(long ttlSeconds)               { m.ttlSeconds = ttlSeconds; return this; }
        public Builder createdAt(Instant createdAt)              { m.createdAt = createdAt; return this; }
        public Builder lastAccessedAt(Instant lastAccessedAt)    { m.lastAccessedAt = lastAccessedAt; return this; }
        public Builder usageCount(long usageCount)               { m.usageCount = usageCount; return this; }
        public Builder relevanceScore(double relevanceScore)     { m.relevanceScore = relevanceScore; return this; }
        public Builder conflictStrategy(ConflictStrategy cs)     { m.conflictStrategy = cs; return this; }
        public Memory build()                                    { return m; }
    }

    public String getId()                              { return id; }
    public void setId(String id)                       { this.id = id; }

    public String getNamespace()                       { return namespace; }
    public void setNamespace(String namespace)         { this.namespace = namespace; }

    public String getValue()                           { return value; }
    public void setValue(String value)                 { this.value = value; }

    public List<String> getTags()                      { return tags; }
    public void setTags(List<String> tags)             { this.tags = tags; }

    public int getPriority()                           { return priority; }
    public void setPriority(int priority)              { this.priority = priority; }

    public long getTtlSeconds()                        { return ttlSeconds; }
    public void setTtlSeconds(long ttlSeconds)         { this.ttlSeconds = ttlSeconds; }

    public Instant getCreatedAt()                      { return createdAt; }
    public void setCreatedAt(Instant createdAt)        { this.createdAt = createdAt; }

    public Instant getLastAccessedAt()                 { return lastAccessedAt; }
    public void setLastAccessedAt(Instant t)           { this.lastAccessedAt = t; }

    public long getUsageCount()                        { return usageCount; }
    public void setUsageCount(long usageCount)         { this.usageCount = usageCount; }

    public double getRelevanceScore()                  { return relevanceScore; }
    public void setRelevanceScore(double relevanceScore) { this.relevanceScore = relevanceScore; }

    public ConflictStrategy getConflictStrategy()      { return conflictStrategy; }
    public void setConflictStrategy(ConflictStrategy c){ this.conflictStrategy = c; }
}
