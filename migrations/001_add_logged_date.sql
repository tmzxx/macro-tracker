-- Adds a distinct "logged_date" column to meals so entries can be backdated
-- to a past day without touching created_at (which keeps recording the
-- actual insert time). History/daily-summary/insights queries group by
-- logged_date, not created_at, going forward.
--
-- Run manually in the Supabase SQL editor (or `supabase db execute`).

ALTER TABLE meals ADD COLUMN logged_date date;

-- Backfill existing rows from their creation timestamp so nothing
-- disappears from History after the app switches to querying by logged_date.
UPDATE meals SET logged_date = created_at::date;

ALTER TABLE meals ALTER COLUMN logged_date SET NOT NULL;
ALTER TABLE meals ALTER COLUMN logged_date SET DEFAULT (now()::date);

CREATE INDEX IF NOT EXISTS meals_logged_date_idx ON meals (logged_date);
