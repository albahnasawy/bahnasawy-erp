import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const outDir = path.join(rootDir, 'dist-pages');
const viteCli = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');

const result = spawnSync(process.execPath, [viteCli, 'build'], {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_DEMO_MODE: 'true',
    VITE_BASE_PATH: '/bahnasawy-erp/',
    VITE_OUT_DIR: 'dist-pages',
  },
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
fs.copyFileSync(path.join(outDir, 'index.html'), path.join(outDir, '404.html'));
console.log('Static GitHub Pages build ready at dist-pages/');
