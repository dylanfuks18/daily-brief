/* =============================================
   DAILY BRIEF - app.js
   ============================================= */

// ---------- CONFIG ----------

const ALLORIGINS  = 'https://api.allorigins.win/get?url=';
const RSS2JSON    = 'https://api.rss2json.com/v1/api.json?count=20&rss_url=';
const SPORTS_API  = 'https://www.thesportsdb.com/api/v1/json/1/eventsday.php';

const SOURCES = [
  { url: 'https://www.xataka.com/feed',                      cat: 'tech',    name: 'Xataka' },
  { url: 'https://hipertextual.com/feed',                    cat: 'tech',    name: 'Hipertextual' },
  { url: 'https://feeds.weblogssl.com/genbeta',              cat: 'tech',    name: 'Genbeta' },
  { url: 'https://feeds.bbci.co.uk/mundo/rss.xml',           cat: 'general', name: 'BBC Mundo' },
  { url: 'https://www.ambito.com/rss.html',                  cat: 'general', name: 'Ambito' },
  { url: 'https://www.cronista.com/rss/',                    cat: 'economy', name: 'El Cronista' },
  { url: 'https://www.ole.com.ar/rss/home.xml',              cat: 'sports',  name: 'Ole' },
  { url: 'https://www.espinof.com/rss',                      cat: 'cinema',  name: 'Espinof' },
];

const KEYWORDS = {
  israel:  ['israel', 'gaza', 'hamas', 'palestina', 'hezbollah', 'cisjordania', 'netanyahu', 'medio oriente', 'tel aviv'],
  ar_pol:  ['milei', 'kirchner', 'peronismo', 'diputados', 'senado', 'casa rosada', 'kicillof', 'macri', 'gobierno argentino', 'argentina '],
  poleco:  ['trump', 'putin', 'xi jinping', 'banco central', 'inflaci', 'dolar', 'dólar', 'pbi', 'bolsa', 'mercado', 'economia', 'economía', 'finanzas', 'elecciones', 'gobierno', 'politica', 'política', 'fed ', 'reservas'],
  sports:  ['futbol', 'fútbol', 'river', 'boca', 'racing', 'independiente', 'san lorenzo', 'champions', 'premier', 'real madrid', 'barcelona', 'messi', 'ronaldo', 'seleccion', 'copa', 'gol', 'tenis', 'formula 1', 'f1'],
  tech:    ['inteligencia artificial', 'chatgpt', 'openai', 'google', 'apple', 'microsoft', 'iphone', 'android', 'startup', 'robot', 'tecnologia', 'tecnología', 'software', 'ciberseguridad', 'gemini', 'deepmind', 'ia '],
  cinema:  ['pelicula', 'película', 'cine', 'netflix', 'disney', 'hbo', 'amazon prime', 'marvel', 'oscar', 'actor', 'actriz', 'director', 'estreno', 'trailer', 'serie', 'streaming', 'hollywood'],
};

const FOOTBALL_LEAGUES = [
  { key: 'champions', label: 'Champions',  terms: ['champions league', 'uefa champions'] },
  { key: 'premier',   label: 'Premier',    terms: ['english premier', 'premier league'] },
  { key: 'argentina', label: 'Argentina',  terms: ['argentina primera', 'superliga', 'liga profesional', 'copa argentina', 'primera nacional'] },
  { key: 'friendly',  label: 'Amistoso',   terms: ['international friendl', 'friendl'] },
];

// ---------- STATE ----------
let allArticles    = [];
let isDark         = localStorage.getItem('theme') !== 'light';
let readLater      = JSON.parse(localStorage.getItem('readLater')  || '[]');
let favorites      = JSON.parse(localStorage.getItem('favorites')  || '[]');
let expandedCards  = new Set();
const collapsedCats = new Set();

// ---------- INIT ----------
document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  setHeaderDate();
  renderSavedSection('readlater');
  renderSavedSection('favorites');
  updateBadges();
  loadAll();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
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
  document.body.style.overflow =
    document.getElementById('side-menu').classList.contains('open') ? 'hidden' : '';
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

// ---------- CATEGORY COLLAPSE ----------
function toggleCat(cat) {
  const list  = document.getElementById('cat-' + cat);
  const arrow = document.getElementById('arrow-' + cat);
  if (collapsedCats.has(cat)) {
    collapsedCats.delete(cat);
    list.style.display = '';
    arrow.classList.remove('collapsed');
  } else {
    collapsedCats.add(cat);
    list.style.display = 'none';
    arrow.classList.add('collapsed');
  }
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
  expandedCards.clear();
  loadAll().finally(() => btn.classList.remove('spinning'));
}

// ---------- LOAD ----------
async function loadAll() {
  ['top-container','cat-tech','cat-israel','cat-poleco','cat-sports','cat-cinema','argentina-container','jobs-news-container']
    .forEach(id => showSkeletons(id, 3));
  await Promise.all([loadMatches(), fetchAllFeeds()]);
  renderAll();
}

// ---------- FETCH FEEDS ----------
async function fetchAllFeeds() {
  const results = await Promise.allSettled(SOURCES.map(src => fetchFeed(src)));
  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value?.length) allArticles.push(...r.value);
  });
  allArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
}

async function fetchFeed(src) {
  // Try rss2json first
  try {
    const res  = await fetch(RSS2JSON + encodeURIComponent(src.url), { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (data.status === 'ok' && data.items?.length) {
      return data.items.map(item => processItem(item, src));
    }
  } catch { /* fall through */ }

  // Fallback: allorigins proxy + XML parse
  try {
    const res  = await fetch(ALLORIGINS + encodeURIComponent(src.url), { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    if (data.contents) return parseXML(data.contents, src);
  } catch { /* fall through */ }

  return [];
}

function processItem(item, src) {
  const raw = {
    title:       item.title || '',
    description: item.description || item.content || '',
    link:        item.link || '#',
    pubDate:     item.pubDate || new Date().toISOString(),
  };
  return buildArticle(raw, src);
}

function parseXML(xmlStr, src) {
  try {
    const doc   = new DOMParser().parseFromString(xmlStr, 'text/xml');
    const items = doc.querySelectorAll('item');
    return Array.from(items).map(item => {
      const g = tag => item.querySelector(tag)?.textContent?.trim() || '';
      const raw = {
        title:       g('title'),
        description: g('description') || g('content'),
        link:        g('link'),
        pubDate:     g('pubDate') || new Date().toISOString(),
      };
      return buildArticle(raw, src);
    });
  } catch { return []; }
}

function buildArticle(raw, src) {
  const id = btoa(encodeURIComponent((raw.link || raw.title || Math.random()).toString()).slice(0, 60)).slice(0, 20);
  return {
    id,
    title:   raw.title,
    summary: stripHtml(raw.description),
    link:    raw.link || '#',
    pubDate: raw.pubDate,
    source:  src.name,
    cat:     classify(raw, src.cat),
  };
}

// ---------- CLASSIFY ----------
function classify(raw, defaultCat) {
  if (defaultCat !== 'general' && defaultCat !== 'economy') return defaultCat;
  const text = ((raw.title || '') + ' ' + (raw.description || '')).toLowerCase();
  if (match(text, KEYWORDS.israel))  return 'israel';
  if (match(text, KEYWORDS.ar_pol))  return 'ar_pol';
  if (match(text, KEYWORDS.cinema))  return 'cinema';
  if (match(text, KEYWORDS.tech))    return 'tech';
  if (match(text, KEYWORDS.sports))  return 'sports';
  if (match(text, KEYWORDS.poleco))  return 'poleco';
  if (defaultCat === 'economy')      return 'poleco';
  return 'poleco';
}

function match(text, list) { return list.some(k => text.includes(k)); }

// ---------- HELPERS ----------
function stripHtml(html) {
  if (!html) return '';
  const d = document.createElement('div');
  d.innerHTML = html;
  return (d.textContent || d.innerText || '').replace(/\s+/g, ' ').trim();
}

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

  const top = ['tech','israel','poleco','sports','cinema']
    .map(c => by[c][0]).filter(Boolean).map(a => ({ ...a, isTop: true }));

  renderList('top-container',       top.slice(0, 5), true);
  renderList('cat-tech',            by.tech.slice(0, 8));
  renderList('cat-israel',          by.israel.slice(0, 6));
  renderList('cat-poleco',          by.poleco.slice(0, 8));
  renderList('cat-sports',          by.sports.slice(0, 8));
  renderList('cat-cinema',          by.cinema.slice(0, 6));
  renderList('argentina-container', by.ar_pol.slice(0, 10));

  const jobsKw = ['empleo','trabajo','contrat','vacante','remoto','junior','senior','desarrollador','developer'];
  renderList('jobs-news-container',
    by.tech.filter(a => match(a.title.toLowerCase(), jobsKw)).slice(0, 5));
}

// ---------- RENDER LIST ----------
function renderList(id, articles, isTop = false) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!articles.length) {
    el.innerHTML = `<div class="error-card">No hay noticias disponibles ahora.</div>`;
    return;
  }
  el.innerHTML = articles.map(a => buildCard(a, isTop)).join('');
}

// ---------- CARD ----------
function buildCard(a, isTop = false) {
  const rl       = readLater.includes(a.id);
  const fav      = favorites.includes(a.id);
  const expanded = expandedCards.has(a.id);
  const short    = a.summary.slice(0, 380);
  const hasMore  = a.summary.length > 380;
  const articleJson = JSON.stringify(a).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

  return `
  <div class="news-card${isTop ? ' top-card' : ''}" id="card-${a.id}">
    <div class="card-meta">
      <span class="card-source">${a.source}</span>
      <span class="card-time">${timeAgo(a.pubDate)}</span>
    </div>
    <div class="card-title">${a.title}</div>
    <div class="card-summary${expanded ? ' expanded' : ''}" id="summary-${a.id}">
      ${expanded ? a.summary : short}${!expanded && hasMore ? '...' : ''}
    </div>
    <div class="card-footer">
      <button class="card-expand-btn" onclick="toggleExpand('${a.id}')">
        ${hasMore ? (expanded ? 'Ver menos &#x25B4;' : 'Leer mas &#x25BE;') : ''}
      </button>
      <div class="card-actions">
        <button class="card-action-btn${rl ? ' active' : ''}" onclick="toggleRL(event,'${a.id}',\`${articleJson}\`)" title="Leer despues">
          <svg viewBox="0 0 24 24" fill="${rl ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8">
            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
          </svg>
        </button>
        <button class="card-action-btn${fav ? ' fav-active' : ''}" onclick="toggleFav(event,'${a.id}',\`${articleJson}\`)" title="Favorito">
          <svg viewBox="0 0 24 24" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
      </div>
    </div>
  </div>`;
}

// ---------- EXPAND ----------
function toggleExpand(id) {
  const a       = allArticles.find(x => x.id === id) || getStored(id);
  if (!a) return;
  const sumEl   = document.getElementById('summary-' + id);
  const cardEl  = document.getElementById('card-' + id);
  const btn     = cardEl?.querySelector('.card-expand-btn');
  if (!sumEl) return;

  if (expandedCards.has(id)) {
    expandedCards.delete(id);
    sumEl.classList.remove('expanded');
    sumEl.textContent = a.summary.slice(0, 380) + (a.summary.length > 380 ? '...' : '');
    if (btn) btn.innerHTML = 'Leer mas &#x25BE;';
  } else {
    expandedCards.add(id);
    sumEl.classList.add('expanded');
    sumEl.textContent = a.summary;
    if (btn) btn.innerHTML = 'Ver menos &#x25B4;';
  }
}

// ---------- READ LATER ----------
function toggleRL(e, id, articleJson) {
  e.stopPropagation();
  const a = JSON.parse(articleJson);
  readLater = readLater.includes(id) ? readLater.filter(x => x !== id) : [...readLater, id];
  storeArticle(a);
  localStorage.setItem('readLater', JSON.stringify(readLater));
  refreshActions(id);
  renderSavedSection('readlater');
  updateBadges();
}

// ---------- FAVORITES ----------
function toggleFav(e, id, articleJson) {
  e.stopPropagation();
  const a = JSON.parse(articleJson);
  favorites = favorites.includes(id) ? favorites.filter(x => x !== id) : [...favorites, id];
  storeArticle(a);
  localStorage.setItem('favorites', JSON.stringify(favorites));
  refreshActions(id);
  renderSavedSection('favorites');
  updateBadges();
}

// ---------- STORAGE ----------
function storeArticle(a) {
  const store = JSON.parse(localStorage.getItem('articleStore') || '{}');
  store[a.id] = a;
  localStorage.setItem('articleStore', JSON.stringify(store));
}
function getStored(id) {
  return JSON.parse(localStorage.getItem('articleStore') || '{}')[id] || null;
}

// ---------- REFRESH CARD BUTTONS ----------
function refreshActions(id) {
  document.querySelectorAll(`#card-${id} .card-action-btn`).forEach((btn, i) => {
    const active = i === 0 ? readLater.includes(id) : favorites.includes(id);
    btn.className = `card-action-btn${active ? (i === 0 ? ' active' : ' fav-active') : ''}`;
    if (i === 0) {
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="${active ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>`;
    } else {
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="${active ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    }
  });
}

// ---------- SAVED SECTIONS ----------
function renderSavedSection(type) {
  const ids = type === 'readlater' ? readLater : favorites;
  const cid = type === 'readlater' ? 'readlater-container' : 'favorites-container';
  const el  = document.getElementById(cid);
  if (!el) return;

  if (!ids.length) {
    const t = type === 'readlater'
      ? { path: 'M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z', msg: 'Todavia no guardaste nada', sub: 'Toca el marcador en cualquier noticia' }
      : { path: 'M12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2', msg: 'Todavia no tenes favoritos', sub: 'Toca la estrella en cualquier noticia' };
    el.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="${t.path}"/></svg><p>${t.msg}</p><span>${t.sub}</span></div>`;
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

// ---------- FOOTBALL ----------
async function loadMatches() {
  const container = document.getElementById('matches-container');
  const dateStr   = new Date().toISOString().split('T')[0];

  try {
    const res    = await fetch(`${SPORTS_API}?d=${dateStr}&s=Soccer`, { signal: AbortSignal.timeout(8000) });
    const data   = await res.json();
    const events = data.events || [];

    const grouped = {};
    FOOTBALL_LEAGUES.forEach(l => { grouped[l.key] = []; });

    events.forEach(ev => {
      const league = (ev.strLeague || '').toLowerCase();
      for (const l of FOOTBALL_LEAGUES) {
        if (l.terms.some(t => league.includes(t))) {
          grouped[l.key].push(ev);
          break;
        }
      }
    });

    const cards = [];
    FOOTBALL_LEAGUES.forEach(l => {
      grouped[l.key].forEach(ev => cards.push(buildMatchCard(ev, l.label)));
    });

    container.innerHTML = cards.length
      ? cards.join('')
      : `<div class="match-no-games">Sin partidos de interes hoy.</div>`;
  } catch {
    container.innerHTML = `<div class="match-no-games">No se pudo cargar partidos.</div>`;
  }
}

function buildMatchCard(ev, label) {
  const status   = ev.strStatus || '';
  const isLive   = /^\d+$/.test(status) || status === 'HT';
  const finished = status === 'Match Finished';
  const hasScore = ev.intHomeScore != null && ev.intAwayScore != null;

  let timeHtml;
  if (isLive) {
    timeHtml = `<span class="match-time live">EN VIVO ${status ? '&#x2022; ' + status + "'" : ''}</span>`;
  } else if (finished && hasScore) {
    timeHtml = `<span class="match-score">${ev.intHomeScore} - ${ev.intAwayScore}</span>`;
  } else {
    const t = (ev.strTime || '').slice(0, 5);
    timeHtml = `<span class="match-time">${t || 'Hoy'}</span>`;
  }

  return `
  <div class="match-card">
    <div class="match-league">${label}</div>
    <div class="match-teams">
      <span class="match-team">${ev.strHomeTeam || ''}</span>
      <span class="match-vs">vs</span>
      <span class="match-team">${ev.strAwayTeam || ''}</span>
    </div>
    ${timeHtml}
  </div>`;
}
