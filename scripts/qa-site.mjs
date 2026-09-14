import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [chromePath, url, outputPath, widthArg = '1440', heightArg = '900'] = process.argv.slice(2);

if (!chromePath || !url || !outputPath) {
  console.error('Usage: node qa-site.mjs <chrome> <url> <output> [width] [height]');
  process.exit(2);
}

const width = Number(widthArg);
const height = Number(heightArg);
const profile = join(tmpdir(), `tribnb-site-qa-${process.pid}-${Date.now()}`);
await mkdir(profile, { recursive: true });

const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  `--window-size=${width},${height}`,
  'about:blank'
], { stdio: 'ignore', windowsHide: true });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForActivePort() {
  const activePortFile = join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const text = await readFile(activePortFile, 'utf8');
      const [port] = text.trim().split(/\r?\n/);
      if (port) return port;
    } catch {
      // Chrome has not written the port yet.
    }
    await delay(50);
  }
  throw new Error('Chrome did not expose a DevTools port');
}

let socket;
let nextId = 0;
const pending = new Map();
const eventWaiters = new Map();
const runtimeErrors = [];
const failedRequests = [];

function waitForEvent(method) {
  return new Promise((resolve) => {
    const waiters = eventWaiters.get(method) ?? [];
    waiters.push(resolve);
    eventWaiters.set(method, waiters);
  });
}

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

try {
  const port = await waitForActivePort();
  const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!targetResponse.ok) throw new Error(`Could not create QA target: HTTP ${targetResponse.status}`);
  const target = await targetResponse.json();

  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
      return;
    }

    if (message.method === 'Runtime.exceptionThrown') {
      runtimeErrors.push(message.params.exceptionDetails?.text ?? 'Unknown runtime exception');
    }
    if (message.method === 'Network.loadingFailed') {
      failedRequests.push(message.params.errorText ?? 'Unknown request failure');
    }

    const waiters = eventWaiters.get(message.method);
    if (!waiters?.length) return;
    eventWaiters.delete(message.method);
    waiters.forEach((resolve) => resolve(message.params));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 480,
    screenWidth: width,
    screenHeight: height
  });

  const loaded = waitForEvent('Page.loadEventFired');
  await send('Page.navigate', { url });
  await loaded;

  await send('Runtime.evaluate', {
    expression: `document.fonts.ready.then(async () => {
      const previousScrollBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto';
      const step = Math.max(300, Math.floor(innerHeight * 0.72));
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        scrollTo(0, y);
        await new Promise(resolve => setTimeout(resolve, 70));
      }
      await Promise.all([...document.images].map(img => {
        if (img.complete && img.naturalWidth) return Promise.resolve();
        return new Promise(resolve => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
          setTimeout(resolve, 3000);
        });
      }));
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        scrollTo(0, y);
        await new Promise(resolve => setTimeout(resolve, 70));
      }
      scrollTo(0, 0);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      document.documentElement.style.scrollBehavior = previousScrollBehavior;
    })`,
    awaitPromise: true,
    returnByValue: true
  });

  const interactionResult = await send('Runtime.evaluate', {
    expression: `(async () => {
      const result = {};
      const visibleReveals = [...document.querySelectorAll('.reveal')].filter(item => item.getClientRects().length > 0);
      result.observerReveals = {
        total: visibleReveals.length,
        activated: visibleReveals.filter(item => item.classList.contains('is-visible')).length
      };
      const menu = document.querySelector('.menu-toggle');
      const nav = document.querySelector('.site-nav');
      if (innerWidth <= 860 && menu && nav) {
        menu.click();
        result.mobileMenuOpened = menu.getAttribute('aria-expanded') === 'true' && nav.classList.contains('is-open');
        menu.click();
        result.mobileMenuClosed = menu.getAttribute('aria-expanded') === 'false' && !nav.classList.contains('is-open');
      }

      if (innerWidth > 860) {
        const card = document.querySelector('[data-tilt]');
        const story = document.querySelector('[data-story-stage]');
        if (card) {
          const rect = card.getBoundingClientRect();
          card.dispatchEvent(new PointerEvent('pointermove', { clientX: rect.left + rect.width * .75, clientY: rect.top + rect.height * .35, pointerType: 'mouse', bubbles: true }));
          result.cardTilt = getComputedStyle(card).getPropertyValue('--tilt-x').trim() !== '';
          card.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse', bubbles: true }));
        }
        if (story) {
          const rect = story.getBoundingClientRect();
          story.dispatchEvent(new PointerEvent('pointermove', { clientX: rect.left + rect.width * .7, clientY: rect.top + rect.height * .4, pointerType: 'mouse', bubbles: true }));
          result.storyParallax = getComputedStyle(story).getPropertyValue('--story-trio-x').trim() !== '';
          story.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse', bubbles: true }));
        }
      }
      return result;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  await send('Runtime.evaluate', {
    expression: `(() => {
      document.querySelectorAll('.reveal').forEach(item => item.classList.add('is-visible'));
      scrollTo(0, 0);
    })()`,
    returnByValue: true
  });
  await delay(1700);

  const auditResult = await send('Runtime.evaluate', {
    expression: `(() => {
      const root = document.documentElement;
      const ids = ['top', 'legends', 'equation', 'story', 'how-it-works'];
      const sections = Object.fromEntries(ids.map(id => {
        const el = document.getElementById(id);
        const rect = el?.getBoundingClientRect();
        return [id, el ? { top: Math.round(rect.top + scrollY), width: Math.round(rect.width), height: Math.round(rect.height) } : null];
      }));
      const images = [...document.images].map(img => ({
        src: new URL(img.currentSrc || img.src, location.href).pathname.split('/').pop(),
        complete: img.complete,
        width: img.naturalWidth,
        height: img.naturalHeight,
        visible: getComputedStyle(img).display !== 'none' && img.getBoundingClientRect().width > 0
      }));
      const brokenImages = images.filter(img => !img.complete || !img.width || !img.height);
      const hashLinks = [...document.querySelectorAll('a[href^="#"]')];
      const brokenAnchors = hashLinks.map(a => a.getAttribute('href')).filter(href => href !== '#' && !document.querySelector(href));
      const legacy = ['why', 'rewards', 'tokens'].map(id => {
        const element = document.getElementById(id);
        return element ? { id, removed: false, display: getComputedStyle(element).display } : { id, removed: true };
      });
      const removedSections = ['rationale', 'truth', 'faq', 'closing'].map(id => ({
        id,
        removed: !document.getElementById(id)
      }));
      const runtimeConfig = window.__TRIBNB_CONFIG__ ?? {};
      const xButtons = [...document.querySelectorAll('[data-link="x"]')];
      const contractFields = [...document.querySelectorAll('[data-config="contractAddress"]')];
      const expectedXUrl = runtimeConfig.xUrl || '';
      const expectedContractAddress = runtimeConfig.contractAddress || '';
      const enabledXButtons = xButtons.filter(link => link.getAttribute('aria-disabled') !== 'true').length;
      const publicConfig = {
        xButtonCount: xButtons.length,
        xButtonsEnabled: enabledXButtons,
        xEnabledStateValid: expectedXUrl ? enabledXButtons === xButtons.length : enabledXButtons === 0,
        xHrefs: xButtons.map(link => link.getAttribute('href')),
        xSecurityAttributesValid: xButtons.every(link => expectedXUrl
          ? link.target === '_blank' && link.rel === 'noopener noreferrer' && link.href === expectedXUrl
          : !link.hasAttribute('href') && !link.hasAttribute('target') && !link.hasAttribute('rel') && link.getAttribute('aria-disabled') === 'true'),
        contractFieldCount: contractFields.length,
        contractTexts: contractFields.map(element => element.textContent.trim()),
        contractFieldsValid: contractFields.every(element => expectedContractAddress
          ? element.textContent.includes(element.dataset.format === 'short'
            ? expectedContractAddress.slice(0, 6) + '…' + expectedContractAddress.slice(-4)
            : expectedContractAddress)
          : element.textContent === 'CA: SOON')
      };
      return {
        viewport: { width: innerWidth, height: innerHeight },
        document: { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth, scrollHeight: root.scrollHeight },
        noHorizontalOverflow: root.scrollWidth <= root.clientWidth,
        images: { total: images.length, visible: images.filter(img => img.visible).length, broken: brokenImages },
        anchors: { total: hashLinks.length, broken: brokenAnchors },
        copyControls: document.querySelectorAll('[data-copy], .contract-line').length,
        visibleLegendCards: [...document.querySelectorAll('.legend-card')].filter(el => getComputedStyle(el).display !== 'none').length,
        reveals: {
          total: document.querySelectorAll('.reveal').length,
          visibleAfterCaptureSetup: [...document.querySelectorAll('.reveal')].filter(el => Number(getComputedStyle(el).opacity) > .95).length
        },
        sections,
        legacy,
        removedSections,
        publicConfig,
        contentChecks: {
          howItWorksPresent: Boolean(document.getElementById('how-it-works')),
          formulaPortraits: document.querySelectorAll('.formula-portrait img').length,
          formulaWordmarkPresent: Boolean(document.querySelector('.equation-result img')),
          storyBnbMarkRemoved: !document.querySelector('.story-bnb-mark'),
          footerLogoRemoved: !document.querySelector('.footer-brand'),
          footerWordmarkRemoved: !document.querySelector('.footer-wordmark'),
          preLaunchTextRemoved: !/pre[\s-]?launch/i.test(document.body.innerText),
          returnToTopInHowItWorks: Boolean(document.querySelector('#how-it-works .works-return a[href="#top"]')),
          closingCopyRemoved: !/the equation is the identity/i.test(document.body.innerText),
          heroCoreAssetPresent: document.querySelector('.hero-core') instanceof HTMLImageElement && document.querySelector('.hero-core')?.getAttribute('src') === 'assets/generated/hero-core-flap.png',
          legacyHeroCoreRemoved: !document.querySelector('svg.hero-core, #bnb-mark')
        }
      };
    })()`,
    returnByValue: true
  });

  const metrics = await send('Page.getLayoutMetrics');
  const content = metrics.cssContentSize;
  const captureHeight = Math.min(Math.ceil(content.height), 16000);
  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: Math.ceil(content.width), height: captureHeight, scale: 1 }
  });
  await writeFile(outputPath, Buffer.from(data, 'base64'));

  const report = {
    ...auditResult.result.value,
    interactions: interactionResult.result.value,
    runtimeErrors,
    failedRequests,
    capture: { path: outputPath, width: Math.ceil(content.width), height: captureHeight, fullHeight: Math.ceil(content.height) }
  };
  console.log(JSON.stringify(report, null, 2));

  const checks = report.contentChecks;
  const config = report.publicConfig;
  const failed = !report.noHorizontalOverflow || report.images.broken.length > 0 || report.anchors.broken.length > 0 || runtimeErrors.length > 0 || failedRequests.length > 0 || report.copyControls !== 0 || report.visibleLegendCards !== 3 || report.interactions.observerReveals.activated !== report.interactions.observerReveals.total || report.removedSections.some(section => !section.removed) || config.xButtonCount !== 2 || !config.xEnabledStateValid || !config.xSecurityAttributesValid || config.contractFieldCount !== 2 || !config.contractFieldsValid || !checks.howItWorksPresent || checks.formulaPortraits !== 3 || !checks.formulaWordmarkPresent || !checks.storyBnbMarkRemoved || !checks.footerLogoRemoved || !checks.footerWordmarkRemoved || !checks.preLaunchTextRemoved || !checks.returnToTopInHowItWorks || !checks.closingCopyRemoved || !checks.heroCoreAssetPresent || !checks.legacyHeroCoreRemoved;
  await send('Browser.close').catch(() => {});
  if (failed) process.exitCode = 1;
} finally {
  socket?.close();
  if (!chrome.killed) chrome.kill();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
