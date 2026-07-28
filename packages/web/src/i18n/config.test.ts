import { describe, expect, it } from 'vitest';
import { resources } from './config.js';

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
