# Mock Trial Docket

One app for the mock trial world: tournament schedules and sign-ups, round pairings, live scores and rankings, case file releases, bulletins, and round recordings. It starts with law school competitions; every record carries a `level` (`law_school`, `collegiate`, `high_school`) so the other circuits slot in without a rebuild.

Built with [Expo](https://expo.dev) (React Native + TypeScript), so one codebase ships to the Apple App Store and Google Play. The backend is [Supabase](https://supabase.com) (Postgres, sign-in, file storage, live updates).

## What's in this first version

| Area | What people can do |
| --- | --- |
| **Schedule** | Browse competitions by circuit. See registration deadlines and upcoming case releases at a glance. |
| **Director wizard** | Any signed-in tournament director creates a competition in seven steps: basics, dates and venue, format (rounds, ballots, witnesses per side, 1 to 4 random opening rounds, pairing method, side rules), rules, case, registration, review. Save as draft or publish. |
| **Rules checklist** | The organizer ticks the rules that apply (woodshedding and how long, negative inference, invention of fact, FRE, time limits, roster limits, conduct, and more) and adds any others in their own words. They show on the competition page. The catalog lives in `src/lib/rules.ts`. |
| **Sign-ups** | Open competitions: coaches register a team; the organizer confirms, waitlists, or declines (or confirms automatically). Invitational competitions: schools send a request with a note, and the organizer invites or waitlists. Teams over the cap are waitlisted. |
| **Judges** | Judges volunteer from the competition page (background, rounds, conflicts). The organizer confirms them and assigns them to trials by hand or with auto-fill, which avoids conflicts. |
| **Pairings** | Opening rounds are drawn at random (1 to 4, the organizer's choice), later rounds power-matched without rematches, with side rules. A by-team grid shows each team's side, opponent, and courtroom for every round. |
| **Scores** | Judges score in the app on a per-performance sheet. Organizers can also enter paper ballots by hand or photograph them: the photo is read by Claude, filled into the form, and the organizer confirms before saving. |
| **Privacy** | Only the organizer sees scores and standings. Judges see only their own ballot. Teams see nothing until the organizer publishes results, and see their own ballots only if the organizer also returns them. |
| **Locking** | Once the organizer finalizes results, or 7 days after the last day, the competition is locked. Nobody, including the organizer, can change it, and the database enforces this. |
| **Rankings and archive** | Teams are ranked continuously as ballots arrive: by ballots won (or trials won, the organizer's choice), then combined strength, then point differential. The organizer sees live standings; everyone else sees them once results are published. Past events are grouped by season, and each team has a history page. |
| **Case files** | Case authors set a release time; files stay locked until that moment, then unlock for every team at once. Corrections post as versioned files plus a case bulletin. |
| **Bulletins** | Schedule changes, case errata, and results in one feed instead of email. |
| **Recordings** | Paste an unlisted YouTube link on a trial, visible to the two teams, coaches, or everyone. No paid video hosting. |
| **Score sheet** | The organizer picks a 1–10 or 1–15 scale, what judges score (pretrial, openings, directs, witnesses, crosses, objections and evidence, closings, professionalism, or their own lines), and where judges can comment. The sheet keeps running totals and the point differential line by line. |
| **Chat** | Group chat per competition: everyone, judges only, coaches only. No private messages. High school students can read but not post; the organizer can switch to announcements only and remove any message. |

## Run it

```bash
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app on an iPhone or Android phone. Without Supabase settings the app runs in **demo mode** on a fictional sample season stored on the device; the **Me** tab switches between director, coach, student, and signed-out views.

Type check: `npx tsc --noEmit`

## Connect a real backend

1. Create a Supabase project.
2. Run `supabase/migrations/0001_initial.sql`, `0002_security.sql`, then `0003_scoring_and_video.sql`, in the SQL editor. It creates the tables, row-level security rules (organizers edit only their competitions, judges score only their own assigned trials, ballots hidden until results are published, case files hidden until release, recordings limited by visibility), lock triggers, an append-only change log, private `case-files` and `backups` storage buckets, and live-update publication.
3. Copy `.env.example` to `.env` and fill in the project URL and anon key.
4. Restart `npx expo start`. The app now uses email sign-in codes and shared data.
5. Work through the dashboard settings in [SECURITY.md](SECURITY.md).
6. Ballot photo reading: `supabase secrets set ANTHROPIC_API_KEY=...`, then `supabase functions deploy read-ballot`.
7. Backups: follow [BACKUPS.md](BACKUPS.md) (free: your computer plus an encrypted nightly copy in Cloudflare R2). Every insert, update, and delete is also written to `change_log`, which nobody can edit.

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
- `src/lib/judging.ts` — score sheet lines, who sees which ballots, judge assignment, locking
- `src/lib/rules.ts` — the competition rules checklist
- `src/lib/backend.ts` — demo and Supabase backends behind one interface
- `src/lib/sampleData.ts` — fictional sample season for demo mode
- `supabase/migrations/` — database schema and access rules
- `supabase/functions/` — ballot photo reading and nightly backups

## Known gaps

- Dates are typed as `YYYY-MM-DD`; native date pickers are next.
- Co-organizers: a competition can list several directors, but there is no screen to invite one yet.
- Teammates: coaches add members with the `add_team_member` database function; the screen for it is next.
- Push notifications for bulletins and pairings are not wired up yet.
- Elimination brackets after prelims are not built yet.
- Case release times are compared in UTC on the server.
