#!/usr/bin/env node
import { openSync, readSync, closeSync } from 'node:fs';
import { TextDecoder } from 'node:util';
import { compareCsv, CsvError } from './compare.mjs';

const HELP = `csv-compare 0.1.0
Usage: csv-compare BEFORE.csv AFTER.csv --key COLUMN [--key COLUMN] [--json] [--delimiter CHAR]

Compare rows by unique explicit keys. Values remain text. Row/column order is ignored.
Exit codes: 0 equal, 1 differences, 2 invalid input or arguments.
Reads UTF-8 files up to 32 MiB each. No files are changed. No network is used.
`;
const args = process.argv.slice(2);
let json = args.includes('--json');
function readInput(filename) {
  const limit = 32 * 1024 * 1024;
  const chunks = [];
  const buffer = Buffer.alloc(64 * 1024);
  let descriptor;
  try {
    descriptor = openSync(filename, 'r');
    let length = 0;
    while (true) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (!count) break;
      length += count;
      if (length > limit) throw new CsvError('SIZE', 'Each CSV file must be at most 32 MiB.');
      chunks.push(Buffer.from(buffer.subarray(0, count)));
    }
    try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks)); }
    catch { throw new CsvError('ENCODING', 'Input must contain valid UTF-8.'); }
  } catch (error) {
    if (error instanceof CsvError) throw error;
    throw new CsvError('READ', 'Unable to read a CSV input file.');
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}
try {
  if (args.length === 1 && args[0] === '--help') { process.stdout.write(HELP); }
  else if (args.length === 1 && args[0] === '--version') { process.stdout.write('0.1.0\n'); }
  else {
    const files = [], keys = [];
    let delimiter = ',';
    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];
      if (arg === '--json') continue;
      if (arg === '--key' || arg === '--delimiter') {
        const value = args[++index];
        if (value === undefined || value.startsWith('--')) throw new CsvError('ARGUMENT', 'Option requires a value.');
        if (arg === '--key') keys.push(value); else delimiter = value;
      } else if (arg.startsWith('-')) throw new CsvError('ARGUMENT', 'Unknown option. Use --help.');
      else files.push(arg);
    }
    if (files.length !== 2) throw new CsvError('ARGUMENT', 'Provide exactly two CSV file paths.');
    const result = compareCsv(readInput(files[0]), readInput(files[1]), { keys, delimiter });
    if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
    else {
      process.stdout.write(result.equal ? 'CSV records are equal.\n' : 'CSV records differ.\n');
      process.stdout.write(`Rows: ${result.counts.added} added, ${result.counts.removed} removed, ${result.counts.changed} changed.\n`);
      process.stdout.write(`Columns: ${result.columns.added.length} added, ${result.columns.removed.length} removed.\n`);
      for (const item of result.rows.changed) {
        process.stdout.write(`Key ${JSON.stringify(item.key)}: ${item.changes.map(change => JSON.stringify(change.column)).join(', ')} changed.\n`);
      }
    }
    process.exitCode = result.equal ? 0 : 1;
  }
} catch (error) {
  const safe = error instanceof CsvError ? error : new CsvError('INTERNAL', 'Comparison failed.');
  const details = Object.fromEntries(['code', 'message', 'side', 'row', 'column'].filter(key => safe[key] !== undefined).map(key => [key, safe[key]]));
  if (json) process.stdout.write(`${JSON.stringify({ error: details })}\n`);
  else process.stderr.write(`${safe.code}: ${safe.message}${safe.row ? ` (record ${safe.row}${safe.column ? `, column ${safe.column}` : ''})` : ''}\n`);
  process.exitCode = 2;
}
