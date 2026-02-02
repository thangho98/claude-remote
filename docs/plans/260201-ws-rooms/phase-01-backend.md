# Phase 01: Backend Broadcasting Implementation

Status: ✅ Complete
Dependencies: None

## Objective

Update `server/src/websocket.ts` to use `rooms.ts` broadcasting capabilities (`publishToRoom`) instead of direct `send()` for shared events. This creates the "Isolation" and "Sync" effects.

## Requirements

### Functional

- [ ] Chat messages (`message:append`, `message:thinking`, `message:done`) must be broadcast to `session:{id}`.
- [ ] Session updates (`session:list`, `session:current`) must be broadcast.
  - `session:list` updates should go to `project:{path}` (since the list belongs to the project).
  - `session:current` updates should go to `session:{id}` (or potentially `project` if we want to show active status elsewhere).
- [ ] File updates (`file:tree`, `file:content`) technically belong to `project:{path}`, but we might keep them direct for now unless we want collaborative editing (out of scope). Let's stick to **Session** and **Project** state sync.
- [ ] **Crucial:** Ensure the original sender _also_ receives the update (Pub/Sub usually requires the publisher to also be subscribed, or we manually send to self if `publish` excludes sender - _Bun's `ws.publish` excludes the sender by default_, so we need to handle that).

### Non-Functional

- [ ] Performance: properly scope broadcasts to avoid noise.
- [ ] Reliability: Maintain connection state.

## Implementation Steps

1. [ ] **Refactor `sendToSession` helper:** Create a helper function in `websocket.ts` that takes a `sessionId` and sends an event to that room AND the current `ws` (since Bun's publish skips sender).
2. [ ] **Refactor `sendToProject` helper:** Similar helper for project-level events (like session creation/deletion updates).
3. [ ] **Update `handleMessage` loop:**
   - Replace `send(ws, ...)` with `sendToSession(sessionId, ...)` for:
     - `message:append`
     - `message:thinking`
     - `message:thinking_content`
     - `message:tool_use` (if any legacy left)
     - `terminal:output`
     - `message:done`
     - `message:error`
4. [ ] **Update Session Management handlers:**
   - When a new session is created (`session:new`), broadcast `session:list` to the `project` room.
   - When session info changes (`session:info`), broadcast to `session` room.

## Files to Modify

- `server/src/websocket.ts` - Main logic update.
- `server/src/rooms.ts` - (Optional) Verify helper functions.

## Test Criteria

- [ ] **Sync Test:** Open app in 2 tabs (Tab A, Tab B). Join same session.
- [ ] Type in Tab A. Tab B should see the response stream in real-time.
- [ ] Switch projects in Tab A. Tab B (if in same project) should see session list update if a new session is added.
