/**
 * The slice of i18next's `t` that this app's helpers need.
 *
 * Written as overloads rather than one signature with an optional argument:
 * under `exactOptionalPropertyTypes`, `(key, options?: Record<string, unknown>)`
 * is not a supertype of i18next's `TFunction` (which never accepts an explicit
 * `undefined` for its options), so passing `t` straight in would not type-check.
 */
export type Translate = {
  (key: string): string;
  (key: string, options: Record<string, unknown>): string;
};
