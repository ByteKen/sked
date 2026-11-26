# Gantt — Modern Project Timelines & Shareable Gantt Charts

A production-ready TypeScript Gantt chart studio built with React 19, Vite, Tailwind CSS, Framer Motion, Zustand, Firebase Authentication, Cloud Firestore, and Vercel Serverless Functions. Open to any Google account with live public shareable charts, task descriptions, account deletion, and Telegram deadline reminders.

## Features

- **Open Google Authentication**: Any Google account (personal, school, or work) can sign in — zero domain limits — with self-service account deletion.
- **Unified Split-Pane Gantt Engine**:
  - Resizable Task Hierarchy + Timeline split pane with active-source locked vertical scroll sync
  - Collapse/expand parent groups synchronized 1:1 between tree rows and timeline bars
  - Task descriptions with an instant inline timeline toggle, hover cards, search indexing, and CSV/JSON import & export
  - Subtasks, auto-calculated parent progress, single-day deadline milestones, dependency arrows, and parent-child brackets
  - Five timeline granularities (`Days`, `Weeks`, `Months`, `Quarters`, `Years`), zoom (`50%–300%`), Auto-Fit, Today marker, and keyboard shortcuts (`/`, `N`, `+`, `-`, `T`)
- **Live Shareable Gantt Charts (`/share/:shareId`)**:
  - Toggle public read-only link on/off per workspace with live Firestore sync
  - Regenerate link to invalidate older URLs
  - Viewers can **Duplicate to Workspace** with one click (routing anonymously through Google Sign-In seamlessly)
- **Telegram Deadline Bot Alerts (Vercel Serverless + Cron)**:
  - 1-tap deep-link connection from **Settings → Telegram Deadline Alerts**
  - Exact timezone-aware calendar-day countdowns (`7d`, `5d`, `3d`, `2d`, `1d`, `Due today`, + optional `Overdue`) with idempotent deduplication
  - Interactive Telegram bot commands (`/upcoming`, `/pause`, `/resume`, `/stop`)
- **Full Export & Atomic JSON Import**:
  - Export to **PDF** (lazy-loaded `jsPDF`), **PNG** (2× Retina), **CSV**, and **JSON**
  - Paste or upload `.json` files with live schema validation and atomic batch persistence

---

## Local Development

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Copy `.env.example` to `.env.local` and supply your Firebase web app credentials (`VITE_FIREBASE_*`). For local testing of `/api/*` serverless routes, run `vercel dev` with the server-only environment variables from `.env.example`.

### 3. Scripts

```bash
npm run dev        # Start local Vite dev server
npm run typecheck  # Strict TypeScript check across app, node, and api (tsc -b --noEmit)
npm run lint       # ESLint + typescript-eslint
npm run test       # Run Vitest unit & component tests
npm run build      # Typecheck + production bundle
npm run preview    # Preview built bundle locally
```

---

## Production Firebase Security Rules

Publish [`firestore.rules`](./firestore.rules) in Firebase Console → **Firestore Database → Rules** so private user data stays owner-only, `/share/:shareId` public links work safely, and server-only Telegram collections cannot be accessed from browsers:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    match /sharedCharts/{shareId} {
      allow get: if true;
      allow list: if false;
      allow create: if request.auth != null
                    && request.resource.data.ownerId == request.auth.uid;
      allow update, delete: if request.auth != null
                            && resource.data.ownerId == request.auth.uid;
    }

    match /telegramSubscriptions/{userId} {
      allow read, write: if false;
    }
    match /telegramLinkTokens/{tokenId} {
      allow read, write: if false;
    }
  }
}
```

---

## Telegram Deadline Bot Setup (Vercel — Zero Separate Server)

1. **Create a bot in Telegram**: Message [@BotFather](https://t.me/BotFather) → `/newbot` → copy the bot token and username (without `@`).
2. **Generate a Firebase Service Account**: Firebase Console → **Project Settings → Service accounts → Generate new private key**.
3. **Add Environment Variables in Vercel** (Settings → Environment Variables — do **not** prefix with `VITE_`):
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_BOT_USERNAME`
   - `TELEGRAM_WEBHOOK_SECRET` (any long random string)
   - `CRON_SECRET` (any long random string — Vercel Cron sends this automatically)
   - `FIREBASE_SERVICE_ACCOUNT_JSON` (raw JSON or base64-encoded service account JSON)
   - `APP_BASE_URL` (e.g., `https://your-app.vercel.app`)
4. **Deploy to Vercel**, then register your webhook **once**:
   ```bash
   curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url":"https://your-app.vercel.app/api/telegram/webhook","secret_token":"<TELEGRAM_WEBHOOK_SECRET>"}'
   ```
5. **Scheduling**:
   - **Daily reminders (included automatically)**: `vercel.json` runs `/api/cron/reminders?mode=daily` every day at `00:00 UTC` (`08:00 AM PHT`).
   - **Optional hourly per-user-timezone reminders**: Add `APP_BASE_URL` and `CRON_SECRET` to your GitHub repo's **Settings → Secrets → Actions** to enable [`.github/workflows/telegram-reminders.yml`](./.github/workflows/telegram-reminders.yml).

---

## Architecture Overview

```text
api/
├── _lib/           # Firebase Admin singleton, Bearer verification, Telegram HTTP adapter
├── telegram/
│   ├── manage.ts   # Authenticated link creation, settings sync, test alert, disconnect
│   └── webhook.ts  # Telegram webhook (/start <token>, /upcoming, /pause, /resume, /stop)
└── cron/
    └── reminders.ts # Deduplicated timezone-aware daily/hourly deadline dispatcher

src/
├── types/          # Strict domain, preferences & Firestore TypeScript interfaces
├── domain/         # Pure taskTree, timeline math, validation, and deadline reminders (unit tested)
├── config/         # Firebase Auth (open to all Google accounts) & Firestore
├── services/       # Single-listener userDocumentSync, repositories, Telegram client, export pipeline
├── store/          # Typed Zustand stores (auth, workspace, gantt, preferences, toast)
├── hooks/          # useMediaQuery, useResizablePane, useSyncedScroll, useKeyboardShortcuts
├── components/
│   ├── ui/         # Button, Modal, Switch, Badge, BrandLogo, ToastContainer, Skeleton
│   ├── gantt/      # GanttWorkspace, GanttToolbar, TaskTreePane, TimelineHeader/Grid/Bars, DependencyLayer
│   ├── modals/     # TaskModal, ShareModal, SettingsModal, DeleteAccountModal, ImportModal, TaskDetailModal
│   ├── settings/   # TelegramSettingsSection
│   ├── workspace/  # FloatingActionDock, WorkspaceSelector, WorkspaceCard, ExportMenu
│   └── layout/     # AppHeader, AppFooter, UserProfilePill, MobileNav, ThemeToggle
└── pages/          # LandingPage (/), HomePage, WorkspacePage, SharedChartPage, LegalPage
```
