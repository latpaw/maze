import { mkdir, cp } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await mkdir(new URL('dist/', root), { recursive: true });
for (const path of ['index.html', 'styles.css', 'js', 'assets']) {
  await cp(new URL(path, root), new URL(`dist/${path}`, root), { recursive: true });
}
console.log('静态网页已输出到 dist/，可部署到任意静态托管服务。');
