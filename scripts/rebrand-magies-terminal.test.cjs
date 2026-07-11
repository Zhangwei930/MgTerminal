const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const repositoryRoot = path.resolve(__dirname, '..');
const legacyAgentBrand = ['cat', 'ty'].join('');
const legacyBrand = `net${legacyAgentBrand}`;
const legacyUserBrand = ['da', 'mao'].join('');
// 匹配独立的旧 Agent 品牌词，但放行外部依赖 MoshCatty（binaricat/MoshCatty 及其 moshcatty-* 发布件）
const legacyAgentBrandPattern = new RegExp(`(?<!mosh)${legacyAgentBrand}`, 'i');
const ignoredDirectories = new Set(['.git', 'dist', 'node_modules', 'release']);

function listFiles(directory, relativeDirectory = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name)
        ? []
        : listFiles(absolutePath, relativePath);
    }

    return entry.isFile() ? [relativePath] : [];
  });
}

test('tracked files use the MagiesTerminal brand', () => {
  const trackedFiles = listFiles(repositoryRoot);

  const legacyPaths = trackedFiles.filter(
    (file) =>
      file.toLowerCase().includes(legacyBrand) ||
      legacyAgentBrandPattern.test(file) ||
      file.toLowerCase().includes(legacyUserBrand),
  );
  const legacyContent = [];

  for (const file of trackedFiles) {
    const content = fs.readFileSync(path.join(repositoryRoot, file));
    if (content.includes(0)) continue;

    const text = content.toString('utf8');
    if (
      text.toLowerCase().includes(legacyBrand) ||
      legacyAgentBrandPattern.test(text) ||
      text.toLowerCase().includes(legacyUserBrand)
    ) {
      legacyContent.push(file);
    }
  }

  assert.deepEqual(legacyPaths, [], `legacy brand remains in paths:\n${legacyPaths.join('\n')}`);
  assert.deepEqual(legacyContent, [], `legacy brand remains in files:\n${legacyContent.join('\n')}`);
});
