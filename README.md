# Flashcards Android (Vanilla UI)

A lightweight, offline-first Android WebView flashcard app. The interface uses plain HTML, CSS and vanilla JavaScript; React and ReactDOM vendor bundles have been removed.

## Features
- Smooth card flip, previous/next navigation, shuffle and reviewed progress
- Responsive, accessible mobile-first interface
- Offline custom decks from pasted notes
- Local deck storage and JSON backup import/export
- Android APK build workflow in `.github/workflows/build-apk.yml`

## Build
Run the **Build Android APK** GitHub Actions workflow. The generated APK is published as a workflow artifact.

Default sample cards cover core JavaScript concepts. Custom decks remain on the device unless exported.
