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

<p align="center">
  <strong>Leave a star if you find this project helpful!</strong>
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

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill in your Firebase web config in `.env.local` and publish [`firestore.rules`](./firestore.rules) in Firebase Console. For Vercel deployment and optional Telegram alerts, configure the server environment variables listed in [`.env.example`](./.env.example).

## Goal

This is a personal project built to keep Gantt scheduling fast and uncluttered. If it does not cover every workflow, other project tools may be a better fit, though bug reports and suggestions are always welcome in [GitHub Issues](https://github.com/ByteKen/ganttapp/issues).

## License

Licensed under the [Apache License 2.0](./LICENSE).
