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

// ---------- SHARED UTILITIES ----------

// Logo X reutilizable (evita duplicar el SVG en 3+ lugares)
const X_LOGO_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.26 5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`;

// Fecha local YYYYMMDD (evita desfase UTC en Argentina de noche)
const fmtLocal = d =>
  `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;

// Status ESPN para fútbol — centralizado para evitar duplicación entre loadMatches/buildMatchCard
const FINISHED_STATUSES = new Set([
  'STATUS_FINAL', 'STATUS_FULL_TIME', 'STATUS_FT', 'STATUS_FINAL_OT', 'STATUS_FINAL_PEN'
]);
function getMatchStatus(ev) {
  const statusName = ev.status?.type?.name ?? '';
  const completed  = ev.status?.type?.completed === true;
  const isLive     = statusName === 'STATUS_IN_PROGRESS';
  const isHalf     = statusName === 'STATUS_HALFTIME' || statusName === 'STATUS_HALF_TIME';
  const isFinished = completed || FINISHED_STATUSES.has(statusName);
  return { statusName, isLive, isHalf, isFinished };
}

// ---------- TWEET RSS PARSER (module scope — hoisted de tryFetchTweetsClientSide) ----------
// Precompila regex una sola vez (evita 32 allocations por llamada)
const _RE_ITEM   = /<item>([\s\S]*?)<\/item>/g;
const _RE_TITLE  = /<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i;
const _RE_DATE   = /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i;
const _RE_DESC   = /<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i;
const _RE_LINK   = /<link>(.*?)<\/link>/i;
const TWEET_MAX_AGE = 14 * 86400000;

function parseRssXml(xml) {
  const items = [...xml.matchAll(_RE_ITEM)].map(m => m[0]);
  const now   = Date.now();
  const tag   = (raw, re) => { const m = raw.match(re); return m ? m[1].replace(/<[^>]+>/g,'').trim() : ''; };
  return items.map(raw => {
    const title   = tag(raw, _RE_TITLE);
    const pubDate = tag(raw, _RE_DATE);
    const desc    = tag(raw, _RE_DESC);
    const linkM   = raw.match(_RE_LINK) || raw.match(/<link\s*\/?>([^<]+)/i);
    const xUrl    = (linkM ? linkM[1].trim() : '').replace(/https?:\/\/[^/]+\//, 'https://x.com/');
    if (!title || title.length < 10) return null;
    if (pubDate && now - new Date(pubDate).getTime() > TWEET_MAX_AGE) return null;
    return { id: btoa(unescape(encodeURIComponent(xUrl || title))).slice(0, 20),
             title, summary: desc || title, link: xUrl, pubDate, source: 'MokedBitajon', cat: 'israel' };
  }).filter(Boolean).slice(0, 8);
}

// ---------- CORS PROXY HELPERS ----------
// Configuración de proxies para tweet/RSS fetching
const TWEET_PROXIES = [
  {
    buildUrl: u => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
    extract:  async res => { const d = await res.json(); return (d.status?.http_code ?? 200) === 200 ? d.contents : null; }
  },
  {
    buildUrl: u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    extract:  res => res.text()
  },
  {
    buildUrl: u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    extract:  res => res.text()
  },
];

async function fetchViaProxy(rssUrl, proxy) {
  const res = await fetch(proxy.buildUrl(rssUrl), { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return null;
  return proxy.extract(res);
}

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

// ---------- IA MOCK NEWS DATA ----------
const IA_MOCK_NEWS = [
  {
    id: 'ia1',
    title: 'OpenAI cierra ronda de $40.000 millones y alcanza valuación récord de $300B',
    source: 'Bloomberg',
    date: new Date(Date.now() - 1.5*3600000),
    summary: 'La compañía liderada por Sam Altman completó la mayor ronda de financiamiento privado de la historia tech, con SoftBank como inversor principal.',
    tags: ['Empresas', 'Mercado'],
    cat: 'empresas',
  },
  {
    id: 'ia2',
    title: 'GPT-4.5 ya está disponible para todos los usuarios de ChatGPT',
    source: 'OpenAI Blog',
    date: new Date(Date.now() - 3*3600000),
    summary: 'El nuevo modelo mejora notablemente la coherencia en conversaciones largas y reduce alucinaciones en un 40% respecto a GPT-4o.',
    tags: ['Modelos'],
    cat: 'modelos',
  },
  {
    id: 'ia3',
    title: 'Claude 3.7 Sonnet: razonamiento extendido en tiempo real disponible via API',
    source: 'Anthropic',
    date: new Date(Date.now() - 5*3600000),
    summary: 'El modelo híbrido de Anthropic permite controlar el "tiempo de pensamiento" antes de responder, con mejoras notables en matemáticas y código.',
    tags: ['Modelos', 'Desarrollo'],
    cat: 'modelos',
  },
  {
    id: 'ia4',
    title: 'Cursor supera el millón de usuarios activos y se convierte en el IDE de IA más popular',
    source: 'TechCrunch',
    date: new Date(Date.now() - 8*3600000),
    summary: 'El editor basado en VS Code lidera la nueva ola de herramientas para desarrolladores, con integraciones para Claude, GPT-4o y modelos locales.',
    tags: ['Herramientas', 'Desarrollo'],
    cat: 'herramientas',
  },
  {
    id: 'ia5',
    title: 'Google lanza Gemini 2.0 Ultra con ventana de contexto de 2 millones de tokens',
    source: 'Google DeepMind',
    date: new Date(Date.now() - 12*3600000),
    summary: 'La nueva versión soporta entrada nativa de audio, video e imágenes simultáneas y supera a GPT-4o en 15 de 18 benchmarks evaluados.',
    tags: ['Modelos', 'Empresas'],
    cat: 'modelos',
  },
  {
    id: 'ia6',
    title: 'Adobe Firefly 3.0 integra generación de imágenes directamente en Photoshop y Premiere',
    source: 'Adobe',
    date: new Date(Date.now() - 18*3600000),
    summary: 'La nueva versión incluye generación de video, relleno generativo mejorado y una paleta de estilos artísticos entrenados con contenido licenciado.',
    tags: ['Diseño', 'Herramientas'],
    cat: 'diseño',
  },
  {
    id: 'ia7',
    title: 'Meta lanza Llama 4 Scout y Maverick: open-source con arquitectura de mezcla de expertos',
    source: 'Meta AI',
    date: new Date(Date.now() - 24*3600000),
    summary: 'Los nuevos modelos de Meta son competitivos con GPT-4o y están disponibles de forma gratuita para uso comercial bajo licencia comunitaria.',
    tags: ['Modelos', 'Empresas'],
    cat: 'modelos',
  },
  {
    id: 'ia8',
    title: 'Mistral AI lanza API gratuita con acceso a Mistral Small 3.1 para desarrolladores',
    source: 'Mistral Blog',
    date: new Date(Date.now() - 30*3600000),
    summary: 'La startup francesa ofrece 1 billón de tokens gratuitos por mes para fomentar la adopción de sus modelos en proyectos independientes y startups.',
    tags: ['Desarrollo', 'Herramientas'],
    cat: 'desarrollo',
  },
  {
    id: 'ia9',
    title: 'Figma AI lanza "Make Design": generá interfaces completas desde texto en segundos',
    source: 'Figma',
    date: new Date(Date.now() - 36*3600000),
    summary: 'La función más esperada de Figma genera layouts, componentes y prototipos navegables a partir de una descripción en lenguaje natural.',
    tags: ['Diseño'],
    cat: 'diseño',
  },
  {
    id: 'ia10',
    title: 'El mercado global de IA generativa superará el billón de dólares antes de 2028',
    source: 'Goldman Sachs',
    date: new Date(Date.now() - 48*3600000),
    summary: 'Un nuevo informe proyecta un crecimiento anual del 67% impulsado por adopción empresarial, con Estados Unidos y China liderando la inversión.',
    tags: ['Mercado'],
    cat: 'mercado',
  },
  {
    id: 'ia11',
    title: 'xAI lanza Grok 3 con modo de razonamiento "Think" y acceso a búsqueda en tiempo real',
    source: 'xAI',
    date: new Date(Date.now() - 54*3600000),
    summary: 'El modelo de Elon Musk incluye acceso nativo a X/Twitter y destaca en análisis de datos financieros, según benchmarks internos de la compañía.',
    tags: ['Modelos', 'Empresas'],
    cat: 'modelos',
  },
  {
    id: 'ia12',
    title: 'Anthropic y Amazon amplían acuerdo estratégico a $8.000 millones en infraestructura cloud',
    source: 'Reuters',
    date: new Date(Date.now() - 60*3600000),
    summary: 'El acuerdo convierte a AWS en la nube preferida de Anthropic para entrenamiento e inferencia, con chips Trainium2 como base de la próxima generación de Claude.',
    tags: ['Empresas', 'Mercado'],
    cat: 'empresas',
  },
];

// Contenido enriquecido por artículo
const IA_ARTICLE_CONTENT = {
  ia1: {
    tldr: 'OpenAI recaudó $40.000 millones liderados por SoftBank, triplicando su valuación a $300B en menos de un año.',
    points: [
      'SoftBank aportó la mayor parte con $30.000M; el resto lo completaron fondos como Coatue y Altimeter.',
      'La valuación pasó de $157B (ronda anterior) a $300B en menos de 12 meses.',
      'El dinero se destinará a infraestructura de cómputo y expansión del equipo de investigación.',
      'Sam Altman confirmó que el camino a la AGI requiere inversiones "sin precedentes en la historia".',
    ],
    why: 'Esta ronda consolida a OpenAI como la startup más valiosa del mundo, por encima de SpaceX. Señala que los inversores todavía creen que la IA generativa es el negocio del siglo, a pesar de que OpenAI todavía no es rentable.',
  },
  ia2: {
    tldr: 'GPT-4.5 llegó a todos los usuarios de ChatGPT con mejoras reales en coherencia y menos errores factuales.',
    points: [
      'Reduce alucinaciones en un 40% respecto a GPT-4o según pruebas internas de OpenAI.',
      'Mejor manejo de contexto largo: mantiene coherencia en conversaciones de más de 50 turnos.',
      'Disponible para usuarios Free, Plus y Team; sin costo adicional.',
      'No es un salto en razonamiento, sino en confiabilidad y "personalidad" más natural.',
    ],
    why: 'GPT-4.5 no es el modelo que razona como o1/o3, pero es el más agradable de usar en el día a día. OpenAI apostó a que la mayoría de los usuarios prefieren respuestas fluidas antes que pensamiento profundo.',
  },
  ia3: {
    tldr: 'Claude 3.7 Sonnet combina respuesta rápida con razonamiento extendido activable, siendo el primer modelo híbrido de este tipo.',
    points: [
      'El modo "extended thinking" permite que el modelo piense hasta varios minutos antes de responder.',
      'Supera a GPT-4o en benchmarks de matemáticas (AIME) y código (SWE-bench).',
      'Disponible via API con parámetro `thinking: {budget_tokens: N}` para controlar el tiempo de razonamiento.',
      'Anthropic lo entrenó con énfasis en honestidad: el modelo admite cuando no sabe algo.',
    ],
    why: 'Es la propuesta más interesante del mercado ahora mismo: un solo modelo que funciona como respuesta rápida o como razonador profundo según lo que el desarrollador necesite. Ideal para apps que mezclan tareas simples y complejas.',
  },
  ia4: {
    tldr: 'Cursor se volvió el editor de código de IA más popular del mundo con 1M de usuarios activos, superando a GitHub Copilot en satisfacción.',
    points: [
      'Basado en VS Code, integra Claude, GPT-4o y modelos locales (Ollama) en un solo entorno.',
      'Su función "Composer" permite editar múltiples archivos a la vez con una sola instrucción.',
      'Reportan que el 70% de sus usuarios escribe menos código que antes de usarlo.',
      'Recaudó $60M en su última ronda con valuación de $400M.',
    ],
    why: 'Cursor demuestra que el editor de código es la interfaz más natural para IA en el trabajo real. GitHub Copilot llegó primero, pero Cursor ganó siendo más ambicioso: no solo autocompleta, sino que piensa con vos.',
  },
  ia5: {
    tldr: 'Gemini 2.0 Ultra establece un nuevo récord con ventana de 2 millones de tokens y entrada nativa de audio, video e imagen simultánea.',
    points: [
      '2 millones de tokens equivalen a procesar unas 1.500 páginas de texto de una sola vez.',
      'Supera a GPT-4o en 15 de 18 benchmarks, incluyendo MMLU, HumanEval y MATH.',
      'Integración nativa con Google Search, Maps, Gmail y YouTube para respuestas con contexto real.',
      'Disponible en Gemini Advanced y vía API en Google AI Studio sin costo adicional por ahora.',
    ],
    why: 'Google finalmente tiene un modelo que compite de igual a igual con OpenAI en calidad. La ventaja de Gemini es la integración con el ecosistema Google — nadie más puede ofrecer acceso a tu Gmail o tu historial de búsqueda.',
  },
  ia6: {
    tldr: 'Adobe Firefly 3.0 lleva la IA generativa directamente al flujo de trabajo de diseñadores en Photoshop y Premiere, sin salir de la app.',
    points: [
      'Generación de video de hasta 60 segundos directamente en la línea de tiempo de Premiere Pro.',
      'Relleno generativo mejorado: ahora mantiene iluminación y perspectiva del contexto original.',
      'Paleta de 1.000+ estilos artísticos, todos entrenados con imágenes licenciadas (sin problemas de copyright).',
      'Integración con Firefly API para que agencias puedan automatizar producción de assets.',
    ],
    why: 'Adobe entendió que los diseñadores no quieren salir a Midjourney y volver. Al meter todo dentro de sus apps, apuesta a que la conveniencia gana sobre la calidad pura. Y para trabajo comercial, el modelo libre de copyright es un argumento decisivo.',
  },
  ia7: {
    tldr: 'Meta lanzó Llama 4 con arquitectura MoE (mezcla de expertos), siendo el modelo open-source más capaz hasta la fecha y de uso comercial libre.',
    points: [
      'Scout (17B activos / 109B totales) y Maverick (17B activos / 400B totales) disponibles para descargar.',
      'Ventana de contexto de 10 millones de tokens en Scout — el mayor de cualquier modelo público.',
      'Maverick supera a GPT-4o y Gemini 2.0 Flash en benchmarks de razonamiento multimodal.',
      'Licencia comunitaria: cualquier empresa con menos de 700M de usuarios puede usarlo gratis.',
    ],
    why: 'Llama 4 es el mejor argumento contra el modelo cerrado. Si podés ejecutarlo en tus propios servidores con resultados comparables a GPT-4o, ¿por qué pagarle a OpenAI? Meta regala el modelo para destruir el negocio de sus competidores.',
  },
  ia8: {
    tldr: 'Mistral ofrece 1B de tokens gratuitos por mes de su modelo Mistral Small 3.1 para que desarrolladores construyan sin fricción.',
    points: [
      'Mistral Small 3.1 corre localmente en una GPU de 24GB con rendimiento comparable a modelos 3x más grandes.',
      'API compatible con el formato de OpenAI: migración con cambio mínimo de código.',
      'Soporte para 80+ idiomas incluido español con excelente calidad.',
      'El tier gratuito no requiere tarjeta de crédito ni aprobación manual.',
    ],
    why: 'Mistral está haciendo lo que hizo Stripe en pagos: quitar toda la fricción para que el primer MVP sea gratis. Una vez que integraste su API en tu app, cambiarla tiene costo. El tier gratuito es su estrategia de adquisición.',
  },
  ia9: {
    tldr: 'La función Make Design de Figma genera pantallas completas desde texto, incluyendo componentes reales de tu design system.',
    points: [
      'Entiende el contexto: si tenés un design system cargado, usa tus propios componentes en lugar de generar nuevos.',
      'Genera prototipos navegables, no solo imágenes estáticas.',
      'Disponible para todos los planes de Figma, incluyendo el gratuito con límite de usos.',
      'Funciona en español: podés describir la pantalla en tu idioma sin necesidad de prompt en inglés.',
    ],
    why: 'Make Design no reemplaza al diseñador pero sí cambia cuándo lo necesitás. Ahora el primer borrador lo puede hacer el product manager o el dev, y el diseñador entra a refinar. El proceso de diseño se acelera 3x en la etapa de exploración.',
  },
  ia10: {
    tldr: 'Goldman Sachs proyecta que la IA generativa alcanzará $1 billón en ingresos anuales antes de 2028, con un crecimiento del 67% anual.',
    points: [
      'El software empresarial de IA será el segmento más grande, superando al hardware (chips) hacia 2026.',
      'Estados Unidos y China concentran el 75% de la inversión global; Europa queda rezagada.',
      'Las industrias más impactadas serán: finanzas, salud, manufactura y marketing.',
      'El informe advierte que la productividad prometida todavía no se refleja en datos macroeconómicos.',
    ],
    why: 'El billón de dólares es la apuesta de que la IA pasa de "herramienta de experimentación" a "infraestructura crítica". La advertencia final del informe es honesta: todavía estamos en la fase de inversión, no de retorno.',
  },
  ia11: {
    tldr: 'Grok 3 de xAI llega con modo de razonamiento propio y acceso en tiempo real a X/Twitter, posicionándose como alternativa real a GPT-4o.',
    points: [
      'El modo "Think" activa razonamiento paso a paso similar a o1 de OpenAI, pero con respuestas más concisas.',
      'Acceso nativo a posts de X en tiempo real: puede analizar trending topics del momento.',
      'Disponible para suscriptores de X Premium+ ($16/mes) y vía API para empresas.',
      'Benchmarks internos muestran superioridad en análisis financiero y preguntas de cultura pop.',
    ],
    why: 'La gran apuesta de Grok es el acceso a X como fuente de datos en tiempo real. Ningún otro modelo tiene eso. Si necesitás saber qué está pasando ahora mismo en el mundo, Grok tiene una ventaja estructural que los otros no pueden copiar fácilmente.',
  },
  ia12: {
    tldr: 'Anthropic duplicó su acuerdo con Amazon a $8B, convirtiendo a AWS en la nube exclusiva para entrenar y servir modelos de Claude.',
    points: [
      'Los chips Trainium2 de Amazon serán la base para entrenar la próxima generación de modelos Claude.',
      'Claude estará disponible como servicio nativo dentro de Amazon Bedrock para empresas.',
      'El acuerdo incluye colaboración en seguridad de IA: Anthropic asesora a Amazon en políticas de uso responsable.',
      'Amazon tiene opción de participación accionaria en Anthropic como parte del trato.',
    ],
    why: 'Este acuerdo cambia la dinámica competitiva: Amazon tiene chips propios, infraestructura global y ahora el modelo más confiable del mercado. Microsoft tiene a OpenAI y Google tiene sus propios modelos. Amazon eligió la ruta de la alianza en lugar de construir desde cero.',
  },
};

const IA_FILTERS = [
  { key: 'todo',        label: 'Todo' },
  { key: 'empresas',   label: 'Empresas' },
  { key: 'modelos',    label: 'Modelos' },
  { key: 'herramientas', label: 'Herramientas' },
  { key: 'desarrollo', label: 'Desarrollo' },
  { key: 'diseño',     label: 'Diseño' },
  { key: 'mercado',    label: 'Mercado' },
];

let _iaFilter       = 'todo';
let _iaToolsSaved   = JSON.parse(localStorage.getItem('iaToolsSaved') || '[]');

// ---------- IA TOOLS DATA ----------
const IA_TOOLS = [
  {
    id: 'tool-chatgpt',
    name: 'ChatGPT',
    company: 'OpenAI',
    cat: 'Chat & Texto',
    catKey: 'chat',
    color: '#10a37f',
    emoji: '🤖',
    desc: 'El asistente de IA más popular del mundo. Responde preguntas, escribe, analiza y razona.',
    sirve: ['Redacción', 'Análisis', 'Código', 'Estudio'],
    precio: 'Freemium',
    nivel: 'Principiante',
    link: 'https://chat.openai.com',
    pros: ['Muy fácil de usar', 'Enorme comunidad', 'Plugins y GPTs personalizados', 'Integración con DALL-E'],
    cons: ['GPT-4o limitado en plan gratis', 'A veces inventa hechos', 'Sin acceso a internet en plan base'],
    precioDetalle: 'Gratis con límites · Plus $20/mes · Team $25/mes',
    resumen: 'ChatGPT es la puerta de entrada a la IA para la mayoría. Su versión gratuita es muy capaz para tareas cotidianas; el plan Plus vale la pena si lo usás más de 1h por día.',
  },
  {
    id: 'tool-claude',
    name: 'Claude',
    company: 'Anthropic',
    cat: 'Chat & Texto',
    catKey: 'chat',
    color: '#bf5af2',
    emoji: '✦',
    desc: 'El modelo más preciso y honesto del mercado. Destaca en razonamiento, escritura larga y código.',
    sirve: ['Código', 'Documentos largos', 'Análisis', 'Escritura'],
    precio: 'Freemium',
    nivel: 'Principiante',
    link: 'https://claude.ai',
    pros: ['Contexto de 200k tokens', 'Honesto: reconoce sus límites', 'Excelente en código y razonamiento', 'Modo "Extended Thinking"'],
    cons: ['Sin generación de imágenes', 'Límites de uso en plan gratis', 'Menos integraciones que ChatGPT'],
    precioDetalle: 'Gratis con límites · Pro $20/mes · Team $25/mes',
    resumen: 'Claude es la elección de quienes trabajan con textos largos o código complejo. Su razonamiento es más profundo que el de ChatGPT y sus respuestas tienden a ser más precisas y menos alucinadas.',
  },
  {
    id: 'tool-perplexity',
    name: 'Perplexity',
    company: 'Perplexity AI',
    cat: 'Búsqueda IA',
    catKey: 'busqueda',
    color: '#20b2aa',
    emoji: '🔍',
    desc: 'Motor de búsqueda potenciado por IA que responde con fuentes citadas en tiempo real.',
    sirve: ['Investigación', 'Noticias', 'Preguntas factuales', 'Comparativas'],
    precio: 'Freemium',
    nivel: 'Principiante',
    link: 'https://perplexity.ai',
    pros: ['Respuestas con fuentes verificadas', 'Siempre actualizado', 'Interfaz muy limpia', 'Búsqueda en PDF y YouTube'],
    cons: ['No es tan creativo como ChatGPT/Claude', 'Plan Pro caro para lo que ofrece', 'Puede citar fuentes de baja calidad'],
    precioDetalle: 'Gratis · Pro $20/mes',
    resumen: 'Perplexity es el mejor reemplazo de Google para preguntas que necesitan respuesta, no solo links. Si querés saber algo específico con fuentes confiables, es la herramienta correcta.',
  },
  {
    id: 'tool-midjourney',
    name: 'Midjourney',
    company: 'Midjourney Inc.',
    cat: 'Imágenes IA',
    catKey: 'imagenes',
    color: '#e91e8c',
    emoji: '🎨',
    desc: 'La IA de generación de imágenes más artística. Produce resultados fotorrealistas y de alta calidad.',
    sirve: ['Diseño', 'Ilustración', 'Concept Art', 'Marketing'],
    precio: 'Pago',
    nivel: 'Intermedio',
    link: 'https://midjourney.com',
    pros: ['La mejor calidad de imagen del mercado', 'Estética artística única', 'V6 es fotorrealista', 'Comunidad muy activa'],
    cons: ['No tiene plan gratuito', 'Requiere Discord o web', 'Curva de aprendizaje en prompts'],
    precioDetalle: 'Basic $10/mes · Standard $30/mes · Pro $60/mes',
    resumen: 'Midjourney sigue siendo el rey de las imágenes generadas por IA cuando la calidad artística importa. No es el más barato ni el más fácil, pero los resultados no tienen competencia real todavía.',
  },
  {
    id: 'tool-runway',
    name: 'Runway',
    company: 'Runway AI',
    cat: 'Video IA',
    catKey: 'video',
    color: '#ff6b35',
    emoji: '🎬',
    desc: 'Suite de IA creativa para generar y editar video. El estándar de la industria para video IA.',
    sirve: ['Video IA', 'Efectos visuales', 'Edición', 'Animación'],
    precio: 'Freemium',
    nivel: 'Intermedio',
    link: 'https://runwayml.com',
    pros: ['Gen-3 produce video de alta calidad', 'Herramientas de edición integradas', 'Fácil de usar para no técnicos', 'Exportación en alta resolución'],
    cons: ['Créditos se agotan rápido', 'Videos de máximo 10 seg en plan base', 'Caro si lo usás intensamente'],
    precioDetalle: 'Gratis (125 créditos) · Standard $15/mes · Pro $35/mes',
    resumen: 'Runway democratizó la producción de video con IA. Para creadores de contenido y equipos de marketing, es la herramienta más completa — aunque el límite de créditos obliga a ser estratégico con cada generación.',
  },
  {
    id: 'tool-cursor',
    name: 'Cursor',
    company: 'Anysphere',
    cat: 'Código IA',
    catKey: 'codigo',
    color: '#fbbf24',
    emoji: '💻',
    desc: 'Editor de código con IA integrada que entiende tu proyecto completo y edita múltiples archivos a la vez.',
    sirve: ['Programación', 'Refactoring', 'Debugging', 'Documentación'],
    precio: 'Freemium',
    nivel: 'Intermedio',
    link: 'https://cursor.sh',
    pros: ['Edición multiarchivo en una sola instrucción', 'Contexto del proyecto completo', 'Compatible con cualquier lenguaje', 'Basado en VS Code (migración fácil)'],
    cons: ['Requiere conocimiento básico de código', 'Plan Pro necesario para uso intensivo', 'Puede sugerir código incorrecto en proyectos complejos'],
    precioDetalle: 'Gratis (hobby) · Pro $20/mes · Business $40/mes',
    resumen: 'Cursor es el mejor IDE con IA para desarrolladores que ya saben programar. No reemplaza el conocimiento técnico, pero multiplica tu velocidad. El "Composer" (edición multiarchivo) es la función que cambia todo.',
  },
  {
    id: 'tool-notion-ai',
    name: 'Notion AI',
    company: 'Notion Labs',
    cat: 'Productividad',
    catKey: 'productividad',
    color: '#374151',
    emoji: '📋',
    desc: 'IA integrada en Notion que resume, escribe, traduce y organiza información directamente en tu workspace.',
    sirve: ['Notas', 'Resúmenes', 'Documentación', 'Traducción'],
    precio: 'Pago',
    nivel: 'Principiante',
    link: 'https://notion.so/product/ai',
    pros: ['Totalmente integrado en Notion', 'No necesita cambiar de app', 'Excelente para resumir páginas largas', 'Genera tablas y listas automáticamente'],
    cons: ['Requiere suscripción adicional a Notion', 'No tan potente como Claude/ChatGPT aislado', 'Solo útil si ya usás Notion'],
    precioDetalle: 'Add-on $10/mes por miembro (requiere plan Notion)',
    resumen: 'Notion AI tiene sentido solo si ya vivís en Notion. La integración es el valor real: no tenés que copiar y pegar entre apps. Si usás otro sistema de notas, Claude o ChatGPT hacen lo mismo y más.',
  },
  {
    id: 'tool-elevenlabs',
    name: 'ElevenLabs',
    company: 'ElevenLabs',
    cat: 'Audio & Voz',
    catKey: 'audio',
    color: '#7c3aed',
    emoji: '🔊',
    desc: 'La plataforma de síntesis de voz con IA más avanzada. Clona voces y genera narración hiperrealista.',
    sirve: ['Podcasts', 'Voiceover', 'Audiobros', 'Doblaje'],
    precio: 'Freemium',
    nivel: 'Intermedio',
    link: 'https://elevenlabs.io',
    pros: ['Calidad de voz más natural del mercado', 'Clonación de voz con pocos segundos de audio', 'Soporte para 30+ idiomas incluyendo español', 'API disponible para desarrolladores'],
    cons: ['Plan gratis muy limitado (10k caracteres/mes)', 'Precios suben rápido según uso', 'Clonación de voz genera dudas éticas'],
    precioDetalle: 'Gratis (10k chars/mes) · Starter $5/mes · Creator $22/mes',
    resumen: 'ElevenLabs es la mejor opción para síntesis de voz realista. Para creadores de contenido, la calidad justifica el precio. La clonación de voz es impresionante pero hay que usarla con responsabilidad.',
  },
];

// Detalle extendido para el bottom sheet
const IA_TOOL_DETAIL = {}; // populated below
IA_TOOLS.forEach(t => { IA_TOOL_DETAIL[t.id] = t; });

// ---------- IA NEEDS DATA ----------
const IA_NEEDS = [
  { id: 'escribir',       label: 'Escribir',             emoji: '✍️' },
  { id: 'resumir',        label: 'Resumir',               emoji: '📝' },
  { id: 'investigar',     label: 'Investigar',            emoji: '🔍' },
  { id: 'diseñar',        label: 'Diseñar imágenes',      emoji: '🎨' },
  { id: 'presentaciones', label: 'Presentaciones',        emoji: '📊' },
  { id: 'programar',      label: 'Programar',             emoji: '💻' },
  { id: 'video',          label: 'Editar video',          emoji: '🎬' },
  { id: 'trabajo',        label: 'Buscar trabajo',        emoji: '💼' },
  { id: 'automatizar',    label: 'Automatizar tareas',    emoji: '⚡' },
  { id: 'estudiar',       label: 'Estudiar mejor',        emoji: '📚' },
];

const IA_NEED_RECS = {
  escribir: [
    { toolId: 'tool-claude',   porQue: 'Genera textos largos con coherencia excepcional. Ideal para artículos, emails formales y contenido estructurado.', paraQuien: 'Redactores, estudiantes, profesionales que escriben mucho', dificultad: 'Fácil', alternativa: 'ChatGPT' },
    { toolId: 'tool-chatgpt',  porQue: 'Versátil para cualquier tipo de escritura: creativa, técnica o informal. El más popular por algo.', paraQuien: 'Todo el mundo, especialmente quienes recién empiezan con IA', dificultad: 'Fácil', alternativa: 'Claude' },
    { toolId: 'tool-notion-ai',porQue: 'Si ya trabajás en Notion, escribir con IA dentro del mismo espacio es lo más cómodo que existe.', paraQuien: 'Equipos y personas que usan Notion como hub de trabajo', dificultad: 'Fácil', alternativa: 'Claude' },
  ],
  resumir: [
    { toolId: 'tool-claude',     porQue: 'Con 200k tokens de contexto, puede leer y resumir documentos enteros de una sola vez sin perder el hilo.', paraQuien: 'Analistas, estudiantes, quienes leen muchos informes o papers', dificultad: 'Fácil', alternativa: 'Perplexity' },
    { toolId: 'tool-perplexity', porQue: 'Puede resumir páginas web y PDFs con citas. Perfecto cuando querés el resumen y la fuente al mismo tiempo.', paraQuien: 'Investigadores y curiosos que leen mucho contenido online', dificultad: 'Fácil', alternativa: 'Claude' },
    { toolId: 'tool-notion-ai',  porQue: 'Resumen integrado en tus notas: seleccionás un texto en Notion y con un clic lo resumís sin salir.', paraQuien: 'Usuarios de Notion que quieren flujo de trabajo ágil', dificultad: 'Fácil', alternativa: 'ChatGPT' },
  ],
  investigar: [
    { toolId: 'tool-perplexity', porQue: 'El mejor para investigar: responde con fuentes verificadas en tiempo real. Mucho mejor que buscar en Google y leer 10 páginas.', paraQuien: 'Estudiantes, periodistas, cualquiera que necesite info confiable rápido', dificultad: 'Fácil', alternativa: 'Claude' },
    { toolId: 'tool-claude',     porQue: 'Ideal para análisis profundo cuando ya tenés la información. Procesá papers, PDFs o reportes largos de una sola vez.', paraQuien: 'Investigadores, analistas, estudiantes avanzados', dificultad: 'Fácil', alternativa: 'Perplexity' },
    { toolId: 'tool-chatgpt',    porQue: 'Con navegación web habilitada en el plan Plus, puede buscar y sintetizar información actualizada al momento.', paraQuien: 'Usuarios de ChatGPT Plus que quieren todo en un lugar', dificultad: 'Fácil', alternativa: 'Perplexity' },
  ],
  'diseñar': [
    { toolId: 'tool-midjourney', porQue: 'La mejor calidad de imagen con IA. Si querés que algo se vea impresionante, Midjourney es el estándar de la industria.', paraQuien: 'Diseñadores, artistas, marketers que necesitan imágenes de alto impacto', dificultad: 'Intermedio', alternativa: 'DALL-E 3 (dentro de ChatGPT)' },
    { toolId: 'tool-notion-ai',  porQue: 'Para mockups rápidos de interfaces, Notion AI puede ayudarte a pensar la estructura antes de diseñar.', paraQuien: 'Diseñadores de producto en fase de ideación', dificultad: 'Fácil', alternativa: 'Midjourney' },
    { toolId: 'tool-chatgpt',    porQue: 'DALL-E 3 integrado genera imágenes directamente en el chat, sin salir de la app. Menos potente pero muy cómodo.', paraQuien: 'Quienes quieren imágenes rápidas sin aprender otra herramienta', dificultad: 'Fácil', alternativa: 'Midjourney' },
  ],
  presentaciones: [
    { toolId: 'tool-claude',    porQue: 'Estructurá el contenido, los títulos y el guión de cada slide en segundos. Lo exportás a PowerPoint o Canva.', paraQuien: 'Profesionales que necesitan presentaciones claras y bien argumentadas', dificultad: 'Fácil', alternativa: 'ChatGPT' },
    { toolId: 'tool-chatgpt',   porQue: 'Genera el esquema completo de una presentación y puede crear el contenido slide a slide si lo guiás bien.', paraQuien: 'Estudiantes y profesionales que necesitan presentar ideas rápido', dificultad: 'Fácil', alternativa: 'Claude' },
    { toolId: 'tool-midjourney',porQue: 'Para las imágenes de fondo, ilustraciones o visuales que hacen que una presentación destaque visualmente.', paraQuien: 'Diseñadores o quienes quieren presentaciones visualmente impactantes', dificultad: 'Intermedio', alternativa: 'DALL-E 3' },
  ],
  programar: [
    { toolId: 'tool-cursor',  porQue: 'El IDE con IA más poderoso. Entiende tu proyecto completo y puede editar múltiples archivos con una sola instrucción.', paraQuien: 'Desarrolladores con conocimiento básico o avanzado de código', dificultad: 'Intermedio', alternativa: 'GitHub Copilot' },
    { toolId: 'tool-claude',  porQue: 'Mejor que ChatGPT para debugging y arquitectura. Explica el código con claridad y señala errores de lógica.', paraQuien: 'Devs que quieren un reviewer inteligente en el chat', dificultad: 'Fácil', alternativa: 'ChatGPT' },
    { toolId: 'tool-chatgpt', porQue: 'Perfecto para generar snippets, explicar errores y aprender conceptos nuevos de programación de forma conversacional.', paraQuien: 'Principiantes en programación o quienes aprenden un lenguaje nuevo', dificultad: 'Fácil', alternativa: 'Claude' },
  ],
  video: [
    { toolId: 'tool-runway',    porQue: 'La suite de video IA más completa: generación, edición, rotoscopia y efectos visuales en una sola plataforma.', paraQuien: 'Creadores de contenido, marketers, cineastas indie', dificultad: 'Intermedio', alternativa: 'Sora (OpenAI)' },
    { toolId: 'tool-midjourney',porQue: 'Generá el storyboard visual con imágenes de alta calidad antes de producir el video final.', paraQuien: 'Directores y creadores en fase de preproducción', dificultad: 'Intermedio', alternativa: 'DALL-E 3' },
    { toolId: 'tool-elevenlabs',porQue: 'Narración en voz hiperrealista para voiceover de videos. Evitás grabar en estudio para contenido de calidad profesional.', paraQuien: 'YouTubers, podcasters, creadores que necesitan narración', dificultad: 'Intermedio', alternativa: 'Murf AI' },
  ],
  trabajo: [
    { toolId: 'tool-chatgpt', porQue: 'Mejorá tu CV, escribí cartas de presentación personalizadas y preparate para entrevistas con práctica de preguntas reales.', paraQuien: 'Cualquiera en búsqueda activa de empleo', dificultad: 'Fácil', alternativa: 'Claude' },
    { toolId: 'tool-claude',  porQue: 'Redacta emails profesionales perfectos, adapta tu perfil de LinkedIn y analiza ofertas laborales para ver si encajás.', paraQuien: 'Profesionales que quieren comunicación impecable con empleadores', dificultad: 'Fácil', alternativa: 'ChatGPT' },
    { toolId: 'tool-perplexity', porQue: 'Investigá empresas, industrias y salarios antes de una entrevista. Llegá sabiendo más que el entrevistador.', paraQuien: 'Candidatos que quieren ir preparados a cada entrevista', dificultad: 'Fácil', alternativa: 'Claude' },
  ],
  automatizar: [
    { toolId: 'tool-chatgpt', porQue: 'Con GPTs personalizados y la API, podés crear flujos automáticos para emails, resúmenes y reportes sin saber programar.', paraQuien: 'Profesionales que quieren automatizar tareas repetitivas sin código', dificultad: 'Intermedio', alternativa: 'Claude API' },
    { toolId: 'tool-cursor',  porQue: 'Si sabés un poco de código, Cursor te ayuda a crear scripts de automatización personalizados en minutos.', paraQuien: 'Devs o semi-técnicos que quieren automatizaciones a medida', dificultad: 'Avanzado', alternativa: 'ChatGPT' },
    { toolId: 'tool-notion-ai', porQue: 'Automatizá la organización de tu workspace: generación de tareas, resúmenes de reuniones y plantillas con un clic.', paraQuien: 'Equipos que viven en Notion y quieren flujos más ágiles', dificultad: 'Fácil', alternativa: 'ChatGPT' },
  ],
  estudiar: [
    { toolId: 'tool-claude',     porQue: 'Explicá cualquier tema con la profundidad que querés: pedile que te lo explique como si tuvieras 10 años o como experto.', paraQuien: 'Estudiantes de todos los niveles que quieren entender, no solo memorizar', dificultad: 'Fácil', alternativa: 'ChatGPT' },
    { toolId: 'tool-perplexity', porQue: 'Investigá temas con fuentes verificadas. Ideal para trabajos académicos donde necesitás citas confiables.', paraQuien: 'Universitarios e investigadores que necesitan fuentes', dificultad: 'Fácil', alternativa: 'Claude' },
    { toolId: 'tool-chatgpt',    porQue: 'Creá flashcards, simulá exámenes y pedí que te haga preguntas de práctica sobre cualquier tema al instante.', paraQuien: 'Estudiantes que preparan exámenes y quieren práctica activa', dificultad: 'Fácil', alternativa: 'Claude' },
  ],
};

let _activeNeed = null;

function fmtRelative(date) {
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h/24)}d`;
}

// ============================================================
// RADAR IA — datos mock + render
// Para conectar datos reales: reemplazá RADAR_DATA con un
// fetch a tu API o al news.json generado por GitHub Actions.
// ============================================================
const RADAR_DATA = {
  trending: [
    { name: 'GPT-4o',     type: 'Modelo',      badge: 'Trending',       cls: 'rb-green'  },
    { name: 'Cursor',     type: 'Coding AI',   badge: 'Alta atención',  cls: 'rb-orange' },
    { name: 'Sora 2',     type: 'Video AI',    badge: 'Muy mencionado', cls: 'rb-blue'   },
    { name: 'Gemini 2.0', type: 'Modelo',      badge: 'En foco',        cls: 'rb-accent' },
    { name: 'Perplexity', type: 'Búsqueda IA', badge: 'Trending',       cls: 'rb-green'  },
  ],
  rising: [
    { name: 'Grok 3',        type: 'Modelo',    desc: 'Supera benchmarks clave de razonamiento',    badge: 'Crecimiento fuerte', cls: 'rb-green'  },
    { name: 'Runway Gen-3',  type: 'Video AI',  desc: 'Video cinematográfico desde texto',          badge: 'Subiendo',          cls: 'rb-blue'   },
    { name: 'Mistral Large', type: 'Modelo',    desc: 'Open-source con rendimiento de nivel top',   badge: 'Emergente',         cls: 'rb-accent' },
    { name: 'Replit AI',     type: 'Coding AI', desc: 'Apps completas directo en el navegador',     badge: 'Para seguir',       cls: 'rb-orange' },
  ],
};

function renderRadarIA() {
  const rd       = window._radarLive || RADAR_DATA;
  const trending = rd.trending?.length ? rd.trending : RADAR_DATA.trending;
  const rising   = rd.rising?.length   ? rd.rising   : RADAR_DATA.rising;

  document.getElementById('radar-trending').innerHTML = `
    <div class="radar-card-title">🔥 Trending ahora</div>
    <div class="radar-list">${trending.map(t => `
      <div class="radar-row">
        <div class="radar-row-main">
          <span class="radar-row-name">${t.name}</span>
          <span class="radar-row-type">${t.type}</span>
        </div>
        <span class="radar-badge ${t.cls}">${t.badge}</span>
      </div>`).join('')}
    </div>`;

  document.getElementById('radar-rising').innerHTML = `
    <div class="radar-card-title">📈 Subiendo rápido</div>
    <div class="radar-list">${rising.map(r => `
      <div class="radar-row radar-row--stack">
        <div class="radar-row-top">
          <span class="radar-row-name">${r.name}</span>
          <span class="radar-badge ${r.cls}">${r.badge}</span>
        </div>
        <span class="radar-row-type">${r.type}${r.desc ? ' · ' + r.desc : ''}</span>
      </div>`).join('')}
    </div>`;
}

function renderIaNews(filter) {
  window._iaFilter = filter;

  document.querySelectorAll('.ia-filter-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.filter === filter);
  });

  const realArticles = allArticles.filter(a => a.cat === 'ia');
  const useReal = realArticles.length > 0;

  const list = useReal
    ? (filter === 'todo' ? realArticles : realArticles.filter(a => a.subcat === filter))
    : (filter === 'todo' ? IA_MOCK_NEWS : IA_MOCK_NEWS.filter(n => n.cat === filter));

  const container = document.getElementById('ia-news-list');
  if (!container) return;

  if (!list.length) {
    container.innerHTML = '<div class="error-card" style="text-align:center;color:var(--text3);padding:24px">Sin noticias en esta categoría.</div>';
    return;
  }

  container.innerHTML = list.map(n => {
    const time    = useReal ? timeAgo(n.pubDate) : fmtRelative(n.date);
    const onclick = useReal ? `openArticle('${n.id}')` : `openIaArticle('${n.id}')`;
    const tagHtml = useReal && n.subcat
      ? `<div class="ia-card-tags"><span class="ia-tag">${n.subcat}</span></div>`
      : n.tags ? `<div class="ia-card-tags">${n.tags.map(t => `<span class="ia-tag ia-tag-${t.toLowerCase().replace(/\s/g,'-')}">${t}</span>`).join('')}</div>` : '';
    return `
      <div class="news-card ia-news-card" onclick="${onclick}">
        <div class="card-meta">
          <span class="card-source">${n.source}</span>
          <span class="card-time">${time}</span>
        </div>
        <div class="card-title">${n.title}</div>
        <div class="card-preview">${n.summary || ''}</div>
        ${tagHtml}
      </div>`;
  }).join('');
}

function openIaArticle(id) {
  const n = IA_MOCK_NEWS.find(x => x.id === id);
  if (!n) return;
  const c = IA_ARTICLE_CONTENT[id] || {};

  // Limpiar hero
  const hero = document.getElementById('article-hero');
  hero.style.display = 'none'; hero.src = '';

  document.getElementById('article-source').textContent = n.source;
  document.getElementById('article-time').textContent   = fmtRelative(n.date);
  document.getElementById('article-title').textContent  = n.title;

  // Eliminar botón de carga si existe (no aplica a IA)
  const existingBtn = document.getElementById('article-load-btn');
  if (existingBtn) existingBtn.remove();

  // Construir cuerpo estructurado
  const points = (c.points || []).map(p => `<li>${p}</li>`).join('');
  document.getElementById('article-body').innerHTML = `
    ${c.tldr ? `
    <div class="ia-article-tldr">
      <span class="ia-article-tldr-label">TL;DR</span>
      <p>${c.tldr}</p>
    </div>` : ''}
    ${points ? `
    <div class="ia-article-section">
      <div class="ia-article-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        Puntos clave
      </div>
      <ul class="ia-article-points">${points}</ul>
    </div>` : ''}
    ${c.why ? `
    <div class="ia-article-section">
      <div class="ia-article-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Por qué importa
      </div>
      <p class="ia-article-why">${c.why}</p>
    </div>` : ''}
    <div class="ia-article-tags-row">
      ${n.tags.map(t => `<span class="ia-tag ia-tag-${t.toLowerCase().replace(/\s/g,'-')}">${t}</span>`).join('')}
    </div>
  `;

  document.getElementById('article-scroll').scrollTop = 0;
  document.getElementById('article-overlay').classList.add('open');
  document.getElementById('article-sheet').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function renderIaNeeds() {
  const chipsEl = document.getElementById('ia-needs-chips');
  const resultEl = document.getElementById('ia-needs-result');
  if (!chipsEl) return;

  chipsEl.innerHTML = IA_NEEDS.map(n => `
    <button class="ia-need-chip" data-need="${n.id}" onclick="selectNeed('${n.id}')">
      <span class="ia-need-emoji">${n.emoji}</span>
      <span>${n.label}</span>
    </button>
  `).join('');

  resultEl.innerHTML = '';
}

function clearNeed() {
  _activeNeed = null;
  document.querySelectorAll('.ia-need-chip').forEach(c => c.classList.remove('active'));
  document.getElementById('ia-needs-result').innerHTML = '';
}

function selectNeed(id) {
  _activeNeed = id;

  // Actualizar chips
  document.querySelectorAll('.ia-need-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.need === id);
  });

  const need  = IA_NEEDS.find(n => n.id === id);
  const recs  = IA_NEED_RECS[id] || [];
  const resultEl = document.getElementById('ia-needs-result');
  if (!resultEl) return;

  const difClass = d => d === 'Fácil' ? 'prin' : d === 'Intermedio' ? 'inter' : 'avanz';

  resultEl.innerHTML = `
    <div class="ia-need-result-header">
      <span class="ia-need-result-emoji">${need.emoji}</span>
      <div style="flex:1">
        <p class="ia-need-result-title">${need.label}</p>
        <p class="ia-need-result-sub">${recs.length} herramientas recomendadas</p>
      </div>
      <button class="ia-need-clear-btn" onclick="clearNeed()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    ${recs.map(r => {
      const tool = IA_TOOL_DETAIL[r.toolId];
      if (!tool) return '';
      return `
      <div class="ia-need-rec-card" onclick="openIaTool('${tool.id}')">
        <div class="ia-need-rec-top">
          <div class="ia-need-rec-avatar" style="background:${tool.color}22; color:${tool.color}">${tool.emoji}</div>
          <div class="ia-need-rec-info">
            <span class="ia-need-rec-name">${tool.name}</span>
            <span class="ia-tool-nivel ia-nivel-${difClass(r.dificultad)}" style="font-size:9px">${r.dificultad}</span>
          </div>
        </div>
        <p class="ia-need-rec-porque">${r.porQue}</p>
        <div class="ia-need-rec-meta">
          <div class="ia-need-rec-meta-item">
            <span class="ia-need-rec-meta-label">Para quién</span>
            <span class="ia-need-rec-meta-val">${r.paraQuien}</span>
          </div>
          <div class="ia-need-rec-meta-item">
            <span class="ia-need-rec-meta-label">Alternativa</span>
            <span class="ia-need-rec-meta-val ia-need-alt" onclick="event.stopPropagation()">${r.alternativa}</span>
          </div>
        </div>
      </div>`;
    }).join('')}
  `;

  // Scroll suave al resultado
  resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderIaTools() {
  const container = document.getElementById('ia-tools-grid');
  if (!container) return;
  container.innerHTML = IA_TOOLS.map(t => {
    const saved = _iaToolsSaved.includes(t.id);
    const precioClass = t.precio === 'Gratis' ? 'gratis' : t.precio === 'Freemium' ? 'freemium' : 'pago';
    const nivelClass  = t.nivel  === 'Principiante' ? 'prin' : t.nivel === 'Intermedio' ? 'inter' : 'avanz';
    return `
    <div class="ia-tool-card" onclick="openIaTool('${t.id}')">
      <div class="ia-tool-header" style="background:${t.color}18; border-bottom:1px solid ${t.color}30">
        <div class="ia-tool-avatar" style="background:${t.color}22; color:${t.color}">${t.emoji}</div>
        <div class="ia-tool-header-text">
          <span class="ia-tool-name">${t.name}</span>
          <span class="ia-tool-company">${t.company}</span>
        </div>
        <button class="ia-tool-save ${saved ? 'saved' : ''}" onclick="event.stopPropagation(); toggleSaveTool('${t.id}')" id="save-btn-${t.id}">
          <svg viewBox="0 0 24 24" fill="${saved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
        </button>
      </div>
      <div class="ia-tool-body">
        <div class="ia-tool-cat-badge" style="color:${t.color}; background:${t.color}18">${t.cat}</div>
        <p class="ia-tool-desc">${t.desc}</p>
        <div class="ia-tool-sirve">
          <span class="ia-tool-sirve-label">Sirve para</span>
          <div class="ia-tool-sirve-tags">
            ${t.sirve.map(s => `<span class="ia-tool-tag">${s}</span>`).join('')}
          </div>
        </div>
        <div class="ia-tool-footer">
          <span class="ia-tool-precio ia-precio-${precioClass}">${t.precio}</span>
          <span class="ia-tool-nivel ia-nivel-${nivelClass}">${t.nivel}</span>
          <button class="ia-tool-ver" onclick="event.stopPropagation(); openIaTool('${t.id}')">Ver más →</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleSaveTool(id) {
  const idx = _iaToolsSaved.indexOf(id);
  if (idx === -1) _iaToolsSaved.push(id);
  else _iaToolsSaved.splice(idx, 1);
  localStorage.setItem('iaToolsSaved', JSON.stringify(_iaToolsSaved));
  const btn = document.getElementById('save-btn-' + id);
  if (!btn) return;
  const saved = _iaToolsSaved.includes(id);
  btn.classList.toggle('saved', saved);
  btn.querySelector('svg').setAttribute('fill', saved ? 'currentColor' : 'none');
}

function openIaTool(id) {
  const t = IA_TOOL_DETAIL[id];
  if (!t) return;

  const hero = document.getElementById('article-hero');
  hero.style.display = 'none'; hero.src = '';

  document.getElementById('article-source').textContent = t.company;
  document.getElementById('article-time').textContent   = t.cat;
  document.getElementById('article-title').textContent  = t.name;

  const existingBtn = document.getElementById('article-load-btn');
  if (existingBtn) existingBtn.remove();

  const precioClass = t.precio === 'Gratis' ? 'gratis' : t.precio === 'Freemium' ? 'freemium' : 'pago';
  const pros  = t.pros.map(p => `<li>${p}</li>`).join('');
  const cons  = t.cons.map(c => `<li>${c}</li>`).join('');

  document.getElementById('article-body').innerHTML = `
    <div class="ia-article-tldr" style="background:${t.color}14; border-color:${t.color}30">
      <span class="ia-article-tldr-label" style="color:${t.color}">En resumen</span>
      <p>${t.resumen}</p>
    </div>

    <div class="ia-article-section">
      <div class="ia-article-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Sirve para
      </div>
      <div class="ia-tool-sirve-tags" style="margin-bottom:4px">
        ${t.sirve.map(s => `<span class="ia-tool-tag">${s}</span>`).join('')}
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px">
      <div class="ia-article-section" style="margin:0">
        <div class="ia-article-section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
          A favor
        </div>
        <ul class="ia-article-points">${pros}</ul>
      </div>
      <div class="ia-article-section" style="margin:0">
        <div class="ia-article-section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          En contra
        </div>
        <ul class="ia-article-points">${cons}</ul>
      </div>
    </div>

    <div class="ia-article-section">
      <div class="ia-article-section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
        Precio
      </div>
      <span class="ia-tool-precio ia-precio-${precioClass}" style="font-size:13px">${t.precioDetalle}</span>
    </div>

    <a href="${t.link}" target="_blank" class="ia-tool-try-btn" onclick="event.stopPropagation()">
      Probar ${t.name} →
    </a>
  `;

  document.getElementById('article-scroll').scrollTop = 0;
  document.getElementById('article-overlay').classList.add('open');
  document.getElementById('article-sheet').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function initIaSection() {
  const section = document.getElementById('section-ia');
  if (section.dataset.initialized) return;
  section.dataset.initialized = '1';
  renderRadarIA();
  renderIaNews('todo');
  renderIaNeeds();
  renderIaTools();
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
  if (name === 'ia') initIaSection();
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
  // Nota: israel usa 'israel-articles' como sub-contenedor (cat-israel es el wrapper)
  ['cat-tech','israel-articles','cat-poleco','cat-sports','cat-cinema','argentina-container','jobs-news-container']
    .forEach(id => showSkeletons(id, 3));
  await Promise.all([loadMatches(), fetchNews(), loadCartelera(), loadEconWidget()]);
  renderAll();

  // Auto-refresh partidos cada 5 minutos (scores en vivo)
  if (!window._matchRefreshTimer) {
    window._matchRefreshTimer = setInterval(() => loadMatches(), 5 * 60 * 1000);
  }
}

// ---------- FETCH news.json ----------
async function fetchNews() {
  try {
    const res  = await fetch('news.json?v=' + Date.now());
    if (!res.ok) throw new Error('no file');
    const data = await res.json();
    allArticles = data.articles || [];
    window._radarLive = (data.radar?.trending?.length || data.radar?.rising?.length) ? data.radar : null;
    // Si la sección IA ya está abierta, refrescar con datos reales
    if (document.getElementById('section-ia')?.dataset.initialized) {
      renderRadarIA();
      renderIaNews(window._iaFilter || 'todo');
    }
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
    ['top-container','cat-tech','israel-articles','cat-poleco','cat-sports','cat-cinema'].forEach(id => {
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
  renderList('cat-cinema',          by.cinema.slice(0, 12));
  renderList('argentina-container', by.ar_pol.slice(0, 18));

  const jobsKw = ['empleo','trabajo','contrat','vacante','remoto','junior','senior','desarrollador','developer'];
  renderList('jobs-news-container',
    [...by.tech, ...by.poleco].filter(a => jobsKw.some(k => a.title.toLowerCase().includes(k))).slice(0, 5));
}

// ---------- TWEET CAROUSEL ----------
let _tweetCarouselGen = 0; // guard contra doble-render en refreshes rápidos

function renderTweetCarousel(id, articles) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!articles.length) {
    // news.json no tiene tweets → fallback client-side en paralelo
    const gen = ++_tweetCarouselGen;
    el.innerHTML = `<div class="tweet-scroll"><div class="tweet-card" style="opacity:.5;pointer-events:none">
      <div class="tweet-header"><div class="tweet-avatar">${X_LOGO_SVG}</div>
      <div class="tweet-handle-col"><div class="tweet-name">Moked Bitajon</div><div class="tweet-at">Cargando tweets…</div></div></div>
    </div></div>`;
    tryFetchTweetsClientSide().then(tweets => {
      if (gen !== _tweetCarouselGen) return; // llamada ya superada por refresh posterior
      el.innerHTML = tweets.length
        ? `<div class="tweet-scroll">${tweets.map(buildTweetCard).join('')}</div>`
        : `<div class="tweet-scroll">
            <a href="https://x.com/MokedBitajon" target="_blank" rel="noopener" class="tweet-card" style="text-decoration:none">
              <div class="tweet-header">
                <div class="tweet-avatar">${X_LOGO_SVG}</div>
                <div class="tweet-handle-col"><div class="tweet-name">Moked Bitajon</div><div class="tweet-at">@MokedBitajon</div></div>
              </div>
              <div class="tweet-body" style="color:var(--text3)">Abrir cuenta en X →</div>
            </a></div>`;
    });
    return;
  }
  el.innerHTML = `<div class="tweet-scroll">${articles.map(buildTweetCard).join('')}</div>`;
}

// Intenta cargar tweets en paralelo — Promise.any() devuelve el primero que responda
// (peor caso: 10s en lugar de 270s del loop secuencial anterior)
const NITTER_BASES = [
  'https://twiiit.com', 'https://nitter.cz', 'https://xcancel.com',
  'https://lightbrd.com', 'https://nitter.privacydev.net', 'https://nitter.poast.org',
  'https://nitter.tiekoetter.com', 'https://nitter.net', 'https://nitter.kavin.rocks',
];

async function tryFetchTweetsClientSide() {
  const attempt = async (base, proxy) => {
    const xml = await fetchViaProxy(`${base}/MokedBitajon/rss`, proxy);
    if (!xml?.includes('<item>')) throw new Error('no items');
    const tweets = parseRssXml(xml);
    if (!tweets.length) throw new Error('empty after parse');
    return tweets;
  };

  try {
    return await Promise.any(
      NITTER_BASES.flatMap(base => TWEET_PROXIES.map(proxy => attempt(base, proxy)))
    );
  } catch {
    return []; // AggregateError — todos fallaron
  }
}

function buildTweetCard(a) {
  const xUrl = a.link || 'https://x.com/MokedBitajon';
  const text  = (a.summary && a.summary.length > a.title.length) ? a.summary : a.title;
  const safe  = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  return `
  <div class="tweet-card" onclick="window.open('${xUrl}','_blank','noopener')">
    <div class="tweet-header">
      <div class="tweet-avatar">${X_LOGO_SVG}</div>
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

  // Botón "leer artículo completo" — siempre visible
  const existingBtn = document.getElementById('article-load-btn');
  if (existingBtn) existingBtn.remove();

  if (a.link && a.link !== '#') {
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
  url => ({ endpoint: `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(url)}`, isJson: false }),
  url => ({ endpoint: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, isJson: false }),
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

  const tryProxy = async proxyFn => {
    const { endpoint, isJson } = proxyFn(url);
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('bad');
    if (isJson) {
      const data = await res.json();
      if (!data.contents || data.contents.length < 200 || (data?.status?.http_code ?? 200) !== 200) throw new Error('empty');
      return data.contents;
    }
    const text = await res.text();
    if (!text || text.length < 200) throw new Error('empty');
    return text;
  };

  let html = null;
  try { html = await Promise.any(ARTICLE_PROXIES.map(tryProxy)); } catch {}

  if (!html) {
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

    // Buscar contenido principal — umbral bajo para no perder artículos cortos
    let mainEl = null;
    for (const sel of CONTENT_SELECTORS) {
      try {
        const el = doc.querySelector(sel);
        if (el && el.textContent.trim().length > 80) { mainEl = el; break; }
      } catch {}
    }
    if (!mainEl) mainEl = doc.body;

    const paras = Array.from(mainEl.querySelectorAll('p, h2, h3, li'))
      .map(p => p.textContent.trim())
      .filter(t => t.length > 20
        && !t.includes('©')
        && !t.match(/todos los derechos|cookie|suscri[bv]|newsletter|publicidad/i));

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
    const today     = new Date();
    const yesterday = new Date(today.getTime() - 86400000);

    const fetchDay = (league, date, isYesterday = false) =>
      fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league.slug}/scoreboard?dates=${fmtLocal(date)}`,
            { signal: AbortSignal.timeout(8000) })
        .then(r => r.json())
        .then(d => ({ label: league.label, emoji: league.emoji, events: d.events || [], isYesterday }));

    const results = await Promise.allSettled(
      ESPN_LEAGUES.flatMap(l => [fetchDay(l, today, false), fetchDay(l, yesterday, true)])
    );

    // Solo mostrar partidos de ayer si son recientes (<18h) — evita ver partidos viejos al dia siguiente
    const YESTERDAY_MAX_AGE = 18 * 3600 * 1000;

    // Deduplicar por ID de evento
    const seenIds = new Set();
    const entries = [];
    results.forEach(r => {
      if (r.status !== 'fulfilled') return;
      r.value.events.forEach(ev => {
        if (seenIds.has(ev.id)) return;
        seenIds.add(ev.id);
        const evDate = new Date(ev.date);
        // Saltar partidos de ayer que ya tienen mas de 18 horas
        if (r.value.isYesterday && Date.now() - evDate.getTime() > YESTERDAY_MAX_AGE) return;
        const card                   = buildMatchCard(ev, r.value.label, r.value.emoji);
        const { isLive, isFinished } = getMatchStatus(ev);
        if (card) entries.push({ card, isLive, isFinished, date: evDate });
      });
    });

    // Orden: en vivo primero → programados → finalizados (más reciente primero)
    entries.sort((a, b) => {
      if (a.isLive  && !b.isLive)     return -1;
      if (!a.isLive && b.isLive)      return  1;
      if (!a.isFinished && b.isFinished) return -1;
      if (a.isFinished && !b.isFinished) return  1;
      return b.date - a.date;
    });

    container.innerHTML = entries.length
      ? entries.map(e => e.card).join('')
      : `<div class="match-no-games">Sin partidos de interés hoy.</div>`;
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

    const { statusName, isLive, isHalf, isFinished } = getMatchStatus(ev);
    const clock = ev.status?.displayClock || '';

    const homeName = home.team?.shortDisplayName || home.team?.displayName || '';
    const awayName = away.team?.shortDisplayName || away.team?.displayName || '';
    const homeLogo = home.team?.logo || '';
    const awayLogo = away.team?.logo || '';

    const logoImg = (url, name) => url
      ? `<img class="match-team-logo" src="${url}" alt="${name}" onerror="this.style.display='none'">`
      : '';

    // Partidos finalizados: score inline por equipo + etiqueta FIN
    if (isFinished) {
      const hScore = home.score ?? '';
      const aScore = away.score ?? '';
      const hWin = parseInt(hScore) > parseInt(aScore);
      const aWin = parseInt(aScore) > parseInt(hScore);
      return `
      <div class="match-card match-card-final">
        <div class="match-league">${emoji ? emoji + ' ' : ''}${label}</div>
        <div class="match-teams">
          <div class="match-team-row">
            ${logoImg(homeLogo, homeName)}
            <span class="match-team${hWin ? ' match-winner' : ''}">${homeName}</span>
            <span class="match-inline-score${hWin ? ' match-winner' : ''}">${hScore}</span>
          </div>
          <div class="match-team-row">
            ${logoImg(awayLogo, awayName)}
            <span class="match-team${aWin ? ' match-winner' : ''}">${awayName}</span>
            <span class="match-inline-score${aWin ? ' match-winner' : ''}">${aScore}</span>
          </div>
        </div>
        <span class="match-time match-fin">FIN</span>
      </div>`;
    }

    // En vivo / entretiempo / programado
    let timeHtml;
    if (isLive) {
      timeHtml = `<span class="match-time live">EN VIVO &bull; ${clock}</span>`;
    } else if (isHalf) {
      timeHtml = `<span class="match-time live">ENTRETIEMPO &bull; ${home.score}-${away.score}</span>`;
    } else {
      const d = new Date(ev.date);
      const t = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      timeHtml = `<span class="match-time">${t}</span>`;
    }

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
