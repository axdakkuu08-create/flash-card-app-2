'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CSV = require(path.join(__dirname, '..', 'www', 'js', 'csv-parser.js'));

describe('CSV parser basics', () => {
  test('parses simple rows and trims question/answer text', () => {
    const out = CSV.parseCsv('front,back\n  What is HTML?  , A markup language ');
    assert.deepEqual(out.errors, []);
    assert.equal(out.rows.length, 1);
    assert.deepEqual(out.rows[0], {
      rowNumber: 2, front: 'What is HTML?', back: 'A markup language',
      tags: [], valid: true, errors: []
    });
  });

  test('removes a UTF-8 BOM and accepts CRLF, LF and CR line endings', () => {
    const out = CSV.parseCsv('\uFEFFquestion,answer\r\nQ1,A1\nQ2,A2\rQ3,A3');
    assert.deepEqual(out.rows.map(r => r.rowNumber), [2, 3, 4]);
    assert.equal(out.rows.length, 3);
  });

  test('supports quoted commas and escaped quotes', () => {
    const out = CSV.parseCsv('front,back\n"Hello, world","Say ""hello"""');
    assert.equal(out.rows[0].front, 'Hello, world');
    assert.equal(out.rows[0].back, 'Say "hello"');
    assert.equal(out.rows[0].valid, true);
  });

  test('supports multiline quoted fields and retains physical start line', () => {
    const out = CSV.parseCsv('front,back\n"What is\nHTML?","A markup\r\nlanguage"\nNext,Answer');
    assert.equal(out.rows[0].front, 'What is\nHTML?');
    assert.equal(out.rows[0].back, 'A markup\nlanguage');
    assert.equal(out.rows[0].rowNumber, 2);
    assert.equal(out.rows[1].rowNumber, 5);
  });

  test('supports header aliases and optional tags column', () => {
    const out = CSV.parseCsv('term,response,tags\nHTML,Markup,"web, basics"');
    assert.deepEqual(out.rows[0].tags, ['web', 'basics']);
    assert.equal(out.rows[0].valid, true);
  });

  test('ignores blank rows and returns no cards for a header-only file', () => {
    const out = CSV.parseCsv('\nfront,back\n\nQ,A\n  ,  \n');
    assert.equal(out.rows.length, 1);
    assert.equal(out.rows[0].front, 'Q');
    assert.equal(CSV.parseCsv('front,back\n\n').rows.length, 0);
  });

  test('deduplicates tags case-insensitively while preserving first spelling', () => {
    const out = CSV.parseCsv('front,back,tags\nQ,A,"Web, web, Basics,WEB"');
    assert.deepEqual(out.rows[0].tags, ['Web', 'Basics']);
  });
});

describe('CSV row validation', () => {
  test('keeps missing question and answer rows as invalid preview records', () => {
    const out = CSV.parseCsv('front,back\n,A\nQ,\n,');
    assert.equal(out.rows.length, 3);
    assert.equal(out.rows.every(r => !r.valid), true);
    assert.match(out.rows[0].errors.join(' '), /Question is required/);
    assert.match(out.rows[1].errors.join(' '), /Answer is required/);
  });

  test('rejects question and answer fields over 10000 characters', () => {
    const out = CSV.parseCsv('front,back\n' + 'q'.repeat(10001) + ',A\nQ,' + 'a'.repeat(10001));
    assert.equal(out.rows.length, 2);
    assert.match(out.rows[0].errors.join(' '), /Question is longer/);
    assert.match(out.rows[1].errors.join(' '), /Answer is longer/);
  });

  test('rejects oversized tags fields', () => {
    const out = CSV.parseCsv('front,back,tags\nQ,A,' + 't'.repeat(10001));
    assert.equal(out.rows[0].valid, false);
    assert.match(out.rows[0].errors.join(' '), /Tags field is longer/);
  });

  test('reports unexpected quotes inside unquoted fields', () => {
    const out = CSV.parseCsv('front,back\nQ"bad,A\nGood,Row');
    assert.equal(out.rows[0].valid, false);
    assert.equal(out.rows[1].valid, true);
    assert.match(out.rows[0].errors.join(' '), /malformed quoting/);
  });

  test('reports characters after a closing quote as a malformed row', () => {
    const out = CSV.parseCsv('front,back\n"Q"x,A\nGood,Row');
    assert.equal(out.rows[0].valid, false);
    assert.equal(out.rows[1].valid, true);
  });

  test('reports an unclosed quoted field without importing that row', () => {
    const out = CSV.parseCsv('front,back\nGood,Row\n"unfinished,field');
    assert.equal(out.rows.length, 2);
    assert.equal(out.rows[0].valid, true);
    assert.equal(out.rows[1].valid, false);
    assert.ok(out.errors.some(e => /not closed/.test(e.message)));
  });

  test('rejects missing required headers', () => {
    const out = CSV.parseCsv('front,tags\nQ,web');
    assert.equal(out.rows.length, 0);
    assert.ok(out.errors.some(e => /required answer column is missing/.test(e.message)));
  });

  test('rejects duplicate raw and duplicate canonical headers', () => {
    assert.ok(CSV.parseCsv('front,front,back\nQ,Q,A').errors.some(e => /duplicate column/.test(e.message)));
    assert.ok(CSV.parseCsv('front,question,back\nQ,Q,A').errors.some(e => /more than one column for front/.test(e.message)));
  });

  test('rejects non-text input and empty files', () => {
    assert.ok(CSV.parseCsv(null).errors.length);
    assert.ok(CSV.parseCsv(' \n\n').errors.some(e => /empty/.test(e.message)));
  });

  test('enforces the input size limit', () => {
    const out = CSV.parseCsv('x'.repeat(CSV.LIMITS.inputChars + 1));
    assert.equal(out.rows.length, 0);
    assert.ok(out.errors.some(e => /larger than 2 MB/.test(e.message)));
  });

  test('enforces the 5000-card row limit', () => {
    const lines = ['front,back'];
    for (let i = 0; i < 5001; i++) lines.push('Q' + i + ',A' + i);
    const out = CSV.parseCsv(lines.join('\n'));
    assert.equal(out.rows.length, 0);
    assert.ok(out.errors.some(e => /more than 5000/.test(e.message)));
  });

  test('does not echo imported content in parser errors', () => {
    const secret = '<script>alert(1)</script>';
    const out = CSV.parseCsv('front,back\n' + secret + ',');
    assert.equal(out.rows[0].valid, false);
    assert.equal(out.rows[0].errors.join(' ').includes(secret), false);
    assert.equal(out.errors.join(' ').includes(secret), false);
  });
});

test('parser has no storage, DOM, or network dependency', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(path.join(__dirname, '..', 'www', 'js', 'csv-parser.js'), 'utf8');
  assert.doesNotMatch(source, /indexedDB|localStorage|document\.|window\.fetch|XMLHttpRequest|WebSocket/);
});
