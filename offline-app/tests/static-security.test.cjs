const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(appRoot, relative), 'utf8');

test('the app shell has a restrictive offline Content Security Policy', () => {
  const html = read('www/index.html');
  assert.match(html, /default-src\s+'none'/);
  assert.match(html, /script-src\s+'self'/);
  assert.match(html, /style-src\s+'self'/);
  assert.match(html, /connect-src\s+'none'/);
  assert.match(html, /object-src\s+'none'/);
});

test('the app does not load remote resources or make network requests', () => {
  const files = [
    'www/index.html',
    'www/css/styles.css',
    'www/js/model.js',
    'www/js/store.js',
    'www/js/app.js'
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /https?:\/\//i, 'remote URL in ' + file);
    assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\b|sendBeacon/, 'network API in ' + file);
  }
});

test('user content is not inserted as HTML and the shell has no inline handlers', () => {
  const scripts = ['www/js/model.js', 'www/js/store.js', 'www/js/app.js'];
  for (const file of scripts) {
    assert.doesNotMatch(read(file), /\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML|document\.write\s*\(|\beval\s*\(|new\s+Function\s*\(/, 'unsafe HTML/code sink in ' + file);
  }
  const html = read('www/index.html');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc\s*=)[^>]*>/i);
});

test('Android manifest does not request internet or backup permissions', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.doesNotMatch(manifest, /<uses-permission[^>]+android\.permission\.INTERNET/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
});

test('Android WebView loads only the bundled HTTPS app origin', () => {
  const java = read('android/app/src/main/java/app/flashcards/offline/MainActivity.java');
  assert.match(java, /WebViewAssetLoader/);
  assert.match(java, /setAllowFileAccess\(false\)/);
  assert.match(java, /setAllowContentAccess\(false\)/);
  assert.match(java, /shouldOverrideUrlLoading/);
  assert.match(java, /"https"\.equals\(target\.getScheme\(\)\)/);
  assert.match(java, /appassets\.androidplatform\.net/);
});
