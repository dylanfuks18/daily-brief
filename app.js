/* =============================================
   DAILY BRIEF - app.js
   ============================================= */

// ---------- CONFIG ----------

const RSS2JSON = 'https://api.rss2json.com/v1/api.json?rss_url=';
const SPORTS_API = 'https://www.thesportsdb.com/api/v1/json/3/eventsday.php';

const SOURCES = [
  // Tech & AI
  { url: 'https://www.xataka.com/feed',        cat: 'tech',    name: 'Xataka' },
  { url: 'https://hipertextual.com/feed',       cat: 'tech',    name: 'Hipertextual' },
  { url: 'https://feeds.weblogssl.com/genbeta', cat: 'tech',    name: 'Genbeta' },

  // General (filtered by keywords into categories)
  { url: 'https://feeds.bbci.co.uk/mundo/rss.xml',  cat: 'general', name: 'BBC Mundo' },
  { url: 'https://www.infobae.com/feeds/rss/',       cat: 'general', name: 'Infobae' },

  // Economy / Politics Argentina
  { url: 'https://www.ambito.com/rss.html',           cat: 'general', name: 'Ambito' },
  { url: 'https://www.cronista.com/rss/',              cat: 'economy', name: 'El Cronista' },

  // Sports
  { url: 'https://www.ole.com.ar/rss/home.xml',       cat: 'sports',  name: 'Ole' },

  // Cinema
  { url: 'https://www.espinof.com/rss',               cat: 'cinema',  name: 'Espinof' },
  { url: 'https://www.sensacine.com/noticias/cine/rss/', cat: 'cinema', name: 'SensaCine' },
];

const KEYWORDS = {
  israel:   ['israel', 'gaza', 'hamas', 'palestina', 'hezbollah', 'cisjordania', 'netanyahu', 'medio oriente', 'franja de gaza', 'tel aviv'],
  ar_pol:   ['milei', 'kirchner', 'peronismo', 'congreso', 'diputados', 'senado', 'casa rosada', 'gobierno argentino', 'kicillof', 'macri', 'fernandez', 'uf argentina', 'provincia'],
  poleco:   ['trump', 'biden', 'kremlin', 'putin', 'xi jinping', 'ue ', 'union europea', 'banco central', 'reservas', 'inflacion', 'inflación', 'dolar', 'dólar', 'pesos', 'pbi', 'bolsa', 'mercado', 'fed ', 'economía', 'economia', 'finanzas', 'elecciones', 'gobierno', 'parlamento', 'congreso', 'politica ', 'política '],
  sports:   ['futbol', 'fútbol', 'river', 'boca', 'racing', 'independiente', 'san lorenzo', 'velez', 'champions', 'premier', 'real madrid', 'barcelona', 'messi', 'ronaldo', 'seleccion', 'mundial', 'copa', 'gol', 'partido', 'tenis', 'nba', 'formula 1', 'f1'],
  tech:     ['inteligencia artificial', 'ia ', ' ia,', 'chatgpt', 'openai', 'google', 'apple', 'microsoft', 'samsung', 'iphone', 'android', 'startup', 'robot', 'tecnologia', 'tecnología', 'software', 'ciberseguridad', 'ciberataque', 'deepmind', 'gemini', 'llm'],
  cinema:   ['pelicula', 'película', 'cine', 'netflix', 'disney', 'hbo', 'amazon prime', 'marvel', 'oscar', 'actor', 'actriz', 'director', 'estreno', 'trailer', 'serie ', ' serie', 'temporada', 'streaming', 'hollywood', 'taquilla', 'primetime'],
};

const FOOTBALL_LEAGUES = [
  { key: 'champions', label: 'Champions',    terms: ['champions league', 'uefa champions'] },
  { key: 'premier',   label: 'Premier',      terms: ['english premier', 'premier league'] },
  { key: 'argentina', label: 'Argentina',    terms: ['argentina primera', 'superliga argent', 'liga profesional', 'copa argentina', 'primera nacional'] },
  { key: 'friendly',  label: 'Amistoso',     terms: ['international friendl', 'friendl'] },
];

// ---------- STATE ----------
let allArticles = [];
let isDark      = localStorage.getItem('theme') !== 'light';
let readLater   = JSON.parse(localStorage.getItem('readLater')   || '[]');
let favorites   = JSON.parse(localStorage.getItem('favorites')   || '[]');
let currentSection = 'home';
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
  const now = new Date();
  const days = ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'];
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const str = `${days[now.getDay()]} ${now.getDate()} de ${months[now.getMonth()]}`;
  document.getElementById('header-date').textContent = str;
}

// ---------- THEME ----------
function applyTheme() {
  document.body.classList.toggle('dark', isDark);
  document.body.classList.toggle('light', !isDark);
  document.getElementById('theme-label').textContent = isDark ? 'Modo Claro' : 'Modo Oscuro';
  const themeIcon = document.getElementById('theme-icon');
  themeIcon.innerHTML = isDark
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
  const navBtn = document.getElementById('nav-' + name);
  if (navBtn) navBtn.classList.add('active-nav');

  currentSection = name;
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

// ---------- LOADING SKELETONS ----------
function showSkeletons(containerId, count = 3) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = Array.from({ length: count }, () => `
    <div class="skeleton-card">
      <div class="skeleton-line short"></div>
      <div class="skeleton-line title"></div>
      <div class="skeleton-line long"></div>
      <div class="skeleton-line medium"></div>
    </div>
  `).join('');
}

// ---------- REFRESH ----------
function refreshAll() {
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  allArticles = [];
  expandedCards.clear();
  loadAll().finally(() => btn.classList.remove('spinning'));
}

// ---------- LOAD EVERYTHING ----------
async function loadAll() {
  showSkeletons('top-container', 3);
  showSkeletons('cat-tech', 3);
  showSkeletons('cat-israel', 2);
  showSkeletons('cat-poleco', 3);
  showSkeletons('cat-sports', 2);
  showSkeletons('cat-cinema', 2);
  showSkeletons('argentina-container', 3);
  showSkeletons('jobs-news-container', 2);

  loadMatches();
  await fetchAllFeeds();
  renderAll();
}

// ---------- FETCH FEEDS ----------
async function fetchAllFeeds() {
  const promises = SOURCES.map(src => fetchFeed(src));
  const results  = await Promise.allSettled(promises);
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) {
      allArticles.push(...r.value);
    }
  });
  // Sort by date desc
  allArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
}

async function fetchFeed(src) {
  try {
    const apiUrl = RSS2JSON + encodeURIComponent(src.url) + '&count=20';
    const res    = await fetch(apiUrl);
    if (!res.ok) return [];
    const data   = await res.json();
    if (!data.items) return [];
    return data.items.map(item => ({
      id:      btoa(encodeURIComponent(item.link || item.title || Math.random())).slice(0, 20),
      title:   item.title || '',
      summary: stripHtml(item.description || item.content || ''),
      link:    item.link || '#',
      pubDate: item.pubDate || new Date().toISOString(),
      source:  src.name,
      cat:     classifyArticle(item, src.cat),
      image:   item.thumbnail || item.enclosure?.link || null,
    }));
  } catch {
    return [];
  }
}

// ---------- CLASSIFY ----------
function classifyArticle(item, defaultCat) {
  const text = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();

  if (defaultCat !== 'general' && defaultCat !== 'economy') return defaultCat;

  if (matchKeywords(text, KEYWORDS.israel))  return 'israel';
  if (matchKeywords(text, KEYWORDS.ar_pol))  return 'ar_pol';
  if (matchKeywords(text, KEYWORDS.cinema))  return 'cinema';
  if (matchKeywords(text, KEYWORDS.tech))    return 'tech';
  if (matchKeywords(text, KEYWORDS.sports))  return 'sports';
  if (matchKeywords(text, KEYWORDS.poleco))  return 'poleco';
  if (defaultCat === 'economy')              return 'poleco';
  return 'poleco';
}

function matchKeywords(text, list) {
  return list.some(k => text.includes(k));
}

// ---------- STRIP HTML ----------
function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
}

// ---------- TIME AGO ----------
function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60)   return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff/60)}min`;
  if (diff < 86400)return `hace ${Math.floor(diff/3600)}h`;
  return `hace ${Math.floor(diff/86400)}d`;
}

// ---------- RENDER ALL ----------
function renderAll() {
  const bycat = {
    tech: [], israel: [], poleco: [], sports: [], cinema: [], ar_pol: []
  };

  allArticles.forEach(a => {
    if (bycat[a.cat]) bycat[a.cat].push(a);
  });

  // Top del dia: first unique article from each category (max 5)
  const topArticles = [];
  ['tech','israel','poleco','sports','cinema'].forEach(cat => {
    if (bycat[cat][0]) topArticles.push({ ...bycat[cat][0], isTop: true });
  });

  renderList('top-container',        topArticles.slice(0, 5), true);
  renderList('cat-tech',             bycat.tech.slice(0, 8));
  renderList('cat-israel',           bycat.israel.slice(0, 6));
  renderList('cat-poleco',           bycat.poleco.slice(0, 8));
  renderList('cat-sports',           bycat.sports.slice(0, 8));
  renderList('cat-cinema',           bycat.cinema.slice(0, 6));
  renderList('argentina-container',  bycat.ar_pol.slice(0, 10));
  renderList('jobs-news-container',  bycat.tech.filter(a => matchKeywords(a.title.toLowerCase(), ['empleo','trabajo','contrata','busca','vacante','remoto','junior','senior','desarrollador'])).slice(0, 4));
}

// ---------- RENDER LIST ----------
function renderList(containerId, articles, isTop = false) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (!articles.length) {
    el.innerHTML = `<div class="error-card">No hay noticias disponibles ahora.</div>`;
    return;
  }

  el.innerHTML = articles.map(a => buildCard(a, isTop)).join('');
}

// ---------- BUILD CARD ----------
function buildCard(article, isTop = false) {
  const rl  = readLater.includes(article.id);
  const fav = favorites.includes(article.id);
  const expanded = expandedCards.has(article.id);

  const summaryShort = article.summary.slice(0, 380);
  const hasMore = article.summary.length > 380;

  return `
  <div class="news-card ${isTop ? 'top-card' : ''}" id="card-${article.id}">
    <div class="card-meta">
      <span class="card-source">${article.source}</span>
      <span class="card-time">${timeAgo(article.pubDate)}</span>
    </div>
    <div class="card-title">${article.title}</div>
    <div class="card-summary ${expanded ? 'expanded' : ''}" id="summary-${article.id}">
      ${expanded ? article.summary : summaryShort}${!expanded && hasMore ? '...' : ''}
    </div>
    <div class="card-footer">
      <button class="card-expand-btn" onclick="toggleExpand('${article.id}', ${JSON.stringify(article.summary).replace(/'/g, "&#39;")})">
        ${expanded ? 'Ver menos &#x25B4;' : (hasMore ? 'Leer mas &#x25BE;' : '')}
      </button>
      <div class="card-actions">
        <button class="card-action-btn ${rl ? 'active' : ''}"
          onclick="toggleReadLater(event, '${article.id}', ${JSON.stringify(article).replace(/'/g, "&#39;")})"
          title="Leer despues">
          <svg viewBox="0 0 24 24" fill="${rl ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8">
            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
          </svg>
        </button>
        <button class="card-action-btn ${fav ? 'fav-active' : ''}"
          onclick="toggleFavorite(event, '${article.id}', ${JSON.stringify(article).replace(/'/g, "&#39;")})"
          title="Favorito">
          <svg viewBox="0 0 24 24" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
      </div>
    </div>
  </div>`;
}

// ---------- EXPAND ----------
function toggleExpand(id, fullText) {
  const summaryEl = document.getElementById('summary-' + id);
  const card = document.getElementById('card-' + id);
  const btn  = card.querySelector('.card-expand-btn');

  if (expandedCards.has(id)) {
    expandedCards.delete(id);
    summaryEl.classList.remove('expanded');
    summaryEl.textContent = fullText.slice(0, 380) + (fullText.length > 380 ? '...' : '');
    btn.innerHTML = 'Leer mas &#x25BE;';
  } else {
    expandedCards.add(id);
    summaryEl.classList.add('expanded');
    summaryEl.textContent = fullText;
    btn.innerHTML = 'Ver menos &#x25B4;';
  }
}

// ---------- READ LATER ----------
function toggleReadLater(e, id, article) {
  e.stopPropagation();
  if (readLater.includes(id)) {
    readLater = readLater.filter(x => x !== id);
  } else {
    readLater.push(id);
    storeArticle(article);
  }
  localStorage.setItem('readLater', JSON.stringify(readLater));
  updateBadges();
  refreshCardActions(id);
  renderSavedSection('readlater');
}

// ---------- FAVORITES ----------
function toggleFavorite(e, id, article) {
  e.stopPropagation();
  if (favorites.includes(id)) {
    favorites = favorites.filter(x => x !== id);
  } else {
    favorites.push(id);
    storeArticle(article);
  }
  localStorage.setItem('favorites', JSON.stringify(favorites));
  updateBadges();
  refreshCardActions(id);
  renderSavedSection('favorites');
}

// Store article data
function storeArticle(article) {
  const stored = JSON.parse(localStorage.getItem('articleStore') || '{}');
  stored[article.id] = article;
  localStorage.setItem('articleStore', JSON.stringify(stored));
}

function getStoredArticle(id) {
  const stored = JSON.parse(localStorage.getItem('articleStore') || '{}');
  return stored[id] || null;
}

// ---------- REFRESH CARD ACTIONS ONLY ----------
function refreshCardActions(id) {
  const card = document.getElementById('card-' + id);
  if (!card) return;
  const rl  = readLater.includes(id);
  const fav = favorites.includes(id);

  const [rlBtn, favBtn] = card.querySelectorAll('.card-action-btn');
  if (rlBtn) {
    rlBtn.className = `card-action-btn ${rl ? 'active' : ''}`;
    rlBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="${rl ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>`;
  }
  if (favBtn) {
    favBtn.className = `card-action-btn ${fav ? 'fav-active' : ''}`;
    favBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  }
}

// ---------- RENDER SAVED SECTIONS ----------
function renderSavedSection(type) {
  const ids = type === 'readlater' ? readLater : favorites;
  const containerId = type === 'readlater' ? 'readlater-container' : 'favorites-container';
  const el = document.getElementById(containerId);
  if (!el) return;

  if (!ids.length) {
    const emptyMsg = type === 'readlater'
      ? { icon: `<path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>`, text: 'Todavia no guardaste nada', sub: 'Toca el icono de marcador en cualquier noticia' }
      : { icon: `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`, text: 'Todavia no tenes favoritos', sub: 'Toca la estrella en cualquier noticia' };
    el.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${emptyMsg.icon}</svg><p>${emptyMsg.text}</p><span>${emptyMsg.sub}</span></div>`;
    return;
  }

  const articles = ids.map(id => {
    const fromFeed = allArticles.find(a => a.id === id);
    return fromFeed || getStoredArticle(id);
  }).filter(Boolean);

  el.innerHTML = articles.map(a => buildCard(a)).join('');
}

// ---------- BADGES ----------
function updateBadges() {
  const rlCount  = readLater.length;
  const favCount = favorites.length;

  const rlBadge  = document.getElementById('readlater-count');
  const favBadge = document.getElementById('favorites-count');

  if (rlBadge) {
    rlBadge.textContent = rlCount;
    rlBadge.style.display = rlCount > 0 ? 'inline-block' : 'none';
  }
  if (favBadge) {
    favBadge.textContent = favCount;
    favBadge.style.display = favCount > 0 ? 'inline-block' : 'none';
  }
}

// ---------- FOOTBALL MATCHES ----------
async function loadMatches() {
  const container = document.getElementById('matches-container');
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];

  try {
    const res  = await fetch(`${SPORTS_API}?d=${dateStr}&s=Soccer`);
    const data = await res.json();
    const events = data.events || [];

    // Group by our league priority
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
      grouped[l.key].forEach(ev => {
        cards.push(buildMatchCard(ev, l.label));
      });
    });

    if (!cards.length) {
      container.innerHTML = `<div class="match-no-games">No hay partidos de interes programados para hoy.</div>`;
    } else {
      container.innerHTML = cards.join('');
    }
  } catch {
    container.innerHTML = `<div class="match-no-games">No se pudo cargar los partidos.</div>`;
  }
}

function buildMatchCard(ev, leagueLabel) {
  const isLive    = ev.strStatus === 'Match Finished' ? false : (ev.strStatus || '').includes('HT') || /^\d+$/.test(ev.strStatus || '');
  const isPlayed  = ev.strStatus === 'Match Finished';
  const hasScore  = ev.intHomeScore !== null && ev.intAwayScore !== null;

  let timeHtml;
  if (isLive) {
    timeHtml = `<span class="match-time live">EN VIVO ${ev.strStatus ? '&#x2022; ' + ev.strStatus + "'" : ''}</span>`;
  } else if (isPlayed && hasScore) {
    timeHtml = `<span class="match-score">${ev.intHomeScore} - ${ev.intAwayScore}</span>`;
  } else {
    const t = ev.strTime ? ev.strTime.slice(0, 5) : '';
    timeHtml = `<span class="match-time">${t || 'Hoy'}</span>`;
  }

  return `
  <div class="match-card">
    <div class="match-league">${leagueLabel}</div>
    <div class="match-teams">
      <span class="match-team">${ev.strHomeTeam || ''}</span>
      <span class="match-vs">vs</span>
      <span class="match-team">${ev.strAwayTeam || ''}</span>
    </div>
    ${timeHtml}
  </div>`;
}
