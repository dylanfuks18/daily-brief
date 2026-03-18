/* =============================================
   DAILY BRIEF - app.js
   ============================================= */

const SPORTS_API = 'https://www.thesportsdb.com/api/v1/json/3/eventsday.php';

const FOOTBALL_LEAGUES = [
  { key: 'champions', label: 'Champions',  terms: ['champions league', 'uefa champions'] },
  { key: 'premier',   label: 'Premier',    terms: ['english premier', 'premier league'] },
  { key: 'argentina', label: 'Argentina',  terms: ['argentina primera', 'superliga', 'liga profesional', 'copa argentina', 'primera nacional'] },
  { key: 'friendly',  label: 'Amistoso',   terms: ['international friendl', 'friendl'] },
];

const CAT_EMOJI = { tech: '🤖', israel: '🌍', poleco: '🏛️', sports: '⚽', cinema: '🎬', ar_pol: '🇦🇷' };

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
  await Promise.all([loadMatches(), fetchNews()]);
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

  // Top del dia → carousel (1 from each category)
  const top = ['tech','israel','poleco','sports','cinema']
    .map(c => by[c][0]).filter(Boolean);
  renderCarousel('top-container', top);

  renderList('cat-tech',            by.tech.slice(0, 8));
  renderList('cat-israel',          by.israel.slice(0, 6));
  renderList('cat-poleco',          by.poleco.slice(0, 8));
  renderList('cat-sports',          by.sports.slice(0, 8));
  renderList('cat-cinema',          by.cinema.slice(0, 6));
  renderList('argentina-container', by.ar_pol.slice(0, 10));

  const jobsKw = ['empleo','trabajo','contrat','vacante','remoto','junior','senior','desarrollador','developer'];
  renderList('jobs-news-container',
    [...by.tech, ...by.poleco].filter(a => jobsKw.some(k => a.title.toLowerCase().includes(k))).slice(0, 5));
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
  if (a.image) {
    hero.src = a.image;
    hero.style.display = 'block';
  } else {
    hero.style.display = 'none';
    hero.src = '';
  }

  document.getElementById('article-source').textContent = a.source;
  document.getElementById('article-time').textContent   = timeAgo(a.pubDate);
  document.getElementById('article-title').textContent  = a.title;
  document.getElementById('article-body').textContent   = a.summary || 'Sin contenido disponible.';

  updateModalButtons();

  document.getElementById('article-scroll').scrollTop = 0;
  document.getElementById('article-overlay').classList.add('open');
  document.getElementById('article-sheet').classList.add('open');
  document.body.style.overflow = 'hidden';
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
        if (l.terms.some(t => league.includes(t))) { grouped[l.key].push(ev); break; }
      }
    });

    const cards = [];
    FOOTBALL_LEAGUES.forEach(l => grouped[l.key].forEach(ev => cards.push(buildMatchCard(ev, l.label))));
    container.innerHTML = cards.length ? cards.join('') : `<div class="match-no-games">Sin partidos de interes hoy.</div>`;
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
    timeHtml = `<span class="match-time live">EN VIVO${status ? ' &bull; ' + status + "'" : ''}</span>`;
  } else if (finished && hasScore) {
    timeHtml = `<span class="match-score">${ev.intHomeScore} - ${ev.intAwayScore}</span>`;
  } else {
    timeHtml = `<span class="match-time">${(ev.strTime || '').slice(0,5) || 'Hoy'}</span>`;
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
