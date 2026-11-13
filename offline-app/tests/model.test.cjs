'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const M = require(path.join(__dirname, '..', 'www', 'js', 'model.js'));

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 15, 12, 0, 0);

function card(overrides) {
  return Object.assign({
    id: 'card-t',
    deckId: 'deck-t',
    front: 'Q',
    back: 'A',
    createdAt: T0,
    reviewHistory: []
  }, M.freshSchedule(T0), overrides || {});
}

function backup(overrides) {
  return JSON.stringify(Object.assign({
    app: 'FlashcardsOffline',
    version: 2,
    exportedAt: new Date(T0).toISOString(),
    decks: [{ id: 'deck-1', title: 'Deck', createdAt: T0 }],
    cards: [{
      id: 'card-1', deckId: 'deck-1', front: 'Q', back: 'A',
      mastery: 0, repetitions: 0, intervalDays: 0, easeFactor: 2.5, nextReview: T0
    }]
  }, overrides || {}));
}

describe('SM-2 scheduling', () => {
  test('Hard resets repetitions, lowers ease by 0.2 and repeats in 2 minutes', () => {
    const r = M.applyRating(card({ repetitions: 4, intervalDays: 30, easeFactor: 2.5 }), 0, T0);
    assert.equal(r.repetitions, 0);
    assert.equal(r.intervalDays, 0);
    assert.equal(r.mastery, 0);
    assert.ok(Math.abs(r.easeFactor - 2.3) < 1e-9);
    assert.equal(r.nextReview, T0 + 2 * 60 * 1000);
  });

  test('Hard never drops ease below 1.3', () => {
    const r = M.applyRating(card({ easeFactor: 1.35 }), 0, T0);
    assert.equal(r.easeFactor, 1.3);
  });

  test('first Good is 1 day, first Easy is 3 days', () => {
    assert.equal(M.applyRating(card(), 1, T0).intervalDays, 1);
    assert.equal(M.applyRating(card(), 2, T0).intervalDays, 3);
  });

  test('second review: Good 3 days, Easy 6 days', () => {
    const base = card({ repetitions: 1, intervalDays: 1 });
    assert.equal(M.applyRating(base, 1, T0).intervalDays, 3);
    assert.equal(M.applyRating(base, 2, T0).intervalDays, 6);
  });

  test('later reviews multiply by ease; Easy adds 1.3 and raises ease by 0.15', () => {
    const base = card({ repetitions: 3, intervalDays: 10, easeFactor: 2.0 });
    const good = M.applyRating(base, 1, T0);
    assert.equal(good.intervalDays, 20);
    assert.equal(good.easeFactor, 2.0);
    const easy = M.applyRating(base, 2, T0);
    assert.equal(easy.intervalDays, 26);
    assert.ok(Math.abs(easy.easeFactor - 2.15) < 1e-9);
  });

  test('mastery becomes 2 on Easy or after two repetitions', () => {
    assert.equal(M.applyRating(card(), 1, T0).mastery, 1);
    assert.equal(M.applyRating(card(), 2, T0).mastery, 2);
    assert.equal(M.applyRating(card({ repetitions: 1, intervalDays: 1 }), 1, T0).mastery, 2);
  });

  test('intervals are clamped to the maximum and never below 1 day after a pass', () => {
    const huge = M.applyRating(card({ repetitions: 9, intervalDays: 36000, easeFactor: 5 }), 2, T0);
    assert.equal(huge.intervalDays, 36500);
  });

  test('applyRating does not mutate its input and records history', () => {
    const input = card();
    const out = M.applyRating(input, 1, T0);
    assert.equal(input.repetitions, 0);
    assert.equal(out.reviewHistory.length, 1);
    assert.equal(out.reviewHistory[0].rating, 1);
  });

  test('history is capped at the configured limit', () => {
    let c = card();
    for (let i = 0; i < M.LIMITS.history + 25; i++) c = M.applyRating(c, 1, T0 + i);
    assert.equal(c.reviewHistory.length, M.LIMITS.history);
  });

  test('unknown ratings are rejected', () => {
    assert.throws(() => M.applyRating(card(), 3, T0), /Unknown rating/);
  });
});

describe('calendar arithmetic and streaks', () => {
  test('addDays keeps local wall-clock time across a DST change', () => {
    // Run with TZ=America/New_York in the test below; here we only check plain addition.
    const start = new Date(2026, 2, 6, 9, 30).getTime();
    const later = new Date(M.addDays(start, 2));
    assert.equal(later.getDate(), 8);
    assert.equal(later.getHours(), 9);
    assert.equal(later.getMinutes(), 30);
  });

  test('streaks count consecutive local days, including across spring-forward (TZ=America/New_York)', () => {
    const out = execFileSync(process.execPath, ['-e', `
      const M = require(${JSON.stringify(path.join(__dirname, '..', 'www', 'js', 'model.js'))});
      const at = (y, mo, d, h) => new Date(y, mo, d, h, 0, 0).getTime();
      const cards = [{ id: 'a', reviewHistory: [
        { reviewedAt: at(2026, 2, 7, 10) }, { reviewedAt: at(2026, 2, 8, 10) }, { reviewedAt: at(2026, 2, 9, 10) }
      ] }];
      const now = at(2026, 2, 9, 12);
      const s = M.streaks(cards, now);
      console.log(JSON.stringify(s));
    `], { env: Object.assign({}, process.env, { TZ: 'America/New_York' }), encoding: 'utf8' });
    const s = JSON.parse(out.trim());
    assert.equal(s.longest, 3, 'a 3-day run across the DST gap must count as 3 days');
    assert.equal(s.current, 3);
  });

  test('current streak is 0 when the last review is older than yesterday', () => {
    const now = new Date(2026, 5, 10, 12).getTime();
    const cards = [{ reviewHistory: [{ reviewedAt: new Date(2026, 5, 5, 12).getTime() }] }];
    assert.deepEqual(M.streaks(cards, now), { current: 0, longest: 1 });
  });
});

describe('dueCards and stats', () => {
  test('dueCards returns only due cards, earliest first', () => {
    const cards = [
      card({ id: 'late', nextReview: T0 - 1 }),
      card({ id: 'future', nextReview: T0 + DAY }),
      card({ id: 'early', nextReview: T0 - 5 }),
      card({ id: 'other', deckId: 'deck-x', nextReview: T0 - 9 })
    ];
    assert.deepEqual(M.dueCards(cards, T0, 'deck-t').map(c => c.id), ['early', 'late']);
    assert.equal(M.dueCards(cards, T0, null).length, 3);
  });

  test('stats report totals, mastery and per-deck breakdown', () => {
    const decks = [{ id: 'deck-t', title: 'T' }];
    const cards = [
      card({ id: 'a', mastery: 2, nextReview: T0 + DAY, reviewHistory: [{ reviewedAt: T0 - DAY }] }),
      card({ id: 'b', mastery: 1, nextReview: T0 - 1 }),
      card({ id: 'c', mastery: 0, nextReview: T0 + DAY, reviewHistory: [{ reviewedAt: T0 - 30 * DAY }] })
    ];
    const s = M.stats(decks, cards, T0);
    assert.equal(s.totalCards, 3);
    assert.equal(s.mastered, 1);
    assert.equal(s.learning, 1);
    assert.equal(s.needsReview, 1);
    assert.equal(s.masteryPercent, 33);
    assert.equal(s.due, 1);
    assert.equal(s.reviewsTotal, 2);
    assert.equal(s.reviewsLast7Days, 1);
    assert.equal(s.perDeck[0].total, 3);
  });

  test('stats handle an empty library without dividing by zero', () => {
    const s = M.stats([], [], T0);
    assert.equal(s.masteryPercent, 0);
    assert.equal(s.totalCards, 0);
  });
});

describe('backup parsing and validation', () => {
  test('accepts a valid version 2 backup and normalises it', () => {
    const out = M.parseBackup(backup());
    assert.equal(out.decks.length, 1);
    assert.equal(out.cards[0].reviewHistory.length, 0);
    assert.equal(out.cards[0].createdAt, T0);
  });

  test('accepts version 3 backups produced by the grok server lineage', () => {
    const out = M.parseBackup(backup({ version: 3, initialized: true }));
    assert.equal(out.cards.length, 1);
  });

  test('round-trips an export through import', () => {
    const seed = M.seedData(T0);
    const text = M.serializeBackup(seed.decks, seed.cards, T0);
    const back = M.parseBackup(text);
    assert.equal(back.decks[0].title, 'Getting started');
    assert.equal(back.cards.length, 2);
  });

  test('rejects other apps and unsupported versions', () => {
    assert.throws(() => M.parseBackup(backup({ app: 'Other' })), /Choose a Flashcards Offline/);
    assert.throws(() => M.parseBackup(backup({ version: 1 })), /Choose a Flashcards Offline/);
  });

  test('rejects invalid JSON and oversized files', () => {
    assert.throws(() => M.parseBackup('{nope'), /not valid JSON/);
    assert.throws(() => M.parseBackup('x'.repeat(M.LIMITS.backupChars + 1)), /larger than 2 MB/);
  });

  test('rejects ids that could break out of an HTML or JS context', () => {
    const evil = `x');alert(1);('`;
    assert.throws(() => M.parseBackup(backup({ decks: [{ id: evil, title: 'T' }], cards: [] })), /invalid id/);
    const cardEvil = backup();
    const obj = JSON.parse(cardEvil);
    obj.cards[0].id = '"><img src=x onerror=alert(1)>';
    assert.throws(() => M.parseBackup(JSON.stringify(obj)), /invalid id/);
  });

  test('rejects cards that reference a missing deck', () => {
    assert.throws(() => M.parseBackup(backup({
      cards: [{ id: 'c1', deckId: 'nope', front: 'Q', back: 'A', mastery: 0, repetitions: 0, intervalDays: 0, easeFactor: 2.5, nextReview: T0 }]
    })), /not in the backup/);
  });

  test('rejects non-finite and out-of-range numbers (Infinity would silently reset schedules)', () => {
    const obj = JSON.parse(backup());
    obj.cards[0].intervalDays = null;
    assert.throws(() => M.parseBackup(JSON.stringify(obj)), /invalid interval/);
    const obj2 = JSON.parse(backup());
    obj2.cards[0].easeFactor = 1e400;
    assert.throws(() => M.parseBackup(JSON.stringify(obj2)), /invalid ease/);
    const obj3 = JSON.parse(backup());
    obj3.cards[0].mastery = 7;
    assert.throws(() => M.parseBackup(JSON.stringify(obj3)), /invalid mastery/);
  });

  test('rejects empty and oversized text fields', () => {
    assert.throws(() => M.parseBackup(backup({ decks: [{ id: 'd', title: '   ' }], cards: [] })), /is empty/);
    assert.throws(() => M.parseBackup(backup({
      decks: [{ id: 'd', title: 'x'.repeat(M.LIMITS.title + 1) }], cards: []
    })), /longer than/);
  });

  test('rejects duplicate ids', () => {
    const obj = JSON.parse(backup());
    obj.cards.push(Object.assign({}, obj.cards[0]));
    assert.throws(() => M.parseBackup(JSON.stringify(obj)), /repeats an existing card id/);
  });

  test('drops unknown keys from accepted records', () => {
    const obj = JSON.parse(backup());
    obj.cards[0].extra = '<script>';
    const out = M.parseBackup(JSON.stringify(obj));
    assert.equal(Object.prototype.hasOwnProperty.call(out.cards[0], 'extra'), false);
  });

  test('errors never echo user content back', () => {
    try {
      M.parseBackup(backup({ decks: [{ id: '<b>bad</b>', title: 'T' }], cards: [] }));
      assert.fail('expected a throw');
    } catch (err) {
      assert.equal(err.message.includes('<b>'), false);
    }
  });
});

describe('ids and labels', () => {
  test('makeId produces ids that pass the backup id rule', () => {
    for (let i = 0; i < 20; i++) {
      const id = M.makeId('card');
      assert.match(id, /^[A-Za-z0-9_-]{1,64}$/);
    }
  });

  test('intervalLabel formats minutes, hours and days', () => {
    assert.equal(M.intervalLabel(2 * 60 * 1000), '2 min');
    assert.equal(M.intervalLabel(3 * 60 * 60 * 1000), '3 h');
    assert.equal(M.intervalLabel(DAY), '1 day');
    assert.equal(M.intervalLabel(6 * DAY), '6 days');
  });

  test('previewLabel shows the Hard delay', () => {
    assert.equal(M.previewLabel(card(), 0, T0), '2 min');
  });
});
