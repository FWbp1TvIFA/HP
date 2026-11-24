# Happy Home for Claude

A small connector (a remote MCP server) that lets the Claude apps (web, desktop, iPhone and Android) read and add to the family's Happy Home: tasks and chore stars, calendar and weekly activities, homework, the shopping list, spending and budgets, notes, bills, the dinner plan, birthdays and countdowns, alarms, and the Family board. You can ask by typing, by talking, or by sending a photo of a receipt, a school newsletter or a handwritten list.

It lives in its own folder and does not change the app. It runs free on Vercel's Hobby plan.

## How it keeps the family's data safe

- **It signs in as you.** When you tap Connect in Claude, the connector's own Happy Home sign-in page opens. Your email and password (and your 6-digit code, if two-step sign-in is on) go straight to Happy Home's Firebase sign-in. They are never stored.
- **It has no master key.** Every database call uses your own sign-in, so the app's Firestore rules still apply. You only ever reach your own family.
- **It keeps no database.** The sign-in codes and tokens it gives Claude are encrypted with the `HH_SECRET` key and expire. They contain your Happy Home sign-in, so only this server can use them.
- **It only works with Claude.** Sign-in results are only ever sent back to Claude's own address (`https://claude.ai/api/mcp/auth_callback`), or to an app on your own computer such as Claude Code. PKCE is required.
- **How to stop it.** Remove the connector in Claude. To cut off every copy at once, change your Happy Home password; within the hour Claude has to sign in again.
- **What it never touches.** It never reads or writes wallet cards, moods, mood checks, locations, Chinese and piano practice (`learn`, `songs`), profile photos (`profiles`), notification settings (`notify`, `pushSubs`), or anyone's private `users/` records. It never changes the family's own settings (names, budgets, members). The code only allows the collections listed in `ALLOWED_COLLECTIONS` in `src/family.js`.

## Tools Claude gets

| Tool | What it does |
| --- | --- |
| `get_overview` | Today's date, the family, Family board messages, overdue and upcoming tasks, the calendar (with weekly activities), homework, dinners, bills due, countdowns, the shopping list, and this month's money |
| `find_items` | Looks things up and gives their ids: tasks, events, homework, shopping, money, notes, bills, meals, countdowns, board, alarms |
| `money_summary` | A month's spending by category against the budgets, the biggest spends, income, bills still to come, and last month's total |
| `add_items` | Adds any mix of things in one atomic call, for example everything on a newsletter photo |
| `update_items` | Changes fields on existing items |
| `mark_done` | Ticks off tasks (gives chore stars and adds the next repeat, like the app), homework and shopping, and marks bills as paid (records the spending and moves the due date on) |
| `delete_items` | Deletes items, or skips one day of a weekly activity |

Every write uses the same fields, defaults and side effects as the app, including `createdAt` and `by` for the Live feed, `doneAt` when something is ticked off, and `remind` when a particular reminder is asked for. Dates are worked out in Australia/Brisbane time.

People can be named the way the family says them: the name shown in the app (such as Dad or Mum), an earlier name the app keeps as `aka`, or mum, mom, mummy, dad, daddy.

## Setup (once)

1. In Vercel: **Add New → Project → Import** the `HP` repo. Set **Root Directory** to `claude-connector`. Add the environment variable `HH_SECRET` (a random value of 32 or more characters, kept private). Then **Deploy**.
2. Open `https://<your-project>.vercel.app/`. It shows **Ready to connect** and the connector address, which ends in `/mcp`.
3. In Claude, go to **Customize** (or **Plugins**) → **Connectors** → **Add custom connector**. Paste the address, then **Add** → **Connect**, and sign in with Happy Home.

The picture guides are in the project's `happy-home/guides/claude-*.jpg`.

### Settings (Vercel environment variables)

| Name | Needed | Meaning |
| --- | --- | --- |
| `HH_SECRET` | yes | The key that seals tokens. If you change it, everyone has to tap Connect again. |
| `HH_TZ` | no | The family's time zone. The default is `Australia/Brisbane`. |
| `HH_PUBLIC_URL` | no | Use this if the connector sits behind a custom domain. |
| `HH_EXTRA_REDIRECTS` | no | Extra return addresses to allow, comma separated. Use only if Claude changes its own. |

The Firebase project and its public web key are built in. They match the app's `firebase-config.js`.

## Developing

```sh
node --test test/unit.test.js                 # fast, no network
firebase emulators:start --only auth,firestore # uses the app's firestore.rules
cd test && npm install && node --test e2e.test.mjs
HH_SECRET=$(openssl rand -base64 32) HH_EMULATOR_HOST=127.0.0.1 node dev-server.js
```

The end-to-end test uses the official MCP client to sign in through the real sign-in page and run every tool against the emulators. It then checks that the stored documents match the app's own shapes.
