# Flashcard App

## Build an Android APK

This repository stores the flashcard project in ZIP archives. GitHub Actions extracts the preferred archive and attempts to build a debug Android APK.

1. Open the repository's **Actions** tab: https://github.com/axdakkuu08-create/flash-card-app-2/actions
2. Select **Build Android APK**.
3. Tap **Run workflow**, keep the branch as `main`, then confirm.
4. Wait for the workflow to finish. Open the successful run and find **Artifacts**.
5. Download **Flashcards-Android-APK** and extract the downloaded ZIP to get `Flashcards-debug.apk`.

The workflow checks archives in this order:
- `js-flashcards-offline-admin-12.zip`
- `js-flashcards-fixed.zip`
- `js-flashcards.zip`

It supports an existing Android Gradle project, or wraps a static HTML/JavaScript project in a Capacitor Android app. The first run can take several minutes because Android build dependencies must be downloaded.

## Important notes

- The APK produced by this workflow is a **debug APK** for testing and direct installation; it is not a signed Play Store release.
- A successful workflow run is required before an APK artifact exists.
- If a build fails, open the run and expand **Build APK** or **Inspect and extract project archive** to see the exact error and the files detected in the selected ZIP.
