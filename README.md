# Mock Trial Docket

One app for the mock trial world: tournament schedules and sign-ups, round pairings, live scores and rankings, case file releases, bulletins, and round recordings. It starts with law school competitions; every record carries a `level` (`law_school`, `collegiate`, `high_school`) so the other circuits slot in without a rebuild.

Built with [Expo](https://expo.dev) (React Native + TypeScript), so one codebase ships to the Apple App Store and Google Play. The backend is [Supabase](https://supabase.com) (Postgres, sign-in, file storage, live updates).

## What's in this first version

| Area | What people can do |
| --- | --- |
| **Schedule** | Browse competitions by circuit. See registration deadlines and upcoming case releases at a glance. |
| **Director wizard** | Any signed-in tournament director creates a competition in six steps: basics, dates and venue, format (rounds, ballots, pairing method, side rules), case, registration (deadline, team cap, fee, review or auto-confirm), review. Save as draft or publish. |
| **Sign-ups** | Coaches register an existing team or a new one. Directors confirm, waitlist, or decline. Teams over the cap are waitlisted automatically. |
| **Pairings** | Directors pair each round: Round 1 random, later rounds power-matched without rematches, with sides alternating. Swap sides or redraw before posting. Posting sends a bulletin. |
| **Scores** | Directors and tab staff enter every judge's ballot after each round. Standings update on everyone's phone right away. |
| **Rankings** | Season-wide and per-competition standings: wins, ballots, combined strength (sum of opponents' wins), point differential. |
| **Case files** | Case authors set a release time; files stay locked until that moment, then unlock for every team at once. Corrections post as versioned files plus a case bulletin. |
| **Bulletins** | Schedule changes, case errata, and results in one feed instead of email. |
| **Recordings** | Attach round video to a trial, visible to the two teams, coaches, or everyone. Links for now; direct upload once a video service (Mux or Cloudflare Stream) is chosen. |

## Run it

```bash
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app on an iPhone or Android phone. Without Supabase settings the app runs in **demo mode** on a fictional sample season stored on the device; the **Me** tab switches between director, coach, student, and signed-out views.

Type check: `npx tsc --noEmit`

## Connect a real backend

1. Create a Supabase project.
2. Run `supabase/migrations/0001_initial.sql` in the SQL editor. It creates the tables, row-level security rules (directors edit only their competitions, staff enter scores only for theirs, case files hidden until release, recordings limited by visibility), a private `case-files` storage bucket, and live-update publication.
3. Copy `.env.example` to `.env` and fill in the project URL and anon key.
4. Restart `npx expo start`. The app now uses email sign-in codes and shared data.

## Ship to the stores

You need an Apple Developer account ($99/year) and a Google Play developer account ($25 once). Then:

```bash
npm install -g eas-cli
eas build --platform all
eas submit --platform all
```

## Code map

- `src/app/` — screens (Expo Router; each file is a route)
- `src/lib/types.ts` — data model
- `src/lib/scoring.ts` — ballot results, standings, pairing suggestions
- `src/lib/backend.ts` — demo and Supabase backends behind one interface
- `src/lib/sampleData.ts` — fictional sample season for demo mode
- `supabase/migrations/` — database schema and access rules

## Known gaps

- Dates are typed as `YYYY-MM-DD`; native date pickers are next.
- Tab staff are stored on each competition (`staff_ids`) but there is no screen to invite them yet.
- Push notifications for bulletins and pairings are not wired up yet.
- Elimination brackets after prelims are not built yet.
- Case release times are compared in UTC on the server.
