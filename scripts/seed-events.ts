/**
 * Seed UFC events for dev/testing.
 * Usage: DATABASE_URL=... npx tsx scripts/seed-events.ts
 */

import { Pool } from 'pg';

const events = [
  {
    id: 'ufc-310',
    name: 'UFC 310',
    short: 'UFC 310',
    venue: 'T-Mobile Arena',
    location: 'Las Vegas, NV',
    at: '2026-06-07T03:00:00Z',
    status: 'scheduled',
  },
  {
    id: 'ufc-311',
    name: 'UFC 311',
    short: 'UFC 311',
    venue: 'Kia Forum',
    location: 'Inglewood, CA',
    at: '2026-07-19T03:00:00Z',
    status: 'scheduled',
  },
  {
    id: 'ufc-312',
    name: 'UFC 312',
    short: 'UFC 312',
    venue: 'Qudos Bank Arena',
    location: 'Sydney, Australia',
    at: '2026-08-09T12:00:00Z',
    status: 'scheduled',
  },
  {
    id: 'ufc-313',
    name: 'UFC 313',
    short: 'UFC 313',
    venue: 'T-Mobile Arena',
    location: 'Las Vegas, NV',
    at: '2026-09-06T03:00:00Z',
    status: 'scheduled',
  },
  {
    id: 'ufc-fn-248',
    name: 'UFC Fight Night: Holloway vs. Allen',
    short: 'UFC FN 248',
    venue: 'UFC Apex',
    location: 'Las Vegas, NV',
    at: '2026-06-21T00:00:00Z',
    status: 'scheduled',
  },
  {
    id: 'ufc-fn-249',
    name: 'UFC Fight Night: Whittaker vs. Muniz',
    short: 'UFC FN 249',
    venue: 'O2 Arena',
    location: 'London, England',
    at: '2026-07-12T17:00:00Z',
    status: 'scheduled',
  },
  {
    id: 'ufc-fn-250',
    name: 'UFC Fight Night: Oliveira vs. Makhachev 2',
    short: 'UFC FN 250',
    venue: 'UFC Apex',
    location: 'Las Vegas, NV',
    at: '2026-08-01T00:00:00Z',
    status: 'scheduled',
  },
  {
    id: 'ufc-309',
    name: 'UFC 309: Jones vs. Miocic',
    short: 'UFC 309',
    venue: 'Madison Square Garden',
    location: 'New York, NY',
    at: '2026-04-12T03:00:00Z',
    status: 'completed',
  },
  {
    id: 'ufc-fn-247',
    name: 'UFC Fight Night: Barboza vs. Murphy',
    short: 'UFC FN 247',
    venue: 'UFC Apex',
    location: 'Las Vegas, NV',
    at: '2026-05-03T00:00:00Z',
    status: 'completed',
  },
];

async function main() {
  const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('supabase.com') ? { rejectUnauthorized: false } : false,
  });

  let inserted = 0;
  for (const ev of events) {
    const { rowCount } = await db.query(
      `
      INSERT INTO ufc_events (ufc_event_id, name, short_name, event_type, venue, location, scheduled_at, status, is_scoring_event)
      VALUES ($1, $2, $3, 'numbered', $4, $5, $6, $7, true)
      ON CONFLICT (ufc_event_id) DO NOTHING
    `,
      [ev.id, ev.name, ev.short, ev.venue, ev.location, ev.at, ev.status],
    );
    if ((rowCount ?? 0) > 0) inserted++;
  }

  console.log(`Seeded ${inserted} events (${events.length - inserted} already existed).`);
  await db.end();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
