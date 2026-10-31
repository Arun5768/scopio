# Scopio

**Every request. Clearly agreed.**

A working scope-management workspace for freelance developers and small agencies, built with Codex.

[Live app](https://scopio.arunchandel1780.workers.dev/) · [Privacy policy](https://scopio.arunchandel1780.workers.dev/privacy)

![Scopio homepage](docs/images/homepage.png)

## From feedback to agreement

“Can we also add Google login?” arrives halfway through a project. Scopio keeps the original brief, the new request, its estimate, and the client's decision together.

1. Record the approved brief, deliverables, and exclusions.
2. Paste client feedback and compare it with supporting scope excerpts.
3. Review the suggestion and edit the deliverable, effort, price, and delivery impact.
4. Prepare a frozen approval request and share its link or send an email.
5. The designated client signs in with Google and approves or declines. The decision stays in the project history.

Scope suggestions use deterministic wording rules and require human review. They are not an AI or contractual decision.

## Working features

- Google sign-in, private workspaces, persistent projects, three-step onboarding, and four currencies.
- Versioned briefs, searchable feedback, editable estimates, frozen pending requests, and withdrawal.
- Verified-client approvals, stale-edit protection, separate approved/pending totals, history, and JSON export.
- Optional send-only Gmail, approval emails, and owner notifications after emailed requests receive decisions.
- A persistent outbox, bounded retries, duplicate prevention, and explicit handling of uncertain send results.
- Signed Resend delivery reports, authenticated review activity, operator controls, and service health monitoring.
- Responsive layouts, keyboard-accessible dialogs, reduced-motion support, and labelled example projects.

Example projects simulate decisions and never send email. Real approvals require the designated client's verified Google email.

## Built with Codex

This repository contains the application, database migrations, deployment template, and automated checks developed through iterative work with Codex: product scoping, interface implementation, authentication, approval rules, email integration, testing, and Cloudflare deployment.

The live app is a functioning pilot. Google verification for unrestricted Gmail connections is still pending.

## Stack and structure

React 19, TypeScript, Next.js-style routing through Vinext/Vite, Cloudflare Workers, D1, Drizzle, Zod, and jose.

| Directory | Purpose |
| --- | --- |
| `app/` | Public pages, workspace, client review, operations, and API routes |
| `lib/` | Authentication, scope rules, mail providers, delivery, and monitoring |
| `db/`, `drizzle/` | Schema and append-only migrations |
| `worker/` | Worker entrypoint and scheduled processing |
| `scripts/test-*.mjs` | Authentication, workflow, API, provider, and scheduler checks |

## Run locally

Requires Node.js 22.13+ and npm. Dependencies are pinned in the lockfile.

```sh
npm ci
cp wrangler.example.jsonc wrangler.jsonc
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply DB --local --persist-to .wrangler/state
npm run dev
```

Open `http://127.0.0.1:5175`. On PowerShell, `Copy-Item` can replace `cp`.

For real local sign-in, create a separate Google Web OAuth client with callback `http://127.0.0.1:5175/api/auth/callback`. Store its client ID and secret in `.dev.vars`. The app has no production authentication bypass. `node scripts/preview-qa.mjs` can seed an isolated synthetic local session; its helper binds only to loopback and is not imported into production.

Both `.dev.vars` and `wrangler.jsonc` are ignored. Use the committed templates with your own configuration.

## Configuration

| Variable | Purpose |
| --- | --- |
| `APP_ORIGIN` | Exact application origin; HTTPS in production |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Web OAuth client |
| `GMAIL_OWNER_EMAIL` | Verified operator email for `/operations` |
| `GMAIL_ACCESS_MODE` | Keep `invited` until Google approves the Gmail scope |
| `GMAIL_TOKEN_KEY` | Optional Gmail credential encryption key: 32 random bytes as 64 hex characters |
| `RESEND_API_KEY` | Optional Resend sending key |
| `EMAIL_MODE` | `test` restricts Resend sends to the configured test account |
| `EMAIL_FROM`, `EMAIL_TEST_RECIPIENT` | Resend sender and allowed test recipient |
| `RESEND_WEBHOOK_SECRET` | Optional delivery-webhook signing secret |

Generate a new encryption key for each deployment and keep it in Worker secrets. Changing an existing key without migrating stored credentials requires users to reconnect. Never commit production credentials or OAuth downloads.

## Deploy your own instance

1. Run `npx wrangler login`, then `npx wrangler d1 create scopio-db` in your own Cloudflare account.
2. Copy `wrangler.example.jsonc` to `wrangler.jsonc`. Replace the placeholder D1 ID, set your Worker name and HTTPS origin, and configure your operator/test email.
3. Configure the Google OAuth homepage, privacy URL, and exact callback `<APP_ORIGIN>/api/auth/callback`. Enable the Gmail API if using optional Gmail sending. Normal sign-in requests identity scopes; Gmail separately requests `gmail.send`.
4. Store each secret with `npx wrangler secret put <NAME> --config wrangler.jsonc`. Start with the Google client ID and secret; add optional mail secrets as needed.
5. Apply migrations, build, and deploy:

```sh
npx wrangler d1 migrations apply DB --remote
npm run build
npm run deploy
```

Append new migrations instead of editing applied ones. Local database files are not uploaded. Update the privacy-policy operator/contact and the Search Console verification tag for your deployment.

For Resend tracking, configure `<APP_ORIGIN>/api/hooks/resend` for sent, delayed, delivered, failed, bounced, and complaint events, then store the signing secret. External uptime checks can use `<APP_ORIGIN>/api/health`. A scheduled Worker processes eligible queued messages and records a health heartbeat every five minutes.

The current deployment uses free service options with provider quotas. There is no billing integration or automatic paid upgrade.

## Validation

```sh
npm run typecheck
npm test
npm run test:services
npm run build
node scripts/test-built-cron.mjs
```

GitHub Actions runs these checks with an isolated configuration and no production secrets. Mail tests use mocked providers and isolated local D1 storage; they do not send real messages.

For API integration checks, start the local server on `127.0.0.1:5175`, apply local migrations, and run `node scripts/test-api.mjs`. It creates synthetic local users and projects and must not target production.

Coverage includes account isolation, expired sessions, spoofed identity headers, cross-origin writes, stale edits, frozen estimates, wrong-client rejection, repeated decisions, OAuth return targets, PKCE, credential encryption, quota limits, uncertain sends, signed webhook validation, event ordering, and the compiled scheduler.

## Security and pilot limits

Google sign-in uses state, nonce, PKCE, signature checks, verified email, and hashed session tokens. Production cookies are Secure, HttpOnly, SameSite=Lax, and host-only. The server enforces project ownership and client authorization. Gmail credentials are encrypted per user.

Gmail is optional and send-only; Scopio cannot read the inbox. Gmail acceptance is distinct from delivery. Resend delivery means the destination mail server accepted the message. Client review activity is separate and uses no tracking pixels. Uncertain Gmail outcomes pause instead of automatically resending.

- Gmail remains an invited beta, with a lifetime cap of 20 invitations excluding the operator. Do not set `GMAIL_ACCESS_MODE=verified` before Google's approval.
- Clients need a Google account matching the designated recipient email.
- No payments, subscriptions, team roles, automatic reminders, or paid AI features are configured.
- Suggestions can miss paraphrases; brief-approval references are user-supplied rather than independently verified signatures.
- Current limits include 100 projects per account and 2,000 activity entries per project. A larger launch still needs pagination, stronger retention controls, and load testing.
- Data deletion and private security reports go to the operator contact on the live privacy page.

Secrets, local databases, review links, production logs, and one-off operator deployment scripts are excluded from this repository. Third-party files retain their included license notices.

Before committing, stage the intended source files and run `node scripts/check-publication.mjs`. This checks tracked paths, common credential formats, and empty example settings; CI repeats the check. It is a guardrail, not a substitute for reviewing files before pushing. Store real secrets only in local ignored settings or Cloudflare Worker secrets. Never upload database exports, consent recordings, private approval links, or client screenshots.
