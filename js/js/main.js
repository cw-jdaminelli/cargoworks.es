// ===== LANGUAGE DROPDOWN =====
const langSelect = document.getElementById("langSelect");
if (langSelect) {
  const translations = window.CARGOWORKS_TRANSLATIONS || {};
  const fallbackLang = translations.en || {};

  const setText = (key, value) => {
    if (value == null) return;
    const nodes = document.querySelectorAll(`[data-i18n="${key}"]`);
    if (nodes.length) {
      nodes.forEach((node) => {
        if (typeof value === 'string' && value.includes('<li>')) {
          node.innerHTML = value;
        } else {
          node.textContent = value;
        }
      });
    } else {
      const fallback = document.getElementById(key);
      if (!fallback) return;
      if (typeof value === 'string' && value.includes('<li>')) {
        fallback.innerHTML = value;
      } else {
        fallback.textContent = value;
      }
    }
  };

  const applyLanguage = (lang) => {
    const dict = Object.assign({}, fallbackLang, translations[lang]);
    setText('navAbout', dict.navAbout);
    setText('navServices', dict.navServices);
    setText('navZones', dict.navZones);
    setText('heroCaption', dict.caption);
    setText('aboutTitle', dict.aboutTitle);
    setText('aboutText', dict.aboutText);
    setText('servicesTitle', dict.servicesTitle);
    setText('servicesList', dict.servicesList);
    setText('zonesTitle', dict.zonesTitle);
    setText('zonesText', dict.zonesText);
    setText('block1Title', dict.block1Title);
    setText('block1Body', dict.block1Body);
    setText('block2Title', dict.block2Title);
    setText('block2Body', dict.block2Body);
    setText('block3Title', dict.block3Title);
    setText('block3Body', dict.block3Body);
    setText('card1Title', dict.card1Title);
    setText('card1Body', dict.card1Body);
    setText('card2Title', dict.card2Title);
    setText('card2Body', dict.card2Body);
    setText('card3Title', dict.card3Title);
    setText('card3Body', dict.card3Body);
    setText('card4Title', dict.card4Title);
    setText('card4Body', dict.card4Body);
    setText('scrollDown', dict.scrollDown);
    setText('scrollUp', dict.scrollUp);
    setText('siteExplore', dict.siteExplore);
    setText('siteAbout', dict.siteAbout);
    setText('siteServices', dict.siteServices);
    setText('siteZones', dict.siteZones);
    setText('siteFaq', dict.siteFaq);
    setText('siteSolutions', dict.siteSolutions);
    setText('siteMessenger', dict.siteMessenger);
    setText('siteCargo', dict.siteCargo);
    setText('siteRoutes', dict.siteRoutes);
    setText('siteMaintenance', dict.siteMaintenance);
    setText('siteContact', dict.siteContact);
    setText('siteContactBlurb', dict.siteContactBlurb);
    setText('siteEmailLabel', dict.siteEmailLabel);
    setText('sitePhoneLabel', dict.sitePhoneLabel);
    setText('siteHoursLabel', dict.siteHoursLabel);
    setText('siteHoursText', dict.siteHoursText);
    setText('footerInstagram', dict.footerInstagram);
    setText('footerCopy', dict.footerCopy);

    document.documentElement.lang = lang;
    try { localStorage.setItem('lang', lang); } catch (err) { /* storage optional */ }

    fitHeroCaption();
    matchCaptionToTitle();
  };

  const initialLang = (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || langSelect.value || 'en';
  langSelect.value = initialLang;
  applyLanguage(initialLang);

  langSelect.addEventListener('change', (event) => {
    applyLanguage(event.target.value);
  });
}

// Autosize the hero caption to fit into the caption box by reducing font-size until it fits
function fitHeroCaption() {
  const caption = document.getElementById('heroCaption');
  if (!caption) return;
  // wrap caption text into an inner node used for measurement and possible horizontal stretch
  let inner = caption.querySelector('.fit-inner');
  if (!inner) {
    inner = document.createElement('span');
    inner.className = 'fit-inner';
    // move caption children into inner
    while (caption.firstChild) inner.appendChild(caption.firstChild);
    caption.appendChild(inner);
  }

  const containerWidth = parseFloat(getComputedStyle(caption).width);
  let fontSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hero-caption-max-size')) || parseFloat(getComputedStyle(inner).fontSize) || 48;

  // Start from the max font size and allow wrapping; do not reduce based on container height
  inner.style.fontSize = fontSize + 'px';
  inner.style.transform = 'none';

  // Ensure the inner does not exceed container height by allowing wrapping and then only reducing if overflow occurs
  const maxAttempts = 20;
  let attempts = 0;
  while (inner.scrollHeight > caption.clientHeight && fontSize > 12 && attempts < maxAttempts) {
    fontSize -= 2; // reduce in larger steps to be faster
    inner.style.fontSize = fontSize + 'px';
    attempts++;
  }

  // Stretch horizontally if still narrower than container (cap 20%)
  const innerWidth = inner.getBoundingClientRect().width;
  if (innerWidth < containerWidth) {
    const scaleX = Math.min(1.2, containerWidth / innerWidth);
    inner.style.transform = `scaleX(${scaleX})`;
    inner.style.display = 'inline-block';
  }
}

// Run on load and resize
window.addEventListener('load', () => setTimeout(fitHeroCaption, 60));
window.addEventListener('resize', () => {
  // debounce resize handlers to avoid repeated layout thrash
  if (window._heroResizeTimer) clearTimeout(window._heroResizeTimer);
  window._heroResizeTimer = setTimeout(() => {
    fitHeroCaption();
  }, 120);
});

// Match caption width to the hero title width when the --match modifier is present
function matchCaptionToTitle() {
  const title = document.querySelector('.hero-title');
  const caption = document.querySelector('.hero-caption.hero-caption--match');
  if (!title || !caption) return;

  // measure rendered width and apply it to the caption (with small padding)
  const rect = title.getBoundingClientRect();
  caption.style.transform = 'none';
  caption.style.marginLeft = 'auto';
  caption.style.marginRight = 'auto';
  caption.style.textAlign = 'center';
  // prefer a generous width so the caption reads clearly under the banner
  // allow up to 90% of the viewport width on wide screens, or slightly wider than the title
  const expandedWidth = Math.min(window.innerWidth * 0.92, rect.width + 260, 1180);
  caption.style.width = expandedWidth + 'px';
  caption.style.maxWidth = Math.min(window.innerWidth * 0.92, 1180) + 'px';
  // after adjusting width, refit the text size
  fitHeroCaption();
}

// ensure caption width matching runs after load and on resize (debounced)
window.addEventListener('load', () => setTimeout(matchCaptionToTitle, 120));
window.addEventListener('resize', () => {
  if (window._heroResizeTimer) clearTimeout(window._heroResizeTimer);
  window._heroResizeTimer = setTimeout(() => {
    matchCaptionToTitle();
  }, 140);
});

// Random Barcelona hero image each load

// 1) Random hero with per-photo focus (edit focus values below)
(function setRandomHeroImage() {
  const hero = document.getElementById('hero') || document.querySelector('.hero-section');
  if (!hero) return;

  const HERO_IMAGES = [
    { url: 'https://images.unsplash.com/photo-1468793195345-d9d67818016d?q=80&w=1600&auto=format&fit=crop', focus: '50% 60%' },
    { url: 'https://images.unsplash.com/photo-1734872083965-025e07ac5912?q=80&w=1600&auto=format&fit=crop', focus: '50% 40%' },
    { url: 'https://images.unsplash.com/photo-1698861560273-afb83a672ce6?q=80&w=1600&auto=format&fit=crop', focus: '50% 55%' },
    { url: 'https://images.unsplash.com/photo-1507619579562-f2e10da1ec86?q=80&w=1600&auto=format&fit=crop', focus: 'center 55%' },
    { url: 'https://images.unsplash.com/photo-1688199412486-b486eff757da?q=80&w=1600&auto=format&fit=crop', focus: 'center 45%' },
    { url: 'https://images.unsplash.com/photo-1564221710304-0b37c8b9d729?q=80&w=1600&auto=format&fit=crop', focus: '50% 35%' }
  ];
  // Preload all hero images
  HERO_IMAGES.forEach((imgObj) => {
    const img = new window.Image();
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.src = imgObj.url;
  });
  const pick = HERO_IMAGES[Math.floor(Math.random() * HERO_IMAGES.length)];
  const focus = pick.focus || '50% 60%';
  hero.style.setProperty('--hero-image', `url("${pick.url}")`);
  hero.style.setProperty('--hero-focus', focus);
  hero.style.backgroundImage = `url("${pick.url}")`;
  hero.style.backgroundPosition = focus;
})();

// language helper removed (handled above)
