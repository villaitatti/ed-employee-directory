import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resources } from './config.js';

// From the web package's root, which is vitest's cwd. Not `import.meta.url`:
// Vite rewrites that to a `/@fs/`-prefixed path that `fs` cannot open.
const SERVER_SRC = resolve(process.cwd(), '../server/src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

/**
 * Every error code the API can put on the wire.
 *
 * Read out of the server's source rather than hand-listed, because a
 * hand-maintained list is exactly what drifts: three codes were already missing
 * from the catalogue when this was written. `\s*` spans newlines in a JS regex,
 * so the wrapped multi-line throws are matched too; the `code:` form catches the
 * error middleware's literals and the codes passed as options.
 */
function serverErrorCodes(): string[] {
  const codes = new Set<string>();
  for (const file of sourceFiles(SERVER_SRC)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/new HttpError\(\s*\d+,\s*'([A-Z][A-Z0-9_]+)'/g)) codes.add(match[1]!);
    for (const match of source.matchAll(/\bcode:\s*'([A-Z][A-Z0-9_]+)'/g)) codes.add(match[1]!);
    // Thrown as `new HttpError(400, code, ...)` with the code held in a variable,
    // so no literal appears at the throw site.
    for (const match of source.matchAll(/'(RESPONSABILE_REQUIRED|SOSTITUTO_RESPONSABILE_REQUIRED)'/g)) {
      codes.add(match[1]!);
    }
  }
  return [...codes].sort();
}

/** Every leaf key, dotted — `errors.NOT_FOUND.body` and so on. */
function leafKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key)
  );
}

/** `{{name}}` placeholders, sorted — the contract between copy and call site. */
function placeholders(value: string): string[] {
  return [...value.matchAll(/{{\s*([\w.]+)\s*}}/g)].map((match) => match[1]!).sort();
}

function flatten(value: unknown, prefix = ''): Map<string, string> {
  const entries = new Map<string, string>();
  for (const key of leafKeys(value, prefix)) {
    const resolved = key
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], value);
    if (typeof resolved === 'string') entries.set(key, resolved);
  }
  return entries;
}

describe('translation catalogue', () => {
  const it_ = flatten(resources.it.translation);
  const en = flatten(resources.en.translation);

  it('defines the same keys in both languages', () => {
    // A key present in only one language silently falls back to Italian for an
    // English-speaking operator — the exact failure this whole layer exists to
    // prevent, so it is asserted rather than reviewed.
    expect([...en.keys()].filter((key) => !it_.has(key))).toEqual([]);
    expect([...it_.keys()].filter((key) => !en.has(key))).toEqual([]);
  });

  it('uses the same interpolation placeholders in both languages', () => {
    const mismatched = [...it_.entries()]
      .filter(([key, italian]) => {
        const english = en.get(key);
        return english !== undefined && placeholders(italian).join() !== placeholders(english).join();
      })
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });

  it('translates every error code the server can emit, in both languages', () => {
    const codes = serverErrorCodes();
    // Sanity-check the scan itself: if a refactor changes how errors are thrown,
    // this must fail loudly rather than quietly asserting nothing.
    expect(codes.length).toBeGreaterThan(20);
    expect(codes).toContain('DUPLICATE_VALUE');

    for (const [language, catalogue] of [
      ['it', resources.it.translation.errors],
      ['en', resources.en.translation.errors],
    ] as const) {
      const untranslated = codes.filter((code) => !(code in catalogue));
      expect(untranslated, `${language} is missing copy for these server codes`).toEqual([]);
    }
  });

  it('gives every error code both a title and a next step', () => {
    for (const [language, catalogue] of [
      ['it', resources.it.translation.errors],
      ['en', resources.en.translation.errors],
    ] as const) {
      for (const [code, entry] of Object.entries(catalogue)) {
        // `fieldRejected` / `nothingSaved` are bare strings, not code entries.
        if (typeof entry === 'string') continue;
        const record = entry as Record<string, unknown>;
        // SERVER is a body-only fallback appended to another error's title.
        if (code === 'SERVER') {
          expect(record['body'], `${language}.${code}`).toBeTruthy();
          continue;
        }
        expect(record['title'], `${language}.${code}.title`).toBeTruthy();
        expect(record['body'], `${language}.${code}.body`).toBeTruthy();
      }
    }
  });
});
