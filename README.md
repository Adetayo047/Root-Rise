# Root & Rise Institute — Landing Page

Landing page for Root & Rise Institute of Craft, with a Paystack-powered
application/registration form. Runs on **Cloudflare Workers**:

- The page itself is rendered from the EJS templates in `views/` into plain
  HTML at deploy time (`npm run build` → `dist/`) and served as static files.
- The `/api/*` routes (application form, payment verify, Paystack webhook)
  run as a Worker (`src/`).
- Applications are stored in **Cloudflare D1** (a SQLite database).
- Notification emails are sent through **Resend**.

Cohort, resumption date, registration fee, the schools list and the bank
account for direct transfers live in `src/config.js` — change them there and
redeploy.

## How candidates pay

1. The candidate submits the form — the application is saved straight away.
2. They then choose how to pay the registration fee:
   - **Pay online** (Paystack): card, bank transfer (works from OPay, PalmPay,
     Moniepoint or any bank app) or USSD. Confirmed automatically. Needs the
     Paystack keys below.
   - **Direct bank transfer** into the account in `BANK_TRANSFER` in
     `src/config.js` (hidden while `accountNumber` is empty). The candidate
     clicks "I've made the transfer", the team gets an email, and someone
     confirms it in `/admin` with **Confirm payment received**.

## Deploying on Cloudflare

The Worker is connected to this GitHub repo (Workers Builds), so every push
to `main` deploys automatically. In the Worker's **Settings → Build**:

- **Build command:** leave empty (Wrangler runs `npm run build` itself)
- **Deploy command:** `npx wrangler deploy`

The Worker name in the dashboard must match `"name"` in `wrangler.jsonc`
(`root-rise`).

The D1 database is created automatically on the first deploy — no manual
step. You can browse applications in the dashboard under
**Storage & Databases → D1 → rootandrise-applications → Console**, e.g.
`SELECT * FROM applications WHERE status = 'paid' ORDER BY paid_at DESC;`

### Variables and secrets

In the Worker's **Settings → Variables and Secrets**, add:

| Name | Type | Value |
| --- | --- | --- |
| `PAYSTACK_PUBLIC_KEY` | Text | `pk_test_...` / `pk_live_...` |
| `PAYSTACK_SECRET_KEY` | **Secret** | `sk_test_...` / `sk_live_...` |
| `RESEND_API_KEY` | **Secret** | `re_...` |
| `ADMISSIONS_NOTIFY_EMAIL` | Text | `rootandriseinstitute@gmail.com` |
| `MAIL_FROM` | Text | optional — see email section |
| `ADMIN_PASSWORD` | **Secret** | a long passphrase — see admin section |

These are kept across deploys (`keep_vars` in `wrangler.jsonc`).

### Custom domain

1. Cloudflare dashboard → **Add a site** → enter your domain.
2. At your domain registrar, replace the nameservers with the two
   Cloudflare gives you. Wait until the domain shows **Active**.
3. Worker → **Settings → Domains & Routes → Add → Custom domain** → enter the
   domain (and `www.` too if you want it). HTTPS is set up automatically.

## Admin dashboard

`https://YOUR_DOMAIN/admin` — a password-protected dashboard for the
admissions team:

- Overview: paid applications, fees received, who still needs a first
  call, admitted count, scholarship requests
- Search by name/email/phone/reference; filter by payment status, admission
  stage and craft
- Open any application to see everything the candidate submitted, contact
  them in one tap (WhatsApp / call / email), set their admission stage
  (New → Contacted → Interview Scheduled → Admitted / Waitlisted / Declined)
  and keep private notes
- Export the current filtered list to CSV (opens in Excel / Google Sheets)

**To turn it on:** add an `ADMIN_PASSWORD` **Secret** on the Worker
(Settings → Variables and Secrets). Use a long passphrase — anyone with it
can see every applicant's details. Everyone on the team shares that one
password; sign-ins last 12 hours. Changing the password signs everyone out
immediately.

The admin API lives under `/api/admin/*` (`src/routes/admin.js`); the page
itself (`views/admin.ejs`, `public/js/admin.js`) contains no applicant data
and fetches everything after sign-in. Admission stages are listed in
`src/config.js`.

## Local development

```bash
npm install
cp .env.example .dev.vars   # then fill in your test keys
npm run dev                 # http://localhost:8787
```

`npm run dev` uses a local copy of D1, so test applications don't touch the
live database.

## Paystack payment setup

1. Create a Paystack account: https://dashboard.paystack.com/#/signup
2. Grab your **test** API keys from
   https://dashboard.paystack.com/#/settings/developer
3. Add them as `PAYSTACK_PUBLIC_KEY` / `PAYSTACK_SECRET_KEY` (see table
   above). Submitting the application form now opens a real Paystack
   checkout popup for the registration fee.
4. Use a [Paystack test card](https://paystack.com/docs/payments/test-payments/)
   to pay in test mode, e.g. `4084 0840 8408 4081`, any future expiry, CVV `408`, PIN `0000`, OTP `123456`.
5. When you're ready to accept real payments, swap in your **live** keys
   (`pk_live_...` / `sk_live_...`) from the same dashboard page.

**Never commit `.env` or `.dev.vars`** — both are gitignored.

## How the payment flow works

1. Candidate fills the form → browser `POST /api/applications`.
2. The Worker validates the fields, generates a unique reference, and stores
   a `pending` record in D1.
3. Browser opens the Paystack popup (Paystack Inline) with that reference.
4. After the popup reports success, the browser calls
   `POST /api/applications/:reference/verify`.
5. The Worker independently re-verifies the transaction directly with
   Paystack's API (`GET /transaction/verify/:reference`) using the secret
   key — the client's own "it worked" message is never trusted on its own.
6. Only once Paystack confirms `status: success`, correct amount, and NGN
   currency does the Worker mark the record `paid` and the page show the
   success notice.

## Webhook (reliable payment confirmation)

`POST /api/webhooks/paystack` is a second, independent path to confirming
payment — Paystack calls it directly, server-to-server, whenever a charge
succeeds. This is what makes payment confirmation reliable even if a
candidate closes their browser tab right after paying, before the
browser-driven verify call (above) has a chance to fire.

Every request is checked against Paystack's HMAC-SHA512 signature
(`x-paystack-signature` header, computed with your secret key) before
anything is trusted — requests that don't match are rejected with 401 and
ignored. Once verified, it re-checks the transaction directly with
Paystack's API (same as the browser path) before marking a record `paid`.

**To activate it:** in the Paystack dashboard, go to
[Settings → API Keys & Webhooks](https://dashboard.paystack.com/#/settings/developer)
and set the webhook URL to `https://YOUR_DOMAIN/api/webhooks/paystack`
(the `*.workers.dev` URL works too until your domain is connected). No extra
keys needed — it reuses `PAYSTACK_SECRET_KEY`.

Both confirmation paths write to the same D1 record and both check
`status === 'paid'` before doing anything, so it's safe for either one — or
both — to fire for the same payment.

## Who gets notified when someone applies

The moment a payment is confirmed (by either path above), an email is sent
to `ADMISSIONS_NOTIFY_EMAIL` with the candidate's full details — name,
email, phone, age, craft discipline, scholarship interest, their statement,
and the payment reference/amount/channel. An atomic "claim" in the database
guards against sending it twice if both the browser and the webhook confirm
the same payment.

**To set up the email:**

1. Sign up at https://resend.com — use `rootandriseinstitute@gmail.com`.
2. Create an API key at https://resend.com/api-keys and add it as the
   `RESEND_API_KEY` secret.
3. Until you verify a domain, Resend only sends from `onboarding@resend.dev`
   **to the email address you signed up with** — which is enough if
   notifications go to `rootandriseinstitute@gmail.com`.
4. Once your domain is on Cloudflare, add it under
   https://resend.com/domains (Resend can add the DNS records to Cloudflare
   for you), then set `MAIL_FROM`, e.g.
   `Root & Rise Admissions <admissions@yourdomain.com>`. After that you can
   send to any address, including several comma-separated ones in
   `ADMISSIONS_NOTIFY_EMAIL`.

### WhatsApp notifications — not yet possible with what you have

You mentioned having a WhatsApp Business **app** number. That's the free
mobile app — it has no API, so nothing (this site included) can send it an
automated message. To get automated WhatsApp notifications, you'd need the
**WhatsApp Business Platform (Cloud API)** instead, which means:

- Verifying a Meta Business account (Meta reviews this — can take a few days)
- Registering a phone number with the Cloud API — in most setups this
  number can no longer be used in the regular WhatsApp Business app at the
  same time, so it's usually a *different* number than the one you use for
  candidate WhatsApp chats
- Either calling Meta's API directly, or going through a provider like
  Twilio or 360dialog who resell/manage it for you

If you want to go this route, either:
- **Meta direct** — start at https://developers.facebook.com/docs/whatsapp/cloud-api/get-started,
  then share your Phone Number ID and a permanent access token and I'll wire it up, or
- **Twilio** — sign up for Twilio's WhatsApp sandbox/sender at
  https://www.twilio.com/docs/whatsapp, then share your Account SID, Auth
  Token, and approved WhatsApp sender number

Until then, the email notification above is the reliable channel — and
since it lands in `rootandriseinstitute@gmail.com`, you'll likely see it on
your phone anyway via the Gmail app.

## Project structure

```
wrangler.jsonc                   Cloudflare config (Worker, static assets, D1)
scripts/build.js                 Renders views/ + public/ into dist/
src/config.js                    Cohort, dates, fee, craft list
src/worker.js                    Worker entry point — routes /api/*
src/routes/applications.js       Application + payment API endpoints (browser-driven)
src/routes/webhooks.js           Paystack webhook (server-to-server confirmation)
src/routes/admin.js              Admin dashboard API (sign-in, list, update, CSV)
src/lib/auth.js                  Admin password check + signed session cookie
src/lib/paystack.js              Paystack API client (verify transaction)
src/lib/mailer.js                Email notification (Resend)
src/lib/store.js                 D1 storage for applications
views/                           EJS templates
  index.ejs                      Page shell, assembles partials
  admin.ejs                      Admin dashboard page (/admin)
  partials/                      head, header, hero, programmes, journey,
                                  pathways, curriculum, admissions, form, footer
public/                          Static assets (CSS, JS, images)
```
