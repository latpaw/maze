import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const scripts = ['js/shapes.js', 'js/lattices.js', 'js/graph-maze.js', 'js/maze.js', 'js/geometry.js', 'js/document.js', 'js/app.js', 'scripts/serve.mjs', 'scripts/build.mjs'];
for (const script of scripts) {
  const result = spawnSync(process.execPath, ['--check', script], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
if (new Set(ids).size !== ids.length) throw new Error('HTML 包含重复 ID');
if (/https?:\/\//.test(html.replace(/<svg[\s\S]*?<\/svg>/g, ''))) throw new Error('页面存在外部资源依赖');
console.log(`${scripts.length} 个脚本语法检查通过；HTML ID 唯一；无远程资源依赖。`);
