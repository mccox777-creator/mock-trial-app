# Backups

Three copies, all free at this size:

| Copy | Where | When | Holds |
| --- | --- | --- | --- |
| History log | Inside the database (`change_log`) | Every change, as it happens | Every insert, edit and delete, with who did it |
| Off-site | Your Cloudflare R2 bucket, encrypted | Every night | Every table |
| Your computer | A folder you choose | Every day the computer is on | Every table and every case file |

## 1. Your computer

You need [Node.js](https://nodejs.org) (the LTS version) and this project folder.

1. Copy `scripts/backup.env.example` to `scripts/backup.env`.
2. In Supabase, open **Project Settings > API**. Paste the project URL and the `service_role` key into `scripts/backup.env`. This key can do anything in the database, so it stays in that file on your computer and nowhere else. The file is already excluded from GitHub.
3. Optional: set `BACKUP_DIR` in the same file, for example a folder inside Dropbox or iCloud Drive for an extra copy.
4. Try it: `npm run backup`. You'll see a dated folder appear.

**Run it every day automatically**

- **Mac:** open Terminal, run `crontab -e`, and add this line (fix the path to your project), then save:
  `0 21 * * * cd "/Users/you/mock-trial-app" && /usr/local/bin/node scripts/backup.mjs >> backups/log.txt 2>&1`
  This runs at 9 PM. If your Mac is asleep then, it simply runs the next day.
- **Windows:** open **Task Scheduler > Create Basic Task**, choose **Daily**, action **Start a program**: program `node`, arguments `scripts\backup.mjs`, and "Start in" set to the project folder.

Backups older than 60 days are deleted automatically (`BACKUP_KEEP_DAYS` changes that).

## 2. Off-site in Cloudflare R2

1. In Cloudflare, create a bucket (for example `mock-trial-backups`). Leave public access off.
2. Under **R2 > Manage API tokens**, create a token with **Object Read & Write** on that bucket only. Note the Access Key ID, Secret Access Key, and your Account ID.
3. Recommended: add a **bucket lock** rule on the bucket (keep objects 30 days). Then even someone with the token can't delete recent backups.
4. Pick a long passphrase (four or more random words) and store it in your password manager. **Without it the backups can't be opened, by anyone, including you.**
5. Give them to Supabase. Paste them into your own terminal, never into a chat or email:
   ```
   supabase secrets set R2_ACCOUNT_ID=... R2_BUCKET=mock-trial-backups R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... BACKUP_PASSPHRASE='...'
   supabase secrets set BACKUP_CRON_SECRET=<a long random string>
   supabase functions deploy nightly-export
   ```
6. Schedule it as described at the top of `supabase/functions/nightly-export/index.ts`.

Each night adds one file, `mock-trial-<date>.backup`, a few hundred kilobytes.

## Restoring

1. Pick a backup folder from your computer, or download a `.backup` file from R2 and unlock it:
   `node scripts/decrypt-backup.mjs mock-trial-2026-11-27.backup` (it asks for the passphrase and writes a folder under `backups/`).
2. See what would change: `npm run restore -- backups/2026-11-27`
3. Do it: `npm run restore -- backups/2026-11-27 --yes`

Restoring writes every row from the backup back (matched by id) and re-uploads case files. Rows created after the backup are left alone. It works even on locked competitions, because it uses the service key, and each restored row is recorded in the history log.

To restore into a brand-new Supabase project, run the migrations first, and have people sign in once so their accounts exist before restoring profiles and team memberships.

## When to pay for more

Supabase Pro (about $25 a month) adds 7 days of automatic daily snapshots and keeps the project from pausing when it's idle. Point-in-time recovery is a further paid add-on and isn't needed at this size.
