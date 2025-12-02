# Gantt Chart Project - AI Agent Instructions

## Project Overview
This is a **dual-implementation Gantt chart application**: a vanilla JavaScript version (`/index.html`) for reference and a modern React+Tailwind version (`/ganttapp`) which is the **active, production-ready implementation** with authentication, local persistence, and export features.

## Active Implementation: React + Tailwind CSS (`/ganttapp`)

### Technology Stack
- **React 19** - Component-based UI with hooks
- **Tailwind CSS 3** - Utility-first styling with glassmorphism effects
- **Zustand** - Lightweight state management (replaces Redux for simplicity)
- **Lucide React** - Icon library (plug-and-play SVG icons)
- **jsPDF** - PDF export with table formatting
- **Vite** - Build tool with HMR support
- **localStorage** - Client-side data persistence (no backend required)

### Architecture Overview

**State Management Pattern (Zustand):**
Two separate stores handle concerns independently:

1. **`authStore.js`** - Authentication & Authorization
   - Domain-based access control: validates email ends with `@ALLOWED_DOMAIN`
   - Session persistence in localStorage key: `gantt_user_session`
   - Simulates Google login flow with 800ms delay for realism
   - Exports: `useAuthStore()` hook with actions: `login()`, `logout()`, `initAuth()`

2. **`ganttStore.js`** - Task Data Management
   - Recursive task hierarchy (parent-child relationships)
   - Auto-increment ID generation (prevents ID collisions)
   - Full CRUD operations with automatic localStorage sync
   - Exports: `useGanttStore()` hook with actions: `addTask()`, `updateTask()`, `deleteTask()`, etc.

**Data Persistence Architecture:**
```
localStorage Structure:
├── gantt_user_session    → JSON: { id, email, name, loginTime }
├── gantt_tasks           → JSON: nested array of Task objects
└── gantt_next_id         → STRING: numeric counter for ID generation
```

**Component Hierarchy:**
```
App.jsx (auth check + routing)
├── LoginScreen.jsx (glassmorphic auth UI)
└── GanttDashboard.jsx (main app orchestration)
    ├── Header (search, export, logout buttons)
    ├── TaskList.jsx (left sidebar - recursive task tree)
    ├── GanttChart.jsx (right side - timeline visualization)
    ├── TaskModal.jsx (create/edit form in portal)
    └── ExportMenu.jsx (PDF/CSV/JSON selector dropdown)
```

### Critical Data Model

**Task Object Structure:**
```javascript
{
  id: number,                    // Auto-increment from nextId
  name: string,                  // Display name
  start: string,                 // ISO date "YYYY-MM-DD"
  end: string,                   // ISO date "YYYY-MM-DD"
  progress: number,              // 0-100 percentage
  isMilestone: boolean,          // Visual indicator (diamond shape)
  parentId: number | null,       // Links to parent task for hierarchy
  dependencies: number[],        // Array of blocking task IDs
  children: Task[],              // Nested subtasks (recursive)
  collapsed: boolean             // UI state for expand/collapse
}
```

### Key Implementation Details

**Authentication Flow:**
1. User enters email in LoginScreen
2. `useAuthStore().login(email)` validates:
   - Email regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
   - Domain suffix: `email.endsWith(@${VITE_ALLOWED_DOMAIN})`
   - Returns error if either fails
3. On success, creates User object with UUID
4. Stores to localStorage and sets `isAuthenticated = true`
5. App.jsx checks `isAuthenticated` → routes to GanttDashboard

**Why localStorage (not IndexedDB)?**
- Simplicity for educational/single-user projects
- ~5-10MB limit is sufficient for 1000+ tasks (~50KB per 100 tasks)
- Immediate data availability (synchronous read on mount)
- No database setup required
- Future: can upgrade to IndexedDB for larger datasets

**Task Hierarchy Rendering:**
All components that render tasks use a `flattenTasks()` helper to convert nested structure → flat array:
```javascript
function flattenTasks(tasks) {
  return tasks.reduce((acc, task) => {
    acc.push(task);
    if (task.children?.length) acc.push(...flattenTasks(task.children));
    return acc;
  }, []);
}
```
This enables list rendering while preserving hierarchy in data model.

**Gantt Chart Positioning:**
- Timeline start: `min(all task start dates) - 5 days` buffer
- Cell width: responsive, scales with viewport (40-80px range)
- Task left position: `daysDifference(startDate, task.start) * cellWidth`
- Task bar width: `taskDuration(days) * cellWidth`
```javascript
const daysFromStart = Math.floor((new Date(task.start) - startDate) / (1000*60*60*24));
const left = daysFromStart * cellWidth;
```

**Export Functionality (`exportUtils.js`):**
| Format | Function | Usage |
|--------|----------|-------|
| PDF | `exportToPDF(tasks, filename)` | jsPDF with autoTable, formatted header/footer |
| CSV | `exportToCSV(tasks, filename)` | Manual string construction, quoted fields |
| JSON | `exportToJSON(tasks, filename)` | JSON.stringify with metadata (version, exportDate) |

All exporters:
- Flatten nested tasks first
- Create Blob from content
- Trigger browser download via `<a>` element
- Include timestamp in filename (e.g., `gantt-chart-2025-12-01.pdf`)

### Styling Architecture

**Tailwind CSS Customization:**
- No component library - pure utility classes for flexibility
- Glassmorphism: `backdrop-blur-lg`, `bg-white/10`, `border-white/20`
- Gradients: `bg-gradient-to-r from-blue-500 to-purple-500`
- Animations: `animate-spin`, `animate-pulse` for loading states
- Responsive: Mobile-first approach (sm:, lg: breakpoints)

**Key Visual Components:**
- **LoginScreen**: Animated gradient background + frosted glass card
- **Header**: Sticky positioning, gradient logo icon, search bar
- **TaskList**: Recursive indentation (`level * 16px padding`), hover states
- **GanttChart**: 48px row height, dynamic cell width, progress overlays
- **Modals**: Centered overlay with semi-transparent backdrop (`bg-black bg-opacity-50`)

## Development Workflows

### Adding a New Feature

**Example: Add task tags**

1. **Update data model** in `ganttStore.js`:
   ```javascript
   // Modify Task structure
   { ...task, tags: [] }
   ```

2. **Update form** in `TaskModal.jsx`:
   ```jsx
   <input type="text" placeholder="Add tags (comma-separated)" />
   ```

3. **Create UI component** `src/components/TagSelector.jsx`

4. **Connect to store**:
   ```javascript
   const { updateTask } = useGanttStore();
   updateTask(taskId, { tags });  // Triggers localStorage sync automatically
   ```

### Common Patterns

**Using Zustand in components:**
```javascript
// ✅ Correct: Destructure only needed actions/state
const { tasks, addTask, updateTask } = useGanttStore();

// Store automatically syncs to localStorage after mutations
const handleSave = (taskData) => {
  addTask(taskData);  // ← localStorage sync happens inside
};
```

**Responsive Tailwind patterns:**
```jsx
// Hidden on mobile, visible on lg screens
<div className="hidden lg:block">...</div>

// Full width on mobile, 50% on desktop
<div className="w-full lg:w-1/2">...</div>
```

**Conditional styling:**
```jsx
// Combine classnames for complex conditions
className={`px-4 py-2 rounded-lg ${
  isSelected ? 'bg-blue-500 text-white' : 'bg-slate-100'
}`}
```

### Debugging Tasks

**Check localStorage state:**
```javascript
// Browser console
localStorage.getItem('gantt_tasks')
localStorage.getItem('gantt_user_session')
```

**Inspect Zustand store directly:**
```javascript
useGanttStore.getState()        // Read current state
useAuthStore.getState()          // Auth state
useGanttStore.subscribe(console.log)  // Subscribe to changes
```

**Task positioning issues:**
- Verify `startDate` calculation: log to confirm earliest task
- Check `cellWidth` matches calculated value
- Ensure dates are ISO format "YYYY-MM-DD"
- Inspect browser DevTools → inspect task bar element → see computed `left`, `width`

## File Structure Reference

```
ganttapp/
├── src/
│   ├── components/
│   │   ├── LoginScreen.jsx          # Glassmorphism auth UI
│   │   ├── GanttDashboard.jsx       # Main container + orchestration
│   │   ├── GanttChart.jsx           # Timeline visualization (bars)
│   │   ├── TaskList.jsx             # Recursive task tree sidebar
│   │   ├── TaskModal.jsx            # Task create/edit form
│   │   └── ExportMenu.jsx           # Export format dropdown
│   ├── store/
│   │   ├── authStore.js             # Zustand: auth + domain validation
│   │   └── ganttStore.js            # Zustand: task CRUD + localStorage
│   ├── utils/
│   │   └── exportUtils.js           # PDF/CSV/JSON export functions
│   ├── App.jsx                      # Auth gate + component router
│   ├── main.jsx                     # React entry point
│   └── index.css                    # Tailwind directives + global styles
├── .env.example                     # Template: VITE_ALLOWED_DOMAIN
├── .env.local                       # (Not committed) Active config
├── tailwind.config.js               # Tailwind customization
├── vite.config.js                   # Vite build config
├── postcss.config.js                # PostCSS (Tailwind processor)
├── package.json                     # Dependencies + scripts
└── README.md                        # User documentation
```

## Performance Considerations

**Scalability Limits:**
- localStorage: ~5-10MB per domain
  - 100 tasks ≈ 50KB
  - 1000 tasks ≈ 500KB
  - Sufficient for single-user school projects
  - Consider IndexedDB for enterprise multi-user

**Render Optimization:**
- TaskList: O(n) recursive traversal
  - Acceptable for <500 tasks
  - Optimize with React.memo() if list >500 items
- GanttChart: O(n) flatten + render
  - Timeline width calculated once per render
  - No debouncing needed (Vite's HMR is fast)

**Search Performance:**
- Linear scan O(n) with early exit
- `filterTasks()` preserves hierarchy
- Suitable for course projects with <1000 tasks

## Best Practices

✅ **DO:**
- Always call `persistTasks()` after mutations in ganttStore
- Use Zustand hooks for all state (no useState for app-wide state)
- Keep components under 300 lines (split complex ones)
- Test domain locking: try `user@wrong-domain.com`
- Flatten tasks when rendering lists or exporting
- Use Tailwind utilities exclusively (no inline CSS)

❌ **DON'T:**
- Mutate tasks directly; use store actions (ensures persistence)
- Forget `.env.local` setup (domain locking won't work without it)
- Mix Tailwind with CSS-in-JS or `<style>` tags
- Assume tasks are always flat (always check for children)
- Hardcode domain values anywhere except .env
- Store sensitive data beyond email (it's all localStorage)

## Migration Notes

**If extending from vanilla `/index.html`:**
- Don't modify it; it's a reference implementation
- All new features → `/ganttapp` components
- Core algorithms (date math, hierarchy traversal) can be ported
- Adapt DOM manipulation → React component pattern
- Global variables → Zustand stores

**Upgrading to IndexedDB (future):**
- Create `src/store/indexedDB.js` wrapper
- Keep Zustand interface (action names) the same
- Swap out localStorage calls in ganttStore
- Test with large datasets (1000+ tasks)

## Setup & Local Development

**Initial Setup:**
```bash
cd ganttapp
cp .env.example .env.local
# Edit .env.local: VITE_ALLOWED_DOMAIN=your-school.edu
npm install
npm run dev        # http://localhost:5173
```

**Test Checklist:**
- [ ] Login with correct domain → success
- [ ] Login with wrong domain → "Email must end with @your-school.edu"
- [ ] Create task, refresh page → data persists
- [ ] Export as PDF/CSV/JSON → files download
- [ ] Search by task name → results filter correctly
- [ ] Mobile (resize to <640px) → layout responsive

**Production Build:**
```bash
npm run build      # Creates dist/ folder
npm run preview    # Test production build locally
```

---

**Last Updated:** December 2025 | React Implementation (Production-Ready)
