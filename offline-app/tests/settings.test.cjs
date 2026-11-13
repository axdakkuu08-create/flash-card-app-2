const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const webRoot = path.join(__dirname, '..', 'www');
const html = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');
const settings = fs.readFileSync(path.join(webRoot, 'js', 'settings.js'), 'utf8');

test('Settings screen is included and reachable from the app header', () => {
  assert.match(html, /id="settings-toggle"/);
  assert.match(html, /id="settings-view"/);
  assert.match(html, /src="js\/settings\.js"/);
});

test('JSON backup actions are presented inside Settings', () => {
  const settingsMarkup = html.split('id="settings-view"')[1].split('</section>')[0];
  assert.match(settingsMarkup, /data-action="export"/);
  assert.match(settingsMarkup, /data-action="import"/);
  assert.match(settings, /backupCard\.hidden = true/);
  assert.match(settings, /aria-expanded/);
});

test('Settings UI keeps the existing delegated backup actions', () => {
  assert.match(html, /id="import-file"/);
  assert.match(settings, /settings\.hidden = !opening/);
  assert.match(settings, /appView\.hidden = opening/);
});
