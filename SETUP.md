# ChainArena — External Setup Guide

Everything you need to do before the app works end-to-end.  
This is your single checklist. Work through it top to bottom.

---

## Overview of what needs connecting

| Service | What it powers | Status |
|---|---|---|
| **Supabase** | Auth, database, user profiles, tournaments, payments | ❌ Needs config |
| **Phantom Wallet** | Solana payments, prize distribution | ❌ Needs browser extension |
| **Solana Devnet** | Blockchain transaction verification | ✅ Auto-configured (public RPC) |

---

## PART 1 — Supabase Setup

### Step 1.1 — Create a Supabase project

1. Go to **https://supabase.com** and sign in (or create a free account)
2. Click **New Project**
3. Fill in:
   - **Name:** `chainarena` (or anything you want)
   - **Database Password:** pick a strong password and save it somewhere
   - **Region:** pick the one closest to you
4. Click **Create new project** — wait ~2 minutes for it to provision

---

### Step 1.2 — Get your API keys

1. In your Supabase project, go to **Settings → API** (left sidebar)
2. Copy these two values — you'll need them in a moment:
   - **Project URL** — looks like `https://abcdefghijk.supabase.co`
   - **anon public** key — a long JWT string under "Project API keys"

---

### Step 1.3 — Run the database migration

1. In your Supabase project, go to **SQL Editor** (left sidebar)
2. Click **New query**
3. Open the file `chainarena/supabase/migrations/001_initial_schema.sql` in this project
4. Copy the **entire contents** and paste it into the SQL editor
5. Click **Run** (or press `Ctrl+Enter`)
6. You should see "Success. No rows returned"

This creates all 6 tables (`profiles`, `tournaments`, `participants`, `matches`, `payments`, `transactions`), all Row Level Security policies, all triggers, and all indexes.

---

### Step 1.4 — Configure email auth (disable email confirmation for development)

By default Supabase requires email confirmation before a user can log in.  
For local development, turn this off:

1. Go to **Authentication → Providers** (left sidebar)
2. Click on **Email**
3. Toggle **"Confirm email"** to **OFF**
4. Click **Save**

> Once you go to production, turn this back ON and set up a proper email provider (Resend, SendGrid, etc.)

---

### Step 1.5 — Set the redirect URL (for password reset to work)

1. Go to **Authentication → URL Configuration**
2. Under **Redirect URLs**, add:
   ```
   http://localhost:5173/**
   ```
3. Click **Save**

---

## PART 2 — Wire Supabase into the app

### Step 2.1 — Update your `.env` file

Open `chainarena/.env` — it currently has placeholder values:

```env
VITE_SUPABASE_URL=https://placeholder.supabase.co
VITE_SUPABASE_ANON_KEY=placeholder-anon-key
VITE_SOLANA_NETWORK=devnet
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
```

Replace the first two lines with your actual values from Step 1.2:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE
VITE_SOLANA_NETWORK=devnet
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
```

> **Important:** After editing `.env`, restart the dev server (`Ctrl+C` then `npm run dev`) — Vite does NOT hot-reload env changes.

---

## PART 3 — Phantom Wallet Setup

### Step 3.1 — Install Phantom

1. Go to **https://phantom.app**
2. Click **Download** and install the browser extension (Chrome, Brave, Firefox, Edge all work)
3. Create a new wallet — **save your seed phrase somewhere safe**
4. Phantom will open automatically in your browser toolbar

---

### Step 3.2 — Switch to Devnet

The app runs on Solana Devnet (free test network). You need to switch Phantom to devnet too:

1. Open Phantom extension
2. Click the **settings gear** icon (bottom left)
3. Click **Developer Settings**
4. Click **Change Network**
5. Select **Devnet**

---

### Step 3.3 — Get free Devnet SOL (for testing payments)

You need test SOL to pay entry fees. It's free:

**Option A — Phantom faucet (easiest):**
1. With Phantom open on Devnet, click **Buy**
2. Look for "Airdrop" or go to the Devnet faucet directly

**Option B — Web faucet:**
1. Copy your Phantom wallet address (click the address at the top of Phantom)
2. Go to **https://faucet.solana.com**
3. Paste your address, select **Devnet**, request **2 SOL**
4. Repeat as needed (you can request multiple times)

---

## PART 4 — Organizer Wallet for Tournaments

When you create a tournament as an Organizer, you need to set a **destination wallet address** where player entry fees will be sent.

This is just your Phantom wallet address:

1. Open Phantom
2. Click on your wallet name at the top to copy the full address
3. It looks like: `7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU`
4. Paste this when filling in the **"Your Wallet Address"** field during tournament creation

The app will automatically populate this field from your connected wallet if you connect Phantom before creating a tournament.

---

## PART 5 — First Run Checklist

Do these in order:

- [ ] **1.** `.env` file updated with real Supabase URL and anon key
- [ ] **2.** SQL migration run in Supabase SQL Editor
- [ ] **3.** Email confirmation turned OFF in Supabase Auth settings
- [ ] **4.** Dev server restarted after `.env` change (`npm run dev`)
- [ ] **5.** Phantom installed and switched to Devnet
- [ ] **6.** Devnet SOL airdropped to your wallet

---

## PART 6 — Testing the full flow

### As a Player:

1. Open `http://localhost:5173`
2. Click **Create account** → register as a **Player**
3. Log in → you land on the Dashboard
4. Click **Connect Wallet** in the top bar → connect Phantom (select Devnet wallet)
5. Go to **Tournaments** → find one with Registration Open
6. Click it → click **Join Tournament**
7. Review entry fee → click **Pay with Phantom**
8. Phantom pops up → confirm the transaction
9. Your registration shows as **Pending** → becomes **Verified** once organizer confirms

### As an Organizer:

1. Register a **second account** as an **Organizer** (use a different email or open incognito)
2. Log in as organizer → go to **My Tournaments**
3. Click **Create Tournament** → fill in the form, paste your Phantom wallet address
4. Set status to **Registration Open** from the dropdown
5. Go to **Manage** → see players joining
6. Verify payments manually (check tx signature on explorer) or let the auto-verify handle it
7. Create matches under the **Matches** tab
8. Set match winners → go to **Prizes** tab → send prize to winner

---

## PART 7 — Where each config value lives in the code

In case you need to trace anything:

| Value | File | How it's used |
|---|---|---|
| `VITE_SUPABASE_URL` | `src/constants/index.ts` → `src/lib/supabase.ts` | Supabase client init |
| `VITE_SUPABASE_ANON_KEY` | `src/constants/index.ts` → `src/lib/supabase.ts` | Supabase client auth |
| `VITE_SOLANA_NETWORK` | `src/constants/index.ts` → `src/lib/wallet-provider.tsx` | Wallet adapter network |
| `VITE_SOLANA_RPC_URL` | `src/constants/index.ts` → `src/lib/wallet-provider.tsx` | Solana RPC connection |
| Organizer wallet address | Set by user during tournament creation | Stored in `tournaments.organizer_wallet` in DB |

---

## PART 8 — Common Errors & Fixes

| Error | Cause | Fix |
|---|---|---|
| "Invalid API key" on login | `.env` has placeholder values | Update `.env` and restart dev server |
| "Failed to fetch" on any action | Supabase URL is wrong | Double-check `VITE_SUPABASE_URL` has no trailing slash |
| Sign up succeeds but login fails | Email confirmation is ON | Turn it OFF in Supabase Auth → Providers → Email |
| "Wallet not connected" on join | Phantom not connected | Click Connect Wallet in the header first |
| "User rejected request" | Phantom transaction rejected | Click Approve in the Phantom popup |
| No Devnet SOL | Wallet has 0 balance | Airdrop from https://faucet.solana.com |
| Profile not created after signup | SQL migration not run | Run `001_initial_schema.sql` in Supabase SQL Editor |
| "relation profiles does not exist" | SQL migration not run | Same as above |
| Dashboard shows nothing | Logged in but no profile row | Check if trigger `on_auth_user_created` was created |

---

## PART 9 — Going to Production (future reference)

When you're ready to go live, these are the additional steps:

1. **Switch Solana to Mainnet:**
   ```env
   VITE_SOLANA_NETWORK=mainnet-beta
   VITE_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
   ```
   > For production, use a dedicated RPC provider like [Helius](https://helius.dev) or [QuickNode](https://quicknode.com) — the public RPC has rate limits.

2. **Turn email confirmation back ON** in Supabase and configure an email provider

3. **Set up a custom domain** in Supabase Auth → URL Configuration

4. **Never commit your `.env` file** — it's already in `.gitignore` ✓

---

## Quick Reference

```
Supabase Dashboard:   https://supabase.com/dashboard
Solana Faucet:        https://faucet.solana.com
Phantom:              https://phantom.app
Solana Explorer:      https://explorer.solana.com/?cluster=devnet
Dev Server:           npm run dev  (runs on http://localhost:5173)
```
