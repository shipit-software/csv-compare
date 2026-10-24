export class CsvError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    Object.assign(this, details);
  }
}

/** Parse strict delimited text. Rows and columns in errors are one based. */
export function parseCsv(input, { delimiter = ',' } = {}) {
  if (typeof delimiter !== 'string' || [...delimiter].length !== 1 || /["\r\n\u0000]/u.test(delimiter) || delimiter.length !== 1) {
    throw new CsvError('DELIMITER', 'Delimiter must be one non-quote, non-newline character.');
  }
  if (typeof input !== 'string' || input.length === 0) throw new CsvError('EMPTY', 'CSV input is empty.');
  const text = input.startsWith('\uFEFF') ? input.slice(1) : input;
  if (!text.length) throw new CsvError('EMPTY', 'CSV input is empty.');
  const rows = [];
  let row = [], field = '', state = 'plain', started = false;
  const finishField = () => { row.push(field); field = ''; state = 'plain'; };
  const finishRow = () => { finishField(); rows.push(row); row = []; started = false; };
  const error = (code, message) => new CsvError(code, message, { row: rows.length + 1, column: row.length + 1 });
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\u0000') throw error('NUL', 'NUL bytes are not supported.');
    if (state === 'quoted') {
      if (char === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 1; }
        else state = 'closed';
      } else field += char;
      continue;
    }
    if (char === delimiter) { finishField(); started = true; continue; }
    if (char === '\r' || char === '\n') {
      finishRow();
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      continue;
    }
    if (state === 'closed') throw error('QUOTE', 'Unexpected character after a closing quote.');
    if (char === '"') {
      if (field.length) throw error('QUOTE', 'Quote must start at the beginning of a field.');
      state = 'quoted'; started = true;
    } else { field += char; started = true; }
  }
  if (state === 'quoted') throw error('QUOTE', 'Quoted field is not closed.');
  if (started || row.length || field.length || state === 'closed') finishRow();
  return rows;
}

function table(text, options, side) {
  const rows = parseCsv(text, options);
  const header = rows.shift();
  const seen = new Set();
  for (let column = 0; column < header.length; column += 1) {
    if (!header[column]) throw new CsvError('HEADER', 'Headers must not be empty.', { side, row: 1, column: column + 1 });
    if (seen.has(header[column])) throw new CsvError('HEADER', 'Headers must be unique.', { side, row: 1, column: column + 1 });
    seen.add(header[column]);
  }
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].length !== header.length) throw new CsvError('WIDTH', 'Record width does not match its header.', { side, row: index + 2 });
  }
  return { header, rows };
}

function records(data, keys, side) {
  const indexes = keys.map(key => data.header.indexOf(key));
  if (indexes.includes(-1)) throw new CsvError('KEY_COLUMN', 'Every key column must exist in both files.', { side });
  const output = new Map();
  data.rows.forEach((values, index) => {
    const key = indexes.map(column => values[column]);
    const identity = JSON.stringify(key);
    if (output.has(identity)) throw new CsvError('DUPLICATE_KEY', 'Duplicate composite key; comparison requires unique keys.', { side, row: index + 2 });
    output.set(identity, { key, values });
  });
  return output;
}

function recordObject(header, values) {
  return Object.fromEntries(header.map((column, index) => [column, values[index]]));
}

/** Compare record sets. All cell and key values remain strings. */
export function compareCsv(before, after, { keys, delimiter = ',' } = {}) {
  if (!Array.isArray(keys) || !keys.length || keys.some(key => typeof key !== 'string' || !key.length) || new Set(keys).size !== keys.length) {
    throw new CsvError('KEYS', 'At least one distinct explicit key column is required.');
  }
  const left = table(before, { delimiter }, 'before');
  const right = table(after, { delimiter }, 'after');
  const leftRows = records(left, keys, 'before');
  const rightRows = records(right, keys, 'after');
  const addedColumns = right.header.filter(column => !left.header.includes(column));
  const removedColumns = left.header.filter(column => !right.header.includes(column));
  const common = left.header.filter(column => right.header.includes(column));
  const sharedColumns = common.map(column => [column, left.header.indexOf(column), right.header.indexOf(column)]);
  const addedRows = [], removedRows = [], changedRows = [];
  for (const [identity, original] of leftRows) {
    const current = rightRows.get(identity);
    if (!current) { removedRows.push({ key: original.key, record: recordObject(left.header, original.values) }); continue; }
    const changes = [];
    for (const [column, leftIndex, rightIndex] of sharedColumns) {
      if (original.values[leftIndex] !== current.values[rightIndex]) changes.push({ column, before: original.values[leftIndex], after: current.values[rightIndex] });
    }
    if (changes.length) changedRows.push({ key: original.key, changes });
  }
  for (const [identity, current] of rightRows) {
    if (!leftRows.has(identity)) addedRows.push({ key: current.key, record: recordObject(right.header, current.values) });
  }
  return {
    equal: !addedColumns.length && !removedColumns.length && !addedRows.length && !removedRows.length && !changedRows.length,
    keys: [...keys],
    columns: { added: addedColumns, removed: removedColumns },
    rows: { added: addedRows, removed: removedRows, changed: changedRows },
    counts: { before: left.rows.length, after: right.rows.length, added: addedRows.length, removed: removedRows.length, changed: changedRows.length },
  };
}
