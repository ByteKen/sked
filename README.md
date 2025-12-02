# Gantt Pro - Modern Project Management

A modern, responsive Gantt chart application built with React, Tailwind CSS, Firebase Authentication, and Firestore. Features Google authentication with domain locking, real-time task management, workspaces, and multiple export formats.

## Features

✨ **Modern UI**
- Glassmorphism design with gradient backgrounds
- Responsive layout (mobile, tablet, desktop)
- Light/Dark theme support
- Smooth animations and transitions

🔐 **Authentication**
- Google Sign-In with Firebase
- Domain-based access control (e.g., @phinmaed.com)
- Secure session management
- Login cancellation handling

📊 **Gantt Chart**
- Interactive task bars with progress tracking
- Hierarchical task organization (subtasks)
- Task dependencies visualization
- Milestone and deadline markers
- "Currently Working" indicator
- Zoom controls and time granularity (Days/Weeks/Months/Quarters/Years)
- Mobile-optimized view with collapsible task panel

📁 **Workspaces**
- Multiple project workspaces
- Easy workspace switching
- Workspace-specific task storage

💾 **Data Persistence**
- Firebase Firestore cloud storage
- Real-time sync across devices
- Preferences sync (theme, settings)

📥 **Export Functionality**
- PDF export with formatted table
- CSV export for spreadsheets
- JSON export for backups
- PNG image export

---

## Deployment to Vercel

### Prerequisites
- A [Vercel account](https://vercel.com/signup)
- A [Firebase project](https://console.firebase.google.com/) with Authentication and Firestore enabled
- Git repository (GitHub, GitLab, or Bitbucket)

### Step 1: Prepare Your Repository

1. **Ensure your code is pushed to Git:**
   ```bash
   cd ganttapp
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Verify `.gitignore` excludes sensitive files:**
   - `.env.local` (contains Firebase keys)
   - `node_modules/`
   - `dist/`

### Step 2: Deploy to Vercel

#### Option A: Deploy via Vercel Dashboard (Recommended)

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **"Import Project"**
3. Select your Git repository
4. Configure the project:
   - **Framework Preset:** Vite
   - **Root Directory:** `ganttapp` (if your repo has the root Gantt folder)
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`

5. Add **Environment Variables** (click "Environment Variables"):
   ```
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   VITE_ALLOWED_DOMAIN=phinmaed.com
   ```

6. Click **"Deploy"**

#### Option B: Deploy via Vercel CLI

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel:**
   ```bash
   vercel login
   ```

3. **Deploy:**
   ```bash
   cd ganttapp
   vercel
   ```

4. **Follow the prompts:**
   - Link to existing project? → No (for first deploy)
   - What's your project name? → gantt-pro
   - Which directory? → `./` (current directory)

5. **Add environment variables:**
   ```bash
   vercel env add VITE_FIREBASE_API_KEY
   vercel env add VITE_FIREBASE_AUTH_DOMAIN
   # ... add all other variables
   ```

6. **Redeploy with environment variables:**
   ```bash
   vercel --prod
   ```

### Step 3: Configure Firebase for Production

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project → **Authentication** → **Settings** → **Authorized domains**
3. Add your Vercel domain:
   - `your-project.vercel.app`
   - `your-custom-domain.com` (if using custom domain)

4. Go to **Firestore** → **Rules** and ensure rules allow authenticated users:
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

### Step 4: Verify Deployment

1. Visit your Vercel URL: `https://your-project.vercel.app`
2. Test Google Sign-In
3. Create a task and verify it persists
4. Test on mobile device

### Troubleshooting

| Issue | Solution |
|-------|----------|
| "Firebase not configured" | Check environment variables are set in Vercel |
| Google Sign-In fails | Add Vercel domain to Firebase authorized domains |
| Tasks not saving | Check Firestore rules allow authenticated writes |
| Build fails | Check build logs in Vercel dashboard |
| 404 on refresh | Vercel handles SPA routing automatically with Vite |

---

## Local Development

### Installation

```bash
cd ganttapp
npm install
```

### Configuration

Create `.env.local`:
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_ALLOWED_DOMAIN=phinmaed.com
```

### Run Development Server

```bash
npm run dev
```

### Build for Production

```bash
npm run build
npm run preview  # Test production build locally
```

---

## Project Structure

```
ganttapp/
├── src/
│   ├── components/
│   │   ├── LoginScreen.jsx          # Google Sign-In UI
│   │   ├── GanttDashboard.jsx       # Main dashboard
│   │   ├── GanttChart.jsx           # Timeline visualization
│   │   ├── TaskList.jsx             # Task tree sidebar
│   │   ├── TaskModal.jsx            # Task create/edit form
│   │   ├── WorkspaceSelector.jsx    # Workspace switcher
│   │   ├── SettingsModal.jsx        # App settings
│   │   ├── ConfirmationModal.jsx    # Delete/logout confirmations
│   │   ├── Toast.jsx                # Notification toasts
│   │   ├── ExportMenu.jsx           # Export options
│   │   └── EmptyState.jsx           # First-time user flow
│   ├── store/
│   │   ├── authStore.js             # Firebase auth state
│   │   ├── ganttStore.js            # Task management
│   │   ├── workspaceStore.js        # Workspace management
│   │   └── preferencesStore.js      # User preferences
│   ├── config/
│   │   └── firebase.js              # Firebase configuration
│   ├── utils/
│   │   └── exportUtils.js           # PDF/CSV/JSON/PNG export
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css                    # Tailwind + animations
├── .env.example                     # Environment template
├── .env.local                       # Local environment (gitignored)
├── vite.config.js
├── tailwind.config.js
└── package.json
```

---

## Technologies

| Category | Technology |
|----------|------------|
| Framework | React 19 |
| Styling | Tailwind CSS 3 |
| State Management | Zustand |
| Authentication | Firebase Auth |
| Database | Firebase Firestore |
| Icons | Lucide React |
| PDF Export | jsPDF + html2canvas |
| Build Tool | Vite 7 |
| Deployment | Vercel |

---

## License

MIT - Built for educational purposes.

---

**Built with ❤️ using React, Tailwind CSS, and Firebase**

