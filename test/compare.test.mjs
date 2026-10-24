import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compareCsv, parseCsv } from '../src/compare.mjs';

const compare = (before, after, options = {}) => compareCsv(before, after, { keys: ['id'], ...options });
test('record and column order do not affect equality', () => {
  assert.equal(compare('id,name\n01,A\n02,B\n', 'name,id\nB,02\nA,01\n').equal, true);
});
test('text values are not coerced', () => {
  const result = compare('id,value\n01,001\n', 'id,value\n01,1\n');
  assert.deepEqual(result.rows.changed, [{ key: ['01'], changes: [{ column: 'value', before: '001', after: '1' }] }]);
});
test('added and removed rows carry complete records', () => {
  const result = compare('id,name\n1,Old\n', 'id,name\n2,New\n');
  assert.deepEqual(result.rows.added, [{ key: ['2'], record: { id: '2', name: 'New' } }]);
  assert.deepEqual(result.rows.removed, [{ key: ['1'], record: { id: '1', name: 'Old' } }]);
});
test('column changes reported independently from common cell changes', () => {
  const result = compare('id,old,shared\n1,a,b\n', 'id,new,shared\n1,c,b\n');
  assert.deepEqual(result.columns, { added: ['new'], removed: ['old'] });
  assert.equal(result.counts.changed, 0);
  assert.equal(result.equal, false);
});
test('composite keys cannot collide through delimiter contents', () => {
  const result = compareCsv('a,b,value\n"x,y",z,one\nx,"y,z",two\n', 'a,b,value\nx,"y,z",two\n"x,y",z,one\n', { keys: ['a', 'b'] });
  assert.equal(result.equal, true);
});
test('duplicate keys fail with side and logical record number', () => {
  assert.throws(() => compare('id,v\n1,a\n1,b\n', 'id,v\n1,a\n'), error => error.code === 'DUPLICATE_KEY' && error.side === 'before' && error.row === 3);
});
test('duplicate and empty headers fail', () => {
  for (const input of ['id,id\n1,2\n', 'id,\n1,2\n']) assert.throws(() => compare(input, 'id,v\n1,2\n'), { code: 'HEADER' });
});
test('width mismatch reports logical row despite embedded newline', () => {
  assert.throws(() => compare('id,v\n1,"two\nlines"\n2\n', 'id,v\n1,x\n'), error => error.code === 'WIDTH' && error.row === 3);
});
test('explicit distinct keys must exist in both files', () => {
  assert.throws(() => compareCsv('id\n1\n', 'id\n1\n'), { code: 'KEYS' });
  assert.throws(() => compare('id\n1\n', 'other\n1\n'), { code: 'KEY_COLUMN' });
  assert.throws(() => compare('id\n1\n', 'id\n1\n', { keys: ['id', 'id'] }), { code: 'KEYS' });
});
test('parser handles BOM, CRLF, embedded commas, quotes and newlines', () => {
  assert.deepEqual(parseCsv('\uFEFFid,text\r\n1,"a,""b""\r\nc"\r\n'), [['id', 'text'], ['1', 'a,"b"\r\nc']]);
});
test('parser rejects malformed quoting without exposing cell content', () => {
  for (const input of ['id\n"unclosed', 'id\na"b\n', 'id\n"a"b\n']) assert.throws(() => parseCsv(input), { code: 'QUOTE' });
});
test('parser retains explicit blank records and trailing empty fields', () => {
  assert.deepEqual(parseCsv('a,b\n1,\n\n'), [['a', 'b'], ['1', ''], ['']]);
});
test('empty documents, NUL and invalid delimiters fail', () => {
  assert.throws(() => parseCsv(''), { code: 'EMPTY' });
  assert.throws(() => parseCsv('\uFEFF'), { code: 'EMPTY' });
  assert.throws(() => parseCsv('a\u0000'), { code: 'NUL' });
  for (const delimiter of ['', 'ab', '"', '\n']) assert.throws(() => parseCsv('a', { delimiter }), { code: 'DELIMITER' });
});
test('alternate delimiter and special object-property headers are safe', () => {
  const result = compareCsv('id;__proto__\n1;before\n', 'id;__proto__\n2;after\n', { keys: ['id'], delimiter: ';' });
  assert.equal(Object.getPrototypeOf(result.rows.added[0].record), Object.prototype);
  assert.equal(result.rows.added[0].record.__proto__, 'after');
});
test('CLI exit codes, JSON schema, safe errors and UTF-8 validation', () => {
  const folder = mkdtempSync(join(tmpdir(), 'csv-compare-test-'));
  try {
    const left = join(folder, 'before.csv'), right = join(folder, 'after.csv');
    writeFileSync(left, 'id,v\n1,one\n'); writeFileSync(right, 'id,v\n1,one\n');
    const invoke = (...args) => spawnSync(process.execPath, ['src/cli.mjs', ...args], { encoding: 'utf8' });
    let result = invoke(left, right, '--key', 'id', '--json');
    assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).equal, true);
    writeFileSync(right, 'id,v\n1,two\n');
    result = invoke(left, right, '--key', 'id', '--json');
    assert.equal(result.status, 1); assert.equal(JSON.parse(result.stdout).counts.changed, 1);
    result = invoke(left, right, '--json');
    assert.equal(result.status, 2); assert.equal(JSON.parse(result.stdout).error.code, 'KEYS');
    writeFileSync(right, Buffer.from([0xff]));
    result = invoke(left, right, '--key', 'id', '--json');
    assert.equal(result.status, 2); assert.equal(JSON.parse(result.stdout).error.code, 'ENCODING');
    assert.equal(invoke('--help').status, 0);
    assert.equal(invoke('--version').stdout, '0.1.0\n');
    assert.equal(invoke(left, right, '--key').status, 2);
    assert.equal(invoke(left, right, '--unknown').status, 2);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
