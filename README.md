# A Golden Promise, for Cutuu ❤️

A React + Vite anniversary landing page with a floating 3D heart, a gold visit pass, smooth scrolling, and a one-click redemption flow.

When Cutuu taps **Redeem your visit**, the site:

1. reserves the pass in Supabase using a database lock,
2. enforces one redemption per rolling 365 days across devices and reloads,
3. sends Ritik an automatic email through Resend,
4. displays a success message explaining that she does not need to email or message him separately.

The pass is consumed when the server records a successful claim. If email delivery fails, the same request can retry delivery without consuming another yearly redemption.

## Requirements

- Node.js 20.19+ or 22.12+
- npm
- A Supabase project
- A Resend account

## 1. Create the database table and secure redemption function

1. Create a project at [Supabase](https://supabase.com/).
2. Open **SQL Editor** in the Supabase dashboard.
3. Copy and run the complete contents of `supabase/schema.sql`.
4. Open Project Settings and copy the **Project URL** and the server-side **service_role** key. Keep the key private.

The SQL creates the redemption table and a Postgres function that serializes redemption attempts and blocks a second redemption until 365 days have passed. Do not use the service-role key in browser code.

## 2. Set up automatic email delivery

1. Create an API key at [Resend](https://resend.com/api-keys). Use a sending-only key if available.
2. Set `RESEND_API_KEY` in the server environment.
3. Set `RESEND_FROM_EMAIL` to a sender address authorized by Resend.
   - For a quick test, `A Golden Promise <onboarding@resend.dev>` may be used when the Resend account is sending to its own verified account email.
   - For normal delivery to other addresses, add and verify a domain in Resend and use a sender on that domain, such as `A Golden Promise <love@your-verified-domain.com>`.
4. The recipient is set to `ritik.sainicoding@gmail.com` by default. You can override it with `REDEMPTION_NOTIFY_EMAIL`.

Resend accepting an email means it accepted the message for delivery; it cannot guarantee that a message avoids spam or reaches the inbox.

## 3. Configure local development

Copy `.env.example` to `.env`, then fill in the real values:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_PRIVATE_SERVICE_ROLE_KEY
RESEND_API_KEY=re_YOUR_RESEND_API_KEY
RESEND_FROM_EMAIL="A Golden Promise <onboarding@resend.dev>"
REDEMPTION_NOTIFY_EMAIL=ritik.sainicoding@gmail.com
```

Never commit `.env`, share screenshots of secrets, or prefix these server secrets with `VITE_`. The `.env.example` file contains placeholders only.

Run the project using two terminals from the project root. First install dependencies:

```bash
npm install
```

Terminal 1, start the API server:

```bash
npm run dev:api
```

Terminal 2, start the React/Vite frontend:

```bash
npm run dev
```

Vite proxies `/api/status` and `/api/redeem` to the Express API on `127.0.0.1:3001`. This avoids relying on Vite middleware to execute backend handlers. If the secrets are missing, the UI will show a setup message instead of opening an email draft.

## 4. Deploy the complete project

For production, deploy the frontend and Express API to a host that supports a persistent Node.js server, or adapt the API handlers to your chosen serverless platform. The local Express server is not automatically deployed by Vite:

1. Push this folder to a Git repository and import it into [Vercel](https://vercel.com/).
2. Use the default Vite build settings: build command `npm run build`, output directory `dist`.
3. In Vercel project settings, add these Environment Variables for Production (and Preview if you need it there):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`
   - `REDEMPTION_NOTIFY_EMAIL` (optional; defaults to Ritik's email)
4. Redeploy after adding environment variables.
5. Test the live `/api/status` endpoint and perform one test redemption before sharing the link.

## Where to edit things

- `src/App.jsx`: page copy, pass status, one-click action, success and error messages.
- `src/components/HeartScene.jsx`: 3D heart, lights, sparkles, and particles.
- `src/styles.css`: typography, layout, gold card, modal states, and animations.
- `api/redeem.js`: atomic claim request and automatic email send.
- `api/status.js`: status/availability check.
- `lib/api-http.js`: server-side API helpers.
- `server.js`: local Express API server and routes.
- `supabase/schema.sql`: persistent 365-day redemption rule.

## Important behavior

- The policy is **one redemption every rolling 365 days**, not once per calendar year. It is enforced by Supabase, not by local storage or a frontend button.
- One click triggers the redemption and automatic email request. She does not have to open a mail app or send anything herself.
- If the email provider has a temporary error, the page offers a retry that reuses the same redemption ID. It does not burn another use.
- The email/API credentials must be configured before this becomes live. The code cannot send an email until your own Supabase and Resend credentials are added.


## Deploy the current version (frontend + API together)

This project can be deployed as one Node/Express web service, which avoids the local Vite proxy issue in production. Express serves `dist/` after the Vite build and keeps `/api/status` and `/api/redeem` on the same origin.

### Render deployment

1. Push this project to a private GitHub repository. Do not commit `.env`; it is ignored by Git.
2. In Render, create **New → Web Service** and connect the repository.
3. Use these settings:
   - Runtime: Node
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
4. Add the server-side environment variables from `.env.example` in Render's Environment settings. Use your real Supabase URL and server-only key. Keep `RESEND_FROM_EMAIL` as the test sender for now if you cannot verify a domain; Resend will only allow sending to the account's own email while using its testing sender.
5. Deploy. Test `https://YOUR-SERVICE.onrender.com/api/status` and verify it returns JSON. Then open the service URL to see the website.

**Email limitation:** deploying does not remove Resend's sender verification requirement. With `onboarding@resend.dev`, notifications can only be sent to the email address associated with the Resend account. Automatic notification to a different inbox will work only after a verified sending domain is configured. Do not test the one-time redeem button until you're comfortable with the current email setup; a claim can be recorded even if email delivery fails.
