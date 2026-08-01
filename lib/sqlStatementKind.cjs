"use strict";

/**
 * Classifies SQL as read-only or not, to route AI-issued statements between the
 * db.query.readonly capability (no prompt) and db.query.write (confirm-mode
 * approval + audit).
 *
 * The asymmetry matters: a write misread as a read skips approval entirely,
 * while a read misread as a write only costs an extra prompt. So every
 * ambiguity — unknown verbs, unparseable input, anything not positively
 * recognised — resolves to "not read-only".
 *
 * This is a keyword gate, not a SQL parser. It is deliberately blunt: any write
 * verb appearing anywhere outside a string literal or comment disqualifies the
 * statement, which covers data-modifying CTEs without needing to understand
 * their structure.
 */

/** Verbs that may begin a read-only statement. */
const READ_LEADING_KEYWORDS = new Set([
  "SELECT",
  "SHOW",
  "EXPLAIN",
  "DESCRIBE",
  "DESC",
  "WITH",
  "ANALYZE", // read-only plan inspection in Postgres/MySQL EXPLAIN ANALYZE form
]);

/**
 * Verbs that change state wherever they appear — including inside a CTE, which
 * is how a statement can open with WITH, close with SELECT, and still delete
 * rows. `INTO` is here because every form of it writes: INSERT INTO,
 * SELECT ... INTO OUTFILE/DUMPFILE, and SELECT ... INTO new_table.
 */
const WRITE_KEYWORDS = [
  "INSERT", "UPDATE", "DELETE", "MERGE", "REPLACE", "UPSERT",
  "CREATE", "DROP", "ALTER", "TRUNCATE", "RENAME",
  "GRANT", "REVOKE",
  "CALL", "EXEC", "EXECUTE",
  "INTO",
];

/**
 * Verbs that only mean anything in leading position — SET, BEGIN, COMMIT,
 * VACUUM, COPY and friends. The leading-keyword allowlist already rejects them,
 * so they are deliberately absent from WRITE_KEYWORDS: scanning for them
 * anywhere would misfire on ordinary column names like `start`, `end`, `set`
 * and `copy`. Extra approvals on routine reads are not free — they train people
 * to click through, which is how a real one gets waved past.
 */

/** Locking reads: harmless-looking SELECTs that take row locks. */
const LOCKING_CLAUSE_RE = /\bFOR\s+(?:UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)\b|\bLOCK\s+IN\s+SHARE\s+MODE\b/i;

const WRITE_KEYWORD_RE = new RegExp(`\\b(?:${WRITE_KEYWORDS.join("|")})\\b`, "i");

/**
 * Blanks out comments and the *contents* of string/identifier literals, so a
 * keyword scan cannot be fooled by `SELECT 'DELETE FROM t'` in either
 * direction. Structure (quotes, whitespace, punctuation) is preserved so
 * offsets stay meaningful for callers that want to show the statement back.
 */
function stripSqlNoise(sql) {
  if (typeof sql !== "string") return "";

  let out = "";
  let i = 0;

  while (i < sql.length) {
    const two = sql.slice(i, i + 2);

    if (two === "--") {
      while (i < sql.length && sql[i] !== "\n") i += 1;
      continue;
    }

    if (two === "/*") {
      i += 2;
      while (i < sql.length && sql.slice(i, i + 2) !== "*/") i += 1;
      i += 2;
      continue;
    }

    const ch = sql[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      out += ch;
      i += 1;
      while (i < sql.length) {
        // Doubled quote is an escaped quote, not a terminator.
        if (sql[i] === ch && sql[i + 1] === ch) {
          i += 2;
          continue;
        }
        if (sql[i] === "\\" && ch !== "`") {
          i += 2;
          continue;
        }
        if (sql[i] === ch) break;
        i += 1;
      }
      out += ch;
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

/** Splits on `;`, dropping empties. Literals are already blanked by the caller. */
function splitStatements(strippedSql) {
  return strippedSql
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function isReadOnlyStatement(sql) {
  const stripped = stripSqlNoise(sql);
  const statements = splitStatements(stripped);
  if (statements.length === 0) return false;

  return statements.every((statement) => {
    const leading = /^([A-Za-z]+)/.exec(statement);
    if (!leading) return false;
    if (!READ_LEADING_KEYWORDS.has(leading[1].toUpperCase())) return false;
    // Blunt on purpose: catches data-modifying CTEs and SELECT ... INTO
    // OUTFILE without parsing either of them.
    if (WRITE_KEYWORD_RE.test(statement)) return false;
    return !LOCKING_CLAUSE_RE.test(statement);
  });
}

module.exports = {
  isReadOnlyStatement,
  stripSqlNoise,
  READ_LEADING_KEYWORDS,
  WRITE_KEYWORDS,
};
