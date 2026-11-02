// ===== ZenBan - Actualización automática =====

// ----- Actualización automática -----
// Cada pocos minutos, y al volver a la app, se mira qué versión está publicada (el ?v= de app.js en
// index.html). Si hay una más nueva, se deja de subir a Drive y se recarga apenas no se esté editando:
// así el celular y el PC no quedan con versiones distintas guardando los mismos datos.
// Los cambios no se pierden: ya están guardados en este navegador y la versión nueva los sube.
const AppUpdate = { pending: 0, checking: false, lastCheck: 0, timer: null };

const APP_UPDATE_TRIED_KEY = 'zenban_update_tried';

async function latestPublishedVersion() {
  const r = await fetch(`./index.html?v=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) return 0;
  const m = (await r.text()).match(/app\.js\?v=(\d+)/);
  return m ? Number(m[1]) : 0;
}

async function checkForAppUpdate(force = false) {
  if (AppUpdate.pending) { applyAppUpdate(); return; }
  if (AppUpdate.checking || !navigator.onLine) return;
  if (!force && Date.now() - AppUpdate.lastCheck < 60 * 1000) return;
  AppUpdate.checking = true;
  AppUpdate.lastCheck = Date.now();
  try {
    const latest = await latestPublishedVersion();
    if (latest > Number(APP_VERSION)) {
      AppUpdate.pending = latest;
      applyAppUpdate();
    }
  } catch (e) {
    // Sin conexión o servidor caído: se vuelve a mirar más tarde
  } finally {
    AppUpdate.checking = false;
  }
}

// Escribiendo, arrastrando o con una ventana abierta no se recarga (se reintenta en unos segundos)
function appUpdateBlocked() {
  if (userIsInteracting() || SYNC.busy) return true;
  const a = document.activeElement;
  if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return true;
  return [...document.querySelectorAll('.modal-backdrop')].some(m => !m.hidden && m.getClientRects().length > 0);
}

function applyAppUpdate() {
  clearTimeout(AppUpdate.timer);
  if (appUpdateBlocked()) {
    AppUpdate.timer = setTimeout(applyAppUpdate, 3000);
    return;
  }
  // Si ya se recargó por esta versión hace poco y sigue la vieja (el servidor aún no la entrega), no se insiste
  let tried = null;
  try { tried = JSON.parse(sessionStorage.getItem(APP_UPDATE_TRIED_KEY) || 'null'); } catch (e) {}
  if (AppUpdate.failed) return;
  if (tried && tried.v === AppUpdate.pending && Date.now() - tried.at < 5 * 60 * 1000) {
    AppUpdate.failed = true;
    setSyncStatus('error');
    showToast(`Hay una versión nueva de ZenBan (v${AppUpdate.pending}) pero no se pudo cargar. Cierra y abre la app.`, 'warning');
    return;
  }
  try { sessionStorage.setItem(APP_UPDATE_TRIED_KEY, JSON.stringify({ v: AppUpdate.pending, at: Date.now() })); } catch (e) {}
  showToast(`Actualizando ZenBan a la v${AppUpdate.pending}…`, 'info');
  setTimeout(async () => {
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update();
    } catch (e) {}
    location.reload();
  }, 1200);
}

setTimeout(() => checkForAppUpdate(true), 8000);

setInterval(() => checkForAppUpdate(true), 5 * 60 * 1000);

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForAppUpdate(); });

window.addEventListener('focus', () => checkForAppUpdate());
