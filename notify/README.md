# Phone notifications: the sender

Happy Home has no server. Reminders reach phones because GitHub runs `notify/send.mjs` every 10 minutes
(`.github/workflows/notify.yml`). The script signs in to Firebase as the family's "notifier" user, reads the agenda
the app saved, and sends what is due as Web Push messages. It needs Node 20 or later and has no npm dependencies.

## Setting it up
1. In the app, a parent turns notifications on. The app shows one code that starts with `hh1.`.
2. On GitHub: Settings > Secrets and variables > Actions > New repository secret. Name `HH_NOTIFIER`, value = the code.
3. Nothing else. Until the secret exists every run stops after a few seconds.

To turn it off, delete the secret. If the code stops working (the run log says so), make a new one in the app.

Optional repository **variables** (not secrets): `HH_APP_URL` if the app is not served from
`https://<owner>.github.io/<repo>/`, and `HH_PUSH_HOSTS` (comma-separated host names) if a browser ever uses a push
service that is not on the built-in list in `send.mjs` (`notify/state.lastError` will then say
"push host not on the allow-list" and name the host).

## What a run does
- Reads `families/{id}/notify/agenda`, `notify/state` and the `pushSubs` collection.
- Sends every reminder whose time has come (and is not more than 3 hours old) to the phones of the people it is for.
- Stays on for up to 9 minutes: it looks at the agenda again at least once a minute and sends each reminder at its
  time, then stops as soon as nothing else falls inside the run.
- Removes subscriptions the push service reports as gone (404 or 410).
- Writes `notify/state` so the app can show that the helper is alive:
  `lastRun` (every run), `lastOk` (runs without problems), `lastSent` (last accepted push), `sentCount` (accepted
  pushes since the beginning), `lastError` (short text, or empty), `sent` (reminder id -> time, kept for 3 days).
- Always exits 0, so GitHub never sends failure emails. Problems show up in the run log and in `lastError`.

## Privacy and safety
The repository and its run logs are public, so the log only ever contains counts and the host names of the well-known
push services. It never contains the secret, passwords, tokens, the family id, phone addresses, titles or texts.
Messages are encrypted for each phone (RFC 8291); the push services cannot read them. Everything read from the family's
data is treated as untrusted: pushes go only to `https` addresses of known push services and redirects are not followed.

## Good to know
- GitHub's schedule is not exact: runs often start a few minutes late, and can be skipped when GitHub is busy.
  Staying on for 9 minutes covers most of that, but a reminder can still be late.
- GitHub switches scheduled workflows off after 60 days without activity in the repository. The workflow asks GitHub
  once a day to keep it switched on. This is best effort: if notifications ever stop, open the Actions tab and
  press "Enable workflow".
- On iPhone and iPad, notifications only work for the app added to the Home Screen (iOS 16.4 or later).

## Tests
```
node --test notify/tests/unit.test.mjs                 # logic, crypto test vector, whole runs with a pretend Firebase
node --test notify/tests/e2e-emulator.test.mjs         # real process + Firebase emulator + mock push server (port 8112)
node --test notify/tests/browser.test.mjs              # push.js and sw-push.js in Chromium via Playwright (port 8113)
HH_SCRATCH=/path/with/web-push node --test notify/tests/crypto-independent.test.mjs   # against the web-push package
```
The last one needs `npm install web-push` in a scratch folder outside the app (it is not a dependency of the app).
Real delivery through Apple, Google or Mozilla cannot be tested automatically; try it once on a real phone.
