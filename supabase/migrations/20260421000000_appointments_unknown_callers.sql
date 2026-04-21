-- Let appointments exist without a matching contacts row.
--
-- Before this change, when an AI-booked call landed on a phone number
-- we'd never seen before, the schedule endpoint silently auto-created
-- a contacts row so the appointment could satisfy the NOT NULL
-- foreign-key. Net effect: the Contacts list filled up with every
-- cold caller, and advisors lost the signal of "who's actually my
-- client."
--
-- Now the schedule endpoint leaves contact_id NULL for unknown
-- numbers and stashes what it knows in caller_name/caller_phone on
-- the appointment row itself. The UI renders "Unknown · +1 555…"
-- with the heard name in a muted sub-label. The advisor can promote
-- an unknown caller to a real contact on demand (which back-populates
-- contact_id here and on any sibling appointments from the same
-- number).
--
-- Manual appointments created via the UI still go through the
-- match-or-create path in /api/appointments — the "don't auto-
-- create" rule is specifically for the AI-booked flow.

ALTER TABLE appointments
  ALTER COLUMN contact_id DROP NOT NULL;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS caller_name TEXT;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS caller_phone TEXT;

-- Speeds up the "other appointments from this number" lookup on the
-- detail view, and makes the "promote to client" back-fill query
-- (UPDATE ... WHERE caller_phone = $1 AND contact_id IS NULL) cheap.
CREATE INDEX IF NOT EXISTS appointments_caller_phone_idx
  ON appointments (caller_phone)
  WHERE contact_id IS NULL;
