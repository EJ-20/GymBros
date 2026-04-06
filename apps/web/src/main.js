function isReloadNavigation() {
  const entry = performance.getEntriesByType?.('navigation')?.[0];
  if (entry?.type === 'reload') return true;
  if (typeof performance !== 'undefined' && performance.navigation) {
    return performance.navigation.type === performance.navigation.TYPE_RELOAD;
  }
  return false;
}

function scrollToTopOnReload() {
  if (!isReloadNavigation()) return;
  if (window.location.hash) {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }
  window.scrollTo(0, 0);
}

window.addEventListener('load', scrollToTopOnReload);
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) scrollToTopOnReload();
});

const header = document.querySelector('.site-header');
const toggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.site-nav');

function setNavOpen(open) {
  nav?.classList.toggle('nav-open', open);
  header?.classList.toggle('nav-open', open);
  toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

if (toggle && nav && header) {
  toggle.addEventListener('click', () => {
    setNavOpen(!nav.classList.contains('nav-open'));
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setNavOpen(false));
  });
}
