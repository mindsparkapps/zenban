// ===== ZenBan Plugin SDK =====
// Para que una app web funcione como plugin de ZenBan (un objeto del lienzo):
// 1. Publica junto a la app un archivo zenban-plugin.json:
//      { "name": "Mi plugin", "icon": "🧩", "description": "…", "entry": "index.html", "width": 640, "height": 420 }
//    "icon" puede ser un emoji o la dirección de una imagen.
// 2. Incluye este archivo en la app y usa:
//      ZenBanPlugin.onInit(({ state, theme, readOnly }) => { … restaurar el estado … });
//      ZenBanPlugin.setState({ … });   // se guarda dentro del objeto y se sincroniza con Drive
//      ZenBanPlugin.setTitle('Título'); // título de la ventana
//      ZenBanPlugin.maximize();         // abrir a pantalla completa
// Fuera de ZenBan (abierta directamente) la app funciona igual: onInit no se llama y setState no hace nada.
// Esc dentro del plugin también sale de la pantalla completa.
(function () {
  const inZenBan = window.parent && window.parent !== window;
  const listeners = [];
  let initData = null;
  const send = (msg) => { if (inZenBan) window.parent.postMessage(msg, '*'); };

  window.addEventListener('message', (e) => {
    if (e.source !== window.parent) return;
    const msg = e.data;
    if (!msg || msg.type !== 'zenban:init') return;
    initData = { state: msg.state, theme: msg.theme, readOnly: !!msg.readOnly, id: msg.id };
    listeners.forEach(fn => { try { fn(initData); } catch (err) { console.error(err); } });
  });

  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') send({ type: 'zenban:exitMaximize' }); });

  window.ZenBanPlugin = {
    inZenBan,
    onInit(fn) {
      listeners.push(fn);
      if (initData) fn(initData);
    },
    setState(state) { send({ type: 'zenban:setState', state }); },
    setTitle(title) { send({ type: 'zenban:setTitle', title: String(title || '') }); },
    maximize() { send({ type: 'zenban:maximize' }); },
    exitMaximize() { send({ type: 'zenban:exitMaximize' }); }
  };
  send({ type: 'zenban:ready' });
})();
