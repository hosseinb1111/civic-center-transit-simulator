import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const sourceFiles = [
  'src/config.js', 'src/agents.js', 'src/simulation.js', 'src/rendering.js',
  'src/ui.js', 'src/main.js', 'scripts/import-gtfs.mjs', 'scripts/static-smoke.mjs',
];
for (const file of sourceFiles) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${file}: ${result.stderr || result.stdout}`);
}

const config = JSON.parse(await fs.readFile(path.join(root, 'data/config.json'), 'utf8'));
if (!config.lines || !Array.isArray(config.services) || !config.scenarios) throw new Error('data/config.json does not contain lines, services and scenarios.');
const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
for (const required of ['id="stage"', 'id="stationSummary"', 'id="scheduleMode"', 'id="scenarioSelect"', 'src="src/main.js"']) {
  if (!html.includes(required)) throw new Error(`index.html is missing required app element: ${required}`);
}
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) throw new Error(`Duplicate HTML id(s): ${[...new Set(duplicates)].join(', ')}`);
const css = await fs.readFile(path.join(root, 'styles.css'), 'utf8');
const braces = [...css].reduce((count, char) => count + (char === '{' ? 1 : char === '}' ? -1 : 0), 0);
if (braces !== 0) throw new Error('styles.css has unbalanced braces.');
process.stdout.write(`Validated ${sourceFiles.length} JavaScript files, JSON config, HTML IDs and CSS braces.\n`);
