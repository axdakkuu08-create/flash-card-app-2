(function (root) {
  'use strict';
  var M = root.FCModel, S = root.FCStore, CSV = root.FCCSV;
  if (!M || !S || !CSV) return;
  var rows = [], busy = false;
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function valid() { return rows.filter(function (r) { return r.valid; }); }
  function selected() { return valid().filter(function (r) { return r.selected; }); }
  function parseTags(text) {
    return M.normalizeTags(String(text || '').split(',').map(function (v) { return v.trim(); }).filter(Boolean));
  }
  function validate(row) {
    row.errors = [];
    if (!String(row.front).trim()) row.errors.push('Question is required.');
    if (!String(row.back).trim()) row.errors.push('Answer is required.');
    if (String(row.front).trim().length > M.LIMITS.text) row.errors.push('Question is too long.');
    if (String(row.back).trim().length > M.LIMITS.text) row.errors.push('Answer is too long.');
    try { row.tags = M.normalizeTags(row.tags); } catch (err) { row.errors.push(err.message); }
    row.valid = row.errors.length === 0;
    if (!row.valid) row.selected = false;
  }
  function updateCounts() {
    var good = valid().length;
    $('csv-summary').textContent = rows.length + ' rows · ' + good + ' valid · ' + (rows.length - good) + ' invalid';
    $('csv-valid-count').textContent = '(' + good + ')';
    $('csv-invalid-count').textContent = '(' + (rows.length - good) + ')';
    var count = selected().length;
    $('csv-import').disabled = busy || count === 0;
    $('csv-import').textContent = busy ? 'Importing…' : 'Import ' + count + ' selected';
  }
  function render() {
    $('csv-valid-list').textContent = '';
    $('csv-invalid-list').textContent = '';
    rows.forEach(function (row) {
      var card = el('section', 'card stack');
      var header = el('div', 'row2');
      var check = el('input'); check.type = 'checkbox'; check.checked = row.selected; check.disabled = !row.valid;
      check.setAttribute('aria-label', 'Select row ' + row.rowNumber);
      check.addEventListener('change', function () { row.selected = check.checked; updateCounts(); });
      header.appendChild(check);
      header.appendChild(el('strong', '', 'CSV row ' + row.rowNumber));
      header.appendChild(el('span', 'tag', row.valid ? 'VALID' : 'INVALID'));
      card.appendChild(header);
      [['Question','front'],['Answer','back'],['Tags','tags']].forEach(function (field) {
        var label = el('label', 'field-label', field[0]);
        var input = field[1] === 'back' || field[1] === 'front' ? el('textarea','field') : el('input','field');
        if (input.tagName === 'TEXTAREA') input.rows = 2;
        input.value = field[1] === 'tags' ? row.tags.join(', ') : row[field[1]];
        input.addEventListener(field[1] === 'tags' ? 'change' : 'input', function () {
          try {
            row[field[1]] = field[1] === 'tags' ? parseTags(input.value) : input.value;
            validate(row); render();
          } catch (err) { input.setCustomValidity(err.message); input.reportValidity(); }
        });
        card.appendChild(label); card.appendChild(input);
      });
      if (row.errors.length) card.appendChild(el('p','form-error',row.errors.join(' ')));
      (row.valid ? $('csv-valid-list') : $('csv-invalid-list')).appendChild(card);
    });
    updateCounts();
  }
  function loadCsv(file) {
    if (!file) return;
    if (file.size > CSV.LIMITS.inputChars) { $('csv-errors').textContent = 'CSV file is larger than 2 MB.'; return; }
    file.text().then(function (text) {
      var parsed = CSV.parseCsv(text);
      $('csv-errors').textContent = parsed.errors.map(function (e) { return e.message; }).join(' ');
      rows = parsed.rows.map(function (r, i) {
        return { rowId:'preview-' + i, rowNumber:r.rowNumber, front:r.front, back:r.back,
          tags:M.normalizeTags(r.tags || []), valid:r.valid, errors:r.errors.slice(), selected:!!r.valid };
      });
      S.loadAll().then(function (all) {
        var select = $('csv-deck'); select.textContent = '';
        all.decks.forEach(function (d) { var o=el('option','',d.title); o.value=d.id; select.appendChild(o); });
        if (!all.decks.length) { var empty=el('option','','Create a deck below'); empty.value=''; select.appendChild(empty); }
        render(); $('csv-preview').showModal();
      }).catch(function () { $('csv-errors').textContent = 'Could not read local decks.'; });
    }).catch(function () { $('csv-errors').textContent = 'The CSV file could not be read.'; });
  }
  function applyBulk() {
    var tags;
    try { tags = parseTags($('csv-bulk-tags').value); }
    catch (err) { $('csv-errors').textContent = err.message; return; }
    selected().forEach(function (r) {
      r.tags = M.normalizeTags($('csv-tag-mode').value === 'replace' ? tags : r.tags.concat(tags));
      validate(r);
    });
    render();
  }
  function importRows() {
    if (busy) return;
    var chosen = selected();
    if (!chosen.length) return;
    var title = $('csv-new-deck').value.trim(), deckId = $('csv-deck').value;
    var now = Date.now(), newDeck = null;
    if (title) {
      if (title.length > M.LIMITS.title) { $('csv-errors').textContent = 'Deck title is too long.'; return; }
      deckId = M.makeId('deck'); newDeck = {id:deckId,title:title,createdAt:now};
    }
    if (!deckId) { $('csv-errors').textContent = 'Choose or create a deck.'; return; }
    var cards = chosen.map(function (r) {
      return Object.assign({id:M.makeId('card'),deckId:deckId,front:r.front.trim(),back:r.back.trim(),
        tags:M.normalizeTags(r.tags),createdAt:now,reviewHistory:[]}, M.freshSchedule(now));
    });
    busy = true; updateCounts();
    S.importCards(newDeck,cards).then(function () {
      var summary = cards.length + ' imported; ' + (rows.length - cards.length) + ' not imported.';
      $('csv-preview').close();
      var output = document.createElement('dialog'); output.className = 'confirm';
      var box = el('div','confirm-form stack');
      box.appendChild(el('h2','','Import complete'));
      box.appendChild(el('p','sub',summary));
      var done = el('button','btn primary','Done'); done.type='button';
      done.addEventListener('click',function(){output.close();output.remove();});
      box.appendChild(done); output.appendChild(box); document.body.appendChild(output); output.showModal();
      rows = []; busy = false;
      root.dispatchEvent(new CustomEvent('flashcards:csv-imported',{detail:{imported:cards.length,notImported:rows.length-cards.length}}));
    }).catch(function () {
      busy = false; $('csv-errors').textContent = 'Import failed. The transaction was rolled back; no partial cards were saved.';
      updateCounts();
    });
  }
  function init() {
    $('csv-file').addEventListener('change',function(e){loadCsv(e.target.files && e.target.files[0]);e.target.value='';});
    document.addEventListener('click',function(e){
      var b=e.target.closest && e.target.closest('[data-action="import-csv"]');
      if(b) $('csv-file').click();
    });
    $('csv-select-all').addEventListener('click',function(){valid().forEach(function(r){r.selected=true;});render();});
    $('csv-clear-selection').addEventListener('click',function(){rows.forEach(function(r){r.selected=false;});render();});
    $('csv-apply-tags').addEventListener('click',applyBulk);
    $('csv-import').addEventListener('click',importRows);
    $('csv-cancel').addEventListener('click',function(){rows=[];$('csv-preview').close();});
    $('csv-preview').addEventListener('cancel',function(){rows=[];});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
