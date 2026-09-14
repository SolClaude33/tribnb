const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function resolveXUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';

  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    const allowedHosts = ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'];
    if (url.protocol !== 'https:' || !allowedHosts.includes(hostname) || url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

function applyPublicConfig(root = document) {
  const rawConfig = window.__TRIBNB_CONFIG__ ?? {};
  const contractAddress = typeof rawConfig.contractAddress === 'string' && /^0x[a-fA-F0-9]{40}$/.test(rawConfig.contractAddress)
    ? rawConfig.contractAddress
    : '';
  const xUrl = resolveXUrl(rawConfig.xUrl);

  root.querySelectorAll('[data-config="contractAddress"]').forEach((element) => {
    const displayAddress = element.dataset.format === 'short' && contractAddress
      ? `${contractAddress.slice(0, 6)}…${contractAddress.slice(-4)}`
      : contractAddress;
    element.textContent = contractAddress ? `CA: ${displayAddress}` : 'CA: SOON';
    element.title = contractAddress || 'Contract address coming soon';
    element.setAttribute('aria-label', contractAddress ? `Contract address: ${contractAddress}` : 'Contract address coming soon');
  });

  root.querySelectorAll('[data-link="x"]').forEach((link) => {
    if (!xUrl) {
      link.removeAttribute('href');
      link.removeAttribute('target');
      link.removeAttribute('rel');
      link.setAttribute('aria-disabled', 'true');
      link.title = 'X link coming soon';
      return;
    }

    link.href = xUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.removeAttribute('aria-disabled');
    link.title = 'Open TriBNB on X';
  });
}

applyPublicConfig();

document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-link][aria-disabled="true"]')) return;
  event.preventDefault();
});

const menuToggle = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('.site-nav');

if (menuToggle && siteNav) {
  menuToggle.addEventListener('click', () => {
    const open = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!open));
    siteNav.classList.toggle('is-open', !open);
  });

  siteNav.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link || link.getAttribute('aria-disabled') === 'true') return;
    menuToggle.setAttribute('aria-expanded', 'false');
    siteNav.classList.remove('is-open');
  });
}

const revealItems = document.querySelectorAll('.reveal');

if (reduceMotion || !('IntersectionObserver' in window)) {
  revealItems.forEach((item) => item.classList.add('is-visible'));
} else {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.14, rootMargin: '0px 0px -5% 0px' });

  revealItems.forEach((item) => observer.observe(item));
}

if (window.location.hash) {
  const hashTarget = document.querySelector(window.location.hash);

  if (hashTarget) {
    window.requestAnimationFrame(() => {
      hashTarget.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
  }
}

if (!reduceMotion) {
  const heroStage = document.querySelector('[data-hero-stage]');
  const heroLayers = heroStage ? [...heroStage.querySelectorAll('[data-depth]')] : [];

  let ticking = false;

  const renderScrollMotion = () => {
    const viewportHeight = window.innerHeight;
    const progress = clamp(window.scrollY / (viewportHeight * 1.05));

    if (heroStage) {
      heroStage.style.transform = `translate3d(0, ${progress * 28}px, 0)`;
      heroStage.style.opacity = String(1 - progress * 0.2);
      heroLayers.forEach((layer) => {
        const depth = Number(layer.dataset.depth || 0);
        layer.style.setProperty('--scroll-y', `${progress * depth * 24}px`);
      });
    }

    ticking = false;
  };

  const queueScrollMotion = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(renderScrollMotion);
  };

  renderScrollMotion();
  window.addEventListener('scroll', queueScrollMotion, { passive: true });
  window.addEventListener('resize', queueScrollMotion);

  if (heroStage) {
    heroStage.addEventListener('pointermove', (event) => {
      const rect = heroStage.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;

      heroLayers.forEach((layer) => {
        const depth = Number(layer.dataset.depth || 0);
        layer.style.setProperty('--pointer-x', `${x * depth * 18}px`);
        layer.style.setProperty('--pointer-y', `${y * depth * 14}px`);
      });
    });

    heroStage.addEventListener('pointerleave', () => {
      heroLayers.forEach((layer) => {
        layer.style.setProperty('--pointer-x', '0px');
        layer.style.setProperty('--pointer-y', '0px');
      });
    });
  }
}

if (!reduceMotion) {
  document.querySelectorAll('[data-tilt]').forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const rect = card.getBoundingClientRect();
      const x = clamp((event.clientX - rect.left) / rect.width, 0, 1) - 0.5;
      const y = clamp((event.clientY - rect.top) / rect.height, 0, 1) - 0.5;
      card.style.setProperty('--tilt-x', `${x * 5}deg`);
      card.style.setProperty('--tilt-y', `${y * -5}deg`);
      card.style.setProperty('--art-x', `${x * -5}px`);
      card.style.setProperty('--art-y', `${y * -4}px`);
      card.style.setProperty('--character-x', `${x * 7}px`);
      card.style.setProperty('--character-y', `${y * 5 - 5}px`);
    });

    card.addEventListener('pointerleave', () => {
      ['--tilt-x', '--tilt-y', '--art-x', '--art-y', '--character-x', '--character-y'].forEach((name) => {
        card.style.removeProperty(name);
      });
    });
  });

  const storyStage = document.querySelector('[data-story-stage]');

  if (storyStage) {
    storyStage.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const rect = storyStage.getBoundingClientRect();
      const x = clamp((event.clientX - rect.left) / rect.width, 0, 1) - 0.5;
      const y = clamp((event.clientY - rect.top) / rect.height, 0, 1) - 0.5;
      storyStage.style.setProperty('--story-bg-x', `${x * -7}px`);
      storyStage.style.setProperty('--story-bg-y', `${y * -5}px`);
      storyStage.style.setProperty('--story-trio-x', `${x * 10}px`);
      storyStage.style.setProperty('--story-trio-y', `${y * 7}px`);
    });

    storyStage.addEventListener('pointerleave', () => {
      ['--story-bg-x', '--story-bg-y', '--story-trio-x', '--story-trio-y'].forEach((name) => {
        storyStage.style.removeProperty(name);
      });
    });
  }
}
