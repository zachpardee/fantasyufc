-- Mark UFC 310 as completed so it no longer appears as an active event
UPDATE ufc_events
SET status = 'completed'
WHERE name ILIKE '%UFC 310%';
