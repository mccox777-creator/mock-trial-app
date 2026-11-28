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

## What the Apple review will look for

- A way to delete an account inside the app: Me tab, "Delete my account" (migration 0008, `delete_my_account()`).
- A privacy policy URL and a support contact.
- A demo account for the reviewer, since normal sign-in needs an emailed code. Create it in the Supabase dashboard
  (Authentication, Users, Add user, "Create new user" with a password and "Auto Confirm User" ticked). The reviewer
  signs in on the Me tab with "I have a password". Put the email and password in App Store Connect under
  App Review Information, Sign-In Information. Keep that account free of real student data.
