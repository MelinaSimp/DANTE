-- invites.company_id is a legacy pointer — when the project renamed
-- the "companies" concept to "workspaces", the app code moved over
-- but the FK on invites.company_id was left pointing at the old
-- `companies` table. Sending a new invite from /admin/invites (which
-- selects from workspaces) now fails with:
--
--   insert or update on table "invites" violates foreign key
--   constraint "invites_company_id_fkey"
--
-- because the workspace UUID doesn't exist in the empty legacy table.
--
-- We keep the column name company_id so no app-side code changes are
-- required, but retarget the FK at workspaces(id). Cascade-delete so
-- deleting a workspace cleans up its pending invites automatically.

alter table invites
  drop constraint if exists invites_company_id_fkey;

alter table invites
  add constraint invites_company_id_fkey
  foreign key (company_id)
  references workspaces(id)
  on delete cascade;
