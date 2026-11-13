/*
 * Flashcards Offline: isolated CSV parser.
 * Pure parsing/validation only: no DOM, storage, IDs, scheduling or network.
 * Loaded independently and exported for both the browser and Node tests.
 */
(function (root) {
  'use strict';

  var LIMITS = Object.freeze({
    inputChars: 2 * 1024 * 1024,
    rows: 5000,
    fieldChars: 10000
  });

  var HEADER_ALIASES = Object.freeze({
    front: ['front', 'question', 'prompt', 'term'],
    back: ['back', 'answer', 'definition', 'response'],
    tags: ['tags']
  });

  function error(message, rowNumber) {
    return { message: message, rowNumber: rowNumber || null };
  }

  function isBlankRow(fields) {
    return fields.every(function (field) { return field.trim() === ''; });
  }

  /*
   * RFC-4180-style state machine. Supports commas and line breaks inside quoted
   * fields, doubled quote escapes, and LF/CRLF/CR record endings.
   */
  function tokenize(text) {
    var rows = [];
    var errors = [];
    var fields = [];
    var field = '';
    var state = 'start';
    var line = 1;
    var rowStartLine = 1;
    var rowHasSyntaxError = false;
    var i = 0;

    function finishField() {
      fields.push(field);
      field = '';
      state = 'start';
    }

    function finishRow() {
      finishField();
      rows.push({
        fields: fields,
        rowNumber: rowStartLine,
        syntaxInvalid: rowHasSyntaxError
      });
      fields = [];
      rowHasSyntaxError = false;
      rowStartLine = line;
    }

    function consumeNewline() {
      if (text.charAt(i) === '\r' && text.charAt(i + 1) === '\n') i += 1;
      line += 1;
    }

    while (i < text.length) {
      var ch = text.charAt(i);

      if (state === 'quoted') {
        if (ch === '"') {
          if (text.charAt(i + 1) === '"') {
            field += '"';
            i += 2;
            continue;
          }
          state = 'afterQuote';
          i += 1;
          continue;
        }
        if (ch === '\r' || ch === '\n') {
          field += '\n';
          consumeNewline();
          i += 1;
          continue;
        }
        field += ch;
        i += 1;
        continue;
      }

      if (state === 'afterQuote') {
        if (ch === ',') {
          finishField();
          i += 1;
          continue;
        }
        if (ch === '\r' || ch === '\n') {
          finishRow();
          consumeNewline();
          rowStartLine = line;
          i += 1;
          continue;
        }
        rowHasSyntaxError = true;
        errors.push(error('Unexpected character after a closing quote.', rowStartLine));
        field += ch;
        state = 'unquoted';
        i += 1;
        continue;
      }

      if (state === 'start') {
        if (ch === '"') {
          state = 'quoted';
          i += 1;
          continue;
        }
        if (ch === ',') {
          finishField();
          i += 1;
          continue;
        }
        if (ch === '\r' || ch === '\n') {
          finishRow();
          consumeNewline();
          rowStartLine = line;
          i += 1;
          continue;
        }
        field += ch;
        state = 'unquoted';
        i += 1;
        continue;
      }

      // Unquoted field.
      if (ch === ',') {
        finishField();
        i += 1;
      } else if (ch === '\r' || ch === '\n') {
        finishRow();
        consumeNewline();
        rowStartLine = line;
        i += 1;
      } else if (ch === '"') {
        rowHasSyntaxError = true;
        errors.push(error('A quote appeared inside an unquoted field.', rowStartLine));
        field += ch;
        i += 1;
      } else {
        field += ch;
        i += 1;
      }
    }

    if (state === 'quoted') {
      rowHasSyntaxError = true;
      errors.push(error('A quoted field was not closed before the end of the file.', rowStartLine));
      fields.push(field);
      rows.push({ fields: fields, rowNumber: rowStartLine, syntaxInvalid: true });
      return { rows: rows, errors: errors };
    }

    if (fields.length > 0 || field.length > 0 || state === 'afterQuote' || state === 'unquoted') {
      finishRow();
    }

    return { rows: rows, errors: errors };
  }

  function resolveHeaders(headerFields) {
    var canonical = {};
    var seen = {};
    var errors = [];

    headerFields.forEach(function (raw, index) {
      var name = raw.replace(/^\uFEFF/, '').trim().toLowerCase();
      if (!name) return;

      if (seen[name]) {
        errors.push(error('The header row contains a duplicate column name.', 1));
        return;
      }
      seen[name] = true;

      Object.keys(HEADER_ALIASES).forEach(function (key) {
        if (HEADER_ALIASES[key].indexOf(name) !== -1) {
          if (canonical[key] !== undefined) {
            errors.push(error('The header row contains more than one column for ' + key + '.', 1));
          } else {
            canonical[key] = index;
          }
        }
      });
    });

    if (canonical.front === undefined) errors.push(error('A required question column is missing (front/question/prompt/term).', 1));
    if (canonical.back === undefined) errors.push(error('A required answer column is missing (back/answer/definition/response).', 1));
    return { columns: canonical, errors: errors };
  }

  function parseTags(value) {
    var output = [];
    var seen = Object.create(null);
    value.split(',').forEach(function (part) {
      var tag = part.trim();
      if (!tag) return;
      var key = tag.toLocaleLowerCase();
      if (!seen[key]) {
        seen[key] = true;
        output.push(tag);
      }
    });
    return output;
  }

  function parseCsv(input) {
    if (typeof input !== 'string') {
      return { rows: [], errors: [error('CSV input must be text.')] };
    }
    if (input.length > LIMITS.inputChars) {
      return { rows: [], errors: [error('The CSV file is larger than 2 MB.')] };
    }

    var text = input.replace(/^\uFEFF/, '');
    var tokenized = tokenize(text);
    var rows = tokenized.rows;
    var errors = tokenized.errors.slice();

    while (rows.length && isBlankRow(rows[rows.length - 1].fields)) rows.pop();
    if (!rows.length) {
      errors.push(error('The CSV file is empty.'));
      return { rows: [], errors: errors };
    }

    var header = resolveHeaders(rows[0].fields);
    errors = errors.concat(header.errors);
    if (header.errors.length) return { rows: [], errors: errors };

    var dataRows = rows.slice(1).filter(function (row) { return !isBlankRow(row.fields); });
    if (dataRows.length > LIMITS.rows) {
      return {
        rows: [],
        errors: errors.concat([error('The CSV file contains more than ' + LIMITS.rows + ' card rows.')])
      };
    }

    var output = dataRows.map(function (row) {
      var rowErrors = [];
      var frontValue = row.fields[header.columns.front] || '';
      var backValue = row.fields[header.columns.back] || '';
      var tagsValue = header.columns.tags === undefined ? '' : (row.fields[header.columns.tags] || '');

      if (row.syntaxInvalid) rowErrors.push('The CSV row contains malformed quoting.');
      if (!frontValue.trim()) rowErrors.push('Question is required.');
      if (!backValue.trim()) rowErrors.push('Answer is required.');
      if (frontValue.trim().length > LIMITS.fieldChars) rowErrors.push('Question is longer than 10000 characters.');
      if (backValue.trim().length > LIMITS.fieldChars) rowErrors.push('Answer is longer than 10000 characters.');
      if (tagsValue.length > LIMITS.fieldChars) rowErrors.push('Tags field is longer than 10000 characters.');

      return {
        rowNumber: row.rowNumber,
        front: frontValue.trim(),
        back: backValue.trim(),
        tags: parseTags(tagsValue),
        valid: rowErrors.length === 0,
        errors: rowErrors
      };
    });

    return { rows: output, errors: errors };
  }

  var api = { LIMITS: LIMITS, parseCsv: parseCsv };
  root.FCCsvParser = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
