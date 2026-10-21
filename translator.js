// ===== ZenBan - Traductor (Google Traductor) =====
// Ventana con dos cuadros: escribes en uno y aparece la traducción en el otro (como translate.google.com).
// Usa el servicio gratuito de Google Traductor (no oficial: podría cambiar algún día).

const TRANSLATE_LANGS = [
  ['es', 'Español'], ['en', 'Inglés'], ['pt', 'Portugués'], ['fr', 'Francés'], ['it', 'Italiano'],
  ['de', 'Alemán'], ['nl', 'Neerlandés'], ['ca', 'Catalán'], ['ru', 'Ruso'], ['uk', 'Ucraniano'],
  ['pl', 'Polaco'], ['tr', 'Turco'], ['ar', 'Árabe'], ['he', 'Hebreo'], ['hi', 'Hindi'],
  ['zh-CN', 'Chino (simplificado)'], ['zh-TW', 'Chino (tradicional)'], ['ja', 'Japonés'], ['ko', 'Coreano'],
  ['el', 'Griego'], ['sv', 'Sueco'], ['no', 'Noruego'], ['da', 'Danés'], ['fi', 'Finés'], ['la', 'Latín']
];
const TRANSLATE_PREFS_KEY = 'zenban_translate_prefs';

function translateLangName(code) {
  const l = TRANSLATE_LANGS.find(x => x[0].toLowerCase() === String(code || '').toLowerCase());
  return l ? l[1] : code;
}

async function googleTranslate(text, from, to) {
  const params = `client=gtx&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&dt=t`;
  const url = `https://translate.googleapis.com/translate_a/single?${params}`;
  // Textos largos van en el cuerpo (la dirección tiene un largo máximo)
  const res = text.length > 1500
    ? await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: `q=${encodeURIComponent(text)}` })
    : await fetch(`${url}&q=${encodeURIComponent(text)}`);
  if (!res.ok) throw new Error(`traductor ${res.status}`);
  const j = await res.json();
  return { text: (j[0] || []).map(x => x[0]).join(''), detected: j[2] || from };
}

let translatorPoint = null;

function openTranslator(initialText = '', point = null) {
  translatorPoint = point;
  let m = document.getElementById('translatorModal');
  const prefs = (() => { try { return JSON.parse(localStorage.getItem(TRANSLATE_PREFS_KEY) || '{}'); } catch (e) { return {}; } })();
  if (!m) {
    m = document.createElement('div');
    m.className = 'modal-backdrop';
    m.id = 'translatorModal';
    const opts = TRANSLATE_LANGS.map(([c, n]) => `<option value="${c}">${n}</option>`).join('');
    m.innerHTML = `
      <div class="modal-card translator-card">
        <div class="modal-header">
          <h2>🌐 Traductor</h2>
          <button class="modal-close-btn" type="button" data-close aria-label="Cerrar">&times;</button>
        </div>
        <div class="translator-body">
          <div class="translator-langs">
            <select id="trFrom" aria-label="Idioma de origen"><option value="auto">Detectar idioma</option>${opts}</select>
            <button type="button" class="btn btn-ghost btn-sm" id="trSwap" title="Intercambiar idiomas">⇄</button>
            <select id="trTo" aria-label="Idioma de destino">${opts}</select>
          </div>
          <div class="translator-panes">
            <div class="translator-pane">
              <textarea id="trInput" placeholder="Escribe o pega el texto…" rows="7"></textarea>
              <small id="trDetected"></small>
            </div>
            <div class="translator-pane">
              <textarea id="trOutput" placeholder="Traducción" rows="7" readonly></textarea>
              <small id="trStatus"></small>
            </div>
          </div>
          <div class="translator-actions">
            <button type="button" class="btn btn-ghost btn-sm" id="trClear">Borrar</button>
            <div class="spacer"></div>
            <button type="button" class="btn btn-ghost btn-sm" id="trCopy">📋 Copiar traducción</button>
            <button type="button" class="btn btn-primary btn-sm" id="trToCanvas">Poner en el lienzo</button>
          </div>
        </div>
      </div>`;
    m.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) m.style.display = 'none'; });
    document.body.appendChild(m);

    const input = m.querySelector('#trInput');
    const output = m.querySelector('#trOutput');
    const from = m.querySelector('#trFrom');
    const to = m.querySelector('#trTo');
    const status = m.querySelector('#trStatus');
    const detected = m.querySelector('#trDetected');
    let timer = null;
    let seq = 0;
    const savePrefs = () => localStorage.setItem(TRANSLATE_PREFS_KEY, JSON.stringify({ from: from.value, to: to.value }));
    const run = async () => {
      const text = input.value.trim();
      const mine = ++seq;
      if (!text) { output.value = ''; status.textContent = ''; detected.textContent = ''; return; }
      status.textContent = 'Traduciendo…';
      try {
        let r = await googleTranslate(text, from.value, to.value);
        if (mine !== seq) return; // llegó una respuesta vieja
        // Si lo escrito ya está en el idioma de destino, se traduce al otro idioma de uso (español ↔ inglés)
        if (from.value === 'auto' && r.detected && r.detected.toLowerCase() === to.value.toLowerCase()) {
          to.value = r.detected.toLowerCase() === 'es' ? 'en' : 'es';
          savePrefs();
          r = await googleTranslate(text, from.value, to.value);
          if (mine !== seq) return;
        }
        output.value = r.text;
        status.textContent = '';
        detected.textContent = from.value === 'auto' && r.detected ? `Idioma detectado: ${translateLangName(r.detected)}` : '';
      } catch (err) {
        if (mine !== seq) return;
        status.textContent = navigator.onLine ? 'No se pudo traducir. Inténtalo de nuevo.' : 'Sin conexión.';
      }
    };
    const later = () => { clearTimeout(timer); timer = setTimeout(run, 450); };
    input.addEventListener('input', later);
    from.addEventListener('change', () => { savePrefs(); run(); });
    to.addEventListener('change', () => { savePrefs(); run(); });
    m.querySelector('#trSwap').addEventListener('click', () => {
      const src = from.value === 'auto' ? (TRANSLATE_LANGS.find(l => detected.textContent.includes(l[1])) || [to.value === 'es' ? 'en' : 'es'])[0] : from.value;
      from.value = to.value;
      to.value = src;
      if (output.value) input.value = output.value;
      savePrefs();
      run();
    });
    m.querySelector('#trClear').addEventListener('click', () => { input.value = ''; run(); input.focus(); });
    m.querySelector('#trCopy').addEventListener('click', () => {
      if (!output.value) return;
      copyWithToast(output.value, 'Traducción copiada');
    });
    m.querySelector('#trToCanvas').addEventListener('click', () => {
      if (!output.value) return;
      m.style.display = 'none';
      addText(output.value, translatorPoint);
    });
    m._run = run;
  }
  // Al abrir se detecta el idioma de lo que escribas; el de destino es el último que usaste
  m.querySelector('#trFrom').value = 'auto';
  m.querySelector('#trTo').value = prefs.to || 'en';
  if (initialText) m.querySelector('#trInput').value = initialText;
  m.style.display = 'flex';
  m._run();
  if (!window.matchMedia('(pointer: coarse)').matches) setTimeout(() => m.querySelector('#trInput').focus(), 60);
}

// Abrir: botón de la barra de herramientas y menú del botón derecho (con el texto seleccionado, si hay)
document.getElementById('toolTranslate').addEventListener('click', () => {
  const t = selectedTexts()[0];
  openTranslator(t ? t.text : '');
});

(function translatorStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .translator-card { max-width: 820px; }
    .translator-body { padding: 1rem 1.25rem 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; }
    .translator-langs { display: flex; gap: 8px; align-items: center; }
    .translator-langs select { flex: 1; min-width: 0; }
    .translator-panes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .translator-pane { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .translator-pane textarea { width: 100%; min-height: 160px; resize: vertical; font-family: inherit; font-size: 0.95rem; line-height: 1.45; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border-medium); background: var(--bg-surface); color: var(--text-main); }
    .translator-pane #trOutput { background: var(--bg-surface-hover); }
    .translator-pane small { min-height: 1em; font-size: 0.75rem; color: var(--text-muted); }
    .translator-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    @media (max-width: 640px) { .translator-panes { grid-template-columns: 1fr; } }
  `;
  document.head.appendChild(style);
})();
