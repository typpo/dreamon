# KeepDream

KeepDream is the old dream-journal-by-email app, now running as a single
Cloudflare Worker.

Last materially updated: 2026-05-07.

## Current State

Production is meant to live entirely on Cloudflare, with MongoDB Atlas as the
database:

- domain: `keepdream.me`
- Cloudflare account id: `2d93479a0c78707f4517a9335fba6388`
- Cloudflare zone id: `0787575f8219340143189e58a69f51dd`
- Worker name: `keepdream`
- Worker entrypoint: `src/worker.js`
- public assets: `public/`, bound as `ASSETS`
- database: MongoDB Atlas cluster `keepdream-cluster`
- database name: `heroku_454v0pff`
- collections: `people`, `dreams`

The old Heroku/Express/Jade shape was removed. There is no separate web dyno,
cron process, SendGrid SMTP setup, or template server to find.

## What The Worker Does

`src/worker.js` exports all three Cloudflare handlers:

- `fetch()` serves the web app, signup, feedback, exports, deletes, and
  unsubscribe pages.
- `scheduled()` runs hourly from Cloudflare Cron Triggers and sends reminders
  when a subscriber's local time is 3 AM.
- `email()` receives inbound routed email, parses it with `postal-mime`, and
  stores the reply as a dream.

Dream reminder emails are sent from `<person_id>@keepdream.me`. Replies to those
addresses are routed back into the Worker, and the local part becomes the
`dreams.unique` value used by `/view/:id`.

## Production Cloudflare Config

The production shape is declared in `wrangler.toml`:

- routes:
  - `keepdream.me/*`
  - `www.keepdream.me/*`
- cron: `0 * * * *`
- outbound email binding: `[[send_email]] name = "EMAIL"`
- assets binding: `ASSETS`
- compatibility flag: `nodejs_compat`

Cloudflare Email Routing should have a catch-all rule routed to the `keepdream`
Worker. This is what lets any `<person_id>@keepdream.me` address invoke
`email()`.

Cloudflare Email Sending should have `keepdream.me` enabled as a sending domain.
Check with:

```sh
npx wrangler email sending list
```

DNS should be on Cloudflare, with Cloudflare MX records for inbound email routing.
Basic live checks:

```sh
dig +short keepdream.me A
dig +short keepdream.me MX
curl -I https://keepdream.me/
```

## Secrets And Vars

Production stores the Atlas connection string as a Worker secret:

```sh
npx wrangler secret put MONGODB_URI
npx wrangler secret list
```

Do not commit the Atlas URI, database passwords, Cloudflare tokens, or Atlas API
keys. `.dev.vars` is ignored for local secrets.

Non-secret defaults live in `wrangler.toml`:

- `APP_BASE_URL=https://keepdream.me/`
- `EMAIL_DOMAIN=keepdream.me`
- `MONGODB_DB=heroku_454v0pff`
- `FEEDBACK_TO=typppo@gmail.com`
- `MONGO_SERVER_SELECTION_TIMEOUT_MS=5000`

For local development:

```sh
cp .dev.vars.example .dev.vars
```

Then put a valid Atlas URI in `.dev.vars`.

## MongoDB Data Model

`people` stores subscribers. Relevant fields:

- `_id`: ObjectId used in reminder reply addresses and `/view/:id`
- `email`: subscriber email address
- `tz`: IANA timezone name
- `disabled`: if `true`, hourly reminders ignore this subscriber
- `disabledAt`: timestamp for bulk or manual disables
- `disabledReason`: short operational note

`dreams` stores dream entries. Relevant fields:

- `unique`: string version of the subscriber `_id`
- `text`: cleaned reply body
- `raw`: original parsed text body
- `time`: millisecond timestamp

As of 2026-05-07, existing subscribers were bulk-disabled except
`typppo@gmail.com`: 78 disabled, 1 enabled. The Worker sends reminders only for
people where `disabled` is not `true`. A fresh signup sets `disabled: false` for
that email.

## MongoDB Atlas Access

Cloudflare Workers connect to Atlas directly. Worker TCP egress is not the same
thing as normal proxied Cloudflare IP ranges, so Atlas must allow the Worker to
connect.

The pragmatic options are:

- keep an Atlas access-list entry broad enough for Worker egress, with a
  least-privilege database user scoped to `heroku_454v0pff`, or
- use Cloudflare infrastructure that gives this Worker dedicated/static egress
  and restrict Atlas to that egress.

Use a dedicated DB user for the Worker. If using temporary Atlas API keys or temp
database users for maintenance, delete them afterward.

## Local Development

Install dependencies:

```sh
npm install
```

Start Wrangler:

```sh
npm run dev
```

Cron handlers do not run on their own in local dev. Trigger one manually:

```sh
curl "http://localhost:8787/cdn-cgi/handler/scheduled"
```

Useful local probes:

```sh
curl -i http://localhost:8787/
curl -i -X POST http://localhost:8787/signup -d "email=bad"
curl -i "http://localhost:8787/view/000000000000000000000000?dl"
```

## Deploy

Run the dry-run first:

```sh
npm run check
```

Deploy:

```sh
npm run deploy
```

After deploying, verify the live route:

```sh
curl -I https://keepdream.me/
curl -I https://keepdream.ty.workers.dev/
```

## Operational Notes

If cron emails are not going out:

- confirm the Worker deploy has the `schedule: 0 * * * *` trigger
- confirm `[[send_email]] name = "EMAIL"` is present
- confirm Cloudflare Email Sending still shows `keepdream.me` enabled
- confirm Atlas is reachable from the Worker
- check that target `people` rows are not `disabled: true`
- check Cloudflare Worker logs or tails for scheduled event failures

If inbound emails bounce or do not record dreams:

- confirm Cloudflare MX records are present for `keepdream.me`
- confirm Email Routing is enabled
- confirm the catch-all rule routes to Worker `keepdream`
- send to an address shaped like `<person_id>@keepdream.me`
- check Worker logs for `email()` parse or Atlas insert failures

If the site shows a parking or squatting page again, do DNS first. The app is not
hosted at an old VM or Heroku process anymore; `keepdream.me` should resolve
through Cloudflare and route to the Worker.

## Checks

Current useful validation sequence:

```sh
npm run check
npm audit --audit-level=low
curl -I https://keepdream.me/
```
