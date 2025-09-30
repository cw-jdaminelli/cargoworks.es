// ===== THEME TOGGLE (CodePen switch wired to .light/.dark) =====
const themeInput = document.getElementById("themeToggle");
const switchInfo  = document.querySelector(".switch__info");

// OS preference
const prefersDark = window.matchMedia &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

function setColorMode(mode) {
  if (mode === "dark") {
    document.body.classList.add("dark");
    document.body.classList.remove("light");
    themeInput.checked = true;
    if (switchInfo) switchInfo.textContent = "Dark Mode Active";
  } else {
    document.body.classList.add("light");
    document.body.classList.remove("dark");
    themeInput.checked = false;
    if (switchInfo) switchInfo.textContent = "Light Mode Active";
  }
  localStorage.setItem("color-scheme", mode);
}

// initial: saved → OS → light
const saved = localStorage.getItem("color-scheme");
setColorMode(saved ? saved : (prefersDark ? "dark" : "light"));

// on toggle click
themeInput.addEventListener("change", () => {
  setColorMode(themeInput.checked ? "dark" : "light");
});

// ===== LANGUAGE DROPDOWN =====
const langSelect = document.getElementById("langSelect");
if (langSelect) {
  langSelect.addEventListener("change", () => {
    const isES = langSelect.value === "es";

    // Nav
    const navAbout = document.getElementById("navAbout");
    const navServices = document.getElementById("navServices");
    const navZones = document.getElementById("navZones");
    if (navAbout)    navAbout.innerText    = isES ? "Nosotros"  : "About";
    if (navServices) navServices.innerText = isES ? "Servicios" : "Services";
    if (navZones)    navZones.innerText    = isES ? "Zonas"     : "Zones";

    // Hero caption
    const heroCaption = document.getElementById("heroCaption");
    if (heroCaption) heroCaption.innerText = isES
      ? "Somos Cargoworks: un equipo de repartidores que conoce la ciudad como su casa. Entregamos paquetes, comidas y suministros con rapidez de barrio y cuidado humano. Sin marketing vacío, solo logística honesta y cercana: fiable, de bajo impacto y pensada para las calles que servimos. Llegamos a tiempo, tratamos cada entrega como un compromiso y reducimos el ruido y la congestión. Para negocios que buscan rapidez, responsabilidad y un vínculo con su comunidad, somos la opción práctica y profesional: gente que trabaja en bici y se preocupa por la ciudad."
      : "We’re Cargoworks — a crew of riders who know the city by heart. We deliver urgent parcels, meals and supplies with the speed of a local and the care of a neighbor. No corporate fluff, just honest, human-powered logistics: reliable, low-impact, and tuned to the rhythms of our streets. We show up on time, treat every drop-off like a promise, and keep the city moving without choking it. For businesses that want speed, accountability and a community edge, we’re the practical, professional choice — run by people who care.";

    // Sections
    const aboutTitle = document.getElementById("aboutTitle");
    const aboutText  = document.getElementById("aboutText");
    if (aboutTitle) aboutTitle.innerText = isES ? "Sobre Nosotros" : "About Us";
    if (aboutText)  aboutText.innerText  = isES
      ? "Somos un servicio de mensajería y logística en bicicleta, fiable y socialmente consciente en Barcelona."
      : "We are a reliable and socially conscious bike logistics service in Barcelona. Fast, clean, and human-powered.";

    const servicesTitle = document.getElementById("servicesTitle");
    const servicesList  = document.getElementById("servicesList");
    if (servicesTitle) servicesTitle.innerText = isES ? "Servicios" : "Services";
    if (servicesList)  servicesList.innerHTML  = isES
      ? "<li>Mensajería y repartos</li><li>Consultoría de bicis de carga</li><li>Soluciones logísticas para empresas</li><li>Mantenimiento y formación de flotas</li>"
      : "<li>Messenger & courier deliveries</li><li>Cargo bike consulting</li><li>Logistics solutions for businesses</li><li>Fleet maintenance & training</li>";

    const zonesTitle = document.getElementById("zonesTitle");
    const zonesText  = document.getElementById("zonesText");
    if (zonesTitle) zonesTitle.innerText = isES ? "Mapa de Zonas y Precios" : "Zone Map & Prices";
    if (zonesText)  zonesText.innerText  = isES
      ? "Contáctanos para detalles sobre peso, horarios y entregas en fin de semana."
      : "Contact us for details on weight, timing, and weekend deliveries.";
    // re-fit hero caption after language change
    fitHeroCaption();
    matchCaptionToTitle();
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
  caption.style.margin = '0 auto';
  // prefer a generous width so the caption reads clearly under the banner
  // allow up to 90% of the viewport width on wide screens, or slightly wider than the title
  const preferWidth = Math.min(window.innerWidth * 0.90, rect.width + 220);
  caption.style.width = preferWidth + 'px';
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
