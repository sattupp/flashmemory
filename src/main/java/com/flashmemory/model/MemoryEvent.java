package com.flashmemory.model;

import java.time.Instant;

public class MemoryEvent {

    public enum EventType {
        MEMORY_ADDED,
        MEMORY_DELETED,
        MEMORY_EXPIRED,
        MEMORY_BOOSTED,
        MEMORY_DECAYED,
        MEMORY_ARCHIVED,
        CONFLICT_DETECTED
    }

    private EventType type;
    private String namespace;
    private String memoryId;
    private Memory memory;
    private Instant timestamp;
    private String details;

    public MemoryEvent() {}

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private final MemoryEvent e = new MemoryEvent();

        public Builder type(EventType type)           { e.type = type; return this; }
        public Builder namespace(String namespace)     { e.namespace = namespace; return this; }
        public Builder memoryId(String memoryId)       { e.memoryId = memoryId; return this; }
        public Builder memory(Memory memory)           { e.memory = memory; return this; }
        public Builder timestamp(Instant timestamp)    { e.timestamp = timestamp; return this; }
        public Builder details(String details)         { e.details = details; return this; }
        public MemoryEvent build()                     { return e; }
    }

    public EventType getType()                         { return type; }
    public void setType(EventType type)                { this.type = type; }

    public String getNamespace()                       { return namespace; }
    public void setNamespace(String namespace)         { this.namespace = namespace; }

    public String getMemoryId()                        { return memoryId; }
    public void setMemoryId(String memoryId)           { this.memoryId = memoryId; }

    public Memory getMemory()                          { return memory; }
    public void setMemory(Memory memory)               { this.memory = memory; }

    public Instant getTimestamp()                      { return timestamp; }
    public void setTimestamp(Instant timestamp)        { this.timestamp = timestamp; }

    public String getDetails()                         { return details; }
    public void setDetails(String details)             { this.details = details; }
}
