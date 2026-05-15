# Testing FlashMemory

This repo has two kinds of testing:

1. A fast, repeatable smoke test that hits every feature from the API surface.
2. Manual UI checks for real-time WebSocket updates.

## Prereqs

- Backend running on `http://localhost:8080`
- Redis running on `localhost:6379`
- (Optional) Frontend running on `http://localhost:3000`

## API Smoke Test (Covers All Features)

Runs through:

- Store memory
- Top memories ranking
- Retrieve memory (boosts usageCount and score)
- Keyword search
- Delete memory (removes hash + index + tag refs)
- TTL expiry cleanup (no stale IDs)

Command:

```bash
bash scripts/smoke.sh
```

Override defaults:

```bash
API_BASE=http://localhost:8080/api NS=user:mytest bash scripts/smoke.sh
```

## Manual Realtime Events Test

1. Open `http://localhost:3000`
2. Store a memory
3. Verify:
   - New memory appears in the “Top memories” list
   - Event feed shows `MEMORY_ADDED`
4. Click a memory detail view (or call `GET /api/memories/{ns}/{id}`):
   - Verify event feed shows `MEMORY_BOOSTED`
5. Wait for decay cycle:
   - Verify `MEMORY_DECAYED` events appear periodically
6. Delete a memory:
   - Verify `MEMORY_DELETED`
7. Store a memory with a short TTL and wait:
   - Verify `MEMORY_EXPIRED`

