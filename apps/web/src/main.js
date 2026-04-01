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
