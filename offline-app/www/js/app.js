/*
 * Flashcards Offline: UI. Builds DOM with createElement and textContent only,
 * so user text is never parsed as HTML. Actions use delegated data-action attributes
 * (no inline handlers), which keeps the page compatible with a strict CSP.
 */
(function (root) {
  'use strict';

  var M = root.FCModel;
  var S = root.FCStore;

  var state = {
    route: 'home',
    deckFilter: null,
    deckSearch: '',
    decks: [],
    cards: [],
    flipped: false,
    busy: false,
    pendingConfirm: null
  };

  var ROUTE_TITLES = {
    home: 'Dashboard',
    study: 'Study',
    create: 'New card',
    decks: 'Decks',
    stats: 'Progress'
  };

  function $(id) { return document.getElementById(id); }

  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === undefined || value === null || value === false) return;
        if (key === 'className') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'value' && 'value' in node) node.value = value;
        else if (value === true) node.setAttribute(key, '');
        else node.setAttribute(key, String(value));
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function box(className, children) {
    return el('section', { className: 'card ' + (className || '') }, children);
  }

  function label(text) { return el('p', { className: 'label', text: text }); }
  function value(text) { return el('p', { className: 'value', text: text }); }
  function sub(text) { return el('p', { className: 'sub', text: text }); }

  function button(text, attrs, className) {
    var base = { type: 'button', className: 'btn ' + (className || 'secondary') };
    Object.keys(attrs || {}).forEach(function (k) { base[k] = attrs[k]; });
    base.text = text;
    return el('button', base);
  }

  function toast(message) {
    var node = $('toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { node.classList.remove('show'); }, 2800);
  }

  function refresh() {
    return S.loadAll().then(function (all) {
      state.decks = all.decks;
      state.cards = all.cards;
    });
  }

  function deckTitle(deckId) {
    var deck = state.decks.filter(function (d) { return d.id === deckId; })[0];
    return deck ? deck.title : 'Deleted deck';
  }

  /* ---------- Views ---------- */

  function viewHome(now) {
    var s = M.stats(state.decks, state.cards, now);
    return el('div', { className: 'stack' }, [
      el('div', { className: 'grid2' }, [
        box('', [label('Total cards'), value(String(s.totalCards)), sub(plural(s.deckCount, 'deck'))]),
        box('', [label('Due now'), value(String(s.due)), sub('Ready to review')]),
        box('span2', [
          label('Mastery'),
          value(s.masteryPercent + '%'),
          sub(s.mastered + ' of ' + s.totalCards + ' cards mastered'),
          button('Start study session', { 'data-action': 'study-all' }, 'primary wide')
        ]),
        box('span2', [
          label('Backup'),
          sub('Export or restore your data as a JSON file. Nothing is sent over the network.'),
          el('div', { className: 'row2' }, [
            button('Export backup', { 'data-action': 'export' }),
            button('Import backup', { 'data-action': 'import' })
          ])
        ])
      ])
    ]);
  }

  function viewStudy(now) {
    var queue = M.dueCards(state.cards, now, state.deckFilter);
    var current = queue[0];

    if (!current) {
      var actions = [button('Add a new card', { 'data-route': 'create' }, 'primary wide')];
      if (state.deckFilter) {
        actions.unshift(button('Study all decks', { 'data-action': 'study-all' }, 'wide'));
      }
      return box('center', [
        el('h2', { className: 'empty-title', text: 'All caught up' }),
        sub('No cards are due in this queue.'),
        el('div', { className: 'stack' }, actions)
      ]);
    }

    var ratings = [
      { rating: 0, name: 'Hard', cls: 'hard' },
      { rating: 1, name: 'Good', cls: 'good' },
      { rating: 2, name: 'Easy', cls: 'easy' }
    ];

    return el('div', { className: 'stack' }, [
      el('div', { className: 'study-meta' }, [
        el('span', { text: 'Deck: ' + deckTitle(current.deckId) }),
        el('span', { text: queue.length + ' due' })
      ]),
      el('div', {
        className: 'flashcard' + (state.flipped ? ' flipped' : ''),
        role: 'button',
        tabindex: '0',
        'data-action': 'flip',
        'aria-label': state.flipped ? 'Showing answer. Activate to show question.' : 'Showing question. Activate to show answer.'
      }, [
        el('div', { className: 'face front' }, [
          el('span', { className: 'tag', text: 'Question' }),
          el('p', { className: 'face-text', text: current.front })
        ]),
        el('div', { className: 'face back' }, [
          el('span', { className: 'tag', text: 'Answer' }),
          el('p', { className: 'face-text', text: current.back })
        ])
      ]),
      el('p', { className: 'hint', text: 'Tap the card or press Space to flip. Press 1, 2 or 3 to rate.' }),
      el('div', { className: 'rating-row' }, ratings.map(function (r) {
        return el('button', {
          type: 'button',
          className: 'rate ' + r.cls,
          'data-action': 'rate',
          'data-rating': String(r.rating)
        }, [
          el('span', { className: 'rate-name', text: r.name }),
          el('small', { text: 'Next: ' + M.previewLabel(current, r.rating, now) })
        ]);
      }))
    ]);
  }

  function viewCreate() {
    var select = el('select', { id: 'deck-select', className: 'field', name: 'deck' });
    state.decks.forEach(function (d) {
      select.appendChild(el('option', { value: d.id, text: d.title }));
    });
    if (state.decks.length === 0) {
      select.appendChild(el('option', { value: '', text: 'No decks yet. Name a new deck below.' }));
    }

    return box('', [
      el('form', { id: 'create-form', className: 'form', novalidate: true }, [
        el('label', { className: 'field-label', for: 'deck-select', text: 'Deck' }),
        select,
        el('label', { className: 'field-label', for: 'new-deck', text: 'Or name a new deck' }),
        el('input', { id: 'new-deck', className: 'field', type: 'text', maxlength: String(M.LIMITS.title), autocomplete: 'off' }),
        el('label', { className: 'field-label', for: 'front', text: 'Question' }),
        el('textarea', { id: 'front', className: 'field', rows: '3', maxlength: String(M.LIMITS.text) }),
        el('label', { className: 'field-label', for: 'back', text: 'Answer' }),
        el('textarea', { id: 'back', className: 'field', rows: '3', maxlength: String(M.LIMITS.text) }),
        el('button', { type: 'submit', className: 'btn primary wide', text: 'Save card' }),
        el('p', { id: 'create-error', className: 'form-error', role: 'alert' })
      ])
    ]);
  }

  function viewDecks(now) {
    var query = state.deckSearch.trim().toLowerCase();
    var search = el('input', {
      id: 'deck-search',
      className: 'field',
      type: 'search',
      placeholder: 'Filter decks',
      'aria-label': 'Filter decks',
      autocomplete: 'off'
    });
    search.value = state.deckSearch;

    var list = el('div', { id: 'deck-list', className: 'stack' });
    fillDeckList(list, query, now);

    return el('div', { className: 'stack' }, [search, list]);
  }

  function fillDeckList(list, query, now) {
    list.textContent = '';
    var matches = state.decks.filter(function (d) {
      return d.title.toLowerCase().indexOf(query) !== -1;
    });

    if (state.decks.length === 0) {
      list.appendChild(box('center', [sub('No decks yet. Add a card and name its deck.')]));
      return;
    }
    if (matches.length === 0) {
      list.appendChild(box('center', [sub('No decks match that search.')]));
      return;
    }

    matches.forEach(function (d) {
      var inDeck = state.cards.filter(function (c) { return c.deckId === d.id; });
      var due = M.dueCards(inDeck, now, null).length;
      list.appendChild(el('div', { className: 'deck-row' }, [
        el('div', { className: 'deck-info' }, [
          el('p', { className: 'deck-title', text: d.title }),
          el('p', { className: 'sub', text: inDeck.length + ' cards, ' + due + ' due' })
        ]),
        el('div', { className: 'deck-actions' }, [
          button('Study', { 'data-action': 'study-deck', 'data-deck-id': d.id }, 'primary small'),
          button('Delete', { 'data-action': 'delete-deck', 'data-deck-id': d.id }, 'danger small')
        ])
      ]));
    });
  }

  function viewStats(now) {
    var s = M.stats(state.decks, state.cards, now);
    var perDeck = s.perDeck.length
      ? s.perDeck.map(function (p) {
          return el('div', { className: 'deck-row' }, [
            el('div', { className: 'deck-info' }, [
              el('p', { className: 'deck-title', text: p.title }),
              el('p', { className: 'sub', text: p.total + ' cards, ' + p.mastered + ' mastered' })
            ]),
            el('p', { className: 'value small-value', text: p.masteryPercent + '%' })
          ]);
        })
      : [box('center', [sub('Add a deck to see progress here.')])];

    return el('div', { className: 'stack' }, [
      el('div', { className: 'grid2' }, [
        box('', [label('Needs review'), value(String(s.needsReview))]),
        box('', [label('Learning'), value(String(s.learning))]),
        box('', [label('Mastered'), value(String(s.mastered))]),
        box('', [label('Reviews, last 7 days'), value(String(s.reviewsLast7Days)), sub(s.reviewsTotal + ' in total')]),
        box('span2', [
          label('Streak'),
          value(s.streakCurrent + ' day' + (s.streakCurrent === 1 ? '' : 's')),
          sub('Longest: ' + s.streakLongest + ' day' + (s.streakLongest === 1 ? '' : 's'))
        ])
      ]),
      el('h2', { className: 'section-title', text: 'By deck' }),
      el('div', { className: 'stack' }, perDeck)
    ]);
  }

  function render() {
    var now = Date.now();
    var view = $('view');
    var node;
    if (state.route === 'home') node = viewHome(now);
    else if (state.route === 'study') node = viewStudy(now);
    else if (state.route === 'create') node = viewCreate();
    else if (state.route === 'decks') node = viewDecks(now);
    else node = viewStats(now);

    view.textContent = '';
    view.appendChild(node);
    $('title').textContent = ROUTE_TITLES[state.route] || 'Flashcards';

    document.querySelectorAll('.dock-btn').forEach(function (btn) {
      var active = btn.getAttribute('data-route') === state.route;
      btn.classList.toggle('active', active);
      if (active) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
  }

  function navigate(route) {
    state.route = route;
    state.flipped = false;
    if (route !== 'study') state.deckFilter = null;
    render();
    view().focus({ preventScroll: true });
  }

  function view() { return $('view'); }

  /* ---------- Actions ---------- */

  function studyDeck(deckId) {
    state.deckFilter = deckId || null;
    state.flipped = false;
    navigate('study');
  }

  function flip() {
    if (state.route !== 'study') return;
    state.flipped = !state.flipped;
    render();
  }

  function rate(rating) {
    if (state.busy || state.route !== 'study') return;
    var now = Date.now();
    var card = M.dueCards(state.cards, now, state.deckFilter)[0];
    if (!card) return;
    state.busy = true;
    var updated = M.applyRating(card, rating, now);
    S.putCard(updated)
      .then(refresh)
      .then(function () {
        state.flipped = false;
        render();
      })
      .catch(function () {
        toast('Could not save this rating on the device. Try again.');
      })
      .then(function () { state.busy = false; });
  }

  function confirmAction(message, actionLabel, onConfirm) {
    state.pendingConfirm = onConfirm;
    $('confirm-text').textContent = message;
    $('confirm-ok').textContent = actionLabel;
    $('confirm').showModal();
  }

  function saveCard(event) {
    event.preventDefault();
    var errorNode = $('create-error');
    errorNode.textContent = '';

    var front = $('front').value.trim();
    var back = $('back').value.trim();
    var newDeckTitle = $('new-deck').value.trim();
    var chosenDeckId = $('deck-select').value;

    if (!front || !back) {
      errorNode.textContent = 'Enter both a question and an answer.';
      return;
    }
    if (front.length > M.LIMITS.text || back.length > M.LIMITS.text) {
      errorNode.textContent = 'Each side can be up to ' + M.LIMITS.text + ' characters.';
      return;
    }

    var now = Date.now();
    var newDeck = null;
    var deckId = chosenDeckId;
    if (newDeckTitle) {
      if (newDeckTitle.length > M.LIMITS.title) {
        errorNode.textContent = 'Deck names can be up to ' + M.LIMITS.title + ' characters.';
        return;
      }
      deckId = M.makeId('deck');
      newDeck = { id: deckId, title: newDeckTitle, createdAt: now };
    }
    if (!deckId) {
      errorNode.textContent = 'Choose a deck or name a new one.';
      return;
    }

    var card = Object.assign({
      id: M.makeId('card'),
      deckId: deckId,
      front: front,
      back: back,
      createdAt: now,
      reviewHistory: []
    }, M.freshSchedule(now));

    S.createCard(newDeck, card)
      .then(refresh)
      .then(function () {
        toast('Card saved on this device');
        navigate('home');
      })
      .catch(function () {
        errorNode.textContent = 'The card could not be saved. Check free storage and try again.';
      });
  }

  function deleteDeck(deckId) {
    var deck = state.decks.filter(function (d) { return d.id === deckId; })[0];
    if (!deck) return;
    var count = state.cards.filter(function (c) { return c.deckId === deckId; }).length;
    confirmAction(
      'Delete "' + deck.title + '" and its ' + count + ' card' + (count === 1 ? '' : 's') + '? This cannot be undone.',
      'Delete deck',
      function () {
        S.deleteDeck(deckId)
          .then(refresh)
          .then(function () {
            if (state.deckFilter === deckId) state.deckFilter = null;
            toast('Deck deleted');
            render();
          })
          .catch(function () { toast('The deck could not be deleted. Try again.'); });
      }
    );
  }

  function localDateStamp(now) {
    var d = new Date(now);
    var pad = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function exportBackup() {
    var now = Date.now();
    var text = M.serializeBackup(state.decks, state.cards, now);
    var filename = 'flashcards-backup-' + localDateStamp(now) + '.json';

    var bridge = root.AndroidBridge;
    if (bridge && typeof bridge.shareText === 'function') {
      var accepted = false;
      try {
        accepted = bridge.shareText(filename, text) === true;
      } catch (err) {
        accepted = false;
      }
      toast(accepted ? 'Choose where to save the backup' : 'The backup could not be prepared');
      return;
    }

    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = el('a', { href: url, download: filename });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Backup downloaded');
  }

  function importBackupFile(file) {
    if (!file) return;
    file.text().then(function (text) {
      var parsed;
      try {
        parsed = M.parseBackup(text);
      } catch (err) {
        toast(err.message);
        return;
      }
      confirmAction(
        'Replace everything on this device with this backup? It has ' + parsed.decks.length +
          ' deck' + (parsed.decks.length === 1 ? '' : 's') + ' and ' + parsed.cards.length +
          ' card' + (parsed.cards.length === 1 ? '' : 's') + '. Current data will be removed.',
        'Replace data',
        function () {
          S.replaceAll(parsed.decks, parsed.cards)
            .then(refresh)
            .then(function () {
              state.deckFilter = null;
              toast('Backup restored');
              render();
            })
            .catch(function () { toast('The backup could not be restored. Your data was not changed.'); });
        }
      );
    }).catch(function () {
      toast('The file could not be read.');
    });
  }

  /* ---------- Wiring ---------- */

  function handleAction(action, target) {
    if (action === 'flip') flip();
    else if (action === 'rate') rate(parseInt(target.getAttribute('data-rating'), 10));
    else if (action === 'study-all') studyDeck(null);
    else if (action === 'study-deck') studyDeck(target.getAttribute('data-deck-id'));
    else if (action === 'delete-deck') deleteDeck(target.getAttribute('data-deck-id'));
    else if (action === 'export') exportBackup();
    else if (action === 'import') $('import-file').click();
  }

  function bind() {
    document.addEventListener('click', function (event) {
      var target = event.target.closest ? event.target.closest('[data-route], [data-action]') : null;
      if (!target) return;
      if (target.hasAttribute('data-route')) {
        navigate(target.getAttribute('data-route'));
        return;
      }
      handleAction(target.getAttribute('data-action'), target);
    });

    document.addEventListener('keydown', function (event) {
      if (event.target.closest && event.target.closest('input, textarea, select')) return;
      if (state.route !== 'study') return;
      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault();
        flip();
      } else if (event.key === 'Enter' && event.target.getAttribute && event.target.getAttribute('data-action') === 'flip') {
        event.preventDefault();
        flip();
      } else if (event.key === '1' || event.key === '2' || event.key === '3') {
        rate(parseInt(event.key, 10) - 1);
      }
    });

    document.addEventListener('submit', function (event) {
      if (event.target && event.target.id === 'create-form') saveCard(event);
    });

    document.addEventListener('input', function (event) {
      if (event.target && event.target.id === 'deck-search') {
        state.deckSearch = event.target.value;
        var list = $('deck-list');
        if (list) fillDeckList(list, state.deckSearch.trim().toLowerCase(), Date.now());
      }
    });

    $('import-file').addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0];
      importBackupFile(file);
      event.target.value = '';
    });

    $('confirm').addEventListener('close', function () {
      var action = state.pendingConfirm;
      state.pendingConfirm = null;
      if ($('confirm').returnValue === 'ok' && action) action();
    });

    setInterval(function () {
      if (state.route === 'home' || state.route === 'study') render();
    }, 30000);
  }

  function showStartupError(message) {
    var view = $('view');
    view.textContent = '';
    view.appendChild(box('center', [
      el('h2', { className: 'empty-title', text: 'Storage unavailable' }),
      sub(message)
    ]));
  }

  function start() {
    bind();
    S.open()
      .then(function () {
        return S.ensureSeeded(Date.now(), M.seedData(Date.now()));
      })
      .then(refresh)
      .then(function () { render(); })
      .catch(function (err) {
        showStartupError((err && err.message) || 'Your data could not be opened on this device.');
      });
  }

  root.FCApp = { start: start, _state: state };

  if (root.document && root.document.readyState !== 'loading') {
    start();
  } else if (root.document) {
    root.document.addEventListener('DOMContentLoaded', start);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
