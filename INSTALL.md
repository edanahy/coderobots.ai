# Deployment Guide: Launching Your Own Instance

This guide walks through standing up your own independent deployment of this
app: your own GitHub repo, your own Supabase project (database + auth), your
own AI provider account (OpenAI and/or Gemini), your own Modal account
(serverless backend), and your own Vercel project (hosting). Nothing is
shared with any other deployment of this codebase — each instance is fully
self-contained.

## Contents

1. [Prerequisites](#1-prerequisites)
2. [Secure Credentials Document](#2-secure-credentials-document)
3. [Get the Code](#3-get-the-code)
4. [Set Up Supabase](#4-set-up-supabase)
5. [Set Up an AI Provider](#5-set-up-an-ai-provider)
6. [Set Up Modal](#6-set-up-modal)
7. [Set Up Vercel](#7-set-up-vercel)
8. [Setting Admin Users](#8-setting-admin-users)
9. [Adding a Custom Domain](#9-adding-a-custom-domain-optional) (*optional*)
10. [Bulk-Creating Student Accounts](#10-bulk-creating-student-accounts-optional) (*optional*)
11. [Appendix: Full Supabase SQL Script](#11-appendix-full-supabase-sql-script) (*supporting Step 4*)

---

## 1. Prerequisites

- A code editor (e.g. [Visual Studio Code](https://code.visualstudio.com/))
  - _Why:_ you'll be editing config/env files and running most of these
    steps from its integrated terminal.
- A GitHub account
  - _Why:_ it hosts your copy of the source code; Vercel (Step 7) deploys
    straight from it on every push.
- Python installation (recent version) with `pip` and the `venv` module
  - _Why:_ needed to run the Modal CLI and deploy the backend functions in
    [Step 6](#6-set-up-modal).
- [Git](https://git-scm.com/) installed
  - _Why:_ the tool that actually moves code between your machine and
    GitHub (clone, commit, push, pull), if not using other interfaces.
- Node.js (for *optionally* running the frontend locally — see the main `README.md`)
  - _Why:_ lets you run `npm run dev` and see your changes live in a
    browser on your own machine — so you can verify something works
    *before* pushing to `dev` or merging into `main`. It's local-development
    only; it has no bearing on what Vercel deploys (Vercel does its own
    separate Node-based build on its own servers when it picks up a push).

---

## 2. Secure Credentials Document

Before creating any accounts, set up somewhere secure to store every
password and API key you generate below — e.g. use a password manager on your
machine (e.g. 1Password, Bitwarden, or your OS's built-in one).

Do not put credentials in any file inside the codebase itself.

**Exception:** The exception is `.env.local`, a file you create yourself in the
project root (used for optionally running the app locally, and again in
[Step 10](#10-bulk-creating-student-accounts-optional) for the bulk
user-creation script) — it holds credentials the *app itself* needs to read
at build/run time (e.g. the Supabase project URL and keys, endpoint URLs),
not ones a human needs to remember. It's git-ignored (via the `*.local`
pattern in `.gitignore`), so it never gets committed — but it still lives on disk in plain
text, so it's not a substitute for your password manager for anything you
want to keep long-term or share securely.

---

## 3. Get the Code

1. Make a [GitHub](https://github.com) account if you don't have one.
2. On GitHub.com, open the repository you're copying from and click **Fork**
   (top right) to copy it into your own account. This is the recommended
   path — it keeps a record that your repo descends from the original,
   which makes it easy to pull in future upstream updates.
   - Alternatively, create an independent copy with no fork relationship
     (e.g. download a ZIP of the source and push it into a brand-new empty
     repo you create yourself). Only do this if you specifically don't want
     the fork link back to the original.
3. Get the code onto your machine — any of these work:
   - **VS Code:** open a new window → **Clone Git Repository...** → paste
     your fork's `.git` URL → pick a folder. VS Code clones it and opens it
     for you.
   - **GitHub Desktop:** File → Clone Repository → pick your fork from the
     list (or paste its URL).
   - **Command line:**
     ```bash
     git clone https://github.com/<your-username>/<your-repo>.git
     ```

> **Notes & Troubleshooting**
> - **Cloning/forking a private repository:** if the repo you're copying
>   from is private, a plain `git clone` will prompt for credentials, and
>   GitHub's web UI may need you to accept an invite first. If Git's normal
>   credential prompt doesn't work, install the GitHub CLI and authenticate
>   once — this stores credentials that Git itself can then reuse:
>   ```bash
>   brew install gh        # Mac
>   sudo apt install gh    # Linux
>   gh auth login
>   ```

---

## 4. Set Up Supabase

Supabase is the database (Postgres) and user-authentication provider.

### 4a. Account, Organization, and Project

1. Go to [supabase.com](https://supabase.com) and create an account.
2. After confirming your email, create an organization (free tier is fine).
3. Create a project: give it any name, generate a database password (save it
   in your credentials document), and leave all other options at their
   defaults.
4. Turn off email confirmation: **Authentication → Sign in / Providers →
   Confirm Email** (toggle off). This lets you create accounts
   programmatically later without each one needing to click a confirmation
   link.

### 4b. Database Setup

Go to the **SQL Editor** in the left sidebar. Run each command block from
[the appendix](#11-appendix-full-supabase-sql-script) **one at a time**, in
order — paste a block, press the green "Run" button, confirm you see
"Success. No rows returned," then clear the editor before pasting the next
block. The full script is broken into numbered pieces there for exactly this
reason.

### 4c. Get Supabase API Keys and Data API URL

1. **Project Settings → API Keys.** Copy the **Publishable** key and the
   **Secret** key into your credentials document.
2. **Project Settings → Data API** (under Configuration). Copy the API URL.
   **Important:** delete the trailing `/rest/v1/` from the URL before saving
   it — e.g. save `https://abcdefgh.supabase.co`, not
   `https://abcdefgh.supabase.co/rest/v1/`. (Supabase's Data API setup is
   subject to change — if this looks different, the piece you need is the
   base project URL.)

---

## 5. Set Up an AI Provider

Pick **OpenAI**, **Gemini**, or both — whichever you use here determines
which secrets and deploy flags you'll use in [Step 6](#6-set-up-modal).

### If using OpenAI

1. Create an account at [platform.openai.com](https://platform.openai.com/).
2. Generate an API key (own it as "You," not "Service account," in a
   dedicated project so budgeting stays simple). Save it in your credentials
   document.
3. Add credits. OpenAI's rate limits scale with lifetime spend ("usage
   tiers"), reached ~7 days after your first payment:
   - Tier 1 ($5 spent): 200,000 tokens/min
   - Tier 2 ($50 spent, 7+ days after first payment): 2,000,000 tokens/min

   $50 of initial credit is a reasonable starting point if you expect
   meaningful classroom usage.
4. Turn on auto-recharge (Billing) so you don't run out mid-lesson, with a
   recharge cap (e.g. refill to $10–20 when balance drops below $5) so a
   leaked key can't run away unbounded.
5. Set an organization-wide monthly budget limit (Limits → the
   account/organization-level page, not the project-level one, unless you
   have multiple projects).

### If using Gemini (Google AI Studio)

1. Go to [aistudio.google.com](https://aistudio.google.com/) → Dashboard →
   API Keys → **Create API Key** (create a project first if needed). Save
   the key in your credentials document.
2. Under **Billing**, create a billing account. Gemini's Tier 1 is generous
   enough that you likely don't need to pre-load a specific amount.
3. Under **Spend**, set a spend cap (e.g. $100) as a safety ceiling.

---

## 6. Set Up Modal

Modal runs the serverless Python backend that talks to Supabase and your AI
provider(s). This is the most technical step — errors here often mean a
dependency has a newer version than when this guide was written, not that
you did something wrong. An LLM can help you debug the specific error message.

1. Create an account at [modal.com](https://modal.com) — sign up with
   GitHub or Google (there's no plain email/password signup option).
2. Make sure Python, `pip`, and the `venv` module are installed locally on
   your machine (see [Prerequisites](#1-prerequisites)).
3. Open a terminal **in the repo folder you cloned in Step 3** — double
   check with `ls`; you should see `CLAUDE.md`, `modal_functions/`, `src/`,
   `package.json`, etc. Commands below silently do nothing useful if you're
   in the wrong folder.
4. Create and activate a Python virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```
   Your prompt should now be prefixed with `(.venv)`. Everything installed
   in the next two steps goes *inside* this `.venv` folder, not system-wide
   — it's isolated to this project, safe to install without affecting
   anything else on your machine, and just as safe to delete (`rm -rf
   .venv`) and recreate if something ever goes wrong.
5. Install this project's Python dependencies:
   ```bash
   pip install -r modal_functions/requirements.txt
   ```
   This reads `modal_functions/requirements.txt` and installs exactly what
   the backend code needs to run:
   | Package | What it's for |
   |---|---|
   | `pydantic` | validates the shape of requests/responses the backend handles |
   | `openai` | OpenAI's API client (only actually called if you use OpenAI) |
   | `anthropic` | Anthropic's API client (installed either way; unused unless you enable that provider) |
   | `google-genai` | Google's Gemini API client (only actually called if you use Gemini) |
   | `supabase` | talks to your Supabase project (budget checks, usage logging, the keepalive ping) |
   | `pytz` | timezone-aware date math (daily budgets reset at midnight Eastern Time) |
   | `fastapi[standard]` | the web framework the backend endpoints are built on |

   If this step fails partway through, it's usually one package needing a
   newer/older version than pinned here — safe to paste the exact error into
   an LLM for help, or try again (a flaky network download is common too).
6. Install and authenticate the Modal CLI itself:
   ```bash
   pip install modal
   python3 -m modal setup
   ```
   This opens a browser tab to authorize your terminal against your Modal
   account. After you approve it there, the terminal prints a confirmation
   like:
   ```
   Web authentication finished successfully!
   Token is connected to the <your-workspace> workspace.
   Verifying token against https://api.modal.com
   Token verified successfully!
   Token written to /Users/<you>/.modal.toml in profile <your-workspace>.
   ```
   What happened: Modal generated an auth token tied to your account,
   confirmed it actually works by checking it against Modal's servers, then
   saved it to `~/.modal.toml` — a file in your **home directory**, not
   inside this project folder. That's deliberate: it's a per-machine,
   per-account credential (like an SSH key), not something scoped to one
   project, so every `modal` command you run from this machine authenticates
   as you until you explicitly log out or switch profiles. It's also why
   you never put a Modal token in `.env.local` or anywhere in the repo — the
   CLI already knows who you are without it.

   You may also see a line suggesting `modal skills install` — that's
   unrelated to this guide (a newer Modal CLI feature for AI-agent
   integrations) and safe to ignore here.

### Create Modal secrets

Go to **modal.com → Secrets → Create new secret → Custom** for each of the
following:

**Secret 1 — Supabase** (name: `supabase-credentials`)
| Key | Value |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | the **Secret** key from Step 4c |
| `SUPABASE_URL` | the Supabase API URL from Step 4c |

**Secret 2 — your AI provider(s)** (only create the ones you're using):

If using OpenAI (name: `openai-api-key`):
| Key | Value |
|---|---|
| `OPENAI_API_KEY` | your OpenAI key from Step 5 |

If using Gemini (name: `gemini-secret`):
| Key | Value |
|---|---|
| `GEMINI_API_KEY` | your Gemini key from Step 5 |

### Deploy the chat endpoint

There's no file to open or edit for this step — it's one command, typed or
pasted directly into your terminal (still in the project folder, still with
`(.venv)` active). `modal deploy` reads `chat_with_budget.py` and uploads it
to Modal's servers; that's what "deploying" means here.

`chat_with_budget.py` supports four providers (`openai`, `anthropic`,
`google`, `skolegpt`) and by default requires a secret for **all four** —
deployment fails if any are missing. Restrict it to the provider(s) you
actually set up by putting `MODAL_PROVIDERS=...` *in front of* the deploy
command, on the same line:

```bash
# If you set up OpenAI only, use the following command:
MODAL_PROVIDERS=openai modal deploy modal_functions/chat_with_budget.py

# If you set up Gemini only, use the following command:
MODAL_PROVIDERS=google modal deploy modal_functions/chat_with_budget.py

# If you set up more than one (e.g. openai and gemini), comma-separate them
# with no spaces — this same pattern extends to three or four providers too:
MODAL_PROVIDERS=openai,google modal deploy modal_functions/chat_with_budget.py
```

`MODAL_PROVIDERS=openai` (no spaces around the `=`) is shell syntax for "set
this environment variable for this one command only" — it's not a setting
saved anywhere, and it doesn't touch `chat_with_budget.py` on disk. Inside
that file, the line `os.environ.get("MODAL_PROVIDERS", "")` is simply
reading whatever value you passed on the command line at the moment you run
`modal deploy`; `modal deploy` then bakes that same value into the
deployed container so it also applies at request time, not just at deploy
time. Run the command again later with a different `MODAL_PROVIDERS` value
(e.g. after setting up a second provider) and it just redeploys with the
new setting — nothing to undo from the previous deploy first.

When it finishes, the output includes a line like:
```
Created web function chat_endpoint_with_budget => https://your-workspace--coderobots-chat-budget-chat-endpoint-with-budget-xxxx.modal.run
```
Copy that `https://....modal.run` URL into your credentials document — this
becomes `VITE_MODAL_BUDGET_ENDPOINT_URL` in Step 7.

You'll also see a separate `View Deployment: https://modal.com/apps/...`
line — that's just a link to this deployment's page in the Modal web
dashboard (logs, status, past deploys), for you to look at later if
something needs debugging. It's not a URL the app uses and doesn't need to
go in your credentials document; nothing to "keep" beyond knowing it's there
if you ever need it.

### Deploy the keepalive function

This keeps your Supabase project from being auto-paused for inactivity on
the free tier:

```bash
modal deploy modal_functions/supabase_keepalive.py
```

A successful run ends with something like:
```
Created objects.
├── 🔨 Created mount .../modal_functions/supabase_keepalive.py
└── 🔨 Created function ping_supabase_keepalive.
✓ App deployed in X.XXXs! 🎉
```
The line to look for is `Created function ping_supabase_keepalive.` — that
confirms the scheduled ping is live. It now runs on its own schedule in the
background.

---

## 7. Set Up Vercel

Vercel builds and hosts the frontend from your GitHub repo.

1. Create an account at [vercel.com](https://vercel.com) — signing in with
   GitHub makes the next step easier.
2. **Import Git Repository → GitHub.** The first time, Vercel needs its
   GitHub App installed before it can see your repos: click through to
   GitHub and choose **"Only select repositories"** (recommended — scopes
   Vercel's access to just this one repo, not your whole account) rather
   than "All repositories," then pick the repo you cloned in Step 3. Back
   on Vercel, find that repo in the import list and click **Import**.
3. **Don't deploy yet.** Set the Application Preset to **Vite**.

   Vercel will likely auto-detect **7** environment variables (it reads
   `.env.example` from the repo, which lists every var *any* instance or
   feature might need — not just yours) and show them all as blanks to
   fill in. Only some apply to this specific setup:

   | Key | What to do | Why |
   |---|---|---|
   | `VITE_INSTANCE` | set to `purdue` (or leave blank — same effect) | selects which instance config to build; `purdue` is the only fully-configured one today |
   | `VITE_SUPABASE_URL` | fill in — from Step 4c, ends in `.supabase.co` | required (this instance has `telemetry: true`) |
   | `VITE_SUPABASE_ANON_KEY` | fill in — the Publishable key from Step 4c | required (same reason) |
   | `VITE_MODAL_BUDGET_ENDPOINT_URL` | fill in — from Step 6, ends in `.modal.run` | required (this instance's `chat.mode` is `'direct'`) |
   | `VITE_MODAL_TUTOR_ENDPOINT_URL` | leave blank | only used by `chat.mode: 'tutor'` instances (e.g. `skolegpt-dk`) |
   | `VITE_ESP32_COMPILE_URL` | leave blank | only used by instances offering the `esp32-arduino` platform — `purdue.js` offers the MicroPython `esp32` platform instead, which doesn't need it |
   | `VITE_MODAL_ENDPOINT_URL` | leave blank | a legacy, budget-less chat endpoint kept for backward compatibility — not used by this setup |

   Leaving a var blank is fine — Vercel just won't set it, and the app
   ignores an env var it doesn't need for the active instance/config.

   You may also see an **"Optional Integrations"** panel here suggesting a
   native Supabase connection (Vercel detecting `@supabase/supabase-js` in
   the repo). **Skip it for now** — you've already created and fully
   configured the Supabase project by hand in Step 4, and it isn't yet
   confirmed whether this integration links to that existing project or
   spins up a new one, or whether it names its env vars the `VITE_`-prefixed
   way this app actually needs. The manual env vars above are verified to work.

4. Press **Deploy**. Your app should now be live.

### Understanding Vercel's URLs

After deploying, you'll see up to three different `.vercel.app` URLs for
the same project — these are generated automatically by Vercel, not
something you configure, and each serves a different purpose:

| URL pattern (example) | What it is | Changes when? |
|---|---|---|
| `<project>-alpha.vercel.app` (🌐 globe icon) | The **Production** alias — the stable URL for this project. This is the one to actually share/use. | Stays fixed; always points at whichever deployment is currently "Production" |
| `<project>-git-main-<team>.vercel.app` | The **branch alias** for `main` — "updates automatically" | Always points at the *latest* deployment built from the `main` branch |
| `<project>-<uniquekey>-<team>.vercel.app` | A **deployment-specific** URL, tied to one exact commit | Never changes for that deployment — but every new deployment gets its own new one of these |

In practice: the production alias is what you'd give to students/users (and
what a custom domain in Step 9 attaches to, replacing this default). The
branch alias is handy for "what's currently live on `main`" without
memorizing the ever-changing deployment-specific URL. The deployment-
specific URL is mostly useful for referencing/rolling back to one exact
past version.

**This also matters for your `dev`/`main` workflow:** by default, Vercel
treats pushes to your production branch (`main`) as **Production**
deployments, and pushes to *any other branch* (including `dev`) as
**Preview** deployments — each getting its own branch alias
(`<project>-git-dev-<team>.vercel.app`) and deployment-specific URL,
completely separate from what's live on `main`. That means you can push
experimental changes to `dev`, get a real live URL to test them at, and
nothing about your production site changes until you actually merge into
`main` — which is exactly the "experiment on `dev`, promote to `main`"
setup from the very start of this process.

---

## 8. Setting Admin Users

1. Create an account on your live editor (sign up as yourself via deployed app).
2. In Supabase, go to **Authentication** (lock icon) → find your user in the
   users table → copy the `user_id` (a UUID like
   `06fa2fd1-ce3e-4d85-9b29-229fa763bb17`, aka this is `<YOUR_USER_ID>`).
3. In the **Supabase SQL Editor**, run (with your actual user id):
   ```sql
   update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
   where id = '<YOUR_USER_ID>';
   ```
4. Repeat for any other admin users.
5. **Check who's currently an admin** — run this any time to see the full
   list:
   ```sql
   select id, email, raw_app_meta_data->>'role' as role
   from auth.users
   where raw_app_meta_data->>'role' = 'admin';
   ```
   Each row is one admin (their `user_id`, email, and confirmation the role
   is set). No rows back means nobody has the role yet — check you ran
   step 3 against the right `user_id`.
6. **Remove admin access** from someone:
   ```sql
   update auth.users
   set raw_app_meta_data = raw_app_meta_data - 'role'
   where id = '<THEIR_USER_ID>';
   ```
   This deletes the `role` key entirely (rather than setting it to some
   other value) so they cleanly fall back to being a regular user. Re-run
   the check in step 5 afterward — they should no longer appear.

> **Notes & Troubleshooting**
> - Granting or revoking admin doesn't take effect for someone already
>   logged in until their session token refreshes — `is_admin()` reads the
>   role off the *token's* claims, not a live lookup against `auth.users` on
>   every request. If you (or the person you just changed) don't see the
>   expected admin access/loss of access immediately, sign out and back in
>   to force a fresh token rather than assuming the SQL didn't work.
> - **What admin actually unlocks:** in the running app, `/data` (export raw
>   session data) and `/usage` (aggregate AI-cost dashboard) both explicitly
>   check for admin and redirect non-admins away — enforced both in the UI
>   and again at the database level (the "Admins can read all X" RLS
>   policies from §11.8). `/view-data` (session replay) is *not*
>   admin-gated — it's a local file viewer (you feed it a `.csv` you already
>   exported), so it doesn't need special access to the database at all.
>   Admin is a separate flag from the AI-budget tier (`camps`/`standard`) —
>   making yourself an admin does not change your own daily AI spend limit;
>   that's controlled independently.
> - **Changing a password:** there's no in-app "change password" flow today
>   (confirmed by checking the codebase — `AuthModal.jsx` only has
>   sign-in/sign-up). The only way right now is from Supabase:
>   **Authentication → Users**, find the account, and either send them a
>   password-reset email or set a new password directly for them, depending
>   on what your Supabase Studio version offers. For accounts with a real,
>   monitored inbox (like your own), the reset-email route is simplest; for
>   generic/bulk-created accounts, setting the password directly is more
>   reliable since nobody's actually checking that inbox.
> - **Deleting an account:** also done from **Authentication → Users** in
>   Supabase — delete the user there. Because of the cascade-delete setup in
>   §11.10 (plus `ai_usage`/`user_profiles`, which were created with cascade
>   from the start), this **fully removes all of their data**: every
>   session, code tab, code snapshot, console log, chat conversation and
>   message, interaction, and usage record tied to that `user_id`. There's
>   no soft-delete or recovery — if you just want a clean slate rather than
>   erasing history, creating a new account is simpler and non-destructive.

---

## 9. Adding a Custom Domain (optional)

1. In your Vercel project, go to **Domains** → **Add Existing** → type in
   your domain.
2. Go to your domain registrar's DNS records page (Cloudflare, GoDaddy,
   etc.) and add the record Vercel shows you:
   - Type: `A`
   - Name: `@`
   - Value: (the IP Vercel gives you)
   - Proxy status: **off / DNS only** (if using Cloudflare — proxying breaks
     Vercel's SSL handshake)
   - TTL: Auto
3. Wait 1–2 minutes, then refresh the Domains page in Vercel — it should
   show "Valid Configuration."

---

## 10. Bulk-Creating Student Accounts (optional)

Once you're ready to onboard a group of students:

1. In the project root, create `.env.local` (if it doesn't already exist)
   with:
   ```
   SUPABASE_SERVICE_ROLE_KEY=<the Secret key from Step 4c>
   VITE_SUPABASE_URL=<the Supabase API URL from Step 4c>
   ```
   This file is git-ignored (via `.gitignore`) — never commit it.
2. Run:
   ```bash
   ./scripts/bulk_create_camp_users.sh <count>
   ```
   where `<count>` is how many accounts to create (1–99). This auto-generates
   emails of the form `facelab.team01@gmail.com`, `facelab.team02@gmail.com`,
   etc., with random passwords, tags each account with
   `access_level: "camps"` (a higher daily budget than standard users, per
   the `CAMPS_DAILY_BUDGET` config value), and writes the email/password
   pairs to `camp_users.csv` (also git-ignored).
3. Accounts are expected to be deleted from Supabase before re-running the
   script with the same range — it errors out if any target email already
   exists.

> **Notes & Troubleshooting**
> - The script takes a **count**, not a file of emails — it always generates
>   its own `facelab.team##@gmail.com`-style addresses. If you need
>   different email addresses or domains, either edit the script or create
>   accounts individually through the Supabase dashboard.

---

## 11. Appendix: Full Supabase SQL Script

Run these blocks **in order**, one at a time, in the Supabase SQL Editor
(as detailed in Step 4b). Delete/clear the previous block from the editor before
pasting the next one.

### 11.1 — `is_admin()` helper function

**What & why:** defines a reusable check the other SQL blocks below call to
decide "is the currently logged-in user an admin?" — it reads a `role` field
straight off the user's own login token rather than querying a separate
table, so it's cheap enough to use inside row-security rules.

```sql
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

grant execute on function public.is_admin() to authenticated, service_role;
```

### 11.2 — `app_config` table

**What & why:** creates a generic key/value settings table the app reads at
runtime for things that shouldn't be hardcoded (budget limits, hardware
catalogs, etc. — populated in the next two blocks). Any logged-in user can
read it; only the backend (`service_role`) can write to it.

> **Supabase popup:** when you run this block, Supabase may warn "This query
> creates a table without enabling Row Level Security," with options **Run
> without RLS** / **Run and enable RLS**. Choose **Run without RLS** — the
> warning only looked at the `create table` line; the very next lines in
> this same block already run `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
> and add a policy, so RLS ends up on by the time the whole block finishes.
> "Run and enable RLS" would just have Supabase redundantly inject its own
> RLS-enabling step on top of the explicit one already here.

```sql
create table public.app_config (
  key text not null,
  value jsonb null,
  updated_at timestamp with time zone not null default now(),
  constraint app_config_pkey primary key (key)
) TABLESPACE pg_default;

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All users read access"
ON app_config
FOR SELECT TO authenticated
USING (true);
```

### 11.3 — Default app config values

**What & why:** sets the actual dollar amounts for the app's two built-in
daily AI-spend tiers (`STANDARD_DAILY_BUDGET` for everyone by default,
`CAMPS_DAILY_BUDGET` for a higher-budget group), plus an internal flag the
keepalive function uses. These are the numbers a student can spend per day
before the chat starts refusing requests.

```sql
INSERT INTO public.app_config (key, value)
VALUES
  ('CAMPS_DAILY_BUDGET', '1.0'),
  ('STANDARD_DAILY_BUDGET', '0.125'),
  ('system.supabase_keepalive', '0');
```

### 11.4 — Hardware components (LilyBot / Fritzing)

**What & why:** registers the catalog of parts (microcontroller, sensors,
motor driver, etc.) and one default wiring template that the LilyBot
platform's hardware-configuration UI reads to know what's available and how
to render pin diagrams. LilyBot is the most hardware-flexible of the
platforms this app supports (compare micro:bit or Cutebot, which have fixed
wiring) — this is where you'd add more MPUs/components/templates if you
introduce new LilyBot hardware later.

> **Note:** the templates key below must be `LILYBOT_HARDWARE_TEMPLATES` —
> that's the exact string `src/services/hardwareParts.js` reads. Getting
> this key name wrong causes the LilyBot hardware-config feature to throw an
> error rather than degrade gracefully.

```sql
INSERT INTO public.app_config (key, value)
VALUES
  ('LILYBOT_MPUS', '["rpi-picow"]'),
  ('LILYBOT_COMPONENTS',
   '["hc-sr04","led-5mm","lcd1602iic","buzzer","us100ultrasonic","mpu6050gy521","tb6612fng","sg90","dht11","lm393","ky037","photoresistor"]'),
  ('LILYBOT_HARDWARE_TEMPLATES', '[
    {
      "id": "default-pico-lilybot-sparkfun",
      "name": "Default LilyBot (Pico + SparkFun TB6612FNG + Ultrasonic)",
      "mappings": {
        "gnd": { "label": "Ultrasonic GND", "instanceId": "hcsr04-1", "componentPinId": "gnd" },
        "gp16": { "label": "Ultrasonic ECHO", "instanceId": "hcsr04-1", "componentPinId": "echo" },
        "gp17": { "label": "Ultrasonic TRIG", "instanceId": "hcsr04-1", "componentPinId": "trig" },
        "gp18": { "label": "Motor Driver STBY", "instanceId": "tb6612-1", "componentPinId": "connector3" },
        "gp20": { "label": "Motor Driver PWMB", "instanceId": "tb6612-1", "componentPinId": "connector6" },
        "gp21": { "label": "Motor Driver BIN2", "instanceId": "tb6612-1", "componentPinId": "connector5" },
        "gp22": { "label": "Motor Driver BIN1", "instanceId": "tb6612-1", "componentPinId": "connector4" },
        "gp26": { "label": "Motor Driver AIN1", "instanceId": "tb6612-1", "componentPinId": "connector2" },
        "gp27": { "label": "Motor Driver AIN2", "instanceId": "tb6612-1", "componentPinId": "connector1" },
        "gp28": { "label": "Motor Driver PWMA", "instanceId": "tb6612-1", "componentPinId": "connector0" },
        "connector22": { "label": "Ultrasonic GND", "instanceId": "hcsr04-1", "componentPinId": "connector3" },
        "connector37": [
          { "label": "Motor Driver GND (pin 7)", "instanceId": "tb6612-1", "componentPinId": "connector7" },
          { "label": "Motor Driver GND (pin 10)", "instanceId": "tb6612-1", "componentPinId": "connector10" },
          { "label": "Motor Driver GND (pin 15)", "instanceId": "tb6612-1", "componentPinId": "connector15" }
        ],
        "connector38": { "label": "Ultrasonic VCC", "instanceId": "hcsr04-1", "componentPinId": "vcc" },
        "connector39": [
          { "label": "Motor Driver VM", "instanceId": "tb6612-1", "componentPinId": "connector8" },
          { "label": "Motor Driver VCC", "instanceId": "tb6612-1", "componentPinId": "connector9" }
        ]
      },
      "components": [
        { "nickname": "Motor Driver", "instanceId": "tb6612-1", "componentId": "tb6612fng" },
        { "nickname": "Ultrasonic", "instanceId": "hcsr04-1", "componentId": "hc-sr04" }
      ],
      "selectedMpuId": "rpi-picow"
    }
  ]')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

### 11.5 — Create database tables

**What & why:** creates the actual application data model — user profiles,
sessions (one per "workspace" a student opens), and everything nested under
a session (code tabs, code history snapshots, console output, chat
conversations/messages, button-click telemetry) — **including the
`ai_models` table itself**, which the next block (11.6) inserts rows into.
This is the largest block because tables are created in dependency order —
a table can't reference another table that doesn't exist yet.

> **Supabase popup:** the same "Run without RLS" / "Run and enable RLS"
> prompt from §11.2 will likely pop up again here, once per table. Choose
> **Run without RLS** again — but note the reason is slightly different
> this time: RLS for these tables isn't turned on until §11.7, not later in
> this same block. That's fine; nothing outside this setup can reach these
> tables until the Data API grants in §11.9 anyway.

```sql
-- CREATE NONCIRCULAR TABLES

create table public.user_profiles (
  user_id uuid not null,
  email text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  students text null,
  constraint user_profiles_pkey primary key (user_id),
  constraint user_profiles_email_key unique (email),
  constraint user_profiles_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

-- Keeps user_profiles.updated_at current on every edit.
create or replace function public.touch_user_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_touch_user_profiles_updated_at BEFORE
update on user_profiles for EACH row
execute FUNCTION touch_user_profiles_updated_at ();

create table public.ai_models (
  id bigint generated by default as identity not null,
  model_name text not null,
  provider text not null default 'openai'::text,
  input_price real not null,
  cached_input_price real null,
  output_price real not null,
  unlimited boolean not null default false,
  streamable boolean not null default true,
  "default" boolean not null default false,
  constraint ai_models_pkey primary key (id)
) TABLESPACE pg_default;

create table public.ai_usage (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  timestamp timestamp with time zone not null default now(),
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  reasoning_tokens integer not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  created_at timestamp with time zone not null default now(),
  constraint ai_usage_pkey primary key (id),
  constraint ai_usage_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

-- CREATE SESSIONS EARLY SINCE MANY OTHER TABLES REFERENCE IT

create table public.sessions (
  id bigint generated by default as identity not null,
  start_time timestamp with time zone not null default now(),
  user_id uuid null,
  last_updated timestamp with time zone not null default now(),
  loaded_timestamps timestamp with time zone [] null,
  current_code_id bigint null,
  current_console_id bigint null,
  current_conversation_id bigint null,
  name text null default 'Unnamed Session'::text,
  hardware_platform text null,
  constraint sessions_pkey primary key (id),
  constraint sessions_user_id_fkey foreign KEY (user_id) references auth.users (id) on update CASCADE on delete RESTRICT
) TABLESPACE pg_default;

-- CREATE TABLES THAT REFERENCE SESSIONS

create table public.code (
  id bigint generated by default as identity not null,
  user_id uuid not null default auth.uid (),
  timestamp timestamp with time zone not null default now(),
  content text null default ''::text,
  save_source text not null,
  session_id bigint not null,
  name text null default 'Code Tab'::text,
  constraint code_pkey1 primary key (id),
  constraint code_session_id_fkey1 foreign KEY (session_id) references sessions (id) on update CASCADE on delete RESTRICT,
  constraint code_user_id_fkey1 foreign KEY (user_id) references auth.users (id) on update CASCADE on delete RESTRICT
) TABLESPACE pg_default;

create table public.code_snapshots (
  id bigint generated by default as identity not null,
  user_id uuid not null default auth.uid (),
  timestamp timestamp with time zone not null default now(),
  code_id bigint not null,
  session_id bigint not null,
  content text null default ''::text,
  save_source text not null,
  constraint code_snapshots_pkey primary key (id),
  constraint code_snapshots_code_id_fkey foreign KEY (code_id) references code (id) on update CASCADE on delete CASCADE,
  constraint code_snapshots_session_id_fkey foreign KEY (session_id) references sessions (id) on update CASCADE on delete RESTRICT,
  constraint code_snapshots_user_id_fkey foreign KEY (user_id) references auth.users (id) on update CASCADE on delete RESTRICT
) TABLESPACE pg_default;

create table public.console (
  id bigint generated by default as identity not null,
  user_id uuid not null default auth.uid (),
  timestamp timestamp with time zone not null default now(),
  content text null default ''::text,
  save_source text not null,
  session_id bigint not null,
  constraint console_pkey primary key (id),
  constraint console_session_id_fkey foreign KEY (session_id) references sessions (id) on update CASCADE on delete RESTRICT,
  constraint console_user_id_fkey foreign KEY (user_id) references auth.users (id) on update CASCADE on delete RESTRICT
) TABLESPACE pg_default;

create table public.conversations (
  id bigint generated by default as identity not null,
  user_id uuid not null default auth.uid (),
  start_time timestamp with time zone not null default now(),
  last_updated timestamp with time zone not null default now(),
  session_id bigint not null,
  name text null default 'Unnamed Chat'::text,
  constraint conversations_pkey primary key (id),
  constraint conversations_session_id_fkey foreign KEY (session_id) references sessions (id) on update CASCADE on delete RESTRICT,
  constraint conversations_user_id_fkey foreign KEY (user_id) references auth.users (id) on update CASCADE on delete RESTRICT
) TABLESPACE pg_default;

create table public.interactions (
  id bigint generated by default as identity not null,
  user_id uuid not null default auth.uid (),
  timestamp timestamp with time zone not null default now(),
  button_name text not null,
  session_id bigint not null,
  constraint interactions_pkey primary key (id),
  constraint interactions_session_id_fkey foreign KEY (session_id) references sessions (id) on update CASCADE on delete RESTRICT,
  constraint interactions_user_id_fkey foreign KEY (user_id) references auth.users (id) on update CASCADE on delete RESTRICT
) TABLESPACE pg_default;

create table public.messages (
  id bigint generated by default as identity not null,
  user_id uuid not null default auth.uid (),
  conversation_id bigint not null,
  role text not null,
  content text null,
  coding_level text null,
  ai_model text null,
  prompt_tokens integer null,
  completion_tokens integer null,
  code_context_id bigint null,
  console_context_id bigint null,
  timestamp timestamp with time zone not null default now(),
  constraint messages_pkey1 primary key (id),
  constraint messages_code_context_id_fkey foreign KEY (code_context_id) references code (id) on update CASCADE on delete RESTRICT,
  constraint messages_console_context_id_fkey foreign KEY (console_context_id) references console (id) on update CASCADE on delete RESTRICT,
  constraint messages_conversation_id_fkey foreign KEY (conversation_id) references conversations (id) on update CASCADE on delete RESTRICT,
  constraint messages_user_id_fkey foreign KEY (user_id) references auth.users (id) on update CASCADE on delete RESTRICT
) TABLESPACE pg_default;
```

### 11.6 — AI models

**What & why:** registers which specific AI models the app is allowed to
offer students and what each one costs per token — the budget system in
Step 6 reads this table to price every request. These rows will go stale as
providers release new models; treat the exact model names/prices here as a
snapshot to revisit periodically, not something to get right once and
forget.

Decide now which AI provider(s) this deployment will use — OpenAI, Gemini,
or both. (Actually creating those provider accounts/API keys is Step 5,
which you can do before or after this block — the decision of *which*
provider(s) is all that matters here.) Insert only the row(s) for the
provider(s) you're choosing, so the `ai_models` table doesn't end up listing
a provider your Modal deployment doesn't support (per
`modal_functions/README.md`).

```sql
-- If using OpenAI:
INSERT INTO public.ai_models (model_name, provider, input_price, cached_input_price, output_price, unlimited, streamable, "default")
VALUES
  ('gpt-5.4', 'openai', 2.50, 0.25, 15, FALSE, FALSE, FALSE),
  ('gpt-5.4-mini', 'openai', 0.75, 0.075, 4.50, FALSE, FALSE, FALSE),
  ('gpt-5.4-nano', 'openai', 0.20, 0.02, 1.25, TRUE, TRUE, TRUE);
```

```sql
-- If using Gemini:
INSERT INTO public.ai_models (model_name, provider, input_price, cached_input_price, output_price, unlimited, streamable, "default")
VALUES
  ('gemini-3.5-flash', 'google', 1.50, 0.15, 9.00, FALSE, TRUE, FALSE),
  ('gemini-3.1-flash-lite', 'google', 0.25, 0.025, 1.50, TRUE, TRUE, TRUE);
```

> Prices and model names above reflect what was current when this guide was
> written — check current provider pricing pages before trusting these
> numbers for budgeting.

### 11.7 — Circular constraints, indexes, and row-level security

**What & why:** three cleanup jobs in one block. First, links `sessions`
back to its "current code tab / current chat / current console" columns —
these couldn't be added in 11.5 because `code`/`conversations`/`console`
didn't exist yet when `sessions` was created (a chicken-and-egg problem).
Second, adds indexes so usage/history queries stay fast as data grows.
Third, flips on Row Level Security for every table — until the policies in
the next block exist, RLS-enabled tables reject all access by default,
which is the safe direction to fail in.

```sql
-- ADD CIRCULAR CONSTRAINTS BACK TO SESSIONS TABLE

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_current_code_id_fkey
    FOREIGN KEY (current_code_id) REFERENCES code (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT sessions_current_console_id_fkey
    FOREIGN KEY (current_console_id) REFERENCES console (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT sessions_current_conversation_id_fkey
    FOREIGN KEY (current_conversation_id) REFERENCES conversations (id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- INDEXES

create index IF not exists idx_ai_usage_user_timestamp on public.ai_usage using btree (user_id, "timestamp" desc) TABLESPACE pg_default;
create index IF not exists idx_ai_usage_user_model on public.ai_usage using btree (user_id, model) TABLESPACE pg_default;
create index IF not exists idx_code_snapshots_code_id on public.code_snapshots using btree (code_id) TABLESPACE pg_default;
create index IF not exists idx_code_snapshots_session_id on public.code_snapshots using btree (session_id) TABLESPACE pg_default;
create index IF not exists idx_code_snapshots_timestamp on public.code_snapshots using btree ("timestamp" desc) TABLESPACE pg_default;

-- ENABLE RLS ON ALL TABLES

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE code ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE console ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
```

### 11.8 — RLS policies

**What & why:** the actual access rules Row Level Security enforces per
table — the recurring pattern is "a user can read/write their own rows"
(matched by `auth.uid() = user_id`) plus "an admin can read everyone's rows"
(using the `is_admin()` function from 11.1). This is the enforcement layer
that makes a user's session data private from other users by default.

> **Supabase popup:** this block will likely trigger a different warning —
> "This query includes destructive operations... Run this query only if you
> intend these changes." That's because several lines below are `drop
> policy if exists ...` statements, used so this block can be safely re-run
> without erroring if a policy already exists. No table or data is dropped —
> only (re)defining access policies. Safe to proceed.

```sql
CREATE POLICY "Admins can read ai_usage records" ON ai_usage FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Service role can insert ai_usage record" ON ai_usage FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Users can read their own ai_usage records" ON ai_usage FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can read user profiles" ON user_profiles FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Users can read their own profile" ON user_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "All users read access" ON ai_models FOR SELECT TO authenticated USING (true);

-- SELECT: a user may read only their own row
create policy "Users read own profile" on public.user_profiles for select to authenticated using (auth.uid() = user_id);
-- INSERT: a user may insert only their own row (first-login upsert)
create policy "Users insert own profile" on public.user_profiles for insert to authenticated with check (auth.uid() = user_id);
-- UPDATE: a user may update only their own row
create policy "Users update own profile" on public.user_profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Restrict UPDATE to the students column only
-- (RLS controls rows; column-level access is via GRANT)
revoke update on public.user_profiles from authenticated;
grant update (students) on public.user_profiles to authenticated;

CREATE POLICY "sessions view own" ON sessions FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "sessions insert own" ON sessions FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "sessions update own" ON sessions FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "messages view own" ON messages FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "messages insert own" ON messages FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "code view own" ON code FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "code insert own" ON code FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "code update own" ON code FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can view their own code snapshots" ON code_snapshots FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can create their own code snapshots" ON public.code_snapshots FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "console view own" ON console FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "console insert own" ON console FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "conversations view own" ON conversations FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "conversations insert own" ON conversations FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "conversations update own" ON conversations FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "interactions view own" ON interactions FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "interactions insert own" ON interactions FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

drop policy if exists "Admins can read all sessions" on public.sessions;
create policy "Admins can read all sessions" on public.sessions for select to authenticated using (is_admin());

drop policy if exists "Admins can read all messages" on public.messages;
create policy "Admins can read all messages" on public.messages for select to authenticated using (is_admin());

drop policy if exists "Admins can read all code" on public.code;
create policy "Admins can read all code" on public.code for select to authenticated using (is_admin());

drop policy if exists "Admins can read all code snapshots" on public.code_snapshots;
create policy "Admins can read all code snapshots" on public.code_snapshots for select to authenticated using (is_admin());

drop policy if exists "Admins can read all console" on public.console;
create policy "Admins can read all console" on public.console for select to authenticated using (is_admin());

drop policy if exists "Admins can read all conversations" on public.conversations;
create policy "Admins can read all conversations" on public.conversations for select to authenticated using (is_admin());

drop policy if exists "Admins can read all interactions" on public.interactions;
create policy "Admins can read all interactions" on public.interactions for select to authenticated using (is_admin());

grant select on public.interactions to authenticated;
```

### 11.9 — Data API grants

**What & why:** a separate, newer layer of permission on top of RLS —
Supabase now requires an explicit `grant` before a table is reachable
through its auto-generated REST API at all, regardless of what RLS policies
say. Without this block, every query from the browser would be rejected
before RLS policies are even considered. The last two lines grant access to
the auto-incrementing id sequences, which inserts need in order to generate
new row ids.

```sql
-- =========================================================
-- DATA API GRANTS
-- Required for supabase-js / PostgREST / GraphQL access.
-- =========================================================

grant select on public.app_config to authenticated;
grant select, insert, update, delete on public.app_config to service_role;

grant select, insert, update on public.user_profiles to authenticated;
grant select, insert, update, delete on public.user_profiles to service_role;

grant select on public.ai_models to authenticated;
grant select, insert, update, delete on public.ai_models to service_role;

grant select, insert on public.ai_usage to authenticated;
grant select, insert, update, delete on public.ai_usage to service_role;

grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, update, delete on public.sessions to service_role;

grant select, insert, update, delete on public.code to authenticated;
grant select, insert, update, delete on public.code to service_role;

grant select, insert on public.code_snapshots to authenticated;
grant select, insert, update, delete on public.code_snapshots to service_role;

grant select, insert on public.console to authenticated;
grant select, insert, update, delete on public.console to service_role;

grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.conversations to service_role;

grant insert on public.interactions to authenticated;
grant select, insert, update, delete on public.interactions to service_role;

grant select, insert on public.messages to authenticated;
grant select, insert, update, delete on public.messages to service_role;

-- Required so authenticated inserts can generate the bigint id.
grant usage, select on all sequences in schema public to authenticated;
grant usage, select on all sequences in schema public to service_role;
```

### 11.10 — Shift to cascade delete

**What & why:** replaces the default "block deletion if anything still
references this row" behavior with "delete the dependent rows too" — so
deleting a user or a session actually removes all their data instead of
erroring out because old code/messages/snapshots still point to it. Wrapped
in a single `begin`/`commit` transaction so it either fully applies or not
at all.

```sql
begin;

-- ---------- user_id FKs: cascade from auth.users ----------

alter table public.sessions drop constraint if exists sessions_user_id_fkey;
alter table public.sessions add constraint sessions_user_id_fkey
  foreign key (user_id) references auth.users (id) on update cascade on delete cascade;

alter table public.code drop constraint if exists code_user_id_fkey1;
alter table public.code add constraint code_user_id_fkey1
  foreign key (user_id) references auth.users (id) on update cascade on delete cascade;

alter table public.code_snapshots drop constraint if exists code_snapshots_user_id_fkey;
alter table public.code_snapshots add constraint code_snapshots_user_id_fkey
  foreign key (user_id) references auth.users (id) on update cascade on delete cascade;

alter table public.console drop constraint if exists console_user_id_fkey;
alter table public.console add constraint console_user_id_fkey
  foreign key (user_id) references auth.users (id) on update cascade on delete cascade;

alter table public.conversations drop constraint if exists conversations_user_id_fkey;
alter table public.conversations add constraint conversations_user_id_fkey
  foreign key (user_id) references auth.users (id) on update cascade on delete cascade;

alter table public.interactions drop constraint if exists interactions_user_id_fkey;
alter table public.interactions add constraint interactions_user_id_fkey
  foreign key (user_id) references auth.users (id) on update cascade on delete cascade;

alter table public.messages drop constraint if exists messages_user_id_fkey;
alter table public.messages add constraint messages_user_id_fkey
  foreign key (user_id) references auth.users (id) on update cascade on delete cascade;

-- ---------- session_id FKs: cascade with the parent session ----------

alter table public.code drop constraint if exists code_session_id_fkey1;
alter table public.code add constraint code_session_id_fkey1
  foreign key (session_id) references public.sessions (id) on update cascade on delete cascade;

alter table public.code_snapshots drop constraint if exists code_snapshots_session_id_fkey;
alter table public.code_snapshots add constraint code_snapshots_session_id_fkey
  foreign key (session_id) references public.sessions (id) on update cascade on delete cascade;

alter table public.console drop constraint if exists console_session_id_fkey;
alter table public.console add constraint console_session_id_fkey
  foreign key (session_id) references public.sessions (id) on update cascade on delete cascade;

alter table public.conversations drop constraint if exists conversations_session_id_fkey;
alter table public.conversations add constraint conversations_session_id_fkey
  foreign key (session_id) references public.sessions (id) on update cascade on delete cascade;

alter table public.interactions drop constraint if exists interactions_session_id_fkey;
alter table public.interactions add constraint interactions_session_id_fkey
  foreign key (session_id) references public.sessions (id) on update cascade on delete cascade;

-- ---------- messages parent/context FKs ----------

alter table public.messages drop constraint if exists messages_conversation_id_fkey;
alter table public.messages add constraint messages_conversation_id_fkey
  foreign key (conversation_id) references public.conversations (id) on update cascade on delete cascade;

alter table public.messages drop constraint if exists messages_console_context_id_fkey;
alter table public.messages add constraint messages_console_context_id_fkey
  foreign key (console_context_id) references public.console (id) on update cascade on delete set null;

-- ---------- circular FKs on sessions: SET NULL to break the cycle ----------

alter table public.sessions drop constraint if exists sessions_current_code_id_fkey;
alter table public.sessions add constraint sessions_current_code_id_fkey
  foreign key (current_code_id) references public.code (id) on update cascade on delete set null;

alter table public.sessions drop constraint if exists sessions_current_console_id_fkey;
alter table public.sessions add constraint sessions_current_console_id_fkey
  foreign key (current_console_id) references public.console (id) on update cascade on delete set null;

alter table public.sessions drop constraint if exists sessions_current_conversation_id_fkey;
alter table public.sessions add constraint sessions_current_conversation_id_fkey
  foreign key (current_conversation_id) references public.conversations (id) on update cascade on delete set null;

commit;
```

### 11.11 — Setup verification query

**What & why:** a single copy-paste-able gut-check for everything in §11.1
through §11.10. This is not a line-by-line audit, just enough to catch
"I skipped a block" or "that one failed silently" before you move on to
Step 5. Run it once after finishing §11.10, read down the `status` column,
and anything other than `OK` tells you which earlier block to go re-run.

```sql
with expected_tables (name) as (
  values
    ('app_config'), ('user_profiles'), ('ai_models'), ('ai_usage'),
    ('sessions'), ('code'), ('code_snapshots'), ('console'),
    ('conversations'), ('interactions'), ('messages')
),
table_check as (
  select 'table: ' || et.name as check_name,
         case when t.tablename is not null then 'OK' else 'MISSING (§11.2 / §11.5)' end as status,
         ''::text as detail
  from expected_tables et
  left join pg_tables t on t.schemaname = 'public' and t.tablename = et.name
),
function_check as (
  select 'function: ' || f.fn as check_name,
         case when exists (
           select 1 from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = f.fn
         ) then 'OK' else 'MISSING (§11.1 / §11.5)' end as status,
         ''::text as detail
  from (values ('is_admin'), ('touch_user_profiles_updated_at')) as f(fn)
),
config_check as (
  select 'app_config key: ' || w.key as check_name,
         case when exists (
           select 1 from public.app_config ac where ac.key = w.key
         ) then 'OK' else 'MISSING (§11.3 / §11.4)' end as status,
         ''::text as detail
  from (values
    ('CAMPS_DAILY_BUDGET'), ('STANDARD_DAILY_BUDGET'),
    ('system.supabase_keepalive'), ('LILYBOT_MPUS'),
    ('LILYBOT_COMPONENTS'), ('LILYBOT_HARDWARE_TEMPLATES')
  ) as w(key)
),
model_check as (
  select 'ai_models has rows' as check_name,
         case when (select count(*) from public.ai_models) > 0
           then 'OK' else 'MISSING (§11.6)' end as status,
         (select count(*)::text || ' row(s)' from public.ai_models) as detail
),
rls_check as (
  select 'RLS enabled: ' || et.name as check_name,
         case when c.relrowsecurity then 'OK' else 'MISSING (§11.2 / §11.7)' end as status,
         ''::text as detail
  from expected_tables et
  join pg_class c on c.relname = et.name
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
),
circular_fk_check as (
  select 'circular FK: ' || fk as check_name,
         case when exists (
           select 1 from pg_constraint where conname = fk
         ) then 'OK' else 'MISSING (§11.7)' end as status,
         ''::text as detail
  from (values
    ('sessions_current_code_id_fkey'),
    ('sessions_current_console_id_fkey'),
    ('sessions_current_conversation_id_fkey')
  ) as c(fk)
),
policy_check as (
  select 'policies exist: ' || et.name as check_name,
         case when count(pol.policyname) > 0 then 'OK' else 'MISSING (§11.8)' end as status,
         count(pol.policyname)::text || ' polic' ||
           case when count(pol.policyname) = 1 then 'y' else 'ies' end as detail
  from expected_tables et
  left join pg_policies pol on pol.schemaname = 'public' and pol.tablename = et.name
  group by et.name
),
grant_check as (
  select 'authenticated can select: ' || et.name as check_name,
         case when has_table_privilege('authenticated', 'public.' || et.name, 'select')
           then 'OK' else 'MISSING (§11.9)' end as status,
         ''::text as detail
  from expected_tables et
),
cascade_check as (
  select 'cascade delete applied' as check_name,
         case when confdeltype = 'c' then 'OK' else 'MISSING (§11.10)' end as status,
         ''::text as detail
  from pg_constraint where conname = 'sessions_user_id_fkey'
)
select * from table_check
union all select * from function_check
union all select * from config_check
union all select * from model_check
union all select * from rls_check
union all select * from circular_fk_check
union all select * from policy_check
union all select * from grant_check
union all select * from cascade_check
order by status, check_name;
```

**Reading the results:** every row's `status` should say `OK`. Any other
value names the section to go back and re-run — most often that means the
block errored out partway through and needs a second attempt, or was
skipped entirely. If you re-run a block and a check still fails with no
obvious reason why, that's a good moment to paste the failing check name
plus the error message into an LLM for help debugging — it can usually spot
a missing dependency or a typo faster than reading the raw SQL by eye.

This only checks *existence*, not correctness of values (e.g. it confirms
`CAMPS_DAILY_BUDGET` exists, not that `1.0` is the value you actually
wanted).