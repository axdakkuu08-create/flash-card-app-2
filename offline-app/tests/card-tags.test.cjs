'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const M = require(path.join(__dirname, '..', 'www', 'js', 'model.js'));

describe('card tags and backup v4 compatibility', () => {
  const base = { app:'FlashcardsOffline', version:2, decks:[{id:'deck-1',title:'Deck'}],
    cards:[{id:'card-1',deckId:'deck-1',front:'Q',back:'A',mastery:0,repetitions:0,intervalDays:0,easeFactor:2.5,nextReview:1000}] };
  test('normalizes tags and deduplicates case-insensitively', () => {
    assert.deepEqual(M.normalizeTags([' Biology ', 'biology', 'Plants']), ['Biology','Plants']);
  });
  test('accepts legacy v2 and v3 backups and adds empty tags', () => {
    [2,3].forEach(version => assert.deepEqual(M.parseBackup(JSON.stringify({...base,version})).cards[0].tags, []));
  });
  test('round-trips v4 tags', () => {
    const parsed=M.parseBackup(JSON.stringify({...base,version:4,cards:[{...base.cards[0],tags:['A','a','B']}]}));
    assert.deepEqual(parsed.cards[0].tags,['A','B']);
    const exported=JSON.parse(M.serializeBackup(parsed.decks,parsed.cards,1000));
    assert.equal(exported.version,4);
    assert.deepEqual(exported.cards[0].tags,['A','B']);
  });
  test('rejects excessive, oversized and blank tags', () => {
    assert.throws(()=>M.normalizeTags(Array(21).fill('x')),/invalid/);
    assert.throws(()=>M.normalizeTags(['x'.repeat(41)]),/longer/);
    assert.throws(()=>M.normalizeTags(['  ']),/empty/);
  });
  test('IndexedDB migration and CSV UI retain transactional and offline boundaries', () => {
    const store=fs.readFileSync(path.join(__dirname,'..','www','js','store.js'),'utf8');
    const ui=fs.readFileSync(path.join(__dirname,'..','www','js','csv-import-ui.js'),'utf8');
    assert.match(store,/var DB_VERSION = 2/);
    assert.match(store,/createIndex\('tags'.*multiEntry: true/);
    assert.match(store,/function importCards/);
    assert.match(store,/runTransaction\(\['decks', 'cards'\], 'readwrite'/);
    assert.match(ui,/FCCsvParser/);
    assert.match(ui,/Select all valid/);
    assert.match(ui,/Apply to selected/);
    assert.doesNotMatch(ui,/fetch\(|XMLHttpRequest|WebSocket/);
  });
});
