# Flashcards Offline (Android)

A standalone, offline-first flashcard app for personal use. Flashcards stay on the device. There is no account, server, sync service, analytics, or internet permission.

## Features

- Dashboard with due-card count, mastery, and review progress
- Deck creation through card creation, deck search, and deck deletion with card cascade
- Flashcard study with flip interaction and Hard / Good / Easy SM-2 scheduling
- Local review history, streaks, and per-deck progress
- JSON backup export and confirmed restore
- Backup export format FlashcardsOffline version 2; imports versions 2 and 3

## Project layout

- www/: HTML, CSS, and JavaScript app; no npm dependencies or build step
- www/js/model.js: scheduling, statistics, calendar arithmetic, and backup validation
- www/js/store.js: IndexedDB persistence and atomic multi-record changes
- www/js/app.js: user interface and actions
- android/: Android WebView shell and Gradle project
- tests/: Node unit tests and static security checks

## Test

Requires Node 18 or newer. From this directory:

    node --test tests/*.test.cjs

## Build the debug APK

The repository workflow is **Standalone Offline Android APK**. It runs the tests, builds the Android project, verifies the APK signature, and uploads flashcards-offline.apk as an Actions artifact. GitHub downloads Actions artifacts as ZIP files; extract the APK from the downloaded artifact.

Locally, use JDK 17, Android SDK platform 35, build-tools 35.0.0, and Gradle 8.14.3:

    gradle -p android clean assembleDebug

The Gradle copyWww task bundles the current www/ app into the APK assets before each build.

## Local data and backups

IndexedDB database: FlashcardsOfflineDB, served from the app's https://appassets.androidplatform.net origin. The Android app has no INTERNET permission. Data remains local unless the user explicitly exports a backup.

Imports are size-limited and validated field by field before confirmation. A restore replaces the deck and card stores in one IndexedDB transaction. Rejected or cancelled imports do not change the current library.

## Security boundaries

- No remote scripts, styles, images, or network requests
- Strict Content Security Policy; no inline script or style
- User text is inserted with textContent / text nodes, never parsed as HTML
- Imported identifiers are constrained; backup records are validated and bounded
- Android WebView uses WebViewAssetLoader and only allows navigation to the HTTPS app-assets origin/path
- File/content access is disabled; the native JavaScript bridge exposes only backup export
- Export files are shared from a restricted cache directory through FileProvider
- Android backup and cleartext traffic are disabled

## Verification status

- 31 model tests passed in the supplied archive.
- 5 repository static security tests were added and passed locally.
- The previous scratchpad run reported 23 browser checks passing, but its Playwright harness is not included here; those checks are not yet reproducible in CI.
- Android SDK/Gradle build and APK signature verification must pass in GitHub Actions.
- Physical installation, IndexedDB persistence after force-stop/restart, import/export, and UI behavior still require testing on the target Android phone.

This is a debug build, not a signed production release.
