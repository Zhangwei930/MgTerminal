import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSlashCommandItems,
  filterQuickMessages,
  isValidQuickMessageSlug,
  normalizeQuickMessageSlug,
  sanitizeQuickMessages,
  searchQuickMessages,
  slugFromQuickMessageName,
} from './quickMessages';

test('normalizeQuickMessageSlug lowercases and hyphenates', () => {
  assert.equal(normalizeQuickMessageSlug('Check Disk Space'), 'check-disk-space');
  assert.equal(normalizeQuickMessageSlug('  foo__bar!!  '), 'foo-bar');
});

test('slugFromQuickMessageName mirrors normalize', () => {
  assert.equal(slugFromQuickMessageName('Check Disk'), 'check-disk');
});

test('isValidQuickMessageSlug accepts simple tokens', () => {
  assert.equal(isValidQuickMessageSlug('disk-check'), true);
  assert.equal(isValidQuickMessageSlug('Disk'), false);
  assert.equal(isValidQuickMessageSlug(''), false);
});

test('filterQuickMessages matches slug prefix and name substring', () => {
  const messages = [
    { id: '1', name: 'Check disk', slug: 'disk', content: 'df -h' },
    { id: '2', name: 'List processes', slug: 'ps', content: 'ps aux' },
  ];
  assert.equal(filterQuickMessages(messages, 'di').length, 1);
  assert.equal(filterQuickMessages(messages, 'proc').length, 1);
  assert.equal(filterQuickMessages(messages, '').length, 2);
});

test('sanitizeQuickMessages rejects invalid and dedupes slugs', () => {
  const result = sanitizeQuickMessages([
    { id: '1', name: 'Valid', slug: 'valid', content: 'hello' },
    { id: '2', name: 'Duplicate', slug: 'valid', content: 'ignored' },
    { id: '3', name: '', slug: 'empty', content: 'nope' },
    { id: '4', name: 'Bad slug', slug: '!!!', content: 'nope' },
    null,
    'not-an-object',
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.slug, 'valid');
});

test('buildSlashCommandItems prefers quick messages over conflicting skill slugs', () => {
  const items = buildSlashCommandItems(
    [{ id: '1', name: 'Disk', slug: 'disk', content: 'df -h' }],
    [{ id: 's1', slug: 'disk', name: 'Disk skill', description: '' }],
    '',
  );
  assert.equal(items.length, 1);
  assert.equal(items[0]?.kind, 'quickMessage');
});

test('buildSlashCommandItems excludes skills whose slug matches any quick message', () => {
  const items = buildSlashCommandItems(
    [{ id: '1', name: 'Disk check', slug: 'disk', content: 'df -h' }],
    [{ id: 's1', slug: 'disk', name: 'Disk skill label', description: '' }],
    'label',
  );
  assert.equal(items.length, 0);
});

test('sanitizeQuickMessages returns empty array for non-array input', () => {
  assert.deepEqual(sanitizeQuickMessages(null), []);
  assert.deepEqual(sanitizeQuickMessages({}), []);
});

const searchFixture = [
  { id: '1', name: 'Deploy status', slug: 'status', content: 'Summarize the rollout.', description: 'Release check' },
  { id: '2', name: 'Disk usage', slug: 'disk', content: 'Report free space on /var.' },
  { id: '3', name: 'Tail logs', slug: 'logs', content: 'Show the last 200 lines.', description: 'Debugging' },
  { id: '4', name: 'Nginx check', slug: 'web-health', content: 'Probe the upstream.' },
];

test('searchQuickMessages returns everything for a blank query', () => {
  assert.deepEqual(searchQuickMessages(searchFixture, '   '), searchFixture);
});

test('searchQuickMessages matches name, slug, description and content', () => {
  assert.deepEqual(searchQuickMessages(searchFixture, 'deploy').map((m) => m.id), ['1']);
  assert.deepEqual(searchQuickMessages(searchFixture, 'disk').map((m) => m.id), ['2']);
  assert.deepEqual(searchQuickMessages(searchFixture, 'debugging').map((m) => m.id), ['3']);
  assert.deepEqual(searchQuickMessages(searchFixture, '/var').map((m) => m.id), ['2']);
});

test('searchQuickMessages matches slugs anywhere, unlike the slash picker', () => {
  // filterQuickMessages is prefix-anchored on slug (and falls back to name);
  // "health" is mid-slug and absent from the name, so only the search finds it.
  assert.deepEqual(filterQuickMessages(searchFixture, 'health').map((m) => m.id), []);
  assert.deepEqual(searchQuickMessages(searchFixture, 'health').map((m) => m.id), ['4']);
});

test('searchQuickMessages is case insensitive and has no match fallback', () => {
  assert.deepEqual(searchQuickMessages(searchFixture, 'DISK').map((m) => m.id), ['2']);
  assert.deepEqual(searchQuickMessages(searchFixture, 'nothing-here'), []);
});
