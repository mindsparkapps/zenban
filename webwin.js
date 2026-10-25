// ===== ZenBan - Ventanas web y plugins en el lienzo =====
// Una ventana web es un objeto del lienzo (un texto con t.web) que muestra una página: se mueve, se
// agranda por la esquina, se puede conectar, copiar, agrupar o enviar como cualquier objeto.
// - Para usar la página, selecciona la ventana (con un clic) y ya responde a clics y teclado.
// - ⛶ la maximiza a toda la pantalla; para salir: ✕ o Esc.
// - Algunos sitios (Google, GitHub, X…) no se dejan mostrar dentro de otras apps: ↗ los abre en el navegador.
// Un plugin es una app web con un archivo zenban-plugin.json (nombre, ícono, tamaño). Se agrega en
// ⚙️ Configuración › Plugins con su dirección y aparece en el botón derecho › Agregar aquí. Su estado
// se guarda dentro del objeto (y se sincroniza) usando zenban-plugin-sdk.js.
// Datos: t.web = { url, h, title?, plugin?: { id, name, icon }, state? }

const WEB_DEFAULT_SIZE = { w: 640, h: 420 };
const webFrames = new Map(); // id del texto -> iframe (se conserva entre redibujos)
// Estado que el plugin de cada ventana tiene cargado (texto JSON): si el guardado cambia por otro lado
// (sincronización con otro dispositivo, deshacer…), se le vuelve a mandar para que no lo pise con uno viejo
const pluginStateSent = new Map();
let webMaximizedId = null;

// Lugar fuera del lienzo donde esperan las páginas mientras se redibujan los textos
const webParking = document.createElement('div');
webParking.className = 'webwin-parking';
document.body.appendChild(webParking);

// Mueve un elemento sin recargar la página que muestra (moveBefore: Chrome/Edge recientes)
function moveKeepingState(parent, node) {
  if (node.parentNode === parent) return;
  if (typeof parent.moveBefore === 'function' && node.isConnected) {
    try { parent.moveBefore(node, null); return; } catch (e) {}
  }
  parent.appendChild(node);
}

// YouTube se muestra con su reproductor para incrustar
function webEmbedUrl(url) {
  const s = String(url || '').trim();
  const list = (s.match(/youtube\.com\/.*[?&]list=([\w-]+)/) || [])[1];
  const vid = (s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/) || [])[1];
  if (vid) return `https://www.youtube.com/embed/${vid}${list ? `?list=${list}` : ''}`;
  if (list) return `https://www.youtube.com/embed/videoseries?list=${list}`;
  return s;
}

function normalizeWebUrl(url) {
  let s = String(url || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try { return new URL(s).href; } catch (e) { return ''; }
}

function webHost(url) {
  try { return new URL(url).host.replace(/^www\./, ''); } catch (e) { return url; }
}

function webWindowHtml(t) {
  const w = t.web || {};
  const plugin = w.plugin;
  const icon = plugin ? (/^https?:/.test(plugin.icon || '') ? `<img src="${escapeHtml(plugin.icon)}" alt="">` : escapeHtml(plugin.icon || '🧩'))
    : `<img src="https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(webHost(w.url))}" alt="" referrerpolicy="no-referrer">`;
  const title = w.title || (plugin && plugin.name) || webHost(w.url);
  const h = Math.max(120, w.h || WEB_DEFAULT_SIZE.h / zoom);
  // Pestaña con imagen (como la de los tableros): para reconocerla de lejos y moverla tomándola de ahí
  const tab = w.image ? `<div class="board-image-tab webwin-image-tab" style="--board-w:${Math.round(t.w || WEB_DEFAULT_SIZE.w)}px" title="Arrastra para mover"><img data-board-img="${escapeHtml(w.image)}" alt="" draggable="false"></div>` : '';
  return tab + `<div class="webwin" data-web="${t.id}">` +
    `<div class="webwin-bar"><span class="webwin-icon">${icon}</span><span class="webwin-title" title="${escapeHtml(w.url || '')}">${escapeHtml(title)}</span>` +
    `<button type="button" data-web-act="reload" title="Recargar">⟳</button>` +
    `<button type="button" data-web-act="open" title="Abrir en el navegador">↗</button>` +
    `<button type="button" data-web-act="max" title="Maximizar (para salir: ✕ o Esc)">⛶</button></div>` +
    `<div class="webwin-body" style="height:${h}px"><div class="webwin-slot"></div>` +
    `<div class="webwin-shield"><span>${window.matchMedia && matchMedia('(pointer: coarse)').matches ? 'Toca para abrir la página' : 'Toca para usar la página'}</span></div></div>` +
    `<div class="webwin-resize" title="Arrastra para cambiar el tamaño"></div></div>`;
}

function webFrameFor(t) {
  let f = webFrames.get(t.id);
  const src = webEmbedUrl(t.web.url);
  if (f && f.dataset.src === src) return f;
  if (f) f.remove();
  f = document.createElement('iframe');
  f.className = 'webwin-frame';
  f.dataset.src = src;
  f.dataset.textId = t.id;
  f.allow = 'fullscreen; clipboard-read; clipboard-write; autoplay; encrypted-media; picture-in-picture';
  // Una página de este mismo sitio (p. ej. un plugin publicado junto a ZenBan) queda aislada: no puede leer los datos de ZenBan
  let sameOrigin = false;
  try { sameOrigin = new URL(src).origin === location.origin; } catch (e) {}
  f.setAttribute('sandbox', `allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals${sameOrigin ? '' : ' allow-same-origin'}`);
  f.referrerPolicy = 'no-referrer-when-downgrade';
  f.addEventListener('load', () => sendPluginInit(t.id));
  f.src = src;
  webFrames.set(t.id, f);
  return f;
}

// Antes de redibujar los textos, las páginas se apartan; después vuelven a su ventana (sin recargarse)
function parkWebFrames() {
  webFrames.forEach((f, id) => { if (id !== webMaximizedId && f.isConnected) moveKeepingState(webParking, f); });
}

function placeWebFrames() {
  const alive = new Set();
  getTexts().forEach(t => {
    if (!t.web) return;
    alive.add(t.id);
    if (t.id === webMaximizedId) return;
    const el = getTextEl(t.id);
    const slot = el && el.querySelector('.webwin-slot');
    if (!slot) return;
    moveKeepingState(slot, webFrameFor(t));
  });
  // Ventanas borradas (o de otro proyecto): se cierran sus páginas
  webFrames.forEach((f, id) => { if (!alive.has(id) && id !== webMaximizedId) { f.remove(); webFrames.delete(id); pluginStateSent.delete(id); } });
}

// Ventanas que quedaron gigantes (creadas muy alejado, antes del límite de tamaño) se achican a un
// tamaño normal, manteniendo su proporción y la esquina donde estaban
const WEB_MAX_W = 2400, WEB_SHRINK_W = 960;
function shrinkGiantWebWindows() {
  let changed = false;
  getTexts().forEach(t => {
    if (!t.web || !(t.w > WEB_MAX_W)) return;
    const k = WEB_SHRINK_W / t.w;
    t.w = WEB_SHRINK_W;
    if (t.web.h) t.web.h = Math.max(120, Math.round(t.web.h * k));
    if (t.size) t.size = Math.max(7, Math.round(t.size * k));
    changed = true;
  });
  if (changed) persist();
}

const baseRenderTextsWeb = renderTexts;
renderTexts = function () {
  shrinkGiantWebWindows();
  parkWebFrames();
  baseRenderTextsWeb.apply(this, arguments);
  placeWebFrames();
  if (typeof hydrateBoardImages === 'function') hydrateBoardImages(textLayer);
  // Si el estado guardado de un plugin cambió por otro lado (Drive, deshacer), se le manda el nuevo
  if (typeof resyncPluginStates === 'function') resyncPluginStates();
};

// Doble clic en una ventana web no la abre para escribir: cambia su dirección
const baseEditTextWeb = editText;
editText = function (id) {
  const t = getTexts().find(x => x.id === id);
  if (t && t.web) { if (!t.web.plugin) changeWebUrl(t); return; }
  return baseEditTextWeb.apply(this, arguments);
};

// Al seleccionar una ventana su página no se puede usar enseguida: el escudo sigue unos instantes. Así el
// segundo clic de un doble clic llega al lienzo (y acerca la vista al plugin) en vez de caer en la página.
let webLiveTimer = null;
const baseApplySelectionVisualsWeb = applySelectionVisuals;
applySelectionVisuals = function () {
  baseApplySelectionVisualsWeb.apply(this, arguments);
  clearTimeout(webLiveTimer);
  textLayer.querySelectorAll('.canvas-text.is-web-live:not(.is-solo)').forEach(el => el.classList.remove('is-web-live'));
  const solo = textLayer.querySelector('.canvas-text.is-webwin.is-solo:not(.is-web-live)');
  if (solo) webLiveTimer = setTimeout(() => solo.classList.add('is-web-live'), 400);
};

// ----- Crear -----
function addWebWindow(at, url, plugin = null) {
  const size = plugin ? { w: plugin.width || WEB_DEFAULT_SIZE.w, h: plugin.height || WEB_DEFAULT_SIZE.h } : WEB_DEFAULT_SIZE;
  // Se ajusta al zoom para que se vea de un tamaño cómodo, pero con límite: muy alejado (todo el
  // proyecto a la vista) salía una ventana gigante que tapaba los tableros y arruinaba "ajustar a pantalla"
  const scale = 1 / Math.min(2, Math.max(0.5, zoom));
  const web = { url, h: Math.round(size.h * scale) };
  if (plugin) web.plugin = { id: plugin.id, name: plugin.name, icon: plugin.icon };
  const t = addText(plugin ? plugin.name : webHost(url), at, {
    web, fixedWidth: true, w: Math.round(size.w * scale), size: Math.max(7, Math.round(14 * scale))
  });
  showToast(plugin ? `${plugin.name} agregado. Selecciónalo para usarlo; ⛶ lo maximiza.` : 'Ventana agregada. Selecciónala para usar la página; ⛶ la maximiza. Si no carga, ↗ la abre en el navegador.', 'success');
  return t;
}

// Pide una dirección (ventana propia, como las demás de ZenBan)
function promptWebUrl(title, value = '') {
  return new Promise((resolve) => {
    const m = document.createElement('div');
    m.className = 'modal-backdrop';
    m.style.display = 'flex';
    m.innerHTML = `
      <div class="modal-card modal-sm">
        <div class="modal-header"><h2>🌐 ${escapeHtml(title)}</h2><button class="modal-close-btn" type="button" data-close aria-label="Cerrar">&times;</button></div>
        <form class="webwin-prompt">
          <input type="text" name="url" placeholder="https://…" value="${escapeHtml(value)}" autocomplete="off" spellcheck="false">
          <p class="setup-text">Algunos sitios no se dejan mostrar dentro de otras apps; en ese caso usa ↗ para abrirlos en el navegador. Los videos de YouTube se muestran con su reproductor.</p>
          <div class="share-actions"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Abrir</button></div>
        </form>
      </div>`;
    const done = (v) => { m.remove(); resolve(v); };
    m.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) done(null); });
    m.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const url = normalizeWebUrl(m.querySelector('input').value);
      if (!url) { showToast('Escribe una dirección válida', 'warning'); return; }
      done(url);
    });
    document.body.appendChild(m);
    setTimeout(() => m.querySelector('input').focus(), 30);
  });
}

async function changeWebUrl(t) {
  const url = await promptWebUrl('Cambiar la dirección', t.web.url);
  if (!url) return;
  t.web.url = url;
  t.text = webHost(url);
  persist();
  renderTexts();
}

// ----- Botones de la ventana, cambiar tamaño y usar la página -----
textLayer.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-web-act]');
  if (!btn) return;
  e.stopPropagation();
  const id = btn.closest('.webwin').dataset.web;
  const t = getTexts().find(x => x.id === id);
  if (!t) return;
  const act = btn.dataset.webAct;
  if (act === 'reload') { const f = webFrames.get(id); if (f) f.src = f.dataset.src; }
  if (act === 'open') window.open(t.web.url, '_blank', 'noopener');
  if (act === 'max') maximizeWebWindow(id);
});

// En el celular el lienzo se queda con los gestos del dedo (para moverse y hacer zoom) y la página dentro de
// la ventana no se podría desplazar: al tocarla se abre maximizada, donde sí se desplaza
const IS_COARSE_POINTER = window.matchMedia && matchMedia('(pointer: coarse)').matches;
textLayer.addEventListener('click', (e) => {
  if (!IS_COARSE_POINTER) return;
  const shield = e.target.closest('.webwin-shield');
  if (!shield) return;
  const win = shield.closest('.webwin');
  if (win) maximizeWebWindow(win.dataset.web);
});

textLayer.addEventListener('pointerdown', (e) => {
  const handle = e.target.closest('.webwin-resize');
  if (!handle || e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const id = handle.closest('.webwin').dataset.web;
  const t = getTexts().find(x => x.id === id);
  const el = getTextEl(id);
  if (!t || !el) return;
  setSelection([`text:${id}`]);
  const body = el.querySelector('.webwin-body');
  const start = { x: e.clientX, y: e.clientY, w: t.w, h: t.web.h || body.offsetHeight };
  handle.setPointerCapture(e.pointerId);
  el.classList.add('is-resizing');
  const onMove = (ev) => {
    t.w = Math.max(160, Math.round(start.w + (ev.clientX - start.x) / zoom));
    t.web.h = Math.max(120, Math.round(start.h + (ev.clientY - start.y) / zoom));
    applyTextStyle(el, t);
    body.style.height = `${t.web.h}px`;
    if (typeof renderConnectors === 'function') renderConnectors();
  };
  const onUp = () => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onUp);
    el.classList.remove('is-resizing');
    persist();
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onUp);
}, true);

// ----- Imagen de la pestaña (barra superior: 🖼 Imagen / ✕ Quitar imagen, o soltar una imagen en su barra) -----
const selectedWebTexts = () => getTexts().filter(t => t.web && selection.has(`text:${t.id}`));
const baseUpdateContextBarWeb = updateContextBar;
updateContextBar = function () {
  baseUpdateContextBarWeb.apply(this, arguments);
  const webs = selectedWebTexts();
  const onlyWeb = webs.length > 0 && webs.length === selectedTexts().length;
  document.getElementById('ctxWebImage').hidden = !onlyWeb;
  document.getElementById('ctxWebImageRemove').hidden = !(onlyWeb && webs.some(t => t.web.image));
  // Editar, color y links no aplican a una ventana web
  ['ctxTextEdit', 'ctxTextLinks', 'ctxTextInternal'].forEach(id => { const b = document.getElementById(id); if (b) b.hidden = onlyWeb; });
  const color = document.getElementById('ctxTextColor');
  if (color && color.closest('label')) color.closest('label').style.display = onlyWeb ? 'none' : '';
  if (onlyWeb) ctxTitle.textContent = webs.length === 1 ? (webs[0].web.plugin ? webs[0].web.plugin.name : 'Ventana web') : `${webs.length} ventanas`;
};
const webImageInput = document.createElement('input');
webImageInput.type = 'file';
webImageInput.accept = 'image/*';
webImageInput.hidden = true;
document.body.appendChild(webImageInput);
document.getElementById('ctxWebImage').addEventListener('click', () => webImageInput.click());
webImageInput.addEventListener('change', async () => {
  const file = webImageInput.files && webImageInput.files[0];
  webImageInput.value = '';
  if (!file) return;
  const { id } = await storeImageFile(file);
  selectedWebTexts().forEach(t => { t.web.image = id; });
  persist();
  renderTexts();
  updateContextBar();
});
document.getElementById('ctxWebImageRemove').addEventListener('click', () => {
  selectedWebTexts().forEach(t => { delete t.web.image; });
  persist();
  renderTexts();
  updateContextBar();
});

// ----- Maximizar -----
const webMax = document.createElement('div');
webMax.className = 'webwin-max';
webMax.hidden = true;
webMax.innerHTML = `<div class="webwin-max-bar"><span class="webwin-icon"></span><span class="webwin-max-title"></span>
  <button type="button" data-max-act="reload" title="Recargar">⟳</button>
  <button type="button" data-max-act="open" title="Abrir en el navegador">↗</button>
  <button type="button" data-max-act="close" class="webwin-max-close" title="Salir (Esc)">✕ Salir</button></div>
  <div class="webwin-max-body"></div>`;
document.body.appendChild(webMax);

function maximizeWebWindow(id) {
  const t = getTexts().find(x => x.id === id);
  if (!t) return;
  if (webMaximizedId) restoreWebWindow();
  webMaximizedId = id;
  const el = getTextEl(id);
  webMax.querySelector('.webwin-icon').innerHTML = el ? el.querySelector('.webwin-icon').innerHTML : '';
  webMax.querySelector('.webwin-max-title').textContent = (t.web.plugin && t.web.plugin.name) || t.web.title || webHost(t.web.url);
  webMax.hidden = false;
  moveKeepingState(webMax.querySelector('.webwin-max-body'), webFrameFor(t));
  document.body.classList.add('has-webwin-max');
}

function restoreWebWindow() {
  if (!webMaximizedId) return;
  const id = webMaximizedId;
  webMaximizedId = null;
  webMax.hidden = true;
  document.body.classList.remove('has-webwin-max');
  const f = webFrames.get(id);
  const el = getTextEl(id);
  const slot = el && el.querySelector('.webwin-slot');
  if (f) moveKeepingState(slot || webParking, f);
}

webMax.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-max-act]');
  if (!btn) return;
  const t = getTexts().find(x => x.id === webMaximizedId);
  if (btn.dataset.maxAct === 'close') restoreWebWindow();
  if (btn.dataset.maxAct === 'reload') { const f = webFrames.get(webMaximizedId); if (f) f.src = f.dataset.src; }
  if (btn.dataset.maxAct === 'open' && t) window.open(t.web.url, '_blank', 'noopener');
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && webMaximizedId) { e.preventDefault(); e.stopPropagation(); restoreWebWindow(); }
}, true);

// ----- Plugins: mensajes entre ZenBan y la app del plugin (ver zenban-plugin-sdk.js) -----
function textIdForSource(source) {
  for (const [id, f] of webFrames) if (f.contentWindow === source) return id;
  return null;
}

const stateJson = (s) => JSON.stringify(s ?? null);

// Se le manda el estado a cualquier página que use el SDK (avisa con zenban:ready), aunque la ventana
// se haya abierto como "Ventana web" con la dirección del plugin y no desde el menú de plugins
function sendPluginInit(id) {
  const t = getTexts().find(x => x.id === id);
  const f = webFrames.get(id);
  if (!t || !t.web || !f || !f.contentWindow || !pluginStateSent.has(id) && !t.web.plugin && !f.dataset.sdk) return;
  pluginStateSent.set(id, stateJson(t.web.state));
  f.contentWindow.postMessage({
    type: 'zenban:init', id, state: t.web.state ?? null,
    theme: document.documentElement.dataset.theme || 'dark',
    readOnly: typeof myPermLevel === 'function' && myPermLevel() === 'view'
  }, '*');
}

// Guardado del estado de los plugins: se agrupan los cambios seguidos, pero nunca se pierden al cerrar
let pluginSaveTimer = null;
function flushPluginSave() {
  if (!pluginSaveTimer) return;
  clearTimeout(pluginSaveTimer);
  pluginSaveTimer = null;
  persist();
}
window.addEventListener('pagehide', flushPluginSave);
window.addEventListener('beforeunload', flushPluginSave);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushPluginSave(); });

// Después de redibujar (p. ej. al llegar cambios de Drive): los plugins con un estado distinto al que
// tienen cargado lo reciben de nuevo
function resyncPluginStates() {
  getTexts().forEach(t => {
    if (!t.web || !pluginStateSent.has(t.id)) return;
    if (pluginStateSent.get(t.id) !== stateJson(t.web.state)) sendPluginInit(t.id);
  });
}

window.addEventListener('message', (e) => {
  const msg = e.data;
  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string' || !msg.type.startsWith('zenban:')) return;
  const id = textIdForSource(e.source);
  const t = id && getTexts().find(x => x.id === id);
  if (!t || !t.web) return;
  if (msg.type === 'zenban:ready') {
    const f = webFrames.get(id);
    if (f) f.dataset.sdk = '1';
    sendPluginInit(id);
  }
  if (msg.type === 'zenban:setState') {
    t.web.state = msg.state ?? null;
    pluginStateSent.set(id, stateJson(t.web.state));
    clearTimeout(pluginSaveTimer);
    pluginSaveTimer = setTimeout(() => { pluginSaveTimer = null; persist(); }, 300);
  }
  if (msg.type === 'zenban:setTitle' && typeof msg.title === 'string') {
    t.web.title = msg.title.slice(0, 80);
    const el = getTextEl(id);
    const title = el && el.querySelector('.webwin-title');
    if (title) title.textContent = t.web.title;
    persist();
  }
  if (msg.type === 'zenban:maximize') maximizeWebWindow(id);
  if (msg.type === 'zenban:exitMaximize' && webMaximizedId === id) restoreWebWindow();
});

// ----- Plugins instalados (⚙️ Configuración › Plugins) -----
function installedPlugins() {
  return Array.isArray(appSettings.plugins) ? appSettings.plugins : [];
}

async function installPlugin(rawUrl) {
  const url = normalizeWebUrl(rawUrl);
  if (!url) throw new Error('Dirección no válida');
  const base = url.replace(/[^/]*\.html?(\?.*)?$/i, '').replace(/\/?$/, '/');
  const r = await fetch(`${base}zenban-plugin.json`, { cache: 'no-store' });
  if (!r.ok) throw new Error('No encontré zenban-plugin.json en esa dirección');
  const m = await r.json();
  if (!m || !m.name) throw new Error('El zenban-plugin.json no tiene nombre');
  const plugin = {
    id: `plg-${base.replace(/[^a-z0-9]/gi, '').slice(-40)}`,
    name: String(m.name).slice(0, 40),
    icon: m.icon && /^https?:|^\.{0,2}\//.test(m.icon) ? new URL(m.icon, base).href : (m.icon || '🧩'),
    description: String(m.description || '').slice(0, 200),
    entry: new URL(m.entry || 'index.html', base).href,
    width: Math.min(1600, Math.max(240, Number(m.width) || WEB_DEFAULT_SIZE.w)),
    height: Math.min(1200, Math.max(160, Number(m.height) || WEB_DEFAULT_SIZE.h)),
    base
  };
  appSettings.plugins = [...installedPlugins().filter(p => p.id !== plugin.id), plugin];
  saveData(SETTINGS_KEY, appSettings);
  return plugin;
}

function renderPluginsSetting() {
  const list = document.getElementById('pluginsList');
  if (!list) return;
  const plugins = installedPlugins();
  list.innerHTML = plugins.length ? plugins.map(p => `
    <div class="plugin-row"><span class="plugin-icon">${/^https?:/.test(p.icon) ? `<img src="${escapeHtml(p.icon)}" alt="">` : escapeHtml(p.icon)}</span>
      <div class="plugin-info"><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.description || p.base)}</small></div>
      <button type="button" class="btn btn-ghost btn-sm" data-plugin-remove="${escapeHtml(p.id)}">Quitar</button></div>`).join('')
    : '<p class="setup-text">Todavía no agregaste plugins.</p>';
}

document.getElementById('pluginsList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-plugin-remove]');
  if (!b) return;
  appSettings.plugins = installedPlugins().filter(p => p.id !== b.dataset.pluginRemove);
  saveData(SETTINGS_KEY, appSettings);
  renderPluginsSetting();
});
document.getElementById('pluginAddBtn').addEventListener('click', async (e) => {
  const input = document.getElementById('pluginUrlInput');
  e.target.disabled = true;
  try {
    const p = await installPlugin(input.value);
    input.value = '';
    renderPluginsSetting();
    showToast(`Plugin «${p.name}» agregado: está en el botón derecho › Agregar aquí`, 'success');
  } catch (err) {
    showToast(err.message || 'No se pudo agregar el plugin', 'warning');
  } finally {
    e.target.disabled = false;
  }
});
document.getElementById('openSettingsBtn').addEventListener('click', renderPluginsSetting);

// ----- Botón derecho › Agregar aquí: ventana web y un elemento por plugin -----
const baseOpenCanvasMenuWeb = openCanvasMenu;
openCanvasMenu = function () {
  const panel = canvasMenu.querySelector('[data-sub="add"] .canvas-menu-sub-panel');
  if (panel) {
    panel.querySelectorAll('[data-dyn]').forEach(b => b.remove());
    const item = (cmd, icon, label) => `<button type="button" data-cmd="${escapeHtml(cmd)}" data-dyn role="menuitem"><span class="menu-emoji" aria-hidden="true">${icon}</span><span>${escapeHtml(label)}</span></button>`;
    panel.insertAdjacentHTML('beforeend', item('webWindow', '🌐', 'Ventana web aquí…') +
      installedPlugins().map(p => item(`plugin:${p.id}`, /^https?:/.test(p.icon) ? '🧩' : escapeHtml(p.icon), p.name)).join(''));
  }
  return baseOpenCanvasMenuWeb.apply(this, arguments);
};
canvasMenu.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-cmd]');
  if (!btn || btn.disabled) return;
  const cmd = btn.dataset.cmd;
  const point = menuCanvasPoint;
  if (cmd === 'webWindow') {
    const url = await promptWebUrl('Ventana web');
    if (url) addWebWindow(point, url);
  } else if (cmd.startsWith('plugin:')) {
    const p = installedPlugins().find(x => x.id === cmd.slice(7));
    if (p) addWebWindow(point, p.entry, p);
  }
});

(function addWebStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .webwin-parking { position: fixed; left: -10000px; top: 0; width: 800px; height: 600px; visibility: hidden; pointer-events: none; }
    .canvas-text.is-webwin { --board-color: var(--accent-primary); }
    .webwin-bar.is-image-drop { outline: 2px dashed var(--accent-primary); outline-offset: -2px; background: color-mix(in srgb, var(--accent-primary) 18%, transparent); }
    .canvas-text.is-webwin { padding: 0; background: var(--bg-surface); border: 1px solid var(--border-medium); border-radius: 10px; box-shadow: var(--shadow-lg); white-space: normal; overflow: visible; color: var(--text-main); }
    .webwin { display: flex; flex-direction: column; position: relative; }
    .webwin-bar { display: flex; align-items: center; gap: 0.4em; padding: 0.35em 0.5em; border-bottom: 1px solid var(--border-subtle); cursor: grab; user-select: none; }
    .webwin-icon { width: 1.2em; height: 1.2em; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .webwin-icon img { width: 100%; height: 100%; object-fit: contain; }
    .webwin-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .webwin-bar button, .webwin-max-bar button { border: none; background: transparent; color: var(--text-muted); font: inherit; padding: 0.1em 0.45em; border-radius: 6px; cursor: pointer; }
    .webwin-bar button:hover, .webwin-max-bar button:hover { background: var(--accent-primary); color: #fff; }
    .webwin-body { position: relative; overflow: hidden; border-radius: 0 0 10px 10px; background: #fff; }
    .webwin-slot, .webwin-frame { width: 100%; height: 100%; display: block; border: 0; }
    .webwin-shield { position: absolute; inset: 0; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 0.8em; cursor: pointer; }
    .webwin-shield span { opacity: 0; transition: opacity 0.15s; background: rgba(15, 23, 42, 0.8); color: #fff; padding: 0.3em 0.8em; border-radius: 999px; font-size: 0.85em; }
    .webwin-shield:hover span { opacity: 1; }
    @media (pointer: fine) { .canvas-text.is-solo.is-web-live .webwin-shield { display: none; } }
    @media (pointer: coarse) { .webwin-shield span { opacity: 1; } }
    .canvas-text.is-webwin.is-resizing .webwin-frame { pointer-events: none; }
    .webwin-resize { position: absolute; right: -9px; bottom: -9px; width: 18px; height: 18px; border-radius: 50%; background: var(--accent-primary); border: 2px solid #fff; cursor: nwse-resize; display: none; transform: scale(var(--inv-zoom, 1)); touch-action: none; }
    .canvas-text.is-solo .webwin-resize { display: block; }
    .canvas-text.is-webwin > .canvas-text-handle { display: none !important; }
    .webwin-max { position: fixed; inset: 0; z-index: 3000; display: flex; flex-direction: column; background: var(--bg-surface); }
    .webwin-max[hidden] { display: none; }
    .webwin-max-bar { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border-medium); font-size: 0.9rem; }
    .webwin-max-title { flex: 1; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .webwin-max-bar .webwin-max-close { background: #dc2626; color: #fff; font-weight: 700; padding: 0.3rem 0.8rem; }
    .webwin-max-body { flex: 1; position: relative; background: #fff; }
    .webwin-max-body .webwin-frame { position: absolute; inset: 0; }
    .webwin-prompt { padding: 1rem 1.25rem 1.25rem; display: flex; flex-direction: column; gap: 0.6rem; }
    .webwin-prompt input { width: 100%; }
    .plugin-row { display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 0.6rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); margin-bottom: 0.4rem; }
    .plugin-icon { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; font-size: 1.3rem; }
    .plugin-icon img { width: 100%; height: 100%; object-fit: contain; }
    .plugin-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .plugin-info small { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .plugin-add { display: flex; gap: 0.5rem; }
    .plugin-add input { flex: 1; }
  `;
  document.head.appendChild(style);
})();

// Ya cargó todo: se dibujan las ventanas web que hubiera
renderTexts();
