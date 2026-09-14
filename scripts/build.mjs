import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntimeConfigSource } from './public-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');

const runtimeFiles = [
  'index.html',
  'styles.css',
  'script.js',
  'assets/brand/tribnb-cartoon-lockup.png',
  'assets/generated/hero-background.png',
  'assets/generated/hero-triforce.png',
  'assets/generated/hero-core-flap.png',
  'assets/generated/banana-card-background.png',
  'assets/generated/banana-card-character.png',
  'assets/generated/niu-card-background.png',
  'assets/generated/niu-card-character.png',
  'assets/generated/ben-card-background.png',
  'assets/generated/ben-card-character.png',
  'assets/generated/legends-museum-background.png',
  'assets/generated/formula-lab-background.png',
  'assets/generated/formula-banana.webp',
  'assets/generated/formula-niu.webp',
  'assets/generated/formula-ben.webp',
  'assets/generated/formula-tribnb-wordmark.webp',
  'assets/generated/story-library-background.png',
  'assets/generated/story-background.png',
  'assets/generated/story-trio.png',
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const relativePath of runtimeFiles) {
  const destination = join(dist, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(root, relativePath), destination);
}

await writeFile(join(dist, 'runtime-config.js'), createRuntimeConfigSource(process.env), 'utf8');

console.log(`Built dist with ${runtimeFiles.length + 1} runtime files.`);
