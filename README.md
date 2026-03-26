# Collisions

Minimal Next.js landing page for NYU Bobst "Collisions" meetups.

## Stack

- Next.js (App Router)
- Firebase (Firestore starter integration)
- Vercel-ready deployment

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Copy env file and add your Firebase project values:

```bash
cp .env.example .env.local
```

3. Start dev server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Firebase setup

1. Create Firebase project.
2. Enable Firestore.
3. Add a web app in Firebase console.
4. Copy SDK config values into `.env.local`.
5. In Firestore rules, allow writes from authenticated users (recommended) or from your app during testing.

Form submissions are written to the `interest_signups` collection.

## Deploy to Vercel

1. Import this GitHub repo into Vercel.
2. Add all `NEXT_PUBLIC_FIREBASE_*` environment variables in Vercel project settings.
3. Deploy.

## Suggested next features

- Firebase Auth with NYU domain enforcement.
- Real-time open seats per table.
- Match confirmations and reminders.
- Dynamic metrics pulled from Firestore.
