# Offline-First Flashcards Application (v2.0) — Complete Blueprint & Source Code

This document consolidates the **UI & System Architecture Creation Report**, **Build & Deployment Instructions**, and the **complete source code** for all project files into a single portable Markdown reference.

---

## Part 1: System & UI Architecture Creation Report

### 1. Executive Summary
This blueprint establishes the structural, architectural, and visual foundation for an offline-first mobile flashcard application packaged for Android via Capacitor. It separates static presentation assets from dynamic local persistence to deliver zero-latency study sessions without network dependency.

### 2. System Architecture & Offline Strategy

| Architectural Layer | Technology / Mechanism | Operational Responsibility |
| :--- | :--- | :--- |
| **Native Shell** | Capacitor WebView & GitHub Actions APK Pipeline | Wraps the local web bundle into a distributable Android APK and exposes native storage bridges. |
| **Asset Bundle** | Self-Contained `www/` Directory | Stores all scripts, stylesheets, and SVG icons locally—eliminating external CDN dependencies. |
| **Primary Database** | IndexedDB (`FlashcardsOfflineDB` v2) | Persists flashcard decks, SM-2 spaced-repetition intervals, and ease factors offline. |
| **State & Router** | Client-Side Reactive State Machine (`app.js`) | Manages active route pointers, deck filtering, keyboard shortcuts, and instantaneous DOM updates. |
| **Data Portability** | Offline JSON Export / Import | Enables full deck and card backup or cross-device transfer without a backend server. |

### 3. UI Design System & Screen Breakdown
- **Floating Glassmorphism Dock (`styles.css`):** A rounded translucent bottom bar positioned above the system gesture safe-area (`env(safe-area-inset-bottom)`), featuring expanding active pill labels and an elevated center `+` Floating Action Button (FAB).
- **Home Dashboard (`route: 'home'`):** Asymmetric Bento Grid displaying Total Cards, Due Today, Mastery Progress percentage, and offline JSON Export/Import triggers.
- **Study Session (`route: 'study'`):** Focused single-card canvas with 3D perspective flip (`rotateY(180deg)`), keyboard shortcuts (`Space` to flip, `1/2/3` to rate), and dynamic SM-2 interval previews on **Hard / Good / Easy** buttons.
- **Create Flashcard (`route: 'create'`):** Form supporting existing deck selection or instant on-the-fly deck creation.
- **Decks & Stats (`route: 'decks'`, `route: 'stats'`):** Live search filtering, cascading deck deletion, and color-coded mastery breakdowns.

---

## Part 2: Build & Deployment Instructions

### Project Directory Tree

```text
flashcards_offline_app_v2/
├── .github/
│   └── workflows/
│       └── build-apk.yml       # Automated GitHub Actions APK pipeline
├── www/
│   ├── index.html              # App shell, floating dock, toast banner
│   ├── css/
│   │   └── styles.css          # Bento Grid, 3D card flip, glassmorphism
│   └── js/
│       ├── db.js               # IndexedDB storage, SM-2 engine, JSON backup
│       ├── ui.js               # XSS-safe modular view renderers
│       └── app.js              # State machine, router, keyboard/event bindings
├── capacitor.config.json       # Capacitor Android configuration
├── package.json                # Dependencies and Capacitor CLI scripts
├── .gitignore                  # Ignores node_modules and generated android/ folder
└── README.md                   # Quickstart reference
```

### Option A: Automated Cloud APK Build (GitHub Actions)
1. Switch to an isolated feature branch (keeping `main` untouched):
   ```bash
   git checkout -b feature/flashcards-v2
   ```
2. Create the files using the exact paths and contents in **Part 3** below.
3. Commit and push to trigger `.github/workflows/build-apk.yml`:
   ```bash
   git add .
   git commit -m "feat: initialize offline flashcards v2 with SM-2 and backup"
   git push -u origin feature/flashcards-v2
   ```
4. Open the **Actions** tab on GitHub, select **Build Android APK**, and download the `flashcards-debug-apk-v2` artifact.

### Option B: Local Android APK Build (Gradle / ADB)
1. Ensure **Node.js 20+**, **Java JDK 17**, and the **Android SDK** are installed.
2. Install dependencies and generate the Android native project:
   ```bash
   npm install
   npx cap add android
   npx cap sync android
   ```
3. Compile the debug APK:
   ```bash
   cd android
   ./gradlew assembleDebug
   ```
   Output APK location: `android/app/build/outputs/apk/debug/app-debug.apk`
4. Install onto a connected Android device via USB debugging:
   ```bash
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```

---

## Part 3: Complete Project Source Files

### 1. `package.json`

```json
{
  "name": "offline-flashcards-app",
  "version": "2.0.0",
  "description": "Offline-first dynamic flashcard application with SM-2 spaced repetition, JSON backup/restore, and Android Capacitor APK build pipeline",
  "main": "www/index.html",
  "scripts": {
    "build": "echo 'Static assets ready in www/'",
    "cap:init": "npx cap init Flashcards com.retro.flashcards --web-dir www",
    "cap:add:android": "npx cap add android",
    "cap:sync": "npx cap sync android"
  },
  "dependencies": {
    "@capacitor/android": "^6.0.0",
    "@capacitor/core": "^6.0.0"
  },
  "devDependencies": {
    "@capacitor/cli": "^6.0.0"
  }
}
```

### 2. `capacitor.config.json`

```json
{
  "appId": "com.retro.flashcards",
  "appName": "Flashcards",
  "webDir": "www",
  "bundledWebRuntime": false,
  "server": {
    "androidScheme": "https"
  },
  "android": {
    "allowMixedContent": false,
    "captureInput": true,
    "webContentsDebuggingEnabled": false
  }
}
```

### 3. `.gitignore`

```gitignore
node_modules/
android/
ios/
.DS_Store
*.log
```

### 4. `.github/workflows/build-apk.yml`

```yaml
name: Build Android APK

on:
  push:
    branches:
      - 'feature/**'
      - 'develop'
  workflow_dispatch:

jobs:
  build-apk:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Set up Java 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Install dependencies
        run: npm ci || npm install

      - name: Initialize Capacitor Android platform
        run: |
          if [ ! -d "android" ]; then
            npx cap add android
          fi
          npx cap sync android

      - name: Grant execute permission for gradlew
        run: chmod +x android/gradlew

      - name: Build Debug APK
        run: |
          cd android
          ./gradlew assembleDebug

      - name: Upload APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: flashcards-debug-apk-v2
          path: android/app/build/outputs/apk/debug/app-debug.apk
```

### 5. `www/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="theme-color" content="#0b1120" />
  <title>Flashcards Offline</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <div class="app-shell">
    <!-- Top Header -->
    <header class="top-bar">
      <div class="brand">
        <span class="brand-dot"></span>
        <h1 id="view-title">Dashboard</h1>
      </div>
      <div class="status-pill" id="offline-badge">Offline Ready</div>
    </header>

    <!-- Toast Notification Banner -->
    <div id="toast-banner" class="toast-banner" role="status" aria-live="polite"></div>

    <!-- Main Dynamic Content Viewport -->
    <main id="app-viewport" class="viewport"></main>

    <!-- Hidden File Input for JSON Backup Restore -->
    <input type="file" id="import-json-input" accept=".json,application/json" hidden />

    <!-- Floating Glassmorphism & Expanding Pill Bottom Dock -->
    <nav class="floating-dock" aria-label="Primary Navigation">
      <button class="dock-item active" data-route="home" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
        <span class="dock-label">Home</span>
      </button>

      <button class="dock-item" data-route="study" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
        <span class="dock-label">Study</span>
      </button>

      <button class="dock-fab" data-route="create" type="button" aria-label="Create Card">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>

      <button class="dock-item" data-route="decks" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
          <polyline points="2 17 12 22 22 17"></polyline>
          <polyline points="2 12 12 17 22 12"></polyline>
        </svg>
        <span class="dock-label">Decks</span>
      </button>

      <button class="dock-item" data-route="stats" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="20" x2="18" y2="10"></line>
          <line x1="12" y1="20" x2="12" y2="4"></line>
          <line x1="6" y1="20" x2="6" y2="14"></line>
        </svg>
        <span class="dock-label">Stats</span>
      </button>
    </nav>
  </div>

  <script src="js/db.js"></script>
  <script src="js/ui.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
```

### 6. `www/css/styles.css`

```css
:root {
  --bg-base: #0b1120;
  --bg-surface: rgba(30, 41, 59, 0.74);
  --bg-card: rgba(15, 23, 42, 0.88);
  --border-glass: rgba(255, 255, 255, 0.11);
  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --accent-primary: #38bdf8;
  --accent-secondary: #818cf8;
  --accent-success: #34d399;
  --accent-warn: #fbbf24;
  --accent-danger: #f87171;
  --radius-lg: 24px;
  --radius-md: 16px;
  --shadow-soft: 0 12px 32px rgba(0, 0, 0, 0.45);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: radial-gradient(circle at top right, #1e293b, #0b1120 65%);
  color: var(--text-primary);
  min-height: 100vh;
  overflow-x: hidden;
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: calc(105px + env(safe-area-inset-bottom, 0px));
}

.app-shell {
  max-width: 540px;
  margin: 0 auto;
  padding: 16px;
}

/* Top Bar */
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 4px 20px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent-primary);
  box-shadow: 0 0 12px var(--accent-primary);
}

.top-bar h1 {
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.status-pill {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 999px;
  background: rgba(52, 211, 153, 0.14);
  color: var(--accent-success);
  border: 1px solid rgba(52, 211, 153, 0.3);
}

/* Toast Banner */
.toast-banner {
  position: fixed;
  top: calc(16px + env(safe-area-inset-top, 0px));
  left: 50%;
  transform: translate(-50%, -120%);
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid var(--accent-primary);
  color: var(--text-primary);
  padding: 10px 18px;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 600;
  box-shadow: var(--shadow-soft);
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  z-index: 200;
  pointer-events: none;
}

.toast-banner.show {
  transform: translate(-50%, 0);
}

/* Bento Grid Dashboard */
.bento-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

.bento-card {
  background: var(--bg-surface);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border-glass);
  border-radius: var(--radius-lg);
  padding: 18px;
  box-shadow: var(--shadow-soft);
}

.bento-card.span-2 {
  grid-column: span 2;
}

.bento-label {
  font-size: 0.76rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}

.bento-value {
  font-size: 1.85rem;
  font-weight: 800;
  color: var(--text-primary);
}

.bento-sub {
  font-size: 0.8rem;
  color: var(--accent-primary);
  margin-top: 6px;
}

/* Buttons & Inputs */
.btn-primary {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  color: #0b1120;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  margin-top: 12px;
}

.btn-secondary {
  padding: 11px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-glass);
  background: rgba(15, 23, 42, 0.85);
  color: var(--text-primary);
  font-weight: 600;
  font-size: 0.84rem;
  cursor: pointer;
}

.btn-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 12px;
}

.form-group {
  margin-bottom: 14px;
}

.form-group label {
  display: block;
  font-size: 0.82rem;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.form-control {
  width: 100%;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-glass);
  background: rgba(15, 23, 42, 0.92);
  color: var(--text-primary);
  font-size: 0.95rem;
  font-family: inherit;
}

/* Flashcard 3D Flip */
.flashcard-stage {
  perspective: 1000px;
  margin: 12px 0 20px;
}

.flashcard {
  width: 100%;
  min-height: 270px;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
  cursor: pointer;
}

.flashcard.flipped {
  transform: rotateY(180deg);
}

.card-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  background: var(--bg-surface);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-glass);
  border-radius: var(--radius-lg);
  padding: 28px 22px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  box-shadow: var(--shadow-soft);
}

.card-back {
  transform: rotateY(180deg);
  border-color: rgba(56, 189, 248, 0.45);
}

.card-tag {
  position: absolute;
  top: 16px;
  left: 18px;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--accent-primary);
  background: rgba(56, 189, 248, 0.12);
  padding: 4px 10px;
  border-radius: 999px;
}

.card-text {
  font-size: 1.2rem;
  font-weight: 600;
  line-height: 1.55;
  white-space: pre-wrap;
}

.rating-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.rate-btn {
  padding: 12px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-glass);
  background: var(--bg-card);
  color: var(--text-primary);
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.rate-btn small {
  font-size: 0.68rem;
  opacity: 0.78;
  font-weight: 500;
}

.rate-btn.hard { border-color: rgba(248, 113, 113, 0.45); color: var(--accent-danger); }
.rate-btn.good { border-color: rgba(251, 191, 36, 0.45); color: var(--accent-warn); }
.rate-btn.easy { border-color: rgba(52, 211, 153, 0.45); color: var(--accent-success); }

/* Deck & Card List Items */
.deck-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border-glass);
  border-radius: var(--radius-md);
  margin-bottom: 10px;
}

.deck-actions {
  display: flex;
  gap: 8px;
}

.icon-btn-danger {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(248, 113, 113, 0.35);
  background: rgba(248, 113, 113, 0.1);
  color: var(--accent-danger);
  font-weight: 700;
  font-size: 0.8rem;
  cursor: pointer;
}

/* Floating Glassmorphism Dock + Expanding Pill + Center FAB */
.floating-dock {
  position: fixed;
  bottom: calc(18px + env(safe-area-inset-bottom, 0px));
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 32px);
  max-width: 480px;
  height: 66px;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 0 10px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
  z-index: 100;
}

.dock-item {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.25s ease;
}

.dock-item svg {
  width: 20px;
  height: 20px;
}

.dock-label {
  display: none;
  font-size: 0.8rem;
  font-weight: 700;
}

.dock-item.active {
  background: #f8fafc;
  color: #0b1120;
  padding: 10px 16px;
}

.dock-item.active .dock-label {
  display: inline-block;
}

.dock-fab {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  color: #0b1120;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translateY(-10px);
  box-shadow: 0 8px 20px rgba(56, 189, 248, 0.45);
  cursor: pointer;
}

.dock-fab svg {
  width: 24px;
  height: 24px;
}
```

### 7. `www/js/db.js`

```javascript
const DB_NAME = 'FlashcardsOfflineDB';
const DB_VERSION = 2;

const OfflineDB = {
  db: null,

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('decks')) {
          db.createObjectStore('decks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('cards')) {
          const cardStore = db.createObjectStore('cards', { keyPath: 'id' });
          cardStore.createIndex('deckId', 'deckId', { unique: false });
        }
      };

      request.onsuccess = async (e) => {
        this.db = e.target.result;
        await this.seedDefaultsIfEmpty();
        resolve(this.db);
      };

      request.onerror = (e) => reject(e.target.error);
    });
  },

  async seedDefaultsIfEmpty() {
    const decks = await this.getAll('decks');
    if (decks.length === 0) {
      const defaultDeckId = 'deck-core-1';
      await this.put('decks', {
        id: defaultDeckId,
        title: 'System Architecture',
        createdAt: Date.now()
      });
      await this.put('cards', {
        id: 'card-1',
        deckId: defaultDeckId,
        front: 'What is IndexedDB used for in offline web apps?',
        back: 'Client-side structured storage for large datasets and offline persistence.',
        mastery: 1,
        repetitions: 1,
        intervalDays: 1,
        easeFactor: 2.5,
        nextReview: Date.now()
      });
      await this.put('cards', {
        id: 'card-2',
        deckId: defaultDeckId,
        front: 'How does Capacitor package a web app into an APK?',
        back: 'It wraps local web assets inside a native Android WebView container with a JS-to-Native bridge.',
        mastery: 0,
        repetitions: 0,
        intervalDays: 0,
        easeFactor: 2.5,
        nextReview: Date.now()
      });
    }
  },

  // SM-2 Spaced Repetition Calculation
  calculateSM2(card, qualityRating) {
    // qualityRating: 0 = Hard (Again), 1 = Good, 2 = Easy
    let repetitions = card.repetitions || 0;
    let intervalDays = card.intervalDays || 0;
    let easeFactor = card.easeFactor || 2.5;

    if (qualityRating === 0) {
      repetitions = 0;
      intervalDays = 0;
      easeFactor = Math.max(1.3, easeFactor - 0.2);
      return {
        ...card,
        mastery: 0,
        repetitions,
        intervalDays,
        easeFactor,
        nextReview: Date.now() + 2 * 60 * 1000 // Review again in 2 minutes
      };
    }

    if (repetitions === 0) {
      intervalDays = qualityRating === 2 ? 3 : 1;
    } else if (repetitions === 1) {
      intervalDays = qualityRating === 2 ? 6 : 3;
    } else {
      const bonus = qualityRating === 2 ? 1.3 : 1.0;
      intervalDays = Math.round(intervalDays * easeFactor * bonus);
    }

    repetitions += 1;
    easeFactor = Math.max(
      1.3,
      easeFactor + (qualityRating === 2 ? 0.15 : 0.0)
    );

    return {
      ...card,
      mastery: qualityRating === 2 || repetitions >= 2 ? 2 : 1,
      repetitions,
      intervalDays,
      easeFactor,
      nextReview: Date.now() + intervalDays * 24 * 3600 * 1000
    };
  },

  getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  put(storeName, item) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  delete(storeName, id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async exportBackup() {
    const decks = await this.getAll('decks');
    const cards = await this.getAll('cards');
    return JSON.stringify({
      app: 'FlashcardsOffline',
      version: 2,
      exportedAt: new Date().toISOString(),
      decks,
      cards
    }, null, 2);
  },

  async importBackup(jsonString) {
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed.decks) || !Array.isArray(parsed.cards)) {
      throw new Error('Invalid backup format');
    }
    for (const deck of parsed.decks) {
      if (deck.id && deck.title) {
        await this.put('decks', deck);
      }
    }
    for (const card of parsed.cards) {
      if (card.id && card.deckId && card.front && card.back) {
        await this.put('cards', card);
      }
    }
  }
};
```

### 8. `www/js/ui.js`

```javascript
const UI = {
  escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  renderHome(decks, cards) {
    const mastered = cards.filter(c => c.mastery >= 2).length;
    const due = cards.filter(c => c.nextReview <= Date.now()).length;

    return `
      <div class="bento-grid">
        <div class="bento-card">
          <div class="bento-label">Total Cards</div>
          <div class="bento-value">${cards.length}</div>
          <div class="bento-sub">${decks.length} Active Decks</div>
        </div>
        <div class="bento-card">
          <div class="bento-label">Due Today</div>
          <div class="bento-value">${due}</div>
          <div class="bento-sub">Ready to review</div>
        </div>
        <div class="bento-card span-2">
          <div class="bento-label">Mastery Progress</div>
          <div class="bento-value">${cards.length ? Math.round((mastered / cards.length) * 100) : 0}%</div>
          <div class="bento-sub">${mastered} of ${cards.length} cards mastered offline</div>
          <button class="btn-primary" onclick="App.studyAll()">Start Study Session</button>
        </div>
        <div class="bento-card span-2">
          <div class="bento-label">Offline Data Portability</div>
          <div class="bento-sub" style="color:var(--text-secondary);">Export or restore decks as local JSON files</div>
          <div class="btn-row">
            <button class="btn-secondary" onclick="App.exportJSON()">Export Backup</button>
            <button class="btn-secondary" onclick="App.triggerImport()">Import Backup</button>
          </div>
        </div>
      </div>
    `;
  },

  renderStudy(card, deckName, remainingCount, isFilteredByDeck) {
    if (!card) {
      return `
        <div class="bento-card span-2" style="text-align:center; padding: 36px 20px;">
          <div class="bento-value" style="font-size:1.4rem;">All Caught Up!</div>
          <p style="color:var(--text-secondary); margin: 10px 0 18px;">No cards pending review in this queue.</p>
          ${isFilteredByDeck ? `<button class="btn-secondary" style="width:100%; margin-bottom:8px;" onclick="App.studyAll()">Study All Decks</button>` : ''}
          <button class="btn-primary" onclick="App.navigate('create')">Add New Flashcard</button>
        </div>
      `;
    }

    return `
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.82rem; color:var(--text-secondary);">
        <span>Deck: ${this.escapeHTML(deckName)}</span>
        <span>${remainingCount} due</span>
      </div>
      <div class="flashcard-stage">
        <div class="flashcard" id="active-flashcard" onclick="this.classList.toggle('flipped')">
          <div class="card-face card-front">
            <span class="card-tag">FRONT • TAP OR SPACE TO FLIP</span>
            <div class="card-text">${this.escapeHTML(card.front)}</div>
          </div>
          <div class="card-face card-back">
            <span class="card-tag">ANSWER</span>
            <div class="card-text">${this.escapeHTML(card.back)}</div>
          </div>
        </div>
      </div>
      <div class="rating-row">
        <button class="rate-btn hard" onclick="App.rateCard('${card.id}', 0)">
          Hard
          <small>2 min</small>
        </button>
        <button class="rate-btn good" onclick="App.rateCard('${card.id}', 1)">
          Good
          <small>${(card.repetitions || 0) === 0 ? '1 day' : '3+ days'}</small>
        </button>
        <button class="rate-btn easy" onclick="App.rateCard('${card.id}', 2)">
          Easy
          <small>${(card.repetitions || 0) === 0 ? '3 days' : '6+ days'}</small>
        </button>
      </div>
    `;
  },

  renderCreate(decks) {
    const options = decks.map(d => `<option value="${d.id}">${this.escapeHTML(d.title)}</option>`).join('');
    return `
      <div class="bento-card">
        <form id="create-card-form">
          <div class="form-group">
            <label>Select Existing Deck</label>
            <select class="form-control" id="deck-select">${options}</select>
          </div>
          <div class="form-group">
            <label>Or Create New Deck</label>
            <input type="text" class="form-control" id="new-deck-input" placeholder="e.g. DSA & Algorithms" />
          </div>
          <div class="form-group">
            <label>Front (Question / Prompt)</label>
            <textarea class="form-control" id="card-front-input" rows="3" required placeholder="Enter prompt..."></textarea>
          </div>
          <div class="form-group">
            <label>Back (Answer / Explanation)</label>
            <textarea class="form-control" id="card-back-input" rows="3" required placeholder="Enter answer..."></textarea>
          </div>
          <button type="submit" class="btn-primary">Save Card Offline</button>
        </form>
      </div>
    `;
  },

  renderDecks(decks, cards, searchQuery = '') {
    const q = searchQuery.toLowerCase();
    const filteredDecks = decks.filter(d => d.title.toLowerCase().includes(q));

    const searchBar = `
      <div class="form-group">
        <input type="search" class="form-control" id="deck-search-input" placeholder="Filter decks..." value="${this.escapeHTML(searchQuery)}" />
      </div>
    `;

    if (filteredDecks.length === 0) {
      return searchBar + `<div class="bento-card" style="text-align:center; color:var(--text-secondary);">No matching decks found.</div>`;
    }

    const list = filteredDecks.map(d => {
      const deckCards = cards.filter(c => c.deckId === d.id);
      const dueCount = deckCards.filter(c => c.nextReview <= Date.now()).length;
      return `
        <div class="deck-item">
          <div>
            <div style="font-weight:700;">${this.escapeHTML(d.title)}</div>
            <div style="font-size:0.8rem; color:var(--text-secondary);">${deckCards.length} total • ${dueCount} due</div>
          </div>
          <div class="deck-actions">
            <button class="rate-btn easy" style="padding:10px 14px;" onclick="App.studyDeck('${d.id}')">Study</button>
            <button class="icon-btn-danger" onclick="App.deleteDeck('${d.id}')">Delete</button>
          </div>
        </div>
      `;
    }).join('');

    return searchBar + list;
  },

  renderStats(cards) {
    const hard = cards.filter(c => c.mastery === 0).length;
    const good = cards.filter(c => c.mastery === 1).length;
    const easy = cards.filter(c => c.mastery >= 2).length;

    return `
      <div class="bento-grid">
        <div class="bento-card">
          <div class="bento-label">Needs Review</div>
          <div class="bento-value" style="color:var(--accent-danger);">${hard}</div>
        </div>
        <div class="bento-card">
          <div class="bento-label">Learning</div>
          <div class="bento-value" style="color:var(--accent-warn);">${good}</div>
        </div>
        <div class="bento-card span-2">
          <div class="bento-label">Mastered Cards</div>
          <div class="bento-value" style="color:var(--accent-success);">${easy}</div>
          <div class="bento-sub">SM-2 spaced repetition persisted in IndexedDB</div>
        </div>
      </div>
    `;
  }
};
```

### 9. `www/js/app.js`

```javascript
const App = {
  state: {
    route: 'home',
    selectedDeckId: null,
    deckSearch: '',
    decks: [],
    cards: []
  },

  async init() {
    await OfflineDB.init();
    await this.refreshData();
    this.bindNavigation();
    this.bindKeyboardShortcuts();
    this.bindBackupImport();
    this.updateNetworkBadge();
    window.addEventListener('online', () => this.updateNetworkBadge());
    window.addEventListener('offline', () => this.updateNetworkBadge());
    this.render();
  },

  async refreshData() {
    this.state.decks = await OfflineDB.getAll('decks');
    this.state.cards = await OfflineDB.getAll('cards');
  },

  showToast(msg) {
    const banner = document.getElementById('toast-banner');
    banner.textContent = msg;
    banner.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => banner.classList.remove('show'), 2600);
  },

  updateNetworkBadge() {
    const badge = document.getElementById('offline-badge');
    badge.textContent = navigator.onLine ? 'Offline Ready • Local DB' : 'Offline Mode Active';
  },

  bindNavigation() {
    document.querySelectorAll('[data-route]').forEach(btn => {
      btn.addEventListener('click', () => {
        const route = btn.getAttribute('data-route');
        this.navigate(route);
      });
    });
  },

  bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (this.state.route !== 'study') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const cardEl = document.getElementById('active-flashcard');
      if (!cardEl) return;

      if (e.code === 'Space') {
        e.preventDefault();
        cardEl.classList.toggle('flipped');
      } else if (['1', '2', '3'].includes(e.key)) {
        const activeCard = this.getDueCards()[0];
        if (activeCard) {
          this.rateCard(activeCard.id, parseInt(e.key, 10) - 1);
        }
      }
    });
  },

  bindBackupImport() {
    const input = document.getElementById('import-json-input');
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        await OfflineDB.importBackup(text);
        await this.refreshData();
        this.render();
        this.showToast('Backup restored successfully');
      } catch (err) {
        this.showToast('Invalid JSON backup file');
      } finally {
        input.value = '';
      }
    });
  },

  async exportJSON() {
    const json = await OfflineDB.exportBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flashcards-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('Offline JSON backup exported');
  },

  triggerImport() {
    document.getElementById('import-json-input').click();
  },

  navigate(route) {
    this.state.route = route;
    document.querySelectorAll('.dock-item').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-route') === route);
    });
    const titles = {
      home: 'Dashboard',
      study: 'Study Session',
      create: 'New Flashcard',
      decks: 'Your Decks',
      stats: 'Mastery Stats'
    };
    document.getElementById('view-title').textContent = titles[route] || 'Flashcards';
    this.render();
  },

  studyAll() {
    this.state.selectedDeckId = null;
    this.navigate('study');
  },

  studyDeck(deckId) {
    this.state.selectedDeckId = deckId;
    this.navigate('study');
  },

  async deleteDeck(deckId) {
    const deckCards = this.state.cards.filter(c => c.deckId === deckId);
    for (const c of deckCards) {
      await OfflineDB.delete('cards', c.id);
    }
    await OfflineDB.delete('decks', deckId);
    if (this.state.selectedDeckId === deckId) {
      this.state.selectedDeckId = null;
    }
    await this.refreshData();
    this.render();
    this.showToast('Deck deleted');
  },

  getDueCards() {
    const { cards, selectedDeckId } = this.state;
    return cards
      .filter(c => (!selectedDeckId || c.deckId === selectedDeckId) && c.nextReview <= Date.now())
      .sort((a, b) => a.nextReview - b.nextReview);
  },

  async rateCard(cardId, qualityRating) {
    const card = this.state.cards.find(c => c.id === cardId);
    if (!card) return;
    const updated = OfflineDB.calculateSM2(card, qualityRating);
    await OfflineDB.put('cards', updated);
    await this.refreshData();
    this.render();
  },

  async handleCreateSubmit(e) {
    e.preventDefault();
    let deckId = document.getElementById('deck-select').value;
    const newDeckTitle = document.getElementById('new-deck-input').value.trim();
    const front = document.getElementById('card-front-input').value.trim();
    const back = document.getElementById('card-back-input').value.trim();

    if (newDeckTitle) {
      deckId = 'deck-' + Date.now();
      await OfflineDB.put('decks', {
        id: deckId,
        title: newDeckTitle,
        createdAt: Date.now()
      });
    }

    if (!deckId) {
      this.showToast('Please create or select a deck');
      return;
    }

    await OfflineDB.put('cards', {
      id: 'card-' + Date.now(),
      deckId,
      front,
      back,
      mastery: 0,
      repetitions: 0,
      intervalDays: 0,
      easeFactor: 2.5,
      nextReview: Date.now()
    });

    await this.refreshData();
    this.showToast('Flashcard saved offline');
    this.navigate('home');
  },

  render() {
    const viewport = document.getElementById('app-viewport');
    const { route, decks, cards, selectedDeckId, deckSearch } = this.state;

    if (route === 'home') {
      viewport.innerHTML = UI.renderHome(decks, cards);
    } else if (route === 'study') {
      const dueCards = this.getDueCards();
      const activeCard = dueCards[0] || null;
      const deckObj = activeCard ? decks.find(d => d.id === activeCard.deckId) : null;
      viewport.innerHTML = UI.renderStudy(
        activeCard,
        deckObj ? deckObj.title : 'All Decks',
        dueCards.length,
        Boolean(selectedDeckId)
      );
    } else if (route === 'create') {
      viewport.innerHTML = UI.renderCreate(decks);
      document.getElementById('create-card-form').addEventListener('submit', (e) => this.handleCreateSubmit(e));
    } else if (route === 'decks') {
      viewport.innerHTML = UI.renderDecks(decks, cards, deckSearch);
      const searchInput = document.getElementById('deck-search-input');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          this.state.deckSearch = e.target.value;
          const cursorPos = e.target.selectionStart;
          this.render();
          const refreshedInput = document.getElementById('deck-search-input');
          if (refreshedInput) {
            refreshedInput.focus();
            refreshedInput.setSelectionRange(cursorPos, cursorPos);
          }
        });
      }
    } else if (route === 'stats') {
      viewport.innerHTML = UI.renderStats(cards);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
```