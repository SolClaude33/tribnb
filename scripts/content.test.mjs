import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const emDash = String.fromCodePoint(0x2014);

test('public page copy and metadata contain no em dashes', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('styles.css', root), 'utf8')
  ]);

  assert.equal(html.includes(emDash), false, 'index.html contains an em dash');
  assert.equal(css.includes(emDash), false, 'styles.css contains an em dash');
});
