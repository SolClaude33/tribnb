import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRuntimeConfigSource,
  readPublicEvmAddress,
  readPublicXUrl
} from './public-config.mjs';

const MIXED_CASE_CA = '0xAaBbCcDdEeFf0011223344556677889900aAbBcC';

test('empty public configuration keeps safe pre-launch fallbacks', () => {
  assert.equal(readPublicEvmAddress({}), '');
  assert.equal(readPublicXUrl({}), '');
  assert.match(createRuntimeConfigSource({}), /"contractAddress": ""/);
  assert.match(createRuntimeConfigSource({}), /"xUrl": ""/);
});

test('valid values are preserved and serialized safely', () => {
  const source = createRuntimeConfigSource({
    TRIBNB_CA: MIXED_CASE_CA,
    TRIBNB_X_URL: 'https://x.com/TriBNB'
  });

  assert.match(source, new RegExp(MIXED_CASE_CA));
  assert.match(source, /https:\/\/x\.com\/TriBNB/);
  assert.ok(source.startsWith('window.__TRIBNB_CONFIG__ = Object.freeze('));
});

test('malformed EVM addresses fail the build with the variable name', () => {
  assert.throws(
    () => readPublicEvmAddress({ TRIBNB_CA: '0x1234' }),
    /TRIBNB_CA/
  );
});

test('unsafe or unrelated social URLs fail the build', () => {
  for (const value of [
    'javascript:alert(1)',
    'http://x.com/TriBNB',
    'https://example.com/TriBNB',
    'https://user:pass@x.com/TriBNB'
  ]) {
    assert.throws(() => readPublicXUrl({ TRIBNB_X_URL: value }), /TRIBNB_X_URL/);
  }
});
