-- Reset test data.
--
-- Deletes every auth.users / user_profiles account EXCEPT the one(s) whose
-- raw_app_meta_data.role = 'admin', and wipes application data (sessions,
-- conversations, messages, code, code_snapshots, console, interactions) for
-- every deleted user. ai_usage is always cleared for ALL users, including
-- the kept admin(s) -- "clear out the admin usage data, but keep their
-- account intact".
--
-- TOGGLE: wipe_admin_own_data below controls whether the admin's OWN
-- sessions/code/conversations/etc are wiped too (true), or left alone
-- (false, admin keeps their session history -- only their ai_usage rows
-- and other users' data/accounts are cleared).
--
-- Does NOT touch app_config or ai_models -- those are shared deployment
-- config, not test data.
--
-- Run this in the Supabase SQL Editor (it has the postgres role needed to
-- delete from auth.users). IRREVERSIBLE -- there is no undo. Take a backup
-- first if you're at all unsure.

begin;

do $$
declare
  wipe_admin_own_data boolean := true; -- set to false to keep admin's own session/code/chat data
  admin_ids uuid[];
  keep_ids uuid[]; -- user ids whose sessions/code/etc are PRESERVED (empty when wipe_admin_own_data is true)
begin
  select array_agg(id) into admin_ids
  from auth.users
  where raw_app_meta_data ->> 'role' = 'admin';

  if admin_ids is null or array_length(admin_ids, 1) is null then
    raise exception
      'No admin account found (raw_app_meta_data.role = ''admin'') -- aborting so we don''t delete every account. Confirm an admin exists, or adjust this script if that''s intentional.';
  end if;

  keep_ids := case when wipe_admin_own_data then array[]::uuid[] else admin_ids end;

  raise notice 'Keeping % admin account(s): % (own data preserved: %)',
    array_length(admin_ids, 1), admin_ids, not wipe_admin_own_data;

  -- 1. Break the sessions -> {code, console, conversations} circular FK
  --    (sessions.current_code_id / current_console_id /
  --    current_conversation_id) before those child rows can be deleted.
  --    sessions.user_id is nullable, so orphaned (null-owner) sessions are
  --    always included regardless of the toggle.
  update public.sessions
     set current_code_id = null,
         current_console_id = null,
         current_conversation_id = null
   where user_id <> all (keep_ids) or user_id is null;

  -- 2. Delete session-scoped data for everyone EXCEPT keep_ids, in
  --    FK-safe order (children before parents).
  delete from public.messages where user_id <> all (keep_ids);
  delete from public.code_snapshots where user_id <> all (keep_ids);
  delete from public.interactions where user_id <> all (keep_ids);
  delete from public.console where user_id <> all (keep_ids);
  delete from public.conversations where user_id <> all (keep_ids);
  delete from public.code where user_id <> all (keep_ids);
  delete from public.sessions where user_id <> all (keep_ids) or user_id is null;

  -- 3. Clear usage data for EVERYONE, including the admin(s) being kept --
  --    this one ignores the toggle, per "clear the admin usage data".
  delete from public.ai_usage;

  -- 4. Delete profile rows + auth accounts for every non-admin user.
  --    (ai_usage/user_profiles for these users would cascade automatically
  --    on the auth.users delete anyway; done explicitly above/below for
  --    clarity.)
  delete from public.user_profiles
   where user_id <> all (admin_ids);

  delete from auth.users
   where id <> all (admin_ids);
end $$;

commit;
