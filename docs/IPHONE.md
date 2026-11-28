# The iPhone app

The iPhone app and the website (app.mocktrialcentral.com) are the same app built twice. Both talk to the same
Supabase project, so:

- **One account works on both.** Sign in on either with the same email; the 6-digit code from the email works in the app,
  so no link has to open on the phone.
- **Each updates the other.** Every change is saved to the shared database, and both listen for changes live: a score
  entered on a phone shows on the website within a second or two, and the other way round. A phone also catches up on
  anything it missed the moment the app is opened again.

The shared settings are in `eas.json` (the Supabase address and its publishable key, which is public by design). Never
put the secret service key in the app or this repository.

## First build and TestFlight (about 30 minutes, on a Mac)

You need: the Apple developer account, a free Expo account (expo.dev), and Node installed.

1. In Terminal: `git clone https://github.com/mccox777-creator/mock-trial-app.git && cd mock-trial-app && npm install`
2. `npx eas-cli@latest login` and sign in to Expo.
3. `npm run ios:build`
   - When asked to create an EAS project, say yes. It adds a project id to `app.json`; commit that change.
   - When asked to log in to Apple, say yes and sign in yourself. Let EAS create the certificate and profile.
   - It builds in Expo's cloud (about 15-20 minutes) and then uploads to App Store Connect.
4. In App Store Connect the build appears under TestFlight after Apple's processing (10-30 minutes). Add yourself and
   testers there. Testers install the TestFlight app and open the invite.
5. When ready for the App Store: fill in the listing in App Store Connect (screenshots, description, privacy answers,
   a support URL and the privacy policy URL), pick the build, and submit for review.

Later builds: `npm run ios:build` again. The build number goes up automatically.

## Updates without a new build

Most changes reach installed iPhones without a new App Store build:

- **Results and ratings.** The app downloads the latest results record from the website
  (`/ratings-data/events.json`) whenever it loads past results, keeps the last copy for offline use, and falls back to
  the copy it was built with. A merged results change shows up on phones as soon as the website updates.
- **Everything else in the app's screens and logic** goes out as an over-the-air update (EAS Update). The
  `iPhone update` GitHub workflow publishes one on every merge to main; phones download it in the background and use
  it the next time the app is opened. It needs a repository secret `EXPO_TOKEN` (create a token at expo.dev, account
  settings, Access tokens; add it in GitHub under Settings, Secrets and variables, Actions). Without the secret the
  workflow skips. You can also publish by hand with `npm run ios:update`.
- Updates only reach builds made after over-the-air updates were added (build 4 onward).

A new build (`npm run ios:build`) is still needed when a change adds native code, such as a new Expo package with
native parts, or changes app.json settings like permissions or the icon. When that happens, raise `"version"` in
app.json (for example 1.0.0 to 1.1.0) so older builds don't receive an update they can't run.

## What the Apple review will look for

- A way to delete an account inside the app: Me tab, "Delete my account" (migration 0008, `delete_my_account()`).
- A privacy policy URL and a support contact.
- A demo account for the reviewer, since normal sign-in needs an emailed code. Create it in the Supabase dashboard
  (Authentication, Users, Add user, "Create new user" with a password and "Auto Confirm User" ticked). The reviewer
  signs in on the Me tab with "I have a password". Put the email and password in App Store Connect under
  App Review Information, Sign-In Information. Keep that account free of real student data.
