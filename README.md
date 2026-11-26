<div align="center">
  <img src="./assets/gantt-logo.png" alt="Gantt logo" width="96" />
  <h1>Gantt App</h1>
</div>


<p align="center">
  <img src="./assets/social-preview.png" alt="Gantt - Plan. Organize. Track Progress." width="100%" />
</p>

<p align="center">
  <a href="https://ganttapp.vercel.app">Live App</a> ·
  <a href="https://ganttapp.vercel.app/terms">Terms of Use</a> ·
  <a href="https://ganttapp.vercel.app/privacy">Privacy Policy</a> ·
  <a href="./LICENSE">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v2.0.0-3b6bff?style=flat-square" alt="Version v2.0.0" />
  <img src="https://img.shields.io/badge/license-Apache%202.0-10b981?style=flat-square" alt="Apache 2.0 License" />
  <img src="https://img.shields.io/badge/stack-React%20%C2%B7%20TypeScript%20%C2%B7%20Firebase-0f172a?style=flat-square" alt="React TypeScript Firebase" />
</p>

## About

Gantt is a browser-based project timeline app for planning schedules, tracking subtasks and dependencies, exporting multi-page charts, and sharing live read-only links.

> [!NOTE]
> Open to any Google account with real-time Firebase cloud sync, optional Telegram deadline alerts, and zero ad trackers.

## Features

- **Nested Tasks & Subtasks:** Organize multi-level phases, tasks, and single-day milestones with automatic parent progress rollups.
- **Smart Dependency Arrows:** Connect blocking tasks with obstacle-aware routing that stays clear of bars and labels.
- **Flexible Timeline Views:** Switch between Days, Weeks, Months, Quarters, and Years, with `Ctrl + Scroll` zoom, `Shift + Scroll` panning, and mobile pinch-to-zoom.
- **Multi-Workspace Cloud Sync:** Manage multiple projects synced in real time through Firebase Cloud Firestore.
- **Live Shareable Links:** Publish read-only `/share/:shareId` links with live updates, custom "Shared by" profile names, and one-click duplication.
- **Telegram Deadline Alerts:** Connect Telegram in one tap for timezone-aware reminders, overdue digests, and bot commands (`/upcoming`, `/pause`, `/resume`, `/stop`).
- **Multi-Page Exports & JSON Import:** Export balanced multi-page PDFs, crisp 2x PNG images, CSV, or JSON, and import `.json` backups with validation.
- **Light & Dark Themes:** Daylight and dark interfaces with tabbed settings for Profile, Display, Export, Alerts, and Shortcuts.
- **Full Account Control:** Export your data or permanently delete your account, workspaces, public links, and Telegram link anytime from `Settings -> Profile`.

## Get started

### Prerequisites

- **Node.js 20+** and **npm**
- A free [Firebase](https://console.firebase.google.com) project

### 1. Clone and install

```bash
git clone https://github.com/ByteKen/ganttapp.git
cd ganttapp
npm install
```

### 2. Set up Firebase

1. Open [Firebase Console](https://console.firebase.google.com), create a project, and register a **Web** app.
2. Enable **Authentication -> Sign-in method -> Google**.
3. Create a **Cloud Firestore** database and publish the security rules from [`firestore.rules`](./firestore.rules).
4. Confirm `localhost` is listed under **Authentication -> Settings -> Authorized domains**.

### 3. Add environment variables

Copy [`.env.example`](./.env.example) to `.env.local`:

```bash
cp .env.example .env.local
```

> PowerShell on Windows: `Copy-Item .env.example .env.local`

Paste your Firebase Web app values into the six `VITE_FIREBASE_*` fields:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### 4. Start the dev server

```bash
npm run dev
```

Open `http://localhost:5173` in your browser and sign in with Google.

<details>
<summary>Optional: Running Telegram alerts & serverless API routes locally</summary>

1. Create a bot via [@BotFather](https://t.me/BotFather) and generate a Firebase Service Account key under **Project Settings -> Service accounts**.
2. Fill in the server-only variables in `.env.local` (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `CRON_SECRET`, `FIREBASE_SERVICE_ACCOUNT_JSON`, and `APP_BASE_URL`). Never prefix these with `VITE_`.
3. Run `npx vercel dev` instead of `npm run dev` to serve both the frontend and `/api/*` endpoints locally.
4. On Vercel production, register your bot webhook once with `/api/telegram/webhook` using your `TELEGRAM_WEBHOOK_SECRET`.

</details>

### Useful scripts

```bash
npm run typecheck  # TypeScript check across app and API
npm run lint       # ESLint check
npm run test       # Run Vitest suite
npm run build      # Production build
```

## License

Licensed under the [Apache License 2.0](./LICENSE).
