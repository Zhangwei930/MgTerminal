# strictNullChecks

`npm run typecheck:strict` type-checks `domain/` and `lib/` with
`strictNullChecks` on and fails on any violation. It runs as part of
`npm run verify`, alongside the existing `typecheck:baseline`.

The two gates do different jobs. `typecheck:baseline` ratchets the whole
repo against a checked-in list of known errors. `typecheck:strict` is not a
baseline: within its scope the count is zero, and it stays zero.

## Why only these two layers

Turning `strictNullChecks` on for the whole project reports **624** errors:

| layer | errors | of which non-test |
| --- | --- | --- |
| `components/` | 374 | 249 |
| `infrastructure/` | 124 | 72 |
| `application/` | 55 | 30 |
| `domain/` | 42 | 17 |
| `lib/` | 8 | 8 |

`domain/` is pure logic with no side effects and `lib/` is small shared
helpers, so both could be brought to zero. The other three cannot be, not
without either a long correctness review of every site or a wave of `!`
assertions — and a non-null assertion silences exactly the bug this flag
exists to find, so it is not a shortcut worth taking.

Widen `include` as those layers are fixed.

## Excluded, and why

Three files sit outside the gate. None of their errors are about null safety;
each needs a decision rather than a fix, and guessing would change behaviour:

- **`domain/systemManager/systemTarget.ts`** — two unreachable conditions
  (`session?.protocol === 'local' && host?.os === 'linux'`, after an earlier
  line already returns for `host?.os === 'linux'`). Provably dead. Either the
  line goes, or the earlier one was meant to be narrower.
- **`domain/terminalOutputTriggerFilter.ts`** — the returned `meta` object is
  structurally narrower than `TerminalOutputChunkMeta`. Whether the type or
  the object is wrong needs someone who knows what the field means.
- **Test files** repo-wide — around 25 `domain/` test fixtures omit fields
  that `Host` and `ConnectionLog` require. Mechanical to fix, but they are
  fixtures rather than shipped code, so they are not in the gate's scope.

`domain/hostDataSource.ts` was in this list until its protocol comparison was
rewritten to read the field as a string: hosts are loaded from disk and
imported from other installs, so a value the declared union does not list can
still arrive, and narrowing to the union would have dropped those hosts from
the exported inventory.
