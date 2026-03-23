import asyncio
import feedparser
import requests
import json
import os
import re
import base64
from datetime import datetime, timezone

# Headers para imitar un navegador real (evita bloqueo de bot en nitter/xcancel)
BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
}

def fetch_feed(url, use_browser_headers=False):
    """Fetch RSS feed, usando headers de navegador si se indica."""
    if use_browser_headers:
        try:
            r = requests.get(url, headers=BROWSER_HEADERS, timeout=20, allow_redirects=True)
            if r.status_code == 200 and ('<item>' in r.text or '<entry>' in r.text):
                return feedparser.parse(r.content)
        except Exception as e:
            print(f"  [requests error] {e}")
    return feedparser.parse(url)


async def _fetch_twikit_async():
    """Fetch @MokedBitajon tweets via twikit (Twitter internal web API)."""
    try:
        import twikit
    except ImportError:
        print('  [twikit] librería no instalada')
        return []

    username = os.environ.get('TWITTER_USERNAME', '').strip()
    email    = os.environ.get('TWITTER_EMAIL', '').strip()
    password = os.environ.get('TWITTER_PASSWORD', '').strip()

    if not (username and email and password):
        print('  [twikit] credenciales no configuradas, saltando')
        return []

    try:
        client = twikit.Client('en-US')
        cookies_path = 'twikit_cookies.json'

        # 1. Restaurar cookies desde GitHub Secret (base64) — evita login en CI
        cookies_b64 = os.environ.get('TWIKIT_COOKIES', '').strip()
        if cookies_b64:
            try:
                decoded = base64.b64decode(cookies_b64).decode('utf-8')
                with open(cookies_path, 'w', encoding='utf-8') as f:
                    f.write(decoded)
                print('  [twikit] cookies restauradas desde secret')
            except Exception as e:
                print(f'  [twikit] error restaurando cookies: {e}')

        # 2. Cargar cookies del archivo
        if os.path.exists(cookies_path):
            client.load_cookies(cookies_path)
            print('  [twikit] cookies cargadas OK')
        else:
            # Fallback: login directo (puede fallar en CI)
            await client.login(auth_info_1=username, auth_info_2=email, password=password)
            client.save_cookies(cookies_path)
            print('  [twikit] login OK, cookies guardadas')

        user = await client.get_user_by_screen_name('MokedBitajon')
        tweets = await client.get_user_tweets(user.id, 'Tweets', count=20)

        results = []
        for tw in tweets:
            text = getattr(tw, 'full_text', None) or getattr(tw, 'text', '') or ''
            if not text or text.startswith('RT @'):
                continue
            text = re.sub(r'https://t\.co/\S+', '', text).strip()
            if len(text) < 10:
                continue
            link     = f'https://x.com/MokedBitajon/status/{tw.id}'
            pub_date = getattr(tw, 'created_at', '') or datetime.now(timezone.utc).isoformat()
            results.append({
                'id':      make_id(link),
                'title':   text[:120],
                'summary': text,
                'link':    link,
                'pubDate': pub_date,
                'source':  'MokedBitajon',
                'cat':     'israel',
                'image':   None,
            })

        print(f'  [twikit] ✓ {len(results)} tweets de @MokedBitajon')
        return results

    except Exception as e:
        print(f'  [twikit] error: {e}')
        return []


def get_mokedb_tweets_twikit():
    return asyncio.run(_fetch_twikit_async())

SOURCES = [
    # --- TECH & IA en ESPAÑOL (los artículos de IA se reclasifican via classify()) ---
    {'url': 'https://www.xataka.com/feed',                                                              'cat': 'tech', 'name': 'Xataka'},
    {'url': 'https://hipertextual.com/feed',                                                            'cat': 'tech', 'name': 'Hipertextual'},
    {'url': 'https://feeds.weblogssl.com/genbeta',                                                      'cat': 'tech', 'name': 'Genbeta'},
    {'url': 'https://computerhoy.20minutos.es/feed',                                                    'cat': 'tech', 'name': 'Computer Hoy'},
    {'url': 'https://www.muycomputer.com/feed/',                                                        'cat': 'tech', 'name': 'MuyComputer'},
    {'url': 'https://www.elconfidencial.com/tecnologia/feed/',                                          'cat': 'tech', 'name': 'El Confidencial Tech'},
    {'url': 'https://www.lavanguardia.com/rss/tecnologia.xml',                                          'cat': 'tech', 'name': 'La Vanguardia Tech'},
    {'url': 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/tecnologia/portada',      'cat': 'tech', 'name': 'El País Tech'},
    {'url': 'https://www.technologyreview.es/feed/',                                                    'cat': 'tech', 'name': 'MIT Tech Review ES'},
    {'url': 'https://www.nobbot.com/feed/',                                                             'cat': 'tech', 'name': 'Nobbot'},
    {'url': 'https://marketing4ecommerce.net/feed/',                                                    'cat': 'tech', 'name': 'Marketing4ecommerce'},

    # --- NOTICIAS GENERALES (se clasifican por keywords) ---
    {'url': 'https://feeds.bbci.co.uk/mundo/rss.xml',            'cat': 'general', 'name': 'BBC Mundo'},
    {'url': 'https://www.infobae.com/feeds/rss/',                 'cat': 'general', 'name': 'Infobae'},
    {'url': 'https://tn.com.ar/rss/latest.xml',                   'cat': 'general', 'name': 'TN'},
    {'url': 'https://www.clarin.com/rss/lo-ultimo/',              'cat': 'general', 'name': 'Clarin'},
    {'url': 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/', 'cat': 'general', 'name': 'La Nacion'},
    {'url': 'https://www.perfil.com/rss/noticias',                'cat': 'general', 'name': 'Perfil'},
    {'url': 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada', 'cat': 'general', 'name': 'El Pais'},

    # --- ISRAEL & MEDIO ORIENTE (directo) ---
    {'url': 'http://actualidad.rt.com/feeds/all.rss',             'cat': 'israel',  'name': 'RT en Español'},

    # --- @MokedBitajon en X — fallbacks RSS si twikit no funciona ---
    {'url': 'https://twiiit.com/MokedBitajon/rss',               'cat': 'israel',  'name': 'MokedBitajon'},
    {'url': 'https://nitter.cz/MokedBitajon/rss',                'cat': 'israel',  'name': 'MokedBitajon'},
    {'url': 'https://xcancel.com/MokedBitajon/rss',              'cat': 'israel',  'name': 'MokedBitajon'},
    {'url': 'https://lightbrd.com/MokedBitajon/rss',             'cat': 'israel',  'name': 'MokedBitajon'},
    {'url': 'https://nitter.privacydev.net/MokedBitajon/rss',    'cat': 'israel',  'name': 'MokedBitajon'},
    {'url': 'https://nitter.poast.org/MokedBitajon/rss',         'cat': 'israel',  'name': 'MokedBitajon'},
    {'url': 'https://nitter.net/MokedBitajon/rss',               'cat': 'israel',  'name': 'MokedBitajon'},
    {'url': 'https://nitter.tiekoetter.com/MokedBitajon/rss',    'cat': 'israel',  'name': 'MokedBitajon'},
    {'url': 'https://nitter.1d4.us/MokedBitajon/rss',            'cat': 'israel',  'name': 'MokedBitajon'},
    {'url': 'https://nitter.kavin.rocks/MokedBitajon/rss',       'cat': 'israel',  'name': 'MokedBitajon'},

    # --- ECONOMIA ---
    {'url': 'https://www.ambito.com/rss.html',                    'cat': 'economy', 'name': 'Ambito'},
    {'url': 'https://www.cronista.com/rss/',                      'cat': 'economy', 'name': 'El Cronista'},
    {'url': 'https://www.iprofesional.com/rss/noticias',          'cat': 'economy', 'name': 'iProfesional'},

    # --- DEPORTES ---
    {'url': 'https://www.ole.com.ar/rss/home.xml',                'cat': 'sports',  'name': 'Ole'},
    {'url': 'https://www.marca.com/rss/portada.xml',              'cat': 'sports',  'name': 'Marca'},
    {'url': 'https://as.com/rss/tags/futbol/a/rss.xml',           'cat': 'sports',  'name': 'AS'},
    {'url': 'https://www.tycsports.com/rss.xml',                  'cat': 'sports',  'name': 'TyC Sports'},

    # --- CINE & ENTRETENIMIENTO ---
    {'url': 'https://www.espinof.com/rss',                                'cat': 'cinema',  'name': 'Espinof'},
    {'url': 'https://www.fotogramas.es/rss',                              'cat': 'cinema',  'name': 'Fotogramas'},
    {'url': 'https://www.sensacine.com/noticias/rss/',                    'cat': 'cinema',  'name': 'SensaCine'},
    {'url': 'https://www.filmaffinity.com/es/rss/es_reviews.xml',         'cat': 'cinema',  'name': 'FilmAffinity'},
    {'url': 'https://cinemascomics.com/feed/',                            'cat': 'cinema',  'name': 'CinemasComics'},
    {'url': 'https://www.escribiendocine.com/feed',                       'cat': 'cinema',  'name': 'EscribiendoCine'},
    {'url': 'https://www.ecartelera.com/rss/',                            'cat': 'cinema',  'name': 'eCartelera'},
    {'url': 'https://www.hobbyconsolas.com/rss/cine',                     'cat': 'cinema',  'name': 'HobbyConsolas Cine'},
    {'url': 'https://decine21.com/feed/',                                 'cat': 'cinema',  'name': 'Decine21'},
    {'url': 'https://www.20minutos.es/rss/cineyseries/',                  'cat': 'cinema',  'name': '20minutos Cine'},
    {'url': 'https://www.lavanguardia.com/rss/gente-cultura.xml',         'cat': 'cinema',  'name': 'La Vanguardia Cultura'},

    # --- POLITICA ARGENTINA (directa) ---
    {'url': 'https://www.lapoliticaonline.com/rss/',                      'cat': 'ar_pol',  'name': 'La Política Online'},
    {'url': 'https://chequeado.com/feed/',                                'cat': 'ar_pol',  'name': 'Chequeado'},
    {'url': 'https://www.pagina12.com.ar/rss/portada',                   'cat': 'ar_pol',  'name': 'Pagina 12'},
    {'url': 'https://www.eldiarioar.com/rss/',                           'cat': 'ar_pol',  'name': 'El Diario AR'},
]

# Fuentes que ya obtuvieron articulos (para evitar duplicar @MokedBitajon si varias instancias responden)
_mokedb_done = False

KEYWORDS = {
    'israel':  ['israel', 'gaza', 'hamas', 'palestina', 'hezbollah', 'netanyahu', 'medio oriente', 'cisjordania', 'franja de gaza'],
    'ar_pol':  ['milei', 'kirchner', 'peronismo', 'diputados', 'senado', 'casa rosada', 'kicillof', 'macri', 'bullrich', 'gobierno argentino', 'ministerio de'],
    'poleco':  ['trump', 'putin', 'xi jinping', 'banco central', 'inflaci', 'dolar', 'dólar', 'pbi', 'bolsa', 'mercado financiero', 'economia', 'economía', 'finanzas', 'elecciones', 'gobierno', 'politica', 'política', 'reservas', 'bonos', 'crypto', 'bitcoin'],
    'sports':  ['futbol', 'fútbol', 'river', 'boca', 'racing', 'san lorenzo', 'champions', 'premier', 'real madrid', 'barcelona', 'messi', 'seleccion', 'copa', 'gol', 'tenis', 'formula 1', 'f1', 'nba', 'rugby'],
    'ia':      ['inteligencia artificial', 'chatgpt', 'openai', 'claude', 'anthropic', 'gemini', 'grok', 'llama', 'mistral', 'deepseek', 'midjourney', 'stable diffusion', 'sora', 'runway', 'elevenlabs', 'perplexity', 'copilot', 'cursor ai', 'machine learning', 'modelo de lenguaje', 'llm ', 'gpt-4', 'gpt-5', 'dall-e', 'ia generativa', 'xai ', 'gpt4'],
    'tech':    [' ia ', 'google', 'apple', 'microsoft', 'iphone', 'android', 'startup', 'robot', 'tecnologia', 'tecnología', 'software', 'ciberseguridad', 'samsung', 'chip'],
    'cinema':  ['pelicula', 'película', 'cine', 'netflix', 'disney', 'hbo', 'amazon prime', 'marvel', 'dc comics', 'oscar', 'actor', 'actriz', 'director', 'estreno', 'trailer', 'tráiler', 'serie', 'streaming', 'temporada', 'spiderman', 'spider-man', 'avengers', 'batman', 'superman', 'pixar', 'anime', 'critica', 'crítica'],
}

# Sub-categorías dentro de 'ia' — orden de más específico a más general
IA_SUBCAT_KW = {
    'diseño':       ['midjourney', 'stable diffusion', 'dall-e', 'flux ', 'sora', 'runway', 'text-to-image', 'text-to-video', 'generative image', 'image generation', 'video generation', 'generación de imagen', 'generación de vídeo', 'diseño generativo'],
    'modelos':      ['gpt-4', 'gpt-5', 'gpt4', 'gpt5', 'claude 3', 'claude 4', 'gemini 2', 'grok 3', 'llama 3', 'mistral ', 'deepseek', 'o3 ', 'o4 ', 'benchmark', 'nuevo modelo', 'lanza modelo', 'model release', 'weights'],
    'desarrollo':   ['open source', 'open-source', 'código abierto', 'api ', 'developer', 'programador', 'python ', 'sdk ', 'agent framework', 'agentes de ia', 'automatización', 'automation', 'github copilot'],
    'mercado':      ['recauda', 'ronda de inversión', 'valorada en', 'raises $', 'million funding', 'billion funding', 'acquisition', 'adquisición', 'ipo ', 'revenue', 'valuation'],
    'herramientas': ['cursor ', 'copilot', 'elevenlabs', 'perplexity', 'notion ai', 'herramienta', 'productivity tool', 'lanza app', 'nueva función'],
    'empresas':     ['openai', 'anthropic', 'google deepmind', 'meta ai', 'nvidia', 'microsoft', 'xai ', 'startup de ia'],
}

def ia_subcat(title, desc):
    text = (title + ' ' + desc).lower()
    for subcat, kws in IA_SUBCAT_KW.items():
        if any(k in text for k in kws):
            return subcat
    return 'herramientas'

# Herramientas conocidas para el Radar IA
AI_TOOLS_KW = {
    'ChatGPT': 'Modelo', 'GPT-4': 'Modelo', 'GPT-5': 'Modelo', 'o3': 'Modelo', 'o4': 'Modelo',
    'Claude':  'Modelo', 'Gemini': 'Modelo', 'Grok': 'Modelo',
    'Llama':   'Modelo', 'Mistral': 'Modelo', 'DeepSeek': 'Modelo',
    'Cursor':  'Coding AI', 'Copilot': 'Coding AI', 'Replit': 'Coding AI', 'Devin': 'Coding AI',
    'Midjourney': 'Imágenes IA', 'DALL-E': 'Imágenes IA', 'Stable Diffusion': 'Imágenes IA', 'Flux': 'Imágenes IA',
    'Sora': 'Video AI', 'Runway': 'Video AI', 'Kling': 'Video AI', 'Pika': 'Video AI',
    'Perplexity': 'Búsqueda IA', 'ElevenLabs': 'Voz IA', 'Whisper': 'Voz IA',
}
_TREND_BADGES  = [('Muy mencionado','rb-blue'), ('Trending','rb-green'), ('En foco','rb-accent'), ('Alta atención','rb-orange')]
_RISING_BADGES = [('Crecimiento fuerte','rb-green'), ('Subiendo','rb-blue'), ('Emergente','rb-accent'), ('Para seguir','rb-orange')]

def generate_radar(ia_articles):
    now = datetime.now(timezone.utc)
    counts = {}
    for art in ia_articles:
        text = (art.get('title', '') + ' ' + art.get('summary', '')).lower()
        try:
            pub = datetime.fromisoformat(art.get('pubDate', '').replace('Z', '+00:00'))
            is_recent = (now - pub).total_seconds() < 48 * 3600
        except Exception:
            is_recent = False
        for tool in AI_TOOLS_KW:
            if tool.lower() in text:
                if tool not in counts:
                    counts[tool] = [0, 0, '']
                counts[tool][0] += 1
                if is_recent:
                    counts[tool][1] += 1
                if not counts[tool][2]:
                    counts[tool][2] = art.get('title', '')

    sorted_all    = sorted(counts.items(), key=lambda x: x[1][0], reverse=True)
    sorted_recent = sorted(counts.items(), key=lambda x: x[1][1], reverse=True)

    def trend_badge(total):
        if total >= 10: return _TREND_BADGES[0]
        if total >= 5:  return _TREND_BADGES[1]
        if total >= 3:  return _TREND_BADGES[2]
        return _TREND_BADGES[3]

    def rise_badge(total, recent):
        ratio = recent / total if total else 0
        if ratio >= 0.8: return _RISING_BADGES[0]
        if ratio >= 0.5: return _RISING_BADGES[1]
        if recent >= 2:  return _RISING_BADGES[2]
        return _RISING_BADGES[3]

    trending = []
    for name, (total, recent, title) in sorted_all[:5]:
        badge, cls = trend_badge(total)
        trending.append({'name': name, 'type': AI_TOOLS_KW[name], 'badge': badge, 'cls': cls})

    top3 = {t['name'] for t in trending[:3]}
    rising = []
    for name, (total, recent, title) in sorted_recent:
        if recent == 0 or name in top3: continue
        badge, cls = rise_badge(total, recent)
        desc = re.sub(r'<[^>]+>', '', title).strip()[:80]
        rising.append({'name': name, 'type': AI_TOOLS_KW[name], 'desc': desc or f'Novedades sobre {name}', 'badge': badge, 'cls': cls})
        if len(rising) >= 4: break

    return {'trending': trending, 'rising': rising}


def strip_html(text):
    if not text:
        return ''
    clean = re.sub(r'<[^>]+>', ' ', str(text))
    clean = re.sub(r'&[a-zA-Z]+;', ' ', clean)
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean[:2000]


def get_image(entry):
    """Extract image URL from RSS entry using multiple strategies."""
    # 1. media:thumbnail
    if hasattr(entry, 'media_thumbnail') and entry.media_thumbnail:
        url = entry.media_thumbnail[0].get('url', '')
        if url and url.startswith('http'):
            return url

    # 2. media:content (image type)
    if hasattr(entry, 'media_content') and entry.media_content:
        for mc in entry.media_content:
            url = mc.get('url', '')
            if url and url.startswith('http'):
                mtype  = mc.get('type', '')
                medium = mc.get('medium', '')
                if 'image' in mtype or 'image' in medium:
                    return url

    # 3. enclosures
    if entry.get('enclosures'):
        for enc in entry.enclosures:
            url = enc.get('href', enc.get('url', ''))
            if url and 'image' in enc.get('type', '') and url.startswith('http'):
                return url

    # 4. Extract <img> from description/content HTML
    for field in ['summary', 'description']:
        html = entry.get(field, '')
        if html:
            m = re.search(r'<img[^>]+src=["\']([^"\']{10,})["\']', html, re.IGNORECASE)
            if m:
                url = m.group(1)
                if url.startswith('http') and not url.endswith('.gif'):
                    return url

    # 5. content:encoded
    if hasattr(entry, 'content') and entry.content:
        html = entry.content[0].get('value', '')
        if html:
            m = re.search(r'<img[^>]+src=["\']([^"\']{10,})["\']', html, re.IGNORECASE)
            if m:
                url = m.group(1)
                if url.startswith('http') and not url.endswith('.gif'):
                    return url

    return ''


CRIME_KWS = ['muri', 'falleci', 'asesin', 'crimen', 'homicid', 'femicid',
             'tragedia', 'accidente fatal', 'muerto', 'muertos', 'cadaver',
             'violacion', 'secuestr', 'narco', 'droga', 'detenido', 'preso']

def classify(title, desc, default_cat):
    text = (title + ' ' + desc).lower()

    # Prevenir que noticias de crimen/violencia queden en deportes
    # NO se aplica a cinema: peliculas de narcos/thrillers/zombies contienen esas palabras
    if default_cat == 'sports' and any(k in text for k in CRIME_KWS):
        default_cat = 'general'

    # Artículos de fuentes 'tech' pueden promoverse a 'ia' si tienen keywords de IA
    if default_cat == 'tech':
        if any(k in text for k in KEYWORDS.get('ia', [])):
            return 'ia'
        return 'tech'

    if default_cat not in ('general', 'economy'):
        return default_cat

    # Orden de prioridad: mas especifico primero
    for cat in ['israel', 'ar_pol', 'ia', 'tech', 'cinema', 'sports', 'poleco']:
        if any(k in text for k in KEYWORDS.get(cat, [])):
            return cat
    return 'poleco'


def make_id(s):
    return base64.b64encode(s[:60].encode('utf-8', errors='ignore')).decode()[:20]


articles = []

# --- Intentar obtener tweets de @MokedBitajon via twikit (mejor fuente disponible) ---
_mokedb_done = False
_twikit_tweets = get_mokedb_tweets_twikit()
if _twikit_tweets:
    articles.extend(_twikit_tweets)
    _mokedb_done = True
    print(f'[OK] MokedBitajon (twikit): {len(_twikit_tweets)} tweets')

for src in SOURCES:
    try:
        # @MokedBitajon: si ya obtuvimos tweets de una instancia nitter, saltear las demas
        is_mokedb = src['name'] == 'MokedBitajon'
        if is_mokedb and _mokedb_done:
            print(f"[SKIP] {src['url']} (MokedBitajon ya cargado)")
            continue

        feed = fetch_feed(src['url'], use_browser_headers=is_mokedb)
        count = 0
        for entry in feed.entries[:30]:
            title = strip_html(entry.get('title', ''))
            if not title or len(title) < 15:
                continue

            desc = strip_html(
                (entry.content[0].get('value', '') if hasattr(entry, 'content') and entry.content else '') or
                entry.get('summary', '') or
                entry.get('description', '')
            )

            # Para tweets de nitter: filtrar tweets viejos (> 14 días) y convertir link a x.com
            link = entry.get('link', '')
            if is_mokedb:
                pub_parsed = entry.get('published_parsed')
                if pub_parsed:
                    try:
                        pub_dt = datetime(*pub_parsed[:6], tzinfo=timezone.utc)
                        if (datetime.now(timezone.utc) - pub_dt).days > 14:
                            continue  # ignorar tweets viejos
                    except Exception:
                        pass
                if link:
                    link = re.sub(r'https?://[^/]+/', 'https://x.com/', link)

            pub   = entry.get('published', datetime.now(timezone.utc).isoformat())
            image = get_image(entry)

            cat = classify(title, desc, src['cat'])
            article = {
                'id':      make_id(link or title),
                'title':   title,
                'summary': desc,
                'link':    link,
                'pubDate': pub,
                'source':  src['name'],
                'cat':     cat,
                'image':   image,
            }
            if cat == 'ia':
                article['subcat'] = ia_subcat(title, desc)
            articles.append(article)
            count += 1

        if count > 0:
            print(f"[OK] {src['name']}: {count} articulos")
            if is_mokedb:
                _mokedb_done = True
        else:
            print(f"[EMPTY] {src['name']}: sin entradas")

    except Exception as e:
        print(f"[ERROR] {src['name']}: {e}")

# Deduplicate by id
seen, unique = set(), []
for a in articles:
    if a['id'] not in seen:
        seen.add(a['id'])
        unique.append(a)

# Sort by date descending
unique.sort(key=lambda x: x.get('pubDate', ''), reverse=True)

ia_articles = [a for a in unique if a.get('cat') == 'ia']
radar = generate_radar(ia_articles) if ia_articles else {'trending': [], 'rising': []}
print(f"[radar] trending: {[t['name'] for t in radar['trending']]} | rising: {[r['name'] for r in radar['rising']]}")

output = {
    'articles': unique,
    'radar':    radar,
    'updated':  datetime.now(timezone.utc).isoformat()
}

with open('news.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

with_img = sum(1 for a in unique if a.get('image'))
print(f"\n✓ {len(unique)} articulos guardados ({with_img} con imagen) en news.json")
