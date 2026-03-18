import feedparser
import json
import re
import base64
from datetime import datetime, timezone

SOURCES = [
    # --- TECH & IA ---
    {'url': 'https://www.xataka.com/feed',                        'cat': 'tech',    'name': 'Xataka'},
    {'url': 'https://hipertextual.com/feed',                      'cat': 'tech',    'name': 'Hipertextual'},
    {'url': 'https://feeds.weblogssl.com/genbeta',                'cat': 'tech',    'name': 'Genbeta'},

    # --- NOTICIAS GENERALES (se clasifican por keywords) ---
    {'url': 'https://feeds.bbci.co.uk/mundo/rss.xml',            'cat': 'general', 'name': 'BBC Mundo'},
    {'url': 'https://www.infobae.com/feeds/rss/',                 'cat': 'general', 'name': 'Infobae'},
    {'url': 'https://tn.com.ar/rss/latest.xml',                   'cat': 'general', 'name': 'TN'},
    {'url': 'https://www.clarin.com/rss/lo-ultimo/',              'cat': 'general', 'name': 'Clarin'},
    {'url': 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/', 'cat': 'general', 'name': 'La Nacion'},

    # --- ECONOMIA ---
    {'url': 'https://www.ambito.com/rss.html',                    'cat': 'economy', 'name': 'Ambito'},
    {'url': 'https://www.cronista.com/rss/',                      'cat': 'economy', 'name': 'El Cronista'},

    # --- DEPORTES ---
    {'url': 'https://www.ole.com.ar/rss/home.xml',                'cat': 'sports',  'name': 'Ole'},
    {'url': 'https://www.marca.com/rss/portada.xml',              'cat': 'sports',  'name': 'Marca'},
    {'url': 'https://as.com/rss/tags/futbol/a/rss.xml',           'cat': 'sports',  'name': 'AS'},

    # --- CINE & ENTRETENIMIENTO ---
    {'url': 'https://www.espinof.com/rss',                        'cat': 'cinema',  'name': 'Espinof'},
    {'url': 'https://www.fotogramas.es/rss',                      'cat': 'cinema',  'name': 'Fotogramas'},
    {'url': 'https://www.sensacine.com/noticias/rss/',            'cat': 'cinema',  'name': 'SensaCine'},
]

KEYWORDS = {
    'israel':  ['israel', 'gaza', 'hamas', 'palestina', 'hezbollah', 'netanyahu', 'medio oriente', 'cisjordania', 'franja de gaza'],
    'ar_pol':  ['milei', 'kirchner', 'peronismo', 'diputados', 'senado', 'casa rosada', 'kicillof', 'macri', 'bullrich', 'gobierno argentino', 'ministerio de'],
    'poleco':  ['trump', 'putin', 'xi jinping', 'banco central', 'inflaci', 'dolar', 'dólar', 'pbi', 'bolsa', 'mercado financiero', 'economia', 'economía', 'finanzas', 'elecciones', 'gobierno', 'politica', 'política', 'reservas', 'bonos', 'crypto', 'bitcoin'],
    'sports':  ['futbol', 'fútbol', 'river', 'boca', 'racing', 'san lorenzo', 'champions', 'premier', 'real madrid', 'barcelona', 'messi', 'seleccion', 'copa', 'gol', 'tenis', 'formula 1', 'f1', 'nba', 'rugby'],
    'tech':    ['inteligencia artificial', ' ia ', 'chatgpt', 'openai', 'google', 'apple', 'microsoft', 'iphone', 'android', 'startup', 'robot', 'tecnologia', 'tecnología', 'software', 'ciberseguridad', 'gemini', 'deepseek', 'samsung', 'chip'],
    'cinema':  ['pelicula', 'película', 'cine', 'netflix', 'disney', 'hbo', 'amazon prime', 'marvel', 'oscar', 'actor', 'actriz', 'director', 'estreno', 'trailer', 'serie', 'streaming', 'temporada'],
}


def strip_html(text):
    if not text:
        return ''
    clean = re.sub(r'<[^>]+>', ' ', str(text))
    clean = re.sub(r'&[a-zA-Z]+;', ' ', clean)
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean[:1000]


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

for src in SOURCES:
    try:
        feed = feedparser.parse(src['url'])
        count = 0
        for entry in feed.entries[:25]:
            title = strip_html(entry.get('title', ''))
            if not title:
                continue

            desc = strip_html(
                (entry.content[0].get('value', '') if hasattr(entry, 'content') and entry.content else '') or
                entry.get('summary', '') or
                entry.get('description', '')
            )

            link  = entry.get('link', '')
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

        print(f"[OK] {src['name']}: {count} articulos")

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
