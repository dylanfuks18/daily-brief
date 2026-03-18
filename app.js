/* =============================================
   DAILY BRIEF - app.js
   ============================================= */

// ESPN API publica — sin API key, CORS habilitado, datos en tiempo real
const ESPN_LEAGUES = [
  { slug: 'uefa.champions',        label: 'Champions',    emoji: '🏆' },
  { slug: 'eng.1',                 label: 'Premier',      emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { slug: 'esp.1',                 label: 'La Liga',      emoji: '🇪🇸' },
  { slug: 'conmebol.libertadores', label: 'Libertadores', emoji: '🌎' },
  { slug: 'arg.1',                 label: 'Argentina',    emoji: '🇦🇷' },
  { slug: 'ger.1',                 label: 'Bundesliga',   emoji: '🇩🇪' },
];

// 🎬 Cartelera: consegui tu clave GRATIS en themoviedb.org/settings/api (30 segundos)
// Sin clave igual aparece el link a Showcase Belgrano
const TMDB_KEY = '504f14f901ce7bdd31f468dadcd79165';

const CAT_EMOJI = { tech: '🤖', israel: '🌍', poleco: '🏛️', sports: '⚽', cinema: '🎬', ar_pol: '🇦🇷' };

// ---------- BOLD TEXT PROCESSOR ----------
function boldifyText(text) {
  if (!text) return '';
  // Escape HTML primero
  const escaped = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let result = escaped;

  // Bold números con contexto (%, $, cantidades)
  result = result.replace(/\b(\d[\d.,]*\s*(?:%|millones?|mil|dólares?|pesos?|USD|€|km|km²|años?|meses?|días?|horas?|muertos?|heridos?|presos?)?)\b/g,
    '<strong>$1</strong>');

  // Bold texto entre comillas
  result = result.replace(/[""]([^""]{4,60})[""]|"([^"]{4,60})"/g,
    (m, a, b) => `"<strong>${a || b}</strong>"`);

  // Bold nombres propios (2+ palabras capitalizadas consecutivas)
  result = result.replace(/(?<![.!?]\s)(?<![<>])([A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]{2,}(?:\s+[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]{2,})+)/g,
    '<strong>$1</strong>');

  // Convertir párrafos (doble salto de línea)
  result = '<p>' + result.split(/\n\n+/).join('</p><p>') + '</p>';
  // Saltos simples → <br>
  result = result.replace(/([^>])\n([^<])/g, '$1<br>$2');

  return result;
}

// ---------- STATE ----------
let allArticles    = [];
let isDark         = localStorage.getItem('theme') !== 'light';
let readLater      = JSON.parse(localStorage.getItem('readLater')  || '[]');
let favorites      = JSON.parse(localStorage.getItem('favorites')  || '[]');
let currentArticle = null;

// ---------- INIT ----------
document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  setHeaderDate();
  renderSavedSection('readlater');
  renderSavedSection('favorites');
  updateBadges();
  loadAll();
  setupSwipeClose();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
});

// ---------- DATE ----------
function setHeaderDate() {
  const now    = new Date();
  const days   = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'];
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  document.getElementById('header-date').textContent =
    `${days[now.getDay()]} ${now.getDate()} de ${months[now.getMonth()]}`;
}

// ---------- THEME ----------
function applyTheme() {
  document.body.classList.toggle('dark', isDark);
  document.body.classList.toggle('light', !isDark);
  document.getElementById('theme-label').textContent = isDark ? 'Modo Claro' : 'Modo Oscuro';
  const ico = document.getElementById('theme-icon');
  ico.innerHTML = isDark
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`;
  document.querySelector('meta[name="theme-color"]').setAttribute('content', isDark ? '#000000' : '#f2f2f7');
}
function toggleTheme() {
  isDark = !isDark;
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  applyTheme();
}

// ---------- MENU ----------
function toggleMenu() {
  document.getElementById('side-menu').classList.toggle('open');
  document.getElementById('menu-overlay').classList.toggle('open');
  document.body.style.overflow = document.getElementById('side-menu').classList.contains('open') ? 'hidden' : '';
}

// ---------- SECTIONS ----------
function showSection(name) {
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-' + name).classList.add('active');
  document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('active-nav'));
  const btn = document.getElementById('nav-' + name);
  if (btn) btn.classList.add('active-nav');
  toggleMenu();
}

// ---------- COLLAPSE CATEGORY ----------
function toggleCat(cat) {
  const list  = document.getElementById('cat-' + cat);
  const arrow = document.getElementById('arrow-' + cat);
  if (!list) return;
  const hidden = list.style.display === 'none';
  list.style.display = hidden ? '' : 'none';
  arrow?.classList.toggle('collapsed', !hidden);
}

// ---------- SKELETONS ----------
function showSkeletons(id, n = 3) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = Array.from({ length: n }, () => `
    <div class="skeleton-card">
      <div class="skeleton-line short"></div>
      <div class="skeleton-line title"></div>
      <div class="skeleton-line long"></div>
      <div class="skeleton-line medium"></div>
    </div>`).join('');
}

// ---------- REFRESH ----------
function refreshAll() {
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  allArticles = [];
  loadAll().finally(() => btn.classList.remove('spinning'));
}

// ---------- LOAD ----------
async function loadAll() {
  ['cat-tech','cat-israel','cat-poleco','cat-sports','cat-cinema','argentina-container','jobs-news-container']
    .forEach(id => showSkeletons(id, 3));
  await Promise.all([loadMatches(), fetchNews(), loadCartelera(), loadEconWidget()]);
  renderAll();
}

// ---------- FETCH news.json ----------
async function fetchNews() {
  try {
    const res  = await fetch('news.json?v=' + Date.now());
    if (!res.ok) throw new Error('no file');
    const data = await res.json();
    allArticles = data.articles || [];
    if (data.updated) {
      const t = new Date(data.updated).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      const el = document.getElementById('header-date');
      if (el && !el.textContent.includes('·')) el.textContent += ' · ' + t;
    }
  } catch {
    const msg = `<div class="error-card" style="text-align:left;line-height:1.75;color:var(--text3)">
      Para generar el primer catalogo de noticias:<br>
      <strong style="color:var(--accent)">1.</strong> Entra a <strong>github.com/dylanfuks18/daily-brief</strong><br>
      <strong style="color:var(--accent)">2.</strong> Click en <strong>Actions</strong> &rarr; <strong>Fetch News</strong><br>
      <strong style="color:var(--accent)">3.</strong> Click en <strong>Run workflow</strong> &rarr; <strong>Run workflow</strong><br>
      <strong style="color:var(--accent)">4.</strong> Espera ~1 minuto y recarga
    </div>`;
    ['top-container','cat-tech','cat-israel','cat-poleco','cat-sports','cat-cinema'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = msg;
    });
  }
}

// ---------- HELPERS ----------
function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60)    return 'hace un momento';
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return `hace ${Math.floor(diff / 86400)}d`;
}

// ---------- RENDER ALL ----------
function renderAll() {
  const by = { tech: [], israel: [], poleco: [], sports: [], cinema: [], ar_pol: [] };
  allArticles.forEach(a => { if (by[a.cat]) by[a.cat].push(a); });

  // Separar tweets de @MokedBitajon del resto de noticias israel
  const israelTweets   = by.israel.filter(a => a.source === 'MokedBitajon');
  const israelArticles = by.israel.filter(a => a.source !== 'MokedBitajon');

  // Top del dia → carousel (1 from each category, preferir articulos sobre tweets)
  const top = ['tech','israel','poleco','sports','cinema']
    .map(c => c === 'israel' ? israelArticles[0] || israelTweets[0] : by[c][0])
    .filter(Boolean);
  renderCarousel('top-container', top);

  renderList('cat-tech',            by.tech.slice(0, 8));
  renderTweetCarousel('tweets-israel', israelTweets.slice(0, 8));
  renderList('israel-articles',     israelArticles.slice(0, 6));
  renderList('cat-poleco',          by.poleco.slice(0, 8));
  renderList('cat-sports',          by.sports.slice(0, 8));
  renderList('cat-cinema',          by.cinema.slice(0, 6));
  renderList('argentina-container', by.ar_pol.slice(0, 10));

  const jobsKw = ['empleo','trabajo','contrat','vacante','remoto','junior','senior','desarrollador','developer'];
  renderList('jobs-news-container',
    [...by.tech, ...by.poleco].filter(a => jobsKw.some(k => a.title.toLowerCase().includes(k))).slice(0, 5));
}

// ---------- TWEET CAROUSEL ----------
function renderTweetCarousel(id, articles) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!articles.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="tweet-scroll">${articles.map(buildTweetCard).join('')}</div>`;
}

function buildTweetCard(a) {
  const xUrl = a.link || 'https://x.com/MokedBitajon';
  const text  = (a.summary && a.summary.length > a.title.length) ? a.summary : a.title;
  const safe  = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  return `
  <div class="tweet-card" onclick="window.open('${xUrl}','_blank','noopener')">
    <div class="tweet-header">
      <div class="tweet-avatar">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.26 5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      </div>
      <div class="tweet-handle-col">
        <div class="tweet-name">Moked Bitajon</div>
        <div class="tweet-at">@MokedBitajon</div>
      </div>
    </div>
    <div class="tweet-body">${safe}</div>
    <div class="tweet-footer">
      <span class="tweet-time">${timeAgo(a.pubDate)}</span>
      <span class="tweet-x-mark">𝕏</span>
    </div>
  </div>`;
}

// ---------- CAROUSEL RENDER ----------
function renderCarousel(id, articles) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!articles.length) { el.innerHTML = '<div class="error-card">No hay noticias disponibles.</div>'; return; }
  el.innerHTML = articles.map(a => buildTopCard(a)).join('');
}

function buildTopCard(a) {
  const safeId = CSS.escape ? CSS.escape(a.id) : a.id;
  const hasImg = !!a.image;
  const emoji  = CAT_EMOJI[a.cat] || '📰';
  return `
  <div class="top-visual-card${hasImg ? '' : ' no-img'}" onclick="openArticle('${a.id}')">
    ${hasImg
      ? `<img class="tvc-bg" src="${a.image}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><div class="tvc-no-img" style="display:none"><span class="tvc-no-img-icon">${emoji}</span></div>`
      : `<div class="tvc-no-img"><span class="tvc-no-img-icon">${emoji}</span></div>`
    }
    <div class="tvc-gradient"></div>
    <div class="tvc-content">
      <div class="tvc-source">${a.source}</div>
      <div class="tvc-title">${a.title}</div>
    </div>
  </div>`;
}

// ---------- LIST RENDER ----------
function renderList(id, articles) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!articles.length) { el.innerHTML = `<div class="error-card">No hay noticias en esta categoria.</div>`; return; }
  el.innerHTML = articles.map(a => buildCard(a)).join('');
}

// ---------- CARD ----------
function buildCard(a) {
  const rl  = readLater.includes(a.id);
  const fav = favorites.includes(a.id);

  const thumbHtml = a.image
    ? `<img class="card-thumb" src="${a.image}" alt="" onerror="this.style.display='none'" loading="lazy">`
    : '';

  return `
  <div class="news-card" id="card-${a.id}" onclick="openArticle('${a.id}')">
    <div class="card-meta">
      <span class="card-source">${a.source}</span>
      <span class="card-time">${timeAgo(a.pubDate)}</span>
    </div>
    <div class="card-body">
      <div class="card-text">
        <div class="card-title${a.image ? ' has-thumb' : ''}">${a.title}</div>
        ${a.summary ? `<div class="card-preview">${a.summary}</div>` : ''}
      </div>
      ${thumbHtml}
    </div>
    <div class="card-footer">
      <span class="card-read-hint">Toca para leer &rsaquo;</span>
      <div class="card-actions">
        <button class="card-action-btn${rl ? ' active' : ''}" onclick="cardToggleRL(event,'${a.id}')" title="Leer despues">
          <svg viewBox="0 0 24 24" fill="${rl ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8">
            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
          </svg>
        </button>
        <button class="card-action-btn${fav ? ' fav-active' : ''}" onclick="cardToggleFav(event,'${a.id}')" title="Favorito">
          <svg viewBox="0 0 24 24" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
      </div>
    </div>
  </div>`;
}

// ---------- ARTICLE MODAL ----------
function openArticle(id) {
  const a = allArticles.find(x => x.id === id) || getStored(id);
  if (!a) return;
  currentArticle = a;

  const hero = document.getElementById('article-hero');
  if (a.image) { hero.src = a.image; hero.style.display = 'block'; }
  else { hero.style.display = 'none'; hero.src = ''; }

  document.getElementById('article-source').textContent = a.source;
  document.getElementById('article-time').textContent   = timeAgo(a.pubDate);
  document.getElementById('article-title').textContent  = a.title;

  const bodyEl = document.getElementById('article-body');
  bodyEl.innerHTML = boldifyText(a.summary || '');

  // Botón "leer artículo completo" si el contenido es corto
  const existingBtn = document.getElementById('article-load-btn');
  if (existingBtn) existingBtn.remove();

  if (!a.summary || a.summary.length < 400) {
    const btn = document.createElement('button');
    btn.id = 'article-load-btn';
    btn.className = 'article-fetch-btn';
    btn.textContent = 'Cargar artículo completo →';
    btn.onclick = () => loadFullArticle(a.link, btn);
    bodyEl.after(btn);
  }

  updateModalButtons();
  document.getElementById('article-scroll').scrollTop = 0;
  document.getElementById('article-overlay').classList.add('open');
  document.getElementById('article-sheet').classList.add('open');
  document.body.style.overflow = 'hidden';
}

// ---------- FULL ARTICLE FETCHER ----------
const ARTICLE_PROXIES = [
  url => ({ endpoint: `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, isJson: true }),
  url => ({ endpoint: `https://corsproxy.io/?${encodeURIComponent(url)}`, isJson: false }),
  url => ({ endpoint: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, isJson: false }),
];

const JUNK_SELECTORS = [
  'script','style','nav','header','footer','aside','iframe','form','noscript',
  '.ads','.ad','.advertisement','.related','.share','.social','.newsletter',
  '.cookie','.popup','.sidebar','.comments','[class*="banner"]','[class*="promo"]',
  '[class*="widget"]','[id*="sidebar"]','[id*="related"]'
];

const CONTENT_SELECTORS = [
  '[itemprop="articleBody"]', '.article-body', '.article-content',
  '.article__body', '.article__content', '.nota-cuerpo', '.nota__cuerpo',
  '.cuerpo-nota', '.post-content', '.entry-content', '.story-body',
  '.content-body', '.article-text', '.post-body', 'article', 'main'
];

async function loadFullArticle(url, btn) {
  if (!url || url === '#') {
    btn.textContent = 'No hay URL disponible.';
    btn.disabled = true;
    return;
  }
  btn.textContent = 'Cargando artículo...';
  btn.disabled = true;

  let html = null;

  for (const proxyFn of ARTICLE_PROXIES) {
    try {
      const { endpoint, isJson } = proxyFn(url);
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      if (isJson) {
        const data = await res.json();
        // allorigins.win devuelve status.http_code — verificar que el sitio respondió 200
        const httpCode = data?.status?.http_code ?? 200;
        if (data.contents && data.contents.length > 200 && httpCode === 200) { html = data.contents; break; }
      } else {
        const text = await res.text();
        if (text && text.length > 200) { html = text; break; }
      }
    } catch { continue; }
  }

  if (!html) {
    // Ningún proxy funcionó → botón para abrir en el navegador
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.className = 'article-fetch-btn'; a.style.textDecoration = 'none';
    a.textContent = 'Abrir artículo en el navegador →';
    btn.replaceWith(a);
    return;
  }

  try {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(html, 'text/html');

    // Limpiar basura
    JUNK_SELECTORS.forEach(sel => {
      try { doc.querySelectorAll(sel).forEach(el => el.remove()); } catch {}
    });

    // Buscar contenido principal
    let mainEl = null;
    for (const sel of CONTENT_SELECTORS) {
      try {
        const el = doc.querySelector(sel);
        if (el && el.textContent.trim().length > 200) { mainEl = el; break; }
      } catch {}
    }
    if (!mainEl) mainEl = doc.body;

    const paras = Array.from(mainEl.querySelectorAll('p'))
      .map(p => p.textContent.trim())
      .filter(t => t.length > 40 && !t.includes('©') && !t.match(/todos los derechos/i));

    if (paras.length > 0) {
      document.getElementById('article-body').innerHTML = boldifyText(paras.join('\n\n'));
      btn.remove();
    } else {
      throw new Error('sin párrafos');
    }
  } catch {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.className = 'article-fetch-btn'; a.style.textDecoration = 'none';
    a.textContent = 'Abrir artículo en el navegador →';
    btn.replaceWith(a);
  }
}

function closeArticle() {
  document.getElementById('article-overlay').classList.remove('open');
  document.getElementById('article-sheet').classList.remove('open');
  document.body.style.overflow = '';
  currentArticle = null;
}

function updateModalButtons() {
  if (!currentArticle) return;
  const rl  = readLater.includes(currentArticle.id);
  const fav = favorites.includes(currentArticle.id);
  const rlBtn  = document.getElementById('modal-rl-btn');
  const favBtn = document.getElementById('modal-fav-btn');
  rlBtn.className  = `article-btn-rl${rl ? ' active' : ''}`;
  favBtn.className = `article-btn-fav${fav ? ' active' : ''}`;
  rlBtn.querySelector('svg').setAttribute('fill', rl ? 'currentColor' : 'none');
  favBtn.querySelector('svg').setAttribute('fill', fav ? 'currentColor' : 'none');
}

function modalToggleRL() {
  if (!currentArticle) return;
  const id = currentArticle.id;
  readLater = readLater.includes(id) ? readLater.filter(x => x !== id) : [...readLater, id];
  storeArticle(currentArticle);
  localStorage.setItem('readLater', JSON.stringify(readLater));
  updateModalButtons();
  refreshCardButtons(id);
  renderSavedSection('readlater');
  updateBadges();
}

function modalToggleFav() {
  if (!currentArticle) return;
  const id = currentArticle.id;
  favorites = favorites.includes(id) ? favorites.filter(x => x !== id) : [...favorites, id];
  storeArticle(currentArticle);
  localStorage.setItem('favorites', JSON.stringify(favorites));
  updateModalButtons();
  refreshCardButtons(id);
  renderSavedSection('favorites');
  updateBadges();
}

// Swipe down to close modal
function setupSwipeClose() {
  const sheet = document.getElementById('article-sheet');
  let startY = 0;
  sheet.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchend', e => {
    const delta = e.changedTouches[0].clientY - startY;
    if (delta > 80) closeArticle();
  }, { passive: true });
}

// ---------- CARD QUICK ACTIONS (without opening modal) ----------
function cardToggleRL(e, id) {
  e.stopPropagation();
  const a = allArticles.find(x => x.id === id) || getStored(id);
  if (!a) return;
  readLater = readLater.includes(id) ? readLater.filter(x => x !== id) : [...readLater, id];
  storeArticle(a);
  localStorage.setItem('readLater', JSON.stringify(readLater));
  refreshCardButtons(id);
  renderSavedSection('readlater');
  updateBadges();
}

function cardToggleFav(e, id) {
  e.stopPropagation();
  const a = allArticles.find(x => x.id === id) || getStored(id);
  if (!a) return;
  favorites = favorites.includes(id) ? favorites.filter(x => x !== id) : [...favorites, id];
  storeArticle(a);
  localStorage.setItem('favorites', JSON.stringify(favorites));
  refreshCardButtons(id);
  renderSavedSection('favorites');
  updateBadges();
}

function refreshCardButtons(id) {
  const card = document.getElementById('card-' + id);
  if (!card) return;
  const btns = card.querySelectorAll('.card-action-btn');
  btns.forEach((btn, i) => {
    const active = i === 0 ? readLater.includes(id) : favorites.includes(id);
    btn.className = `card-action-btn${active ? (i === 0 ? ' active' : ' fav-active') : ''}`;
    btn.innerHTML = i === 0
      ? `<svg viewBox="0 0 24 24" fill="${active?'currentColor':'none'}" stroke="currentColor" stroke-width="1.8"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="${active?'currentColor':'none'}" stroke="currentColor" stroke-width="1.8"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  });
}

// ---------- STORAGE ----------
function storeArticle(a) {
  const s = JSON.parse(localStorage.getItem('articleStore') || '{}');
  s[a.id] = a;
  localStorage.setItem('articleStore', JSON.stringify(s));
}
function getStored(id) {
  return JSON.parse(localStorage.getItem('articleStore') || '{}')[id] || null;
}

// ---------- SAVED SECTIONS ----------
function renderSavedSection(type) {
  const ids = type === 'readlater' ? readLater : favorites;
  const cid = type === 'readlater' ? 'readlater-container' : 'favorites-container';
  const el  = document.getElementById(cid);
  if (!el) return;
  if (!ids.length) {
    const t = type === 'readlater'
      ? { d: 'M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z', msg: 'Todavia no guardaste nada', sub: 'Toca el marcador en cualquier noticia' }
      : { d: 'M12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2', msg: 'Todavia no tenes favoritos', sub: 'Toca la estrella en cualquier noticia' };
    el.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="${t.d}"/></svg><p>${t.msg}</p><span>${t.sub}</span></div>`;
    return;
  }
  const articles = ids.map(id => allArticles.find(a => a.id === id) || getStored(id)).filter(Boolean);
  el.innerHTML = articles.map(a => buildCard(a)).join('');
}

// ---------- BADGES ----------
function updateBadges() {
  const rb = document.getElementById('readlater-count');
  const fb = document.getElementById('favorites-count');
  if (rb) { rb.textContent = readLater.length; rb.style.display = readLater.length ? 'inline-block' : 'none'; }
  if (fb) { fb.textContent = favorites.length; fb.style.display = favorites.length ? 'inline-block' : 'none'; }
}

// ---------- FOOTBALL (ESPN API) ----------
async function loadMatches() {
  const container = document.getElementById('matches-container');
  try {
    const results = await Promise.allSettled(
      ESPN_LEAGUES.map(l =>
        fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${l.slug}/scoreboard`,
              { signal: AbortSignal.timeout(8000) })
          .then(r => r.json())
          .then(d => ({ label: l.label, emoji: l.emoji, events: d.events || [] }))
      )
    );

    const cards = [];
    results.forEach(r => {
      if (r.status === 'fulfilled') {
        r.value.events.forEach(ev => {
          const card = buildMatchCard(ev, r.value.label, r.value.emoji);
          if (card) cards.push(card);
        });
      }
    });

    container.innerHTML = cards.length
      ? cards.join('')
      : `<div class="match-no-games">Sin partidos de interes hoy.</div>`;
  } catch {
    container.innerHTML = `<div class="match-no-games">No se pudo cargar partidos.</div>`;
  }
}

function buildMatchCard(ev, label, emoji = '') {
  try {
    const comp = ev.competitions?.[0];
    if (!comp) return null;
    const home = comp.competitors?.find(c => c.homeAway === 'home');
    const away = comp.competitors?.find(c => c.homeAway === 'away');
    if (!home || !away) return null;

    const statusName = ev.status?.type?.name || '';
    const isLive     = statusName === 'STATUS_IN_PROGRESS';
    const isHalf     = statusName === 'STATUS_HALFTIME';
    const isFinished = statusName === 'STATUS_FINAL';
    const clock      = ev.status?.displayClock || '';

    let timeHtml;
    if (isLive) {
      timeHtml = `<span class="match-time live">EN VIVO &bull; ${clock}</span>`;
    } else if (isHalf) {
      timeHtml = `<span class="match-time live">ENTRETIEMPO</span>`;
    } else if (isFinished) {
      timeHtml = `<span class="match-score">${home.score} - ${away.score}</span>`;
    } else {
      const d = new Date(ev.date);
      const t = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      timeHtml = `<span class="match-time">${t}</span>`;
    }

    const homeName = home.team?.shortDisplayName || home.team?.displayName || '';
    const awayName = away.team?.shortDisplayName || away.team?.displayName || '';
    const homeLogo = home.team?.logo || '';
    const awayLogo = away.team?.logo || '';

    const logoImg = (url, name) => url
      ? `<img class="match-team-logo" src="${url}" alt="${name}" onerror="this.style.display='none'">`
      : '';

    return `
    <div class="match-card">
      <div class="match-league">${emoji ? emoji + ' ' : ''}${label}</div>
      <div class="match-teams">
        <div class="match-team-row">${logoImg(homeLogo, homeName)}<span class="match-team">${homeName}</span></div>
        <div class="match-team-row">${logoImg(awayLogo, awayName)}<span class="match-team">${awayName}</span></div>
      </div>
      ${timeHtml}
    </div>`;
  } catch { return null; }
}

// ---------- CARTELERA (TMDB) ----------
const SHOWCASE_URL = 'https://www.showcasecines.com.ar/';

async function loadCartelera() {
  const el = document.getElementById('cartelera-container');
  if (!el) return;

  // Sin clave TMDB: link directo a Showcase Belgrano
  if (!TMDB_KEY) {
    el.innerHTML = `
      <a href="${SHOWCASE_URL}" target="_blank" rel="noopener" class="cartelera-link">
        <span>🍿</span> Ver cartelera Showcase Belgrano &rarr;
      </a>`;
    return;
  }

  el.innerHTML = '<div class="match-placeholder" style="padding-left:16px">Cargando cartelera...</div>';
  try {
    const url = `https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_KEY}&language=es-AR&region=AR`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    const movies = (data.results || [])
      .sort((a, b) => new Date(b.release_date) - new Date(a.release_date))
      .slice(0, 10);
    if (!movies.length) throw new Error('no movies');

    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    el.innerHTML = `
      <div class="cartelera-scroll">
        ${movies.map(m => {
          const releaseDate = m.release_date ? new Date(m.release_date) : null;
          const isNew = releaseDate && releaseDate.getTime() >= oneWeekAgo;
          const dateLabel = releaseDate
            ? releaseDate.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
            : '';
          return `
          <div class="cartelera-card">
            ${m.poster_path
              ? `<img class="cartelera-poster" src="https://image.tmdb.org/t/p/w154${m.poster_path}" alt="" loading="lazy" onerror="this.parentNode.querySelector('.cartelera-no-poster').style.display='flex';this.style.display='none'">`
              : ''}
            <div class="cartelera-no-poster" style="${m.poster_path ? 'display:none' : ''}">🎬</div>
            <div class="cartelera-info">
              ${isNew ? '<div class="cartelera-new">⭐ Nuevo</div>' : ''}
              <div class="cartelera-title">${m.title || ''}</div>
              <div class="cartelera-meta">
                ${dateLabel ? `<div class="cartelera-date">${dateLabel}</div>` : ''}
                ${m.vote_average ? `<div class="cartelera-rating">★ ${m.vote_average.toFixed(1)}</div>` : ''}
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
      <a href="${SHOWCASE_URL}" target="_blank" rel="noopener" class="cartelera-link">
        Ver horarios en Showcase Belgrano &rarr;
      </a>`;
  } catch {
    el.innerHTML = `
      <a href="${SHOWCASE_URL}" target="_blank" rel="noopener" class="cartelera-link">
        <span>🍿</span> Ver cartelera Showcase Belgrano &rarr;
      </a>`;
  }
}

// ---------- ECONOMIC WIDGET ----------
async function loadEconWidget() {
  const el = document.getElementById('econ-container');
  if (!el) return;

  // Render skeleton cards immediately
  el.innerHTML = `
    <div class="econ-scroll">
      <div class="econ-card" id="econ-dolar">
        <div class="econ-label">💵 Dólar Blue</div>
        <div class="econ-value"><span class="econ-num econ-loading">···</span></div>
      </div>
      <div class="econ-card" id="econ-btc">
        <div class="econ-label">₿ Bitcoin</div>
        <div class="econ-value"><span class="econ-num econ-loading">···</span></div>
      </div>
      <div class="econ-card" id="econ-sp">
        <div class="econ-label">📈 S&P 500</div>
        <div class="econ-value"><span class="econ-num econ-loading">···</span></div>
      </div>
    </div>`;

  await Promise.allSettled([_loadDolar(), _loadBitcoin(), _loadSP500()]);
}

function _setEconCard(id, num, sub, changeVal) {
  const card = document.getElementById(id);
  if (!card) return;
  const updown = changeVal > 0 ? 'econ-up' : changeVal < 0 ? 'econ-down' : '';
  const arrow  = changeVal > 0 ? '▲' : changeVal < 0 ? '▼' : '';
  card.querySelector('.econ-value').innerHTML = `
    <span class="econ-num">${num}</span>
    ${sub ? `<span class="econ-sub ${updown}">${arrow ? arrow + ' ' : ''}${sub}</span>` : ''}`;
}

async function _loadDolar() {
  try {
    const res = await fetch('https://api.bluelytics.com.ar/v2/latest', { signal: AbortSignal.timeout(8000) });
    const d = await res.json();
    const sell = d.blue?.value_sell;
    const buy  = d.blue?.value_buy;
    if (!sell) throw new Error();
    _setEconCard('econ-dolar', `$${sell}`, buy ? `Compra $${buy}` : '', 0);
  } catch {
    _setEconCard('econ-dolar', 'N/D', '', 0);
  }
}

async function _loadBitcoin() {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true',
      { signal: AbortSignal.timeout(8000) }
    );
    const d = await res.json();
    const price  = d.bitcoin?.usd;
    const change = d.bitcoin?.usd_24h_change;
    if (!price) throw new Error();
    const display = price >= 1000
      ? `$${(price / 1000).toFixed(1)}K`
      : `$${price.toLocaleString('en-US')}`;
    _setEconCard('econ-btc', display,
      change != null ? `${Math.abs(change).toFixed(2)}% 24h` : '',
      change ?? 0);
  } catch {
    _setEconCard('econ-btc', 'N/D', '', 0);
  }
}

async function _loadSP500() {
  try {
    const yahoUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=2d';
    const res = await fetch(
      `https://api.allorigins.win/get?url=${encodeURIComponent(yahoUrl)}`,
      { signal: AbortSignal.timeout(12000) }
    );
    const wrap = await res.json();
    if (!wrap.contents) throw new Error();
    const data = JSON.parse(wrap.contents);
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) throw new Error();
    const price = meta.regularMarketPrice;
    const prev  = meta.chartPreviousClose || meta.previousClose || 0;
    const pct   = prev ? ((price - prev) / prev) * 100 : 0;
    _setEconCard('econ-sp',
      price.toLocaleString('en-US', { maximumFractionDigits: 0 }),
      pct ? `${Math.abs(pct).toFixed(2)}%` : '',
      pct);
  } catch {
    _setEconCard('econ-sp', 'N/D', '', 0);
  }
}
