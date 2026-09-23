# Data Collection Reference

This document describes every piece of data this app persists to Supabase
(on a `telemetry: true` instance — see `src/config/instances/`), when each
row is written, and what gets included in the admin data export at `/data`.
Other admin-only surfaces read this same data live rather than exporting
it: `/usage` (AI cost/token spend, `src/services/adminUsage.js`) and
`/users` (per-student roster + activity drill-down, `src/services/adminUsers.js`)
— see the note near the `ai_usage` table and "What is not in the export"
below for how `/users` relates to what's covered here.

All tables live in the `public` schema and have row-level security (RLS)
enabled. Regular users can only read/write their own rows; admins have read
access across all users for the auditing tables. The full DDL (tables,
constraints, RLS policies, grants) is in `INSTALL.md` §11 — treat that as
the source of truth for column types/constraints and this document as the
source of truth for *when* and *why* each row gets written.

## Tables at a glance

| Table | Written by | Exported by `/data` | Purpose |
|---|---|---|---|
| `user_profiles` | `AuthContext` first-login upsert | ✅ | Email + roster info per authenticated user |
| `ai_models` | Operator-managed (no app writes) | ❌ | Catalog of selectable chat models and pricing |
| `ai_usage` | Modal backend (`budget_manager.py`) | ❌ | Per-inference token + cost accounting |
| `sessions` | `sessionManager.createNewSession` | ✅ | Top-level work container, one per user "project" |
| `conversations` | `sessionManager.createConversation` | ✅ | Chat tab inside a session |
| `messages` | `dataLogger.logMessage` | ✅ | Every user/assistant/system chat message |
| `code` | `sessionManager.createCode` / live autosave | ✅ | Current contents of each code tab |
| `code_snapshots` | `sessionManager.createCodeSnapshot` | ✅ | Append-only history of code contents |
| `console` | `dataLogger.logConsole` | ✅ | Terminal output captures |
| `interactions` | `dataLogger.logInteraction` | ✅ | Toolbar/button/lifecycle click events |

`code` holds the *current* contents of each tab (mutated in place by live edits); `code_snapshots` is the append-only history. Both are included in the export so you can pull either the latest state of a tab or its full editing history.

---

## `user_profiles`

One row per authenticated user, keyed by `auth.users.id`.

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid PK | FK to `auth.users.id` |
| `email` | text, unique | Pulled from the auth provider on first login |
| `students` | text | Optional roster string; the only column users can `UPDATE` themselves |
| `created_at` | timestamptz | Set on insert |
| `updated_at` | timestamptz | Auto-bumped by `trg_touch_user_profiles_updated_at` |

**Write path:** Upserted by `AuthContext` after a successful sign-in via `userProfileUpsertSchema`.

---

## `ai_models`

Static catalog of chat models. Operator-managed (no in-app writes). `ChatPanel` reads this at runtime via `src/services/aiModels.js`.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `model_name` | text | e.g. `gpt-5.4-mini` |
| `provider` | text | e.g. `openai`, `google` (default `openai`) |
| `input_price` | real | USD per 1M input tokens |
| `cached_input_price` | real | USD per 1M cached input tokens |
| `output_price` | real | USD per 1M output tokens |
| `unlimited` | bool | If true, no daily budget cap applies |
| `streamable` | bool | If true, served via SSE |
| `default` | bool | One row should be marked as the default selection |

Readable by all authenticated users (used to populate the model picker in `chat.mode: 'direct'` instances — tutor-mode instances have no picker).

---

## `ai_usage`

Inserted by the Modal backend after each `direct`-mode chat inference for budget accounting.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | FK to `auth.users.id` |
| `timestamp` | timestamptz | Default `now()` |
| `model` | text | Model name actually used for the call |
| `input_tokens` | int | Uncached input tokens |
| `output_tokens` | int | Generated tokens |
| `cached_input_tokens` | int | Prompt cache hits |
| `reasoning_tokens` | int | Reasoning model thinking tokens (when applicable) |
| `cost_usd` | numeric(10,6) | Cost in USD, computed from `ai_models` prices |
| `created_at` | timestamptz | |

**Write path:** `modal_functions/budget_manager.py` `log_usage()`, called by `chat_with_budget.py` once a streamed response finishes. The frontend never writes to this table — only the Modal `service_role` key may insert.

**Known gap:** this table has no `conversation_id`/`message_id` column, so a row here can only be approximately correlated to a specific `messages` row by timestamp, not joined directly. `prompt_tokens`/`completion_tokens` on the `messages` row (below) are populated from the `usage_logged` SSE event this write triggers — if that write fails (caught and logged server-side, non-fatal) or the provider doesn't report usage (SkoleGPT), those columns are `null` on the message, not `0`, so "not measured" stays distinguishable from "measured and free."

**Read path:** Users can read their own rows (`src/services/aiUsage.js` for daily-budget display); admins can read all rows (`src/services/adminUsage.js` for the `/usage` dashboard).

**Not written at all in `chat.mode: 'tutor'`:** the tutor pipeline (`modal_functions/tutor_pipeline.py`) makes multiple real LLM calls per turn but never calls `budget_manager.log_usage()` — tutor-mode instances have no token/cost accounting anywhere.

---

## `sessions`

Top-level work container. One session bundles a hardware platform choice, multiple chat conversations, and multiple code tabs.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `user_id` | uuid | Owner |
| `name` | text | Defaults to `Unnamed Session`; user-editable |
| `hardware_platform` | text | One of the ids registered in `src/platforms/index.js` (e.g. `spike`, `lilybot`, `microbit`, `cutebot`, `esp32`, `esp32-arduino`, `lego`), chosen at creation and fixed thereafter. Legacy rows may be NULL and are surfaced as `pendingPlatformSession` until the user (or `assignPlatformToSession`) picks one — this is the only path that changes `hardware_platform` after creation, and it's a one-time back-fill, not a general "switch platform on this session" feature |
| `start_time` | timestamptz | Set on insert |
| `last_updated` | timestamptz | Bumped on any meaningful session activity (code save, console write, etc.) |
| `loaded_timestamps` | timestamptz[] | Appended each time an *existing* session is activated (`dataLogger.updateSessionOnLoad`, called from `setActiveSessionById`). Not appended when a brand-new session is created — use the `create_session_<platform>` row in `interactions` for that. |
| `current_code_id` | bigint | FK → `code.id`, the currently active code tab |
| `current_console_id` | bigint | FK → `console.id`, the latest console capture |
| `current_conversation_id` | bigint | FK → `conversations.id`, the currently active chat tab |

**Write path:** Created by `sessionManager.createNewSession` (which also creates the first conversation, code tab, and console row). Pointers and `last_updated` are mutated by `dataLogger` and `sessionManager` as the user works.

---

## `conversations`

One row per chat tab inside a session.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `user_id` | uuid | |
| `session_id` | bigint | FK → `sessions.id` |
| `name` | text | Defaults to `Unnamed Chat`; user-editable |
| `start_time` | timestamptz | Set on insert |
| `last_updated` | timestamptz | Bumped on each new message |

**Write path:** `sessionManager.createConversation`. The first conversation (`Chat 1`) is created alongside the session.

---

## `messages`

Every message in every conversation — user prompts, assistant replies, and (in `chat.mode: 'direct'`) system primings.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `user_id` | uuid | Owner of the conversation |
| `conversation_id` | bigint | FK → `conversations.id` |
| `role` | text | One of `system`, `user`, `assistant` |
| `content` | text | Full message text |
| `coding_level` | text | `beginner` / `intermediate` / `experienced` at send time |
| `ai_model` | text | Model selected when the message was sent (`'tutor-pipeline'` for every tutor-mode row — see the limitation below) |
| `prompt_tokens` | int, nullable | Set on assistant messages from the streaming response. `null` (not `0`) when usage genuinely wasn't measured — never treat `0` here as "this was free," check for `null` first |
| `completion_tokens` | int, nullable | Same convention as `prompt_tokens` |
| `code_context_id` | bigint | FK → `code_snapshots.id` — the immutable snapshot of code the user attached as context (deliberately points at a snapshot, not the mutable `code` row, so it stays accurate even after later edits) |
| `console_context_id` | bigint | FK → `console.id` snapshot the user attached as context |
| `lang` | text, nullable | UI language (`en`, `da`, …) in effect when this message was sent/answered |
| `timestamp` | timestamptz | |

**Write path:** `dataLogger.logMessage`, called from `ChatPanel` for each role. This table is insert-only from the app (no `UPDATE` grant) — nothing ever revises a logged message after the fact.

**System priming (`role: 'system'`):** in `chat.mode: 'direct'`, the first time a conversation sends a message, `ChatPanel` logs one `role: 'system'` row containing the exact platform priming + coding-level instructions + (non-English) language directive that was assembled and sent to the model for that turn — the same text, not a paraphrase, joined with `\n\n---\n\n` separators. This is filtered out of the on-screen chat (students only see their own Q&A) but is included in the export/replay tooling, which already has "System priming message" rendering support (`replayModel.js`, `ReplayChatPane.jsx`). It's logged once per conversation, not once per turn, since platform priming is large (thousands of lines for some platforms) and doesn't change turn-to-turn — `coding_level`/`lang` on each individual row already capture the parts that *can* vary within a conversation.

**Failed/interrupted turns:** if a streamed assistant response errors out or is blocked (budget exceeded) partway through, `ChatPanel` still logs whatever content streamed before the failure, or an explicit `[No response — …]` placeholder if nothing streamed at all — a user question is never left with silently no reply row at all. The one case this can't cover: the browser tab being force-closed while a response is mid-stream kills the page's JS before any logging can run — that residual risk is inherent to logging from the client rather than the Modal backend, and would need moving assistant-message logging server-side to close entirely.

**Known limitation — tutor mode (`chat.mode: 'tutor'`):** the real system prompt is assembled entirely server-side in `modal_functions/tutor_pipeline.py` and is *never sent to the client at all* (only a short outline preview and doc-bundle names reach the browser as ephemeral `progress` events, and those aren't logged either) — so no `role: 'system'` row is logged for tutor conversations, and the exact prompt in effect for a historical tutor message isn't reconstructable from Supabase even in principle. `hw_mode`/`lang` sent to the tutor endpoint aren't stored per-message either (only `coding_level`). If this matters for a tutor-mode deployment, the fix has to happen in `tutor_pipeline.py` (e.g. return the assembled system prompt as a `progress` event and have the client log it), not in `ChatPanel`.

---

## `code`

The live, in-place contents of each code tab. **Not** an append-only log — rows here are updated by autosave as the user types.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `user_id` | uuid | |
| `session_id` | bigint | FK → `sessions.id` |
| `name` | text | Tab name; defaults to `Code Tab`; user-editable |
| `content` | text | Current code contents |
| `save_source` | text | Most recent reason the row was written/updated (see `code_snapshots` below for the full value list — the same values apply here) |
| `timestamp` | timestamptz | Set once at row creation — **not** bumped by later live-edit autosaves, so don't read this as "last edited"; `code_snapshots.timestamp` for the same `code_id` is the accurate edit-history timeline |

This table tracks current state rather than history; it **is** included in the data export as `Code` so you can pull the latest contents of each tab. `code_snapshots` remains the append-only auditable record of every change.

---

## `code_snapshots`

Append-only history of code edits and significant events. Every meaningful change in `code` also writes a snapshot here so the full editing history is preserved.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `user_id` | uuid | |
| `code_id` | bigint | FK → `code.id` the snapshot belongs to |
| `session_id` | bigint | FK → `sessions.id` (denormalized for easy filtering) |
| `content` | text | Snapshot of code at that moment |
| `save_source` | text | Why the snapshot was taken (see below) |
| `timestamp` | timestamptz | |

### `save_source` values

`save_source` is a free-form string, not a DB-level enum — new hardware platforms are expected to introduce new values (e.g. a platform with save destinations analogous to SPIKE's slots). This is the authoritative, maintained list; keep it in sync when you add a platform.

| Value | Where it's emitted | Meaning |
|---|---|---|
| `init` | `sessionManager.createNewSession` | First code row created with the session |
| `tab_create` | `sessionManager.createCode` | User opened a new code tab |
| `live_edit` | Debounced autosave (1s) in `SessionContext` | User typed and the editor flushed |
| `manual_save` | `App.jsx` Save button | User explicitly hit Save |
| `chat_context` | `ChatPanel` when attaching code to a prompt | Snapshot taken so the message context is reproducible |
| `ai_replace` | `App.jsx` `handleReplaceCode`, via `ChatPanel`'s code-block "Replace" button | Captures the state right after an AI-generated replacement |
| `run_device` | `SPIKEEditor` Run button (serial platforms, LEGO, Arduino) | Code as it was when sent to the hardware |
| `save_to_main_py` | `SPIKEEditor` (Pico / ESP32 MicroPython) | Saved code as `main.py` on the device |
| `save_to_slot_<n>` | `SPIKEEditor` (SPIKE) | Saved code to program slot `<n>` (0–19) to run autonomously on the hub |
| `download_to_microbit` | `SPIKEEditor` (micro:bit / Cutebot) | Flashed code to the micro:bit |

> Indexes `idx_code_snapshots_code_id`, `idx_code_snapshots_session_id`, and `idx_code_snapshots_timestamp` exist to make history lookups cheap.

**Known limitation:** an `ai_replace` snapshot has no foreign key back to the specific `messages` row whose code block was inserted — correlation across the two tables is timestamp-only. A `replace_ai_code` row in `interactions` (below) marks that the Replace button was clicked at that moment, but doesn't identify *which* AI message either.

---

## `console`

Captures of the xterm.js terminal output.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `user_id` | uuid | |
| `session_id` | bigint | FK → `sessions.id` |
| `content` | text | Terminal contents at capture time (up to the in-memory buffer's `FIFO_SIZE` = 10,000 characters; older output is dropped from the live buffer before a capture can happen if a run produces more than that between captures) |
| `save_source` | text | Why the capture was taken (see below) |
| `timestamp` | timestamptz | |

### `save_source` values

| Value | Where it's emitted | Meaning |
|---|---|---|
| `init` | `sessionManager.createNewSession` | Empty console row created with the session |
| `manual_save` | `App.jsx` Save button | User explicitly hit Save |
| `chat_context` | `ChatPanel` when attaching console output to a prompt | Capture so the prompt context is reproducible |
| `run_device` | `SPIKEEditor`, when a run finishes (REPL prompt returns) | Full console buffer at the moment a run completed |
| `disconnect` | `SPIKEEditor`, on manual Disconnect **and** on the auto-disconnect triggered by switching to a session on a different platform | Buffer captured right before the device connection is torn down |
| `reset_device` | `SPIKEEditor` Reset button | Buffer captured right before a soft reset |
| `clear_console` | `SPIKEEditor` Clear Console button | Captures the buffer right before clearing |

Non-`chat_context` writes also update the parent session's `current_console_id` and `last_updated`.

**Console output between capture points is not logged incrementally** — only at the discrete moments above. A student running code many times in a row without triggering Save/Reset/Disconnect/Clear between runs will still get one full capture per run (each `run_device` capture happens when that run finishes), but truly continuous "everything printed, moment to moment" isn't captured; only the accumulated buffer at each of those moments is.

---

## `interactions`

Toolbar/button/session-lifecycle click events. Pure analytics — no payload beyond which action occurred, though several `button_name` values embed a specific target (board id, platform id, model name, slot number) the same way `connect_<board>` always has.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `user_id` | uuid | |
| `session_id` | bigint | FK → `sessions.id` |
| `button_name` | text | Free-form string — see enumeration below. Extend this the same way when adding a new platform/feature: pick a clear verb-first name, embed a specific target as a suffix if there is one (`_<value>`), and add it to the table below |
| `timestamp` | timestamptz | |

### `button_name` values — hardware/connection panel (`SPIKEEditor`)

| Value | Trigger |
|---|---|
| `connect_<board>` | Connect button, where `<board>` is the target board id (`pico`, `microbit`, `esp32`, `spike`) |
| `connect_lego` | LEGO device connect (inside the BLE device picker) |
| `connect_esp32_arduino` | ESP32 (C++/Arduino) connect |
| `open_lego_picker` | LEGO "Connect Hardware" button (opens the BLE device picker) |
| `rename_lego_device` | Renaming a paired LEGO device |
| `disconnect` | Disconnect button, or the automatic disconnect fired when switching to a session on a different hardware platform while still connected |
| `run_device` | Run on device |
| `send_ctrl_c` | Ctrl-C interrupt (Stop) |
| `reset_device` | Soft reset |
| `clear_console` | Clear console |
| `save_to_main_py` | Save as `main.py` on Pico/ESP32 MicroPython |
| `save_to_slot_<n>` | SPIKE "Save to Slot", slot `<n>` (0–19) |
| `switch_to_repl_mode` | SPIKE REPL⇄Program-Slot toggle → REPL mode |
| `switch_to_program_slot_mode` | SPIKE REPL⇄Program-Slot toggle → Program-Slot mode |
| `clear_main_esp32` | Clear ESP32 MicroPython main file |
| `clear_download_microbit` | Clear queued micro:bit download |
| `download_to_microbit` | Flash code to micro:bit |

### `button_name` values — session/conversation/code-tab lifecycle (`SessionContext`)

Centralized here rather than in each UI component (`TitleBar`/`CodeTabs`/`ChatTabs`/`SessionModal`/`NewSessionModal` all call into these same `SessionContext` functions), so instrumentation doesn't need to be re-added at every button that can trigger the same underlying transition.

| Value | Trigger |
|---|---|
| `create_session_<platform>` | New session created for hardware platform `<platform>` |
| `switch_session` | Activated a different (existing) session |
| `assign_platform_<platform>` | Back-filled `hardware_platform` on a legacy session |
| `rename_session` | Session renamed |
| `switch_conversation` | Switched chat tabs |
| `create_conversation` | New chat tab created |
| `rename_conversation` | Chat tab renamed |
| `switch_code_tab` | Switched code tabs |
| `create_code_tab` | New code tab created |
| `rename_code_tab` | Code tab renamed |

### `button_name` values — chat (`ChatPanel`) and save (`App.jsx`)

| Value | Trigger |
|---|---|
| `send_message` | Chat "Send" clicked (or Enter) |
| `switch_model_<model_name>` | Model picker changed to `<model_name>` (direct mode only — no picker in tutor mode) |
| `copy_ai_code` | "Copy" clicked on an AI code block |
| `replace_ai_code` | "Replace" clicked on an AI code block (also creates an `ai_replace` code snapshot — see above) |
| `manual_save` | TitleBar "Save Session" clicked |

**Not instrumented, deliberately:** the "Add Code to Chat" / "Add Console to Chat" toggle buttons and the SPIKE slot-selector dropdown are not logged on every click — the meaningful outcome (which context was actually attached to a *sent* message; which slot was actually *saved to*) is already captured elsewhere, and logging every toggle/browse would mostly add noise.

---

## The data export at `/data`

The admin-only `DataExtractor` page (`src/components/data_extractor/DataExtractor.jsx`) bundles the eight exported tables above (`messages`, `sessions`, `console`, `code`, `code_snapshots`, `interactions`, `conversations`, `user_profiles`) into per-table CSVs zipped together as `data_export_<YYYY-MM-DD>.zip`. Each table is also exportable on its own via the per-table sections below the "Export Everything" button.

### Filters

Both filters apply to **every** table in the export and are combined with AND:

- **Time range** — `Start Time` and `End Time` (datetime-local). Applied against the table's natural time column:
  - `sessions`, `conversations` → `start_time`
  - `user_profiles` → `created_at`
  - all others (incl. `code`) → `timestamp`

  **Exception:** the structural/container tables `sessions`, `code`, `conversations`, and `user_profiles` are **exempt from the time range** — they are always exported in full so that rows created before the start time (but still referenced by the time-filtered tables) are present. They remain subject to the email filter. The exempt set lives in `TIME_RANGE_EXEMPT_TABLES` in `src/services/dataExport.js`.
- **Emails** — comma- or newline-separated list. Resolved to `user_id`s via `user_profiles.email`, then filtered with `.in('user_id', …)`. Empty means "all users". If the email list resolves to zero users, the export for that table is empty (rather than unfiltered).

### Per-table column selection

`DataExtractor` lets you toggle which columns ship in each per-table CSV. The defaults (columns marked `default: true` in the file) are tuned for readability — IDs and FKs are off by default, content/timestamps/names are on. The "Export Everything" button uses every column declared for each table regardless of the per-table toggles.

### Mechanics

`src/services/dataExport.js`:
- `fetchAllRowsForExport` pages through the table 1000 rows at a time, ordered by the time column ascending.
- `convertRowsToCsv` CSV-encodes each value (quoted, internal `"` doubled; objects are `JSON.stringify`d).
- `exportAllTablesAsZip` calls the fetcher for each table, builds CSV blobs in memory with `JSZip`, and triggers a browser download.

### Turning an export into a replayable session (`/view-data`)

The `/view-data` Session Replay Viewer (`src/components/replay/`) doesn't consume the raw per-table CSVs directly — it expects one merged, chronologically-sorted CSV per session. `scripts/merge_sessions_to_csv.py` is the bridge: point it at a folder containing the eight table CSVs from a `/data` export (as `research_data/*.csv`) and it writes one `session_<id>.csv` per session, grouped into per-student folders, dereferencing `code_context_id`/`console_context_id` into the actual attached content along the way. Feed one of those merged files into the `/view-data` upload screen.

### The routine gut-check at `/users`

`src/components/admin_users/` (`AdminUsersDashboard.jsx` + `AdminUserDetail.jsx`, data via `src/services/adminUsers.js`) is a live-query alternative to exporting: a roster table (every `user_profiles` row, including zero-activity signups) with session/message/run counts and a "last active" signal derived from the max of `sessions`/`messages`/`code_snapshots`/`interactions` timestamps for that user — there is no real last-sign-in timestamp available client-side (`auth.users.last_sign_in_at` isn't exposed via RLS), so this is the practical substitute. Clicking a student opens a per-user drill-down: their full session list plus a merged, newest-first activity feed (messages, code saves, console captures, interactions) bounded to a time range, reusing `CodeModal`/`ConsoleModal` to view full content. It relies entirely on the "admins can read all rows" RLS policies already covered above — no new tables, columns, or grants.

### What is **not** in the export

- `ai_models` (operator-managed catalog)
- `ai_usage` (surfaced separately via the `/usage` admin dashboard — and only ever has rows for `chat.mode: 'direct'` instances)
- Anything in `auth.users` beyond what's already mirrored into `user_profiles`
