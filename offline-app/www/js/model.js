/*
 * Flashcards Offline: pure logic. No DOM and no network.
 * Loaded as a classic script in the WebView and required by the Node tests.
 *
 * Backup format (compatible with the v2.0 blueprint and the Expo app):
 *   { app: "FlashcardsOffline", version: 2, exportedAt, decks: [...], cards: [...] }
 */
(function (root) {
  'use strict';

  var APP_NAME = 'FlashcardsOffline';
  var EXPORT_VERSION = 4;
  var ACCEPTED_VERSIONS = [2, 3, 4];

  var DAY_MS = 24 * 60 * 60 * 1000;
  var HARD_DELAY_MS = 2 * 60 * 1000;
  var MIN_EASE = 1.3;
  var MAX_EASE = 5;
  var START_EASE = 2.5;
  var MAX_INTERVAL_DAYS = 36500;
  var MAX_TIME_MS = 8.64e15;
  var MAX_REPETITIONS = 100000;

  var LIMITS = {
    backupChars: 2 * 1024 * 1024,
    decks: 200,
    cards: 5000,
    history: 200,
    title: 120,
    text: 10000,
    tags: 20,
    tag: 40
  };

  var ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

  function isRecord(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
  }

  function isFiniteNumber(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function isInteger(v, min, max) {
    return isFiniteNumber(v) && Math.floor(v) === v && v >= min && v <= max;
  }

  function randomHex(byteCount) {
    var cryptoObj = root.crypto;
    if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
      throw new Error('Secure random numbers are not available on this device.');
    }
    var bytes = new Uint8Array(byteCount);
    cryptoObj.getRandomValues(bytes);
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      out += ('0' + bytes[i].toString(16)).slice(-2);
    }
    return out;
  }

  function makeId(prefix) {
    return prefix + '-' + randomHex(8);
  }

  /* Calendar arithmetic. Adding days through Date keeps local wall-clock time across DST changes. */
  function addDays(ts, days) {
    var d = new Date(ts);
    d.setDate(d.getDate() + days);
    return d.getTime();
  }

  /* Integer local calendar-day index. Differences of 1 mean "the next local day" even across DST. */
  function dayIndex(ts) {
    var d = new Date(ts);
    return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
  }

  function freshSchedule(now) {
    return {
      mastery: 0,
      repetitions: 0,
      intervalDays: 0,
      easeFactor: START_EASE,
      nextReview: now
    };
  }

  /* rating: 0 = Hard, 1 = Good, 2 = Easy. Returns a new card object; the input is not changed. */
  function applyRating(card, rating, now) {
    if (rating !== 0 && rating !== 1 && rating !== 2) {
      throw new Error('Unknown rating.');
    }
    var reps = card.repetitions;
    var interval = card.intervalDays;
    var ease = card.easeFactor;
    var mastery;
    var next;

    if (rating === 0) {
      reps = 0;
      interval = 0;
      ease = Math.max(MIN_EASE, ease - 0.2);
      mastery = 0;
      next = now + HARD_DELAY_MS;
    } else {
      var easy = rating === 2;
      if (reps === 0) {
        interval = easy ? 3 : 1;
      } else if (reps === 1) {
        interval = easy ? 6 : 3;
      } else {
        interval = Math.round(interval * ease * (easy ? 1.3 : 1));
      }
      interval = Math.min(MAX_INTERVAL_DAYS, Math.max(1, interval));
      reps += 1;
      if (easy) {
        ease = Math.min(MAX_EASE, ease + 0.15);
      }
      ease = Math.max(MIN_EASE, ease);
      mastery = easy || reps >= 2 ? 2 : 1;
      next = addDays(now, interval);
    }

    var history = (card.reviewHistory || []).concat([{
      reviewedAt: now,
      rating: rating,
      intervalDays: interval,
      nextReview: next
    }]);
    if (history.length > LIMITS.history) {
      history = history.slice(history.length - LIMITS.history);
    }

    return Object.assign({}, card, {
      mastery: mastery,
      repetitions: reps,
      intervalDays: interval,
      easeFactor: ease,
      nextReview: next,
      reviewHistory: history
    });
  }

  function intervalLabel(ms) {
    if (ms < 60 * 60 * 1000) {
      return Math.max(1, Math.round(ms / 60000)) + ' min';
    }
    if (ms < DAY_MS) {
      return Math.round(ms / (60 * 60 * 1000)) + ' h';
    }
    var days = Math.round(ms / DAY_MS);
    return days + (days === 1 ? ' day' : ' days');
  }

  function previewLabel(card, rating, now) {
    return intervalLabel(applyRating(card, rating, now).nextReview - now);
  }

  function dueCards(cards, now, deckId) {
    return cards
      .filter(function (c) {
        return (!deckId || c.deckId === deckId) && c.nextReview <= now;
      })
      .sort(function (a, b) {
        if (a.nextReview !== b.nextReview) return a.nextReview - b.nextReview;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
  }

  function streaks(cards, now) {
    var reviewed = {};
    cards.forEach(function (c) {
      (c.reviewHistory || []).forEach(function (r) {
        reviewed[dayIndex(r.reviewedAt)] = true;
      });
    });

    var days = Object.keys(reviewed).map(Number).sort(function (a, b) { return a - b; });
    var longest = 0;
    var run = 0;
    for (var i = 0; i < days.length; i++) {
      run = i > 0 && days[i] - days[i - 1] === 1 ? run + 1 : 1;
      if (run > longest) longest = run;
    }

    var today = dayIndex(now);
    var cursor = reviewed[today] ? today : today - 1;
    var current = 0;
    while (reviewed[cursor]) {
      current += 1;
      cursor -= 1;
    }

    return { current: current, longest: longest };
  }

  function stats(decks, cards, now) {
    var mastered = 0;
    var learning = 0;
    var needsReview = 0;
    var reviewsTotal = 0;
    var reviewsLast7Days = 0;
    var weekAgo = now - 7 * DAY_MS;

    cards.forEach(function (c) {
      if (c.mastery >= 2) mastered += 1;
      else if (c.mastery === 1) learning += 1;
      else needsReview += 1;
      (c.reviewHistory || []).forEach(function (r) {
        reviewsTotal += 1;
        if (r.reviewedAt >= weekAgo) reviewsLast7Days += 1;
      });
    });

    var perDeck = decks.map(function (d) {
      var inDeck = cards.filter(function (c) { return c.deckId === d.id; });
      var deckMastered = inDeck.filter(function (c) { return c.mastery >= 2; }).length;
      return {
        id: d.id,
        title: d.title,
        total: inDeck.length,
        due: dueCards(inDeck, now, null).length,
        mastered: deckMastered,
        masteryPercent: inDeck.length ? Math.round((deckMastered / inDeck.length) * 100) : 0
      };
    });

    var s = streaks(cards, now);
    return {
      totalCards: cards.length,
      deckCount: decks.length,
      due: dueCards(cards, now, null).length,
      masteryPercent: cards.length ? Math.round((mastered / cards.length) * 100) : 0,
      mastered: mastered,
      learning: learning,
      needsReview: needsReview,
      reviewsTotal: reviewsTotal,
      reviewsLast7Days: reviewsLast7Days,
      streakCurrent: s.current,
      streakLongest: s.longest,
      perDeck: perDeck
    };
  }

  function normalizeTags(raw) {
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw) || raw.length > LIMITS.tags) throw new Error('Card tags are invalid.');
    var seen = {};
    var out = [];
    raw.forEach(function (tag) {
      var value = checkText(tag, 'Tag', LIMITS.tag);
      var key = value.toLocaleLowerCase();
      if (!seen[key]) { seen[key] = true; out.push(value); }
    });
    return out;
  }

  function checkText(value, label, max) {
    if (typeof value !== 'string') {
      throw new Error(label + ' must be text.');
    }
    var trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new Error(label + ' is empty.');
    }
    if (trimmed.length > max) {
      throw new Error(label + ' is longer than ' + max + ' characters.');
    }
    return trimmed;
  }

  function checkId(value, label) {
    if (typeof value !== 'string' || !ID_RE.test(value)) {
      throw new Error(label + ' has an invalid id.');
    }
    return value;
  }

  function checkTime(value, label) {
    if (!isFiniteNumber(value) || value < 0 || value > MAX_TIME_MS) {
      throw new Error(label + ' has an invalid date.');
    }
    return value;
  }

  function parseBackup(text) {
    if (typeof text !== 'string') {
      throw new Error('The file could not be read.');
    }
    if (text.length > LIMITS.backupChars) {
      throw new Error('This backup file is larger than 2 MB.');
    }

    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error('That file is not valid JSON.');
    }

    if (!isRecord(parsed) || parsed.app !== APP_NAME || ACCEPTED_VERSIONS.indexOf(parsed.version) === -1) {
      throw new Error('Choose a Flashcards Offline backup (version 2, 3 or 4).');
    }
    if (!Array.isArray(parsed.decks) || !Array.isArray(parsed.cards)) {
      throw new Error('The backup is missing its decks or cards.');
    }
    if (parsed.decks.length > LIMITS.decks) {
      throw new Error('The backup has more than ' + LIMITS.decks + ' decks.');
    }
    if (parsed.cards.length > LIMITS.cards) {
      throw new Error('The backup has more than ' + LIMITS.cards + ' cards.');
    }

    var deckIds = {};
    var decks = parsed.decks.map(function (d, i) {
      var label = 'Deck ' + (i + 1);
      if (!isRecord(d)) throw new Error(label + ' is malformed.');
      var id = checkId(d.id, label);
      if (deckIds[id]) throw new Error(label + ' repeats an existing deck id.');
      deckIds[id] = true;
      return {
        id: id,
        title: checkText(d.title, label + ' title', LIMITS.title),
        createdAt: d.createdAt === undefined ? 0 : checkTime(d.createdAt, label)
      };
    });

    var cardIds = {};
    var cards = parsed.cards.map(function (c, i) {
      var label = 'Card ' + (i + 1);
      if (!isRecord(c)) throw new Error(label + ' is malformed.');
      var id = checkId(c.id, label);
      if (cardIds[id]) throw new Error(label + ' repeats an existing card id.');
      cardIds[id] = true;

      var deckId = checkId(c.deckId, label + ' deck');
      if (!deckIds[deckId]) throw new Error(label + ' refers to a deck that is not in the backup.');

      if (!isInteger(c.mastery, 0, 2)) throw new Error(label + ' has an invalid mastery value.');
      if (!isInteger(c.repetitions, 0, MAX_REPETITIONS)) throw new Error(label + ' has invalid repetitions.');
      if (!isInteger(c.intervalDays, 0, MAX_INTERVAL_DAYS)) throw new Error(label + ' has an invalid interval.');
      if (!isFiniteNumber(c.easeFactor) || c.easeFactor < MIN_EASE || c.easeFactor > MAX_EASE) {
        throw new Error(label + ' has an invalid ease factor.');
      }

      var nextReview = checkTime(c.nextReview, label);
      var createdAt = c.createdAt === undefined ? nextReview : checkTime(c.createdAt, label);

      var rawHistory = c.reviewHistory === undefined ? [] : c.reviewHistory;
      if (!Array.isArray(rawHistory) || rawHistory.length > LIMITS.history) {
        throw new Error(label + ' has an invalid review history.');
      }
      var reviewHistory = rawHistory.map(function (r) {
        if (!isRecord(r)) throw new Error(label + ' has a malformed review.');
        if (!isInteger(r.rating, 0, 2)) throw new Error(label + ' has an invalid review rating.');
        if (!isInteger(r.intervalDays, 0, MAX_INTERVAL_DAYS)) throw new Error(label + ' has an invalid review interval.');
        return {
          reviewedAt: checkTime(r.reviewedAt, label + ' review'),
          rating: r.rating,
          intervalDays: r.intervalDays,
          nextReview: checkTime(r.nextReview, label + ' review')
        };
      });

      return {
        id: id,
        deckId: deckId,
        front: checkText(c.front, label + ' question', LIMITS.text),
        back: checkText(c.back, label + ' answer', LIMITS.text),
        mastery: c.mastery,
        repetitions: c.repetitions,
        intervalDays: c.intervalDays,
        easeFactor: c.easeFactor,
        nextReview: nextReview,
        createdAt: createdAt,
        reviewHistory: reviewHistory,
        tags: normalizeTags(c.tags)
      };
    });

    return { decks: decks, cards: cards };
  }

  function serializeBackup(decks, cards, now) {
    return JSON.stringify({
      app: APP_NAME,
      version: EXPORT_VERSION,
      exportedAt: new Date(now).toISOString(),
      decks: decks,
      cards: cards.map(function (card) { return Object.assign({}, card, { tags: normalizeTags(card.tags) }); })
    }, null, 2);
  }

  function seedData(now) {
    var deck = { id: 'deck-starter', title: 'Getting started', createdAt: now };
    var cards = [
      {
        id: 'card-starter-1',
        deckId: deck.id,
        front: 'What does "Hard" do?',
        back: 'It shows the card again in 2 minutes and lowers how quickly its interval grows.',
        createdAt: now,
        reviewHistory: []
      },
      {
        id: 'card-starter-2',
        deckId: deck.id,
        front: 'What does "Easy" do?',
        back: 'It makes the next interval longer than "Good" does.',
        createdAt: now,
        reviewHistory: []
      }
    ].map(function (c) {
      return Object.assign(c, freshSchedule(now));
    });
    return { decks: [deck], cards: cards };
  }

  var api = {
    APP_NAME: APP_NAME,
    EXPORT_VERSION: EXPORT_VERSION,
    LIMITS: LIMITS,
    makeId: makeId,
    normalizeTags: normalizeTags,
    addDays: addDays,
    dayIndex: dayIndex,
    freshSchedule: freshSchedule,
    applyRating: applyRating,
    previewLabel: previewLabel,
    intervalLabel: intervalLabel,
    dueCards: dueCards,
    streaks: streaks,
    stats: stats,
    parseBackup: parseBackup,
    serializeBackup: serializeBackup,
    seedData: seedData
  };

  root.FCModel = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
