/**
 * Splits a shell-like command string into argv tokens for spawning without a
 * shell (see electron/main/registerBridges.cjs's pet context-menu handler).
 * Deliberately minimal: whitespace-separated tokens, with single/double
 * quotes grouping a token that contains spaces. No escaping, globbing, env
 * expansion, or pipes — this runs one fixed command the user typed into
 * Settings, not a general shell.
 */
export function parseCommandString(input: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"?|'([^']*)'?|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}
