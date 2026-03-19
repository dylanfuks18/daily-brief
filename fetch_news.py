import feedparser
import requests
import json
import re
import base64
from datetime import datetime, timezone

# Headers para imitar un navegador real (evita bloqueo de bot en nitter/xcancel)
BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
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


# Bearer token público de twitter.com (embebido en su JS, no requiere cuenta)
_TWITTER_BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LTMjD96pljZnPXkqekJPycXga3lSLKBOcHIdlEJCaiy'

def get_mokedb_tweets_guest_api(count=10):
    """Obtiene tweets de @MokedBitajon via Twitter guest API (sin API key de pago)."""
    session = requests.Session()
    session.headers.update({
        'Authorization': f'Bearer {_TWITTER_BEARER}',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'x-twitter-active-user': 'yes',
        'x-twitter-client-language': 'es',
        'Content-Type': 'application/json',
    })
    try:
        # 1. Activar sesión anónima (guest token)
        r = session.post('https://api.twitter.com/1.1/guest/activate.json', timeout=12)
        if r.status_code != 200:
            print(f'  [twitter guest] activate failed: {r.status_code}')
            return []
        guest_token = r.json().get('guest_token', '')
        if not guest_token:
            return []
        session.headers['x-guest-token'] = guest_token

        # 2. Timeline del usuario
        r = session.get(
            'https://api.twitter.com/1.1/statuses/user_timeline.json',
            params={
                'screen_name': 'MokedBitajon',
                'count': count,
                'tweet_mode': 'extended',
                'exclude_replies': 'true',
                'include_rts': 'false',
            },
            timeout=12
        )
        if r.status_code != 200:
            print(f'  [twitter guest] timeline failed: {r.status_code} — {r.text[:120]}')
            return []

        tweets_raw = r.json()
        if not isinstance(tweets_raw, list):
            return []

        now = datetime.now(timezone.utc)
        results = []
        for tw in tweets_raw:
            text = tw.get('full_text', tw.get('text', ''))
            if not text or text.startswith('RT @'):
                continue
            # Limpiar URLs de Twitter del final del texto
            text = re.sub(r'https://t\.co/\S+', '', text).strip()
            created_str = tw.get('created_at', '')
            tweet_id    = tw.get('id_str', '')
            link = f'https://x.com/MokedBitajon/status/{tweet_id}' if tweet_id else 'https://x.com/MokedBitajon'
            results.append({
                'id':      make_id(link),
                'title':   text[:120],
                'summary': text,
                'link':    link,
                'pubDate': created_str,
                'source':  'MokedBitajon',
                'cat':     'israel',
                'image':   None,
            })

        print(f'  [twitter guest] ✓ {len(results)} tweets de @MokedBitajon')
        return results

    except Exception as e:
        print(f'  [twitter guest] error: {e}')
        return []

SOURCES = [
    # --- TECH & IA ---
    {'url': 'https://www.xataka.com/feed',                        'cat': 'tech',    'name': 'Xataka'},
    {'url': 'https://hipertextual.com/feed',                      'cat': 'tech',    'name': 'Hipertextual'},
    {'url': 'https://feeds.weblogssl.com/genbeta',                'cat': 'tech',    'name': 'Genbeta'},
    {'url': 'https://www.technologyreview.com/feed/',             'cat': 'tech',    'name': 'MIT Tech Review'},

    # --- NOTICIAS GENERALES (se clasifican por keywords) ---
    {'url': 'https://feeds.bbci.co.uk/mundo/rss.xml',            'cat': 'general', 'name': 'BBC Mundo'},
    {'url': 'https://www.infobae.com/feeds/rss/',                 'cat': 'general', 'name': 'Infobae'},
    {'url': 'https://tn.com.ar/rss/latest.xml',                   'cat': 'general', 'name': 'TN'},
    {'url': 'https://www.clarin.com/rss/lo-ultimo/',              'cat': 'general', 'name': 'Clarin'},
    {'url': 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/', 'cat': 'general', 'name': 'La Nacion'},
    {'url': 'https://www.perfil.com/rss/noticias',                'cat': 'general', 'name': 'Perfil'},
    {'url': 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada', 'cat': 'general', 'name': 'El Pais'},

    # --- ISRAEL & MEDIO ORIENTE (directo) ---
    {'url': 'https://es.timesofisrael.com/feed/',                 'cat': 'israel',  'name': 'Times of Israel'},

    # --- @MokedBitajon en X (via nitter/xcancel — headers de navegador, se intenta en orden) ---
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
    'tech':    ['inteligencia artificial', ' ia ', 'chatgpt', 'openai', 'google', 'apple', 'microsoft', 'iphone', 'android', 'startup', 'robot', 'tecnologia', 'tecnología', 'software', 'ciberseguridad', 'gemini', 'deepseek', 'samsung', 'chip'],
    'cinema':  ['pelicula', 'película', 'cine', 'netflix', 'disney', 'hbo', 'amazon prime', 'marvel', 'dc comics', 'oscar', 'actor', 'actriz', 'director', 'estreno', 'trailer', 'tráiler', 'serie', 'streaming', 'temporada', 'spiderman', 'spider-man', 'avengers', 'batman', 'superman', 'pixar', 'anime', 'critica', 'crítica'],
}


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

    if default_cat not in ('general', 'economy'):
        return default_cat

    # Orden de prioridad: mas especifico primero
    for cat in ['israel', 'ar_pol', 'tech', 'cinema', 'sports', 'poleco']:
        if any(k in text for k in KEYWORDS.get(cat, [])):
            return cat
    return 'poleco'


def make_id(s):
    return base64.b64encode(s[:60].encode('utf-8', errors='ignore')).decode()[:20]


articles = []

# Intentar Twitter guest API primero (más confiable que nitter)
print('[MokedBitajon] Intentando Twitter guest API...')
_mokedb_tweets = get_mokedb_tweets_guest_api()
if _mokedb_tweets:
    articles.extend(_mokedb_tweets)
    _mokedb_done = True
    print(f'[MokedBitajon] Guest API OK — saltando instancias nitter')
else:
    _mokedb_done = False
    print('[MokedBitajon] Guest API falló — intentando nitter como fallback')

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

            articles.append({
                'id':      make_id(link or title),
                'title':   title,
                'summary': desc,
                'link':    link,
                'pubDate': pub,
                'source':  src['name'],
                'cat':     classify(title, desc, src['cat']),
                'image':   image,
            })
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

output = {
    'articles': unique,
    'updated':  datetime.now(timezone.utc).isoformat()
}

with open('news.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

with_img = sum(1 for a in unique if a.get('image'))
print(f"\n✓ {len(unique)} articulos guardados ({with_img} con imagen) en news.json")
