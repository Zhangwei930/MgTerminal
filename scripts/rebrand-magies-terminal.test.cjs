const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const repositoryRoot = path.resolve(__dirname, '..');
const legacyAgentBrand = ['cat', 'ty'].join('');
const legacyBrand = `net${legacyAgentBrand}`;
const legacyUserBrand = ['da', 'mao'].join('');
// 匹配独立的旧 Agent 品牌词；mosh 客户端已改名 MoshMagies，无需再放行 mosh 前缀
const legacyAgentBrandPattern = new RegExp(legacyAgentBrand, 'i');
const ignoredDirectories = new Set(['.git', 'dist', 'node_modules', 'release']);
// GPL-3.0 §4/§5 require this fork to preserve the upstream project's copyright
// and authorship notices, so the attribution files must be free to name the
// upstream project and its author. Product, UI and docs strings elsewhere are
// still held to the MagiesTerminal brand by the assertions below.
const attributionFiles = new Set([
  'NOTICE',
  'README.md',
  'README.zh-CN.md',
  'README.ja-JP.md',
]);

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
    if (attributionFiles.has(file)) continue;

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
