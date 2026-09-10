# Maneli Milk Log

A mobile-first React PWA for privately recording Maneli's formula feedings. It supports fast amount-and-time entry, editing and soft deletion, daily history, weekly/monthly/yearly insights, offline changes, shared Supabase synchronization, and iPhone installation.

## Local preview

```bash
nvm use 22
npm install
npm run dev
```

Open the local URL printed by Vite. Without Supabase environment values, the app starts in local preview mode and stores test data in IndexedDB.

## Enable private family sync

1. Create a Supabase project.
2. Run `supabase/migrations/20260909000000_initial_schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local`.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the project's Connect panel.
5. In Supabase Authentication URL settings, add the local URL and, later, the Vercel production URL as allowed redirect URLs.
6. Restart `npm run dev`.

The first signed-in parent creates Maneli's family log. The second parent signs in with their own email and joins with the one-time invitation code from Settings.

Only the publishable key is used in the browser. The database migration enables Row Level Security and limits each record to authenticated members of its household. Never expose the Supabase secret key in a `VITE_` variable.

## Import existing Notes data

Once the old notes have been normalized, save them to an ignored file such as `private/feedings.json`:

```json
[
  { "amount_ml": 90, "fed_at": "2026-09-08T06:30:00+03:30" },
  { "amount_ml": 120, "fed_at": "2026-09-08T10:15:00+03:30" }
]
```

Add the private import values from `.env.example` to your shell, then preview the import:

```bash
npm run import:feedings -- private/feedings.json
```

The preview reports valid records, totals, date range, duplicates, and ambiguous rows. After resolving every issue, rerun with `--commit`. Stable IDs make repeat runs safe.

## Verification

```bash
npm run test
npm run build
```

Vercel deployment is intentionally postponed until the local version is approved.
