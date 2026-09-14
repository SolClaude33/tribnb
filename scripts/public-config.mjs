const X_HOSTNAMES = new Set([
  'x.com',
  'www.x.com',
  'twitter.com',
  'www.twitter.com'
]);

function readOptionalValue(environment, variableName) {
  const value = environment[variableName];
  return typeof value === 'string' ? value.trim() : '';
}

export function readPublicEvmAddress(environment, variableName = 'TRIBNB_CA') {
  const address = readOptionalValue(environment, variableName);
  if (!address) return '';

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error(`${variableName} must be 0x followed by 40 hexadecimal characters`);
  }

  return address;
}

export function readPublicXUrl(environment, variableName = 'TRIBNB_X_URL') {
  const value = readOptionalValue(environment, variableName);
  if (!value) return '';

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !X_HOSTNAMES.has(url.hostname.toLowerCase())) {
      throw new Error('unsupported X URL');
    }
    if (url.username || url.password) throw new Error('credentials are not allowed');
    return url.href;
  } catch {
    throw new Error(`${variableName} must be a valid https://x.com or https://twitter.com URL`);
  }
}

export function createRuntimeConfigSource(environment = process.env) {
  const config = {
    contractAddress: readPublicEvmAddress(environment),
    xUrl: readPublicXUrl(environment)
  };

  return `window.__TRIBNB_CONFIG__ = Object.freeze(${JSON.stringify(config, null, 2)});\n`;
}
