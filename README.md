# CSV Compare

Compare CSV records by explicit unique keys, with text and JSON output. This
small command-line tool runs locally, does not change input files, and uses no
network or third-party runtime dependencies.

For an interactive comparison, use [CSV File Tools](https://csvfile.tools/compare).

## Local use

Requires Node.js 22 or newer. From this checkout:

```sh
node src/cli.mjs before.csv after.csv --key id
node src/cli.mjs before.csv after.csv --key account --key item --json
node src/cli.mjs before.tsv after.tsv --key id --delimiter "$(printf '\t')"
```

The proposed package name in `package.json` has not been reserved or published.
There is no registry installation command yet.

Exit codes:

- `0`: equal records and columns.
- `1`: additions, removals, or changes found.
- `2`: invalid CSV, invalid arguments, duplicate keys, or unreadable input.

Use `--key=--id` for a header whose name begins with `--`, and `--delimiter==`
for an equals-sign separator. Put options before `--` when either input filename
begins with a dash, for example `node src/cli.mjs --key id -- -old.csv -new.csv`.
`--json` after `--` is a filename, not an output option.

`--help` and `--version` are available without input files. JSON output contains
`equal`, `keys`, `columns`, `rows`, and `counts`. Invalid input produces an `error`
object with a stable code and, where known, the input side and logical record
number. A multiline quoted record counts as one record. Header is record 1.

## Comparison rules

- All cells and key components stay strings: `001` differs from `1`.
- Repeat `--key` to form a composite key. Each key column must exist in both files.
- Duplicate composite keys are errors, including duplicate empty keys.
- Row order and column order do not affect equality.
- Added and removed columns are reported separately. Changed rows report changed
  cells in columns present on both sides. Adding a column alone does not classify
  every retained row as a changed row.
- Added and removed rows contain their complete record. Output follows the input
  order for reproducible reports; no sorting or numeric inference occurs.
- Headers must be nonempty and unique. Records must match the header width.
- Commas, quoted delimiters, doubled quotes, quoted newlines, LF/CRLF/CR line
  endings, and an initial UTF-8 BOM are supported. Unquoted stray quotes or text
  after a closing quote are rejected. Whitespace remains significant.
- Blank records remain records; a final line ending does not add a record.

## Limits

The CLI reads two UTF-8 files, each limited to 32 MiB, into memory. It is not a
streaming comparison or a spreadsheet formula evaluator. Larger data, other
encodings, fuzzy matching, duplicate-key pairing, and file rewriting are outside
its current scope. The library API operates on strings and leaves size limits to
its caller. `--delimiter` accepts one non-quote ASCII/BMP character; UTF-16
surrogate-pair delimiters are unsupported.

## Library

```js
import { compareCsv } from './src/compare.mjs';
const result = compareCsv('id,value\n1,001\n', 'id,value\n1,1\n', { keys: ['id'] });
console.log(result.rows.changed);
```

## Development

Run `node --test` in a clean public-only environment. Tests use original synthetic
examples and temporary files. No credentials or network are needed.

Licensed under MIT. See [LICENSE](LICENSE).
