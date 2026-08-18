/**
 * Escapes a value for safe use inside a single-quoted shell string.
 *
 * In POSIX shells, single-quoted strings treat every character literally
 * except for the single quote itself (there is no escape sequence inside
 * single quotes). The standard technique is to:
 *   1. Close the current single-quoted segment: '
 *   2. Add an escaped single quote:            \'
 *   3. Re-open a new single-quoted segment:    '
 *
 * Example: "it's" → "it'\''s"
 *
 * This prevents shell injection when interpolating values into commands
 * executed via `sh -c` (e.g. `git submodule foreach`).
 */
export function escapeSingleQuote(value: string): string {
  return value.replace(/'/g, "'\\''")
}
