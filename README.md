# Root & Rise Institute — Landing Page

Express + EJS site for Root & Rise Institute of Craft, with a Paystack-powered
application/registration form.

## Setup

```bash
npm install
cp .env.example .env   # then fill in your real Paystack + email keys
npm start               # or: npm run dev (auto-restarts on file changes)
```

Open http://localhost:3000

## Paystack payment setup

1. Create a Paystack account: https://dashboard.paystack.com/#/signup
2. Grab your **test** API keys from
   https://dashboard.paystack.com/#/settings/developer
3. Put them in `.env`:
   ```
   PAYSTACK_PUBLIC_KEY=pk_test_...
   PAYSTACK_SECRET_KEY=sk_test_...
   ```
4. Restart the server. Submitting the application form now opens a real
   Paystack checkout popup for the ₦20,000 registration fee.
5. Use a [Paystack test card](https://paystack.com/docs/payments/test-payments/)
   to pay in test mode, e.g. `4084 0840 8408 4081`, any future expiry, CVV `408`, PIN `0000`, OTP `123456`.
6. When you're ready to accept real payments, swap in your **live** keys
   (`pk_live_...` / `sk_live_...`) from the same dashboard page.

**Never commit `.env`** — it's gitignored. Only `.env.example` (with no real
keys) is checked in.

## How the payment flow works

1. Candidate fills the form → browser `POST /api/applications`.
2. Server validates the fields, generates a unique reference, and stores a
   `pending` record in `data/applications.json`.
3. Browser opens the Paystack popup (Paystack Inline) with that reference.
4. After the popup reports success, the browser calls
   `POST /api/applications/:reference/verify`.
5. The server independently re-verifies the transaction directly with
   Paystack's API (`GET /transaction/verify/:reference`) using the secret
   key — the client's own "it worked" message is never trusted on its own.
6. Only once Paystack confirms `status: success`, correct amount, and NGN
   currency does the server mark the record `paid` and the page show the
   success notice.

Application records (including payment status) live in
`data/applications.json` — a simple gitignored JSON file, fine for getting
started. Move this to a real database before you have meaningful volume.

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

**To activate it:**

1. In the Paystack dashboard, go to
   [Settings → API Keys & Webhooks](https://dashboard.paystack.com/#/settings/developer)
2. Set the webhook URL to `https://YOUR_DOMAIN/api/webhooks/paystack`
   (must be a real public HTTPS URL — Paystack can't reach `localhost`)
3. That's it — no extra keys needed, it reuses `PAYSTACK_SECRET_KEY` from `.env`

**To test locally before you have a real domain**, tunnel your dev server
with [ngrok](https://ngrok.com/) (`ngrok http 3000`) and use the printed
`https://*.ngrok-free.app` URL as the webhook URL above. Paystack's
dashboard also has a "Send Test Webhook" button for a quick sanity check
once a URL is configured.

Both confirmation paths (browser verify + webhook) write to the same
`data/applications.json` record and both check `status === 'paid'` before
doing anything, so it's safe for either one — or both — to fire for the
same payment.

## Who gets notified when someone applies

The moment a payment is confirmed (by either path above), an email is sent
to `ADMISSIONS_NOTIFY_EMAIL` with the candidate's full details — name,
email, phone, age, craft discipline, scholarship interest, their statement,
and the payment reference/amount/channel. A tiny in-file "claim" guards
against sending it twice if both the browser and the webhook confirm the
same payment.

**To set up the email:**

1. Turn on 2-Step Verification on the sending Gmail account (Gmail requires
   this before it'll issue App Passwords):
   https://myaccount.google.com/security
2. Generate an App Password:
   https://myaccount.google.com/apppasswords — choose "Mail" as the app,
   any device name, and copy the 16-character password it gives you (spaces
   don't matter, you can paste it with or without them).
3. Put it in `.env`:
   ```
   SMTP_USER=rootandriseinstitute@gmail.com
   SMTP_APP_PASSWORD=the16charapppassword
   ADMISSIONS_NOTIFY_EMAIL=rootandriseinstitute@gmail.com
   ```
   (`ADMISSIONS_NOTIFY_EMAIL` can be a different address than `SMTP_USER` if
   you want applications to land somewhere other than the sending account —
   or even several addresses, comma-separated.)
4. Restart the server. Watch the terminal on startup — it'll warn you if
   these still look like placeholders.

**This is App Passwords, not OAuth** — simplest path for a single mailbox
sending a moderate volume of notification emails. If Root & Rise outgrows
this (very high volume, need deliverability analytics, multiple sending
domains), switch to a transactional service like Resend or SendGrid instead
— ask and I'll swap it in; `lib/mailer.js` is the only file that would need
to change.

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
server.js                        Express app entry point
routes/applications.js           Application + payment API endpoints (browser-driven)
routes/webhooks.js               Paystack webhook (server-to-server confirmation)
lib/paystack.js                  Paystack API client (verify transaction)
lib/mailer.js                    Email notification (Gmail SMTP via Nodemailer)
lib/store.js                     JSON-file storage for applications
data/applications.json           Application records (gitignored)
views/                           EJS templates
  index.ejs                      Page shell, assembles partials
  partials/                      head, header, hero, programmes, journey,
                                  pathways, curriculum, admissions, form, footer
public/                          Static assets (CSS, JS, images)
```
