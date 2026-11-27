# Security

No app can promise it will never be hacked. What this one aims for is that the obvious and the clever attacks fail, that the damage from a stolen account is contained, and that nothing is ever lost.

## The rule everything follows

The app on someone's phone is a convenience, not a guard. Anyone can skip it and talk to the database directly with the public key that ships inside every copy of the app. So every promise the app makes is enforced inside the database itself (`supabase/migrations/0002_security.sql`):

| Promise | How the database holds it |
| --- | --- |
| Only the organizer sees scores until results are published | Row rules on `ballots`; judges see only their own ballot; teams see their own trials' ballots only after publish and return |
| Only a team's members see its returned ballots and private recordings | Membership is in `team_members`, granted only by the team's coach. Nobody can add themselves to a team |
| Judges can only score trials they're assigned to, once each | Assignment limited to confirmed judges; one ballot per judge per trial; ballots can't be moved to another trial |
| Scores are honest numbers | Every line must be a whole number from 1 to 10; totals are calculated by the database, never taken from the phone |
| Organizers control only their own competitions | Every update is checked before and after the change, so nothing can be moved into someone else's competition |
| Team limits and deadlines hold | Checked in the database; extra teams go on the waitlist |
| Results lock | Finalized, or 7 days after the last day, nothing changes. Dates freeze once results are out, so the lock can't be dodged |
| Case packets stay sealed until release | Files sit in private storage under the case's folder; download links last 5 minutes and are refused before the release time |
| History can't be erased | Every change is copied to `change_log`, which no app user can read, edit, or wipe |
| Ballot photo reading can't run up a bill | Organizer only, 300 a day, size and type limits |
| Sign-in can't be lifted from the phone | The session is kept in the iPhone Keychain / Android Keystore |

`supabase/tests/security_test.py` runs 69 checks against these rules (40 of them are attacks that must fail) on a throwaway Postgres. Run it after any change to the database rules.

## Settings only the account owner can turn on

These live in dashboards, not in code.

**Supabase** (Authentication and Settings pages)
1. Turn on CAPTCHA protection for sign-in (Cloudflare Turnstile is free). This stops bots from mass-creating accounts or spamming codes.
2. Set email code expiry to 10 minutes or less, and leave the built-in rate limits on.
3. Leave anonymous sign-ins off.
4. Turn on Point-in-Time Recovery (Pro plan) so the database can be rewound to any second.
5. Use a long random database password, and turn on SSL enforcement.
6. Never put the `service_role` key in the app or in GitHub. It belongs only in Supabase function secrets.

**Accounts that could hand someone the keys.** Turn on two-factor sign-in for Supabase, GitHub, Apple Developer, Google Play, Anthropic, and the email account those use. Most real-world breaches come through a stolen password here, not through the app.

**Anthropic.** Set a monthly spend limit on the key used for ballot reading.

**GitHub.** Protect the `main` branch (require a pull request), and turn on secret scanning and Dependabot alerts.

## What's still a risk, honestly

- **A stolen organizer email.** Sign-in is by email code, so whoever controls an organizer's inbox can act as them until the competition locks. The change log shows exactly what they did, and an admin can restore it. Two-factor sign-in for organizers is a good next step.
- **Fake competitions.** Any signed-in person can create a competition, as designed. A report button and a verified-organizer badge would help once the app is public.
- **Flooding.** Supabase rate-limits sign-in and API calls, but a determined flood of traffic is handled by the hosting provider, not the app.
- **Dependencies.** `npm audit` reports 3 moderate issues in Expo's build tooling (`minimatch`). They run on the developer's machine, not in the app people install, and clear with the next Expo update.

## Reporting a problem

If you find a security issue, email the organizers privately instead of opening a public GitHub issue.
