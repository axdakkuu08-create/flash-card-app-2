/*
 * Flashcards Offline: IndexedDB storage. Everything stays on the device.
 * Every multi-record change runs in a single transaction so it is all-or-nothing.
 */
(function (root) {
  'use strict';

  var DB_NAME = 'FlashcardsOfflineDB';
  var DB_VERSION = 1;
  var db = null;

  function requestToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('Storage request failed.')); };
    });
  }

  /* Runs fn(transaction) and resolves only after the whole transaction commits. */
  function runTransaction(storeNames, mode, fn) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(storeNames, mode);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error || new Error('Storage transaction failed.')); };
      tx.onabort = function () { reject(tx.error || new Error('Storage transaction was aborted.')); };
      try {
        fn(tx);
      } catch (err) {
        try { tx.abort(); } catch (ignored) { /* already finished */ }
        reject(err);
      }
    });
  }

  function open() {
    if (!root.indexedDB) {
      return Promise.reject(new Error('This device does not support offline storage.'));
    }
    return new Promise(function (resolve, reject) {
      var request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var database = request.result;
        database.createObjectStore('decks', { keyPath: 'id' });
        var cards = database.createObjectStore('cards', { keyPath: 'id' });
        cards.createIndex('deckId', 'deckId', { unique: false });
        database.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onsuccess = function () {
        db = request.result;
        resolve();
      };
      request.onerror = function () {
        reject(request.error || new Error('The offline database could not be opened.'));
      };
    });
  }

  function loadAll() {
    var tx = db.transaction(['decks', 'cards'], 'readonly');
    var decksReq = tx.objectStore('decks').getAll();
    var cardsReq = tx.objectStore('cards').getAll();
    return Promise.all([requestToPromise(decksReq), requestToPromise(cardsReq)]).then(function (out) {
      return { decks: out[0], cards: out[1] };
    });
  }

  /* Seeds starter content exactly once, so deleting everything does not bring it back. */
  function ensureSeeded(now, seed) {
    var tx = db.transaction('meta', 'readonly');
    return requestToPromise(tx.objectStore('meta').get('seeded')).then(function (flag) {
      if (flag) return false;
      return runTransaction(['decks', 'cards', 'meta'], 'readwrite', function (write) {
        seed.decks.forEach(function (d) { write.objectStore('decks').put(d); });
        seed.cards.forEach(function (c) { write.objectStore('cards').put(c); });
        write.objectStore('meta').put({ key: 'seeded', value: now });
      }).then(function () { return true; });
    });
  }

  function replaceAll(decks, cards) {
    return runTransaction(['decks', 'cards'], 'readwrite', function (tx) {
      tx.objectStore('cards').clear();
      tx.objectStore('decks').clear();
      decks.forEach(function (d) { tx.objectStore('decks').put(d); });
      cards.forEach(function (c) { tx.objectStore('cards').put(c); });
    });
  }

  /* Saves a new card, and its deck when the deck is new, together. */
  function createCard(newDeck, card) {
    return runTransaction(['decks', 'cards'], 'readwrite', function (tx) {
      if (newDeck) tx.objectStore('decks').put(newDeck);
      tx.objectStore('cards').put(card);
    });
  }

  function putCard(card) {
    return runTransaction(['cards'], 'readwrite', function (tx) {
      tx.objectStore('cards').put(card);
    });
  }

  /* Deletes the deck and all of its cards in one transaction. */
  function deleteDeck(deckId) {
    return runTransaction(['decks', 'cards'], 'readwrite', function (tx) {
      var cursorReq = tx.objectStore('cards').index('deckId').openCursor(root.IDBKeyRange.only(deckId));
      cursorReq.onsuccess = function () {
        var cursor = cursorReq.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.objectStore('decks').delete(deckId);
    });
  }

  root.FCStore = {
    open: open,
    loadAll: loadAll,
    ensureSeeded: ensureSeeded,
    replaceAll: replaceAll,
    createCard: createCard,
    putCard: putCard,
    deleteDeck: deleteDeck
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
