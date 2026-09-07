# Roadmap: Genericization & Future Work

This is a living backlog of things discovered while setting up and running
this codebase that are **specific to how the original deployment (Purdue)
was used**, or that are otherwise worth revisiting before this app serves a
wider range of institutions/use-cases. It's meant to be read by humans *and*
by an LLM assistant (like Claude Code) — before touching code related to an
item here, read its entry first so you don't miss a cross-file dependency
someone already mapped out.

This is **not** a task queue to grind through — most entries here are
deliberately *not yet decided*, let alone scheduled. Each one should be
discussed and scoped as its own piece of work when someone actually wants to
tackle it, not done piecemeal as a side effect of something else.

**How an entry is structured:** problem/context → why it matters → what
files it touches (blast radius) → possible approach(es) → open questions.
Status is one of: `idea` (not scoped), `scoped` (approach agreed, not
started), `in-progress`, `done`.

---

## R1 — De-Purdue the default branding

**Status:** idea

**Problem:** `src/config/brand.js` isn't a neutral template — it *is*
Purdue's actual identity (`name: "LilyBot AI Editor"`, `logoAlt: "Purdue
University"`, Purdue's Old Gold/Black color hex codes, a Purdue logo file).
Every instance config imports this file as its base and overrides only what
it wants to change. `skolegpt-dk.js` already demonstrates the override
pattern — it replaces `name`/`logoSrc`/`logoAlt` — but it still inherits
Purdue's exact color palette, because colors were never overridden. So even
the one non-Purdue instance today is silently Purdue-colored.

**Why it matters:** anyone forking this for a new institution currently
either ships with Purdue's name/colors/logo by accident, or has to know to
override every single brand field themselves with no guidance on which
fields exist or what a sane placeholder looks like.

**Affected files:**
- `src/config/brand.js` — the shared base object
- `src/config/instances/purdue.js`, `src/config/instances/skolegpt-dk.js` —
  both import it
- `src/config/applyBrand.js` — reads `instance.brand.colors.*` /
  `fontFamily` / `fontUrl` and injects them as CSS variables
- Logo assets under `public/` (e.g. `PU-H-Full-RGB.svg`)

**Possible approach:** make `brand.js` a genuinely neutral placeholder
(generic name, a neutral color palette, no institution logo), and give
`purdue.js` its *own* full brand override (the way `skolegpt-dk.js` already
partially does) rather than being the thing that defines the shared default.
New instances then start from a neutral base instead of inheriting an
institution's identity by default.

**Open questions:** should there be a documented "brand contract" (which
fields are required, what a good placeholder value is) alongside this, so a
new instance author doesn't have to reverse-engineer `applyBrand.js` to know
what's usable?

---

## R2 — Rethink "camps" as one specific outreach model

**Status:** idea (deliberately not scoped; has potential "large blast radius"
related to implications of multiple user types, etc.)

**Problem:** the app has exactly two built-in access tiers, and one of them
is named and modeled after one specific outreach format (Purdue's summer
camps) rather than the general concept it's actually gesturing at — some
users get a different (larger) daily AI budget than the "standard" default.
In practice, institutions run this under very different models:
- **Purdue:** researcher-generated generic accounts
  (`facelab.team01@gmail.com`, etc.) so minors' personal emails are never
  collected — see `scripts/bulk_create_camp_users.sh`.
- **Tufts:** students expected to sign in with their real `@tufts.edu` accounts.
- Neither of these is "a camp" specifically — workshops, single classes,
  multi-week courses, drop-in activities, and open self-serve trials are all
  plausible and may not map cleanly onto a binary `camps`/`standard` split.

There's also a legal/terminology angle: some institutions specifically avoid
the word "camp" for programs involving minors due to regulatory definitions
that word can trigger — so the naming itself, independent of the technical
model, may need to change.

**Why it matters:** the two-tier model is currently a false binary baked
into both the schema and the code's control flow (not just a label), which
makes it hard to represent "this group of users gets budget X" for more than
one group at a time, and the naming actively doesn't fit every user of this
codebase.

**Affected files (the full "camps" surface, from the earlier audit):**
- `src/services/auth.js` — `CAMPS_EMAIL_DOMAINS` (hardcoded
  `['tufts.edu', 'purdue.edu']`) auto-assigns `access_level` at signup
- `modal_functions/budget_manager.py` — `if access_level == 'camps'` /
  `'standard'`; any other value raises `"Invalid access level"`
- `src/services/persistence/supabaseAdapter/usage.js` — reads
  `CAMPS_DAILY_BUDGET`/`STANDARD_DAILY_BUDGET` config keys +
  `VITE_CAMPS_DAILY_BUDGET` env fallback
- `scripts/bulk_create_camp_users.sh` — hardcodes `access_level: "camps"`
  for every generated account
- `src/components/BudgetErrorModal.jsx` — also branches on a *third*,
  currently-dead value `'en1'` that nothing ever sets (looks like an
  abandoned start at exactly this kind of per-group tier — worth looking at
  before redesigning, it may hint at prior intent)
- Supabase: the `CAMPS_DAILY_BUDGET`/`STANDARD_DAILY_BUDGET` rows in
  `app_config` (see `INSTALL.md` §11.3)

**Possible approach (sketch, not a decision):** replace the two hardcoded
tiers with an admin-editable table of rules — e.g. an `access_tiers` table
(tier name, daily budget, unlimited flag) and an `access_tier_rules` table
(match rule → tier: by email-domain suffix, by explicit allowlist, or a
catch-all default) that `auth.js`'s domain check and `budget_manager.py`'s
`get_daily_budget`/`check_budget` both resolve against at runtime instead of
branching on string literals. This is also the natural foundation for R5
below (a fuller budget model) — worth designing them together rather than
twice.

**Open questions:** how many tiers does a real deployment actually need
concurrently? Does tier assignment ever need to be *changed* for an existing
user (not just decided at signup)? Who administers this — SQL, or does it
need a UI (ties into R5)?

---

## R3 — Inventory every institution/class-specific reference

**Status:** idea

**Problem:** R1 and R2 above are the two biggest, most load-bearing
instances of "this assumes Purdue" — but there are certainly smaller ones
not yet cataloged: hardcoded hostnames, course-code strings, hardcoded
contact names, example domains, etc.

**Known so far** (non-exhaustive — this list should grow as more are
found):
- `src/config/instance.js` — `VITE_INSTANCE` defaults to `'purdue'` if
  unset; `HOST_INSTANCE` hardcodes `purdue.en1editor.com` /
  `denmark.en1editor.com` → instance id
- `scripts/bulk_create_camp_users.sh` — generated emails/passwords are
  literally `facelab.team##@gmail.com` / `purdue###...`
  (`facelab` = the originating research lab's name)
- The dead `'en1'` access-level branch in `BudgetErrorModal.jsx` (see R2) —
  `EN1` being a Tufts course's code

**Why it matters:** without a single inventory, a new deployer has to
rediscover these one at a time (the way this file itself came out of doing
exactly that during initial setup) — which is slow and easy to miss a spot.

**Affected files:** TBD — that's the point of this task.

**Possible approach:** a dedicated pass (grep for known institution
names/domains, course codes, personal names, lab names) producing a
checklist a new deployer works through, likely folded into (or referenced
from) `INSTALL.md` as a "customize your instance" step once R1/R2 give it
somewhere concrete to point to.

**Open questions:** none yet — this is mostly "go do the audit."

---

## R4 — Automated tests

**Status:** idea

**Problem:** `CLAUDE.md` states "There are no automated tests in this
project" as a fact about current state, not a recommendation to stay that
way. Right now, correctness is verified entirely by hand (see also: this
whole `INSTALL.md` effort, which exists precisely because there was no
automated way to confirm the setup steps actually work).

**Why it matters:** a change here can silently break something in a
different file with no signal until a human notices in the running app —
this is exactly the risk that made the R2 rename feel too dangerous to do
casually. Tests would make refactors like R2 *safe* to attempt instead of
scary.

**Possible approach / starting points, roughly in order of value-to-effort:**
1. **Setup verification script** — a script (or `npm run` task) that checks
   a fresh Supabase project actually has everything `INSTALL.md` §11 is
   supposed to create (expected tables, expected `app_config` keys with
   sane values, RLS enabled, `is_admin()` exists) and reports what's
   missing. This directly de-risks the setup process itself. `INSTALL.md`
   §11.11 is a first, manual pass at exactly this — a copy-paste SQL query
   checking *existence* of everything §11.1–§11.10 creates. A real script
   could go further: check actual *values* (not just presence), run from
   `npm run`/CI instead of by hand, and share logic with R7's price-checker.
2. **Backend unit tests** (`modal_functions/`) — pure-logic functions like
   `calculate_cost`, `get_daily_budget`, `check_budget` in
   `budget_manager.py` don't need a real Supabase connection if the client
   is mocked; cheap to test, and exactly the kind of logic R2 would touch.
3. **Frontend unit tests** — pure helpers like `hardwareParts.js` (already
   has no Supabase dependency) and `getAccessLevelFromEmail` in `auth.js`.
4. **End-to-end smoke test against real providers** — a scripted request
   through the deployed Modal `chat_with_budget` endpoint confirming a
   real OpenAI/Gemini call succeeds and gets logged to `ai_usage` — catches
   "the deploy succeeded but the actual AI call is silently failing," which
   nothing else here would catch.

**Open questions:** what test runner/framework fits a codebase with no
existing test infrastructure (Vitest for frontend, `pytest` for
`modal_functions/`, are the obvious defaults)? Is there budget/appetite for
tests that spend real API-provider money (item 4)?

---

## R5 — A richer, multi-tier budget model

**Status:** idea (depends on / overlaps with R2)

**Problem:** the current model is exactly two tiers, hardcoded. A more
mature version of this platform plausibly wants concurrent tiers like:
- **Open/public trial** — anyone on the web, very small daily budget
- **Organization member** — e.g. anyone `@<school>.edu`, a moderate budget
- **Approved class/cohort** — a known, vetted list of users, a larger budget
- **Admin** — unlimited

...plus the operational tooling to run that responsibly: usage dashboards,
automated tracking/reporting, and alerts (e.g. "this tier is approaching
its aggregate daily spend").

**Why it matters:** this is the natural evolution once the app is used by
more than one kind of group at a time, just not yet true *within* a single
deployment.

**Affected files:** the same surface as R2, plus: `src/services/aiUsage.js`
and `src/services/adminUsage.js` (existing usage-tracking/admin-dashboard
code that a "richer tiers + alerts" model would extend rather than replace),
`modal_functions/budget_manager.py`.

**Possible approach:** design together with R2 — the "admin-editable tier
rules" data model sketched there is the same foundation this needs. Alerts/
reporting would likely build on the existing `ai_usage` table and
`AdminUsageDashboard` component rather than needing new infrastructure.

**Open questions:** real-time alerting implies *some* kind of scheduled job
or webhook — does that live in Modal (which already runs
`supabase_keepalive.py` on a schedule) or somewhere else? What's the actual
priority order of the four example tiers above — is "open public trial"
even wanted, or was that illustrative?

---

## R6 — Per-model visibility toggle (possibly per audience)

**Status:** idea

**Problem:** every row in the `ai_models` table is shown to every user,
unconditionally — confirmed in `src/services/aiModels.js`'s
`fetchModelMetadata()`, which selects and returns all rows with no
filtering. There's no way to register a model (e.g. to keep its pricing on
file, or stage it before it's ready) without it immediately appearing as a
pickable option for everyone. You'd want an `active` (or similar) flag to
turn a model on/off without deleting its row.

A wrinkle raised while discussing this: a single global on/off may not be
enough — you might want a model visible to admins (for testing) but not yet
to students, or visible to one class but not another. That's a
*per-audience* visibility rule, not just a global boolean, and it overlaps
with the access-tier work in R2/R5 (both are "which rules apply to which
group of users" problems) — worth designing together rather than twice.

**Why it matters:** right now the only way to "turn off" a model is to
delete its row (losing its pricing history) or stop offering the provider
entirely via `MODAL_PROVIDERS` (all-or-nothing per provider, not per model).

**Affected files:**
- `src/services/aiModels.js` — `fetchModelMetadata()` would need to filter
  results (and possibly resolve per-user/per-tier visibility)
- Supabase: `ai_models` table (would need a new column, e.g. `active
  boolean`, or a join table if visibility needs to vary per tier/group)
- `modal_functions/budget_manager.py`'s `get_model_config` — the backend
  should also refuse a disabled model even if a client somehow requests it
  directly, not just hide it from the picker UI

**Possible approach:** start with a simple global `active` column (cheap,
solves "stage a model before it's ready" and "quietly retire a model");
treat per-audience visibility as a follow-on that reuses whatever
tier/rule mechanism comes out of R2/R5, rather than inventing a second,
parallel rules system just for models.

**Open questions:** is a global flag enough for now, or is per-audience
visibility actually needed from day one? Should a disabled model still be
selectable in old conversations that already used it (so history doesn't
break), just not offered for new messages?

---

## R7 — Automated price-tracking for `ai_models`

**Status:** idea

**Problem:** the `input_price`/`cached_input_price`/`output_price` columns
in `ai_models` are entered by hand (see §11.6) and will silently drift out
of date as providers change pricing — nothing today notices or flags that.

**Why it matters:** stale prices mean the budget system is charging
students the *wrong* amount against their daily limit — either
under-charging (a provider raised prices, so the real cost eats further
into your own margin than tracked) or over-charging (a provider lowered
prices, so students hit their limit sooner than they should).

**Possible approach:** an admin-triggered script/scheduled job that checks
each configured model's current price against its provider's public pricing
page and flags (or, with review, applies) an update — an LLM-assisted
fetch-and-diff is a reasonable way to do this, given pricing pages are
usually plain text/HTML tables and not behind a stable API. Given the
consequence of an unnoticed wrong price is direct financial exposure, this
likely wants a "propose the change, human confirms" step rather than
silently auto-applying updates.

**Open questions:** how often is "often enough" (weekly? on each Modal
deploy)? Does every provider expose pricing in a scrape-friendly way, or
would some need a maintained per-provider parser? Where would proposed
changes surface for review — a diff in a PR, a Slack/email alert, an admin
dashboard panel?

---

## R8 — "Student" as the default term for end-users, across UI and code

**Status:** idea

**Problem:** both the docs and the actual product assume the end-user is
always a "student" in a K-12/university-classroom sense. This isn't just
prose — it's baked into real user-facing UI copy and even a component name:
- `src/locales/en.json` — keys like `studentGroupTitle` ("Who's in your
  group?"), `studentGroupDescription`, `studentNames`,
  `studentNamesPlaceholder`
- `src/components/StudentGroupModal.jsx` / `.css` — an entire modal named
  after "student"
- Referenced from `ChatPanel.jsx`, `HardwareConfigModal.jsx`, the replay
  tooling (`ReplayChatPane.jsx`, `ReplayTitleBar.jsx`,
  `formats/legacyFormat.js`, `formats/currentFormat.js`), and the admin
  `DataExtractor.jsx`
- The `user_profiles.students` column and its code comment describing "the
  camp group" (already noted under R9 for the shared-account angle — this
  is the same column, different lens: the *word choice*, not the sharing
  model)

**Why it matters:** the moment this app serves anything other than academic
classroom/camp instruction — a professional workshop, a hobbyist meetup, an
open self-serve tool, adult continuing-ed — "student" is visibly the wrong
word, with no term (or configurable term) to swap in instead. Same
underlying problem as R2 (one outreach model's vocabulary treated as
universal), just surfacing in UI copy/component naming instead of the
access-tier system.

**Affected files:** the ones listed above, from a quick pass — pair with the
R3 inventory task for a complete list (a full grep for "student" hasn't been
done yet).

**Possible approach:** rather than a blanket rename to one other fixed word
(which just relocates the same problem), consider making the term itself
configurable per instance — e.g. an instance-level label config value
threaded through the relevant locale strings, defaulting to something
neutral ("participant," "user," "group member") that an instance can
override to "student" where that's genuinely accurate. Component/file names
(`StudentGroupModal`) are lower priority — internal identifiers don't reach
end-users the way locale strings do, though renaming reduces confusion for
whoever edits this code next.

**Open questions:** is per-instance configurability worth the complexity,
or is one better-chosen neutral default good enough? Does this ride along
with the R2 access-tier redesign (both touch `user_profiles`/the
shared-account UI), or is it independent enough to do on its own?

---

## R9 — Could Vercel's Supabase integration replace manual setup?

**Status:** idea

**Problem:** Vercel's project-import flow now shows an "Optional
Integrations" panel before the Deploy button, suggesting a native Supabase
integration (likely detected from `@supabase/supabase-js` in
`package.json`). `INSTALL.md` §4/§7 has you create the Supabase project
manually and copy its keys into Vercel's env vars by hand — this
integration might streamline that, but it introduces open questions this
guide hasn't verified:

- Does it **link an existing** Supabase project (the one already created
  and configured per §4/§11), or does it **create a new one** — which
  would orphan all the SQL setup already done?
- What env var **names** does it write? This is a Vite app —
  `src/services/supabase.js` reads `import.meta.env.VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` specifically. Vite only exposes vars prefixed
  `VITE_` to client code by default; if the integration writes
  unprefixed names (e.g. plain `SUPABASE_URL`), the app would silently not
  see them — a confusing failure mode (vars visible in the Vercel
  dashboard, app still broken) if someone accepts this without checking.

**Why it matters:** if the integration *can* safely link an already-set-up
project and write correctly-prefixed env vars, it could remove a chunk of
manual copy-pasting from `INSTALL.md` for anyone doing this setup in the
future. If it can't (or does something surprising like creating a second
Supabase project), recommending it would actively break a first-time
setup.

**Current guidance (until this is investigated):** skip the integration
during initial setup — the manual path in §4/§7 is slower but verified to
work end-to-end. This is exactly the kind of thing worth a deliberate,
isolated test (a throwaway Vercel project + throwaway Supabase project)
before ever recommending it in `INSTALL.md`.

**Possible approach:** someone spins up a disposable test case, tries the
integration against both scenarios (existing project vs. new), inspects
exactly what env vars land in the Vercel project settings afterward, and
reports back — then `INSTALL.md` §7 either gains a documented shortcut or
an explicit "don't use this, here's why" note.

**Open questions:** does the integration support "link existing project" at
all, or is "create new" the only option? Is it Supabase-account-wide (once
connected, does every Vercel project on the account see every Supabase
project, or is it scoped)?

---

## R10 — Other things worth tracking here (add as found)

Space for smaller items that don't yet warrant their own section:

- The `students` column on `user_profiles` (a free-text field, "newline
  separated names of the students... that share this account" per the code
  comment) is itself modeled on the generic-shared-account pattern from R2 —
  worth revisiting together with that redesign rather than separately.
- Locales are currently just `en`/`da` (`src/locales/*.json`,
  `LanguageContext.jsx`); a new instance in a third language needs to know
  to add a locale file and wire it into `instance.locales.available` — not
  hard, but not written down anywhere outside `CLAUDE.md`'s architecture
  notes.
- Admin bootstrapping (`INSTALL.md` §8) is a manual one-off SQL `UPDATE` per
  admin. Fine at small scale; would want a real admin-management UI/flow if
  this scales to many admins (or additional roles) across many deployments.
- **Sanity check once R4 (tests) exists:** `INSTALL.md` §11.4 was corrected
  to insert the LilyBot template config under the key
  `LILYBOT_HARDWARE_TEMPLATES` (matching what `src/services/hardwareParts.js`
  reads), replacing an earlier version of that instruction that used
  `LILYBOT_DEFAULT_TEMPLATES` instead — a name the app doesn't recognize.
  Worth a one-time grep-the-codebase pass to confirm
  `LILYBOT_DEFAULT_TEMPLATES` doesn't linger anywhere (old Supabase
  projects set up before this fix, other docs, etc.) once there's an
  automated way to check it rather than trusting a manual look.
- **No self-service password change/reset in the app itself** — confirmed
  by checking `AuthModal.jsx` and `auth.js`: sign-in/sign-up only, no
  "forgot password" or "change password" flow. Today the only fix is an
  admin manually resetting it from the Supabase dashboard. Fine for a small
  deployment where the admin is reachable; a real gap once there are more
  users than one admin can reasonably hand-hold.
