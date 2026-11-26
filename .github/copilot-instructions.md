# Gantt Pro — AI Agent & Engineering Guide

## Stack & Conventions
- **TypeScript 5 (strict)** + **React 19** + **Vite 7** + **Tailwind CSS 3 (`darkMode: 'class'`)**
- **Zustand** (typed stores) + **React Router v7**
- **Firebase Auth** (open to all Google accounts — no `hd` or email domain restriction) + **Cloud Firestore**
- **Vitest** + **React Testing Library** for automated tests

## Architecture Layers
1. **`src/types/`**: Shared domain interfaces (`Task`, `FlatTask`, `Workspace`, `SharedChart`, `UserPreferences`, `AuthUser`).
2. **`src/domain/`**: Pure, side-effect-free logic (`taskTree.ts`, `timeline.ts`, `validation.ts`). Always put tree mutations, date math, and validation here and cover with unit tests.
3. **`src/services/`**:
   - `userDocumentSync.ts`: Single shared `onSnapshot(doc(db, 'users', uid))` per user fanning out to all stores.
   - `userRepository.ts`: Backward-compatible reads/writes to `users/{uid}` (`workspaces`, `lastWorkspaceId`, `tasks_{workspaceId}`, `nextId_{workspaceId}`, `preferences`).
   - `shareRepository.ts`: Public `sharedCharts/{shareId}` lifecycle (enable, live sync, regenerate, disable, subscribe).
   - `export/`: Canvas renderer + lazy `jsPDF`, PNG, CSV, and JSON exporters.
4. **`src/store/`**: Typed Zustand stores (`authStore`, `workspaceStore`, `ganttStore`, `preferencesStore`, `toastStore`).
5. **`src/components/` & `src/pages/`**: Clean Modern SaaS UI using Tailwind `dark:` variants, accessible portal `Modal`, `Switch`, Lucide SVG icons only (no emojis), and unified split-pane `GanttWorkspace`.

## Rules
- Never introduce email domain locks (`hd` or `ALLOWED_DOMAIN`).
- Never write `undefined` fields to Firestore — pass task arrays through `sanitizeTaskTree()`.
- Keep `users/{uid}` document keys backward-compatible with production data.
- Never define React components inside other component render bodies.
- Always run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` before shipping changes.
