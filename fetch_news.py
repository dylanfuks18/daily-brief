import feedparser
import json
import re
import base64
from datetime import datetime, timezone

SOURCES = [
    {'url': 'https://www.xataka.com/feed',                  'cat': 'tech',    'name': 'Xataka'},
    {'url': 'https://hipertextual.com/feed',                'cat': 'tech',    'name': 'Hipertextual'},
    {'url': 'https://feeds.weblogssl.com/genbeta',          'cat': 'tech',    'name': 'Genbeta'},
    {'url': 'https://feeds.bbci.co.uk/mundo/rss.xml',       'cat': 'general', 'name': 'BBC Mundo'},
    {'url': 'https://www.infobae.com/feeds/rss/',           'cat': 'general', 'name': 'Infobae'},
    {'url': 'https://tn.com.ar/rss/latest.xml',             'cat': 'general', 'name': 'TN'},
    {'url': 'https://www.clarin.com/rss/lo-ultimo/',        'cat': 'general', 'name': 'Clarin'},
    {'url': 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/', 'cat': 'general', 'name': 'La Nacion'},
    {'url': 'https://www.ambito.com/rss.html',              'cat': 'economy', 'name': 'Ambito'},
    {'url': 'https://www.cronista.com/rss/',                'cat': 'economy', 'name': 'El Cronista'},
    {'url': 'https://www.ole.com.ar/rss/home.xml',          'cat': 'sports',  'name': 'Ole'},
    {'url': 'https://www.espinof.com/rss',                  'cat': 'cinema',  'name': 'Espinof'},
]

KEYWORDS = {
    'israel':  ['israel', 'gaza', 'hamas', 'palestina', 'hezbollah', 'netanyahu', 'medio oriente', 'cisjordania'],
    'ar_pol':  ['milei', 'kirchner', 'peronismo', 'diputados', 'senado', 'casa rosada', 'kicillof', 'macri', 'gobierno argentino', 'berni', 'bullrich'],
    'poleco':  ['trump', 'putin', 'xi jinping', 'banco central', 'inflaci', 'dolar', 'pbi', 'bolsa', 'mercado', 'economia', 'finanzas', 'elecciones', 'gobierno', 'politica', 'fed '],
    'sports':  ['futbol', 'river', 'boca', 'racing', 'san lorenzo', 'champions', 'premier', 'real madrid', 'barcelona', 'messi', 'seleccion', 'copa', 'gol', 'tenis', 'formula 1'],
    'tech':    ['inteligencia artificial', ' ia ', 'chatgpt', 'openai', 'google', 'apple', 'microsoft', 'iphone', 'android', 'startup', 'robot', 'tecnologia', 'software', 'ciberseguridad', 'gemini', 'deepseek'],
    'cinema':  ['pelicula', 'cine', 'netflix', 'disney', 'hbo', 'amazon prime', 'marvel', 'oscar', 'actor', 'actriz', 'director', 'estreno', 'trailer', 'serie', 'streaming', 'hollywood'],
}

def strip_html(text):
    if not text:
        return ''
    clean = re.sub(r'<[^>]+>', ' ', str(text))
    clean = re.sub(r'&[a-zA-Z]+;', ' ', clean)
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean[:800]

def classify(title, desc, default_cat):
    if default_cat not in ('general', 'economy'):
        return default_cat
    text = (title + ' ' + desc).lower()
    for cat, kws in KEYWORDS.items():
        if any(k in text for k in kws):
            return cat
    return 'poleco'

def make_id(s):
    return base64.b64encode(s[:60].encode('utf-8', errors='ignore')).decode()[:20]

articles = []

for src in SOURCES:
    try:
        feed = feedparser.parse(src['url'])
        print(f"[{src['name']}] {len(feed.entries)} entradas")
        for entry in feed.entries[:20]:
            title = strip_html(entry.get('title', ''))
            desc  = strip_html(
                entry.get('content', [{}])[0].get('value', '') or
                entry.get('summary', '') or
                entry.get('description', '')
            )
            link  = entry.get('link', '')
            pub   = entry.get('published', datetime.now(timezone.utc).isoformat())

            if not title:
                continue

            articles.append({
                'id':      make_id(link or title),
                'title':   title,
                'summary': desc,
                'link':    link,
                'pubDate': pub,
                'source':  src['name'],
                'cat':     classify(title, desc, src['cat']),
            })
    except Exception as e:
        print(f"Error en {src['name']}: {e}")

# Deduplicar por id
seen = set()
unique = []
for a in articles:
    if a['id'] not in seen:
        seen.add(a['id'])
        unique.append(a)

# Ordenar por fecha
unique.sort(key=lambda x: x.get('pubDate', ''), reverse=True)

output = {
    'articles': unique,
    'updated': datetime.now(timezone.utc).isoformat()
}

with open('news.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"\nGuardados {len(unique)} articulos en news.json")
