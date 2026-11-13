// Editor WYSIWYG de los textos del lienzo: el texto pasa a verse como una hoja (fondo blanco, borde negro
// delgado) con una barra de herramientas encima, y se edita ahí mismo.
// El texto sigue guardándose como marcas ligeras (Markdown, ver richMarks en app.js); este editor lo
// muestra ya con formato y lo devuelve a esas marcas.

// DOM del editor -> marcas (**negrita**, *cursiva*, ~~tachado~~, `código`, # títulos, - listas, > citas,
// {{color:#hex|texto}} y {{size:px|texto}})
function wysiwygToMarks(root) {
  const endsNl = (s) => !s || s.endsWith('\n');
  const kids = (node) => Array.from(node.childNodes).map(nodeMd).join('');
  const wrap = (mark, inner) => (inner.trim() ? mark + inner + mark : inner);

  const toHex = (c) => {
    c = String(c).trim();
    if (!c || c === 'transparent' || /^rgba\(.*,\s*0\)$/.test(c)) return '';
    if (/^#[0-9a-f]{3,8}$/i.test(c)) return c;
    const m = c.match(/\d+/g);
    return m && m.length >= 3 ? '#' + m.slice(0, 3).map(v => (+v).toString(16).padStart(2, '0')).join('') : '';
  };

  // Color, resaltado y tamaño de la selección, línea por línea (la marca no cruza saltos de línea).
  // El tamaño se guarda como número estilo Office (12 = el tamaño base de la hoja): {{pt:14|texto}}
  function styledMd(n, inner) {
    const col = toHex(n.style.color || n.getAttribute('color') || '');
    const bg = toHex(n.style.backgroundColor || '');
    const fs = n.style.fontSize || '';
    const pt = /em$/.test(fs) ? Math.round(parseFloat(fs) * 12) : 0;
    const px = /px$/.test(fs) ? Math.round(parseFloat(fs)) : 0;
    if (!col && !bg && !pt && !px) return inner;
    return inner.split('\n').map(line => {
      if (!line.trim()) return line;
      const pre = (line.match(/^\s*(?:[-*+]|\d{1,3}[.)]|#{1,6}|>)\s+/) || [''])[0];
      let body = line.slice(pre.length);
      if (pt) body = '{{pt:' + pt + '|' + body + '}}';
      if (px) body = '{{size:' + px + '|' + body + '}}';
      if (bg) body = '{{bg:' + bg + '|' + body + '}}';
      if (col) body = '{{color:' + col + '|' + body + '}}';
      return pre + body;
    }).join('\n');
  }

  function listMd(list, depth) {
    const ordered = list.tagName === 'OL';
    let n = 0;
    let out = '';
    Array.from(list.children).forEach(li => {
      if (li.tagName !== 'LI') return;
      n++;
      let own = '';
      let nested = '';
      Array.from(li.childNodes).forEach(c => {
        if (c.nodeType === 1 && /^(UL|OL)$/.test(c.tagName)) nested += listMd(c, depth + 1);
        else own += nodeMd(c);
      });
      out += `${'  '.repeat(depth)}${ordered ? n + '.' : '-'} ${own.replace(/\n+$/, '')}\n${nested}`;
    });
    return out;
  }

  function tableMd(table) {
    const rows = Array.from(table.rows).map(r => Array.from(r.cells).map(c => c.textContent.trim().replace(/\|/g, '/')));
    if (!rows.length) return '';
    const line = (r) => `| ${r.join(' | ')} |`;
    return [line(rows[0]), line(rows[0].map(() => '---')), ...rows.slice(1).map(line)].join('\n') + '\n';
  }

  function blockOut(out, md) {
    return (out && !endsNl(out) ? '\n' : '') + md + (endsNl(md) ? '' : '\n');
  }

  function nodeMd(n) {
    if (n.nodeType === 3) return n.nodeValue.replace(/ /g, ' ');
    if (n.nodeType !== 1 || n.classList.contains('wz-aux')) return '';
    const tag = n.tagName;
    const cls = n.classList;
    switch (tag) {
      case 'BR': return '\n';
      case 'B': case 'STRONG': return wrap('**', kids(n));
      case 'I': case 'EM': return wrap('*', kids(n));
      case 'S': case 'STRIKE': case 'DEL': return wrap('~~', kids(n));
      case 'U': return kids(n);
      case 'CODE':
        return cls.contains('rt-block') ? '```\n' + n.textContent.replace(/\n$/, '') + '\n```\n' : '`' + n.textContent + '`';
      case 'PRE': return '```\n' + n.textContent.replace(/\n$/, '') + '\n```\n';
      case 'A': {
        const href = n.getAttribute('data-url') || n.getAttribute('href') || '';
        const label = n.textContent.trim();
        if (!href) return label;
        return !label || label === href ? href : `[${label}](${href})`;
      }
      case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6':
        return blockOut('', `${'#'.repeat(Math.min(+tag[1], 3))} ${kids(n).replace(/\n+$/, '')}`);
      case 'UL': case 'OL': return listMd(n, 0);
      case 'BLOCKQUOTE':
        return blockOut('', kids(n).replace(/\n+$/, '').split('\n').map(l => `> ${l}`).join('\n'));
      case 'TABLE': return tableMd(n);
      case 'HR': return '---\n';
      case 'FONT': return styledMd(n, kids(n));
      case 'SPAN': {
        const h = /rt-h([123])/.exec(n.className);
        if (cls.contains('rt-h') && h) return `${'#'.repeat(+h[1])} ${kids(n)}`;
        if (cls.contains('rt-quote')) return `> ${kids(n)}`;
        if (cls.contains('rt-li')) {
          const mk = n.querySelector('.rt-mk');
          const mark = mk ? mk.textContent : '-';
          const em = parseFloat(n.style.marginLeft) || 0;
          const body = Array.from(n.childNodes).filter(c => c !== mk).map(nodeMd).join('');
          return `${' '.repeat(Math.round(em * 2))}${mark === '•' ? '-' : mark} ${body}\n`;
        }
        return styledMd(n, kids(n));
      }
      case 'DIV': case 'P': {
        // Una línea en blanco que el navegador deja como <div><br></div>
        if (n.childNodes.length === 1 && n.firstChild.nodeName === 'BR') return '\n';
        return blockOut('', kids(n));
      }
      default: return kids(n);
    }
  }

  // Los bloques (div, h1, listas…) arrancan en línea nueva
  let md = '';
  Array.from(root.childNodes).forEach(c => {
    if (c.nodeType === 1 && c.classList.contains('wz-aux')) return; // piezas de la paginación
    const s = nodeMd(c);
    const isBlock = c.nodeType === 1 && /^(DIV|P|H[1-6]|UL|OL|BLOCKQUOTE|TABLE|HR|PRE)$/.test(c.tagName);
    md += isBlock && md && !endsNl(md) ? '\n' + s : s;
  });
  return md.replace(/[ \t]+\n/g, '\n').replace(/\s+$/, '');
}

// ---- Paginación estilo Word ----
// Cada página es una hoja blanca de fondo; entre una y otra hay un hueco gris. El texto no cruza ese hueco:
// unos "topes" flotantes (float) invisibles obligan a las líneas a saltar a la página siguiente.
function wzGeometry(t) {
  const P = Math.round(t.w * 1.414); // alto de la página (proporción A4)
  const M = Math.round(t.w * 0.07); // margen
  const G = Math.max(10, Math.round(t.w * 0.04)); // hueco entre páginas
  return { P, M, G };
}

function wzPaginate(el, t) {
  const body = el && el.querySelector('.page-body, .wz-surface');
  if (!body || !el.isConnected) return;
  const { P, M, G } = wzGeometry(t);
  const A = P - 2 * M; // alto útil de cada página
  const aux = (tag, cls, css) => {
    const d = document.createElement(tag);
    d.className = `wz-aux ${cls}`;
    d.contentEditable = 'false';
    d.setAttribute('aria-hidden', 'true');
    d.style.cssText = css;
    return d;
  };
  // Monta K páginas de topes, mide dónde termina el texto y devuelve cuántas páginas ocupa
  const build = (K) => {
    body.querySelectorAll(':scope > .wz-aux').forEach(n => n.remove());
    const frag = document.createDocumentFragment();
    for (let k = 0; k < K; k++) {
      frag.appendChild(aux('div', 'wz-pb', `float:left;clear:left;width:0;height:${A}px`));
      frag.appendChild(aux('div', 'wz-pb', `float:left;clear:left;width:100%;height:${2 * M + G}px`));
    }
    body.insertBefore(frag, body.firstChild);
    const end = aux('span', 'wz-end', 'display:inline-block;width:0;height:0');
    body.appendChild(end);
    return Math.floor(end.offsetTop / (P + G)) + 1;
  };
  let K = Math.max(1, body._wzPages || 1);
  for (let i = 0; i < 12; i++) {
    const N = build(K);
    if (N === K) break;
    K = N;
  }
  // Sin el tope final no queda hueco de más debajo de la última página
  const pbs = body.querySelectorAll(':scope > .wz-pb');
  if (pbs.length) pbs[pbs.length - 1].remove();
  for (let i = 0; i < K; i++) {
    const s = aux('div', 'wz-sheet', `top:${i * (P + G)}px;height:${P}px`);
    body.insertBefore(s, body.firstChild);
  }
  body._wzPages = K;
  el._wzGeom = { P, G, pages: K };
  wzUpdatePageInfo(el);
}

// "Página X de N · avance %" debajo de la hoja
function wzUpdatePageInfo(el) {
  const body = el.querySelector('.page-body, .wz-surface');
  const g = el._wzGeom;
  if (!body || !g) return;
  let info = el.querySelector(':scope > .page-info');
  if (!info) {
    info = document.createElement('div');
    info.className = 'page-info';
    el.appendChild(info);
  }
  const cur = Math.max(1, Math.min(g.pages, Math.floor((body.scrollTop + body.clientHeight / 2) / (g.P + g.G)) + 1));
  const max = body.scrollHeight - body.clientHeight;
  const pct = max > 0 ? Math.round(body.scrollTop / max * 100) : 100;
  info.textContent = `Página ${cur} de ${g.pages} · ${pct}%`;
}

// Prepara una hoja ya dibujada: pagina y sigue el scroll
function wzSetupPage(el, t) {
  const body = el.querySelector('.page-body, .wz-surface');
  if (!body) return;
  body.addEventListener('scroll', () => wzUpdatePageInfo(el), { passive: true });
  wzPaginate(el, t);
}

let wysiwygRange = null;
// Tamaños como en Office: 12 es el tamaño base de la hoja (el que tiene el texto sin formato)
const WZ_BASE_PT = 12;
const WZ_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72, 96];
const WZ_HIGHLIGHTS = ['#fde047', '#86efac', '#67e8f9', '#f9a8d4', '#fdba74'];

// La selección se recuerda para poder aplicarle color o tamaño aunque el foco pase a la barra
document.addEventListener('selectionchange', () => {
  const surf = document.querySelector('.wz-surface');
  const sel = window.getSelection();
  if (!surf || !sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  if (surf.contains(r.commonAncestorContainer)) {
    wysiwygRange = r.cloneRange();
    const sizeInput = document.querySelector('.wz-size');
    if (sizeInput && document.activeElement !== sizeInput) {
      // El texto real de la selección (los bordes del rango pueden ser el contenedor, no el texto)
      let node = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
      if (!r.collapsed) {
        const walker = document.createTreeWalker(r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentNode, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (n.nodeValue.trim() && r.intersectsNode(n)) { node = n.parentElement; break; }
        }
      }
      const base = parseFloat(getComputedStyle(surf).fontSize);
      if (node && base) sizeInput.value = Math.round(parseFloat(getComputedStyle(node).fontSize) / base * WZ_BASE_PT) || WZ_BASE_PT;
    }
  }
});

function openWysiwyg(textId) {
  const t = getTexts().find(x => x.id === textId);
  if (!t || Array.isArray(t.ytLists) || t.web) return;
  if (editingTextId) finishTextEdit();
  // El texto pasa a formato de hoja (queda así al terminar)
  t.page = true;
  t.fixedWidth = true;
  t.w = Math.max(t.w || 0, 360);
  renderTexts();
  const el = getTextEl(textId);
  if (!el) return;
  setSelection([`text:${textId}`]);
  editingTextId = textId;
  el.classList.add('is-editing', 'is-wz-editing');
  el.style.width = `${t.w}px`;
  el.textContent = '';

  const bar = document.createElement('div');
  bar.className = 'wz-bar';
  const swatches = ['#111111', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#9333ea']
    .map(c => `<button type="button" class="wz-sw" data-color="${c}" style="background:${c}" title="Colorear selección ${c}"></button>`).join('');
  const highlights = WZ_HIGHLIGHTS
    .map(c => `<button type="button" class="wz-sw wz-hl" data-hl="${c}" style="background:${c}" title="Resaltar selección"></button>`).join('');
  bar.innerHTML = `
    <button type="button" data-cmd="bold" title="Negrita (Ctrl+B)"><b>B</b></button>
    <button type="button" data-cmd="italic" title="Cursiva (Ctrl+I)"><i>I</i></button>
    <button type="button" data-cmd="strikeThrough" title="Tachado"><s>S</s></button>
    <button type="button" data-cmd="code" title="Código">&lt;/&gt;</button>
    <span class="wz-sep"></span>
    <button type="button" data-cmd="h1" title="Título 1">H1</button>
    <button type="button" data-cmd="h2" title="Título 2">H2</button>
    <button type="button" data-cmd="p" title="Párrafo normal">¶</button>
    <span class="wz-sep"></span>
    <button type="button" data-cmd="insertUnorderedList" title="Lista con viñetas">• ≡</button>
    <button type="button" data-cmd="insertOrderedList" title="Lista numerada">1. ≡</button>
    <button type="button" data-cmd="quote" title="Cita">❝</button>
    <button type="button" data-cmd="link" title="Link">🔗</button>
    <span class="wz-sep"></span>
    <span class="wz-lbl">Color</span>
    ${swatches}
    <input type="color" class="wz-color" value="#dc2626" title="Colorear selección (otro color)">
    <span class="wz-sep"></span>
    <span class="wz-lbl">Resaltar</span>
    ${highlights}
    <button type="button" class="wz-hl-none" data-cmd="hl-none" title="Quitar resaltado">✕</button>
    <span class="wz-sep"></span>
    <span class="wz-lbl">Tamaño</span>
    <button type="button" data-cmd="size-" title="Reducir tamaño de la selección">A−</button>
    <input type="number" class="wz-size" list="wzSizes" min="4" max="400" step="1" value="${WZ_BASE_PT}" title="Tamaño de la selección (12 = normal)">
    <datalist id="wzSizes">${WZ_SIZES.map(n => `<option value="${n}"></option>`).join('')}</datalist>
    <button type="button" data-cmd="size+" title="Aumentar tamaño de la selección">A+</button>
    <span class="wz-sep"></span>
    <button type="button" data-cmd="clear" title="Quitar formato">⌫</button>
    <button type="button" data-cmd="unpage" title="Volver a texto normal (sin hoja)">Sin hoja</button>
    <button type="button" class="wz-done" data-cmd="done" title="Terminar (Esc)">Listo</button>`;

  const surface = document.createElement('div');
  surface.className = 'wz-surface';
  surface.contentEditable = 'true';
  surface.spellcheck = true;
  surface.innerHTML = richMarks(escapeHtml(t.text || ''));
  el.appendChild(bar);
  el.appendChild(surface);

  const restore = () => {
    surface.focus();
    if (wysiwygRange) {
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(wysiwygRange);
    }
    return window.getSelection();
  };

  // Devuelve la selección con texto; si solo hay cursor, toma la palabra donde está
  const textSelection = (what) => {
    const sel = restore();
    if (!sel.rangeCount) return null;
    if (sel.isCollapsed && sel.modify) {
      sel.modify('move', 'backward', 'word');
      sel.modify('extend', 'forward', 'word');
    }
    if (sel.isCollapsed) { showToast(`Selecciona el texto que quieres ${what}`, 'info'); return null; }
    return sel;
  };

  const applyColor = (c) => {
    if (!textSelection('colorear')) return;
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('foreColor', false, c);
  };

  const applyHighlight = (c) => {
    if (!textSelection('resaltar')) return;
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('hiliteColor', false, c || 'transparent');
  };

  // Tamaño estilo Office (12 = normal): la letra mide N/12 del tamaño base de la hoja
  const applySize = (pt) => {
    pt = Math.max(4, Math.min(400, Math.round(pt)));
    if (!textSelection('cambiar de tamaño')) return;
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('fontSize', false, '7');
    const made = [];
    surface.querySelectorAll('font[size="7"]').forEach(f => {
      const sp = document.createElement('span');
      sp.style.fontSize = `${(pt / WZ_BASE_PT).toFixed(3)}em`;
      while (f.firstChild) sp.appendChild(f.firstChild);
      // Un tamaño anterior dentro de la selección no debe pisar el nuevo
      sp.querySelectorAll('span').forEach(x => { x.style.fontSize = ''; });
      f.replaceWith(sp);
      made.push(sp);
    });
    // La selección sigue sobre el texto cambiado, para poder colorearlo o ajustarlo después
    if (made.length) {
      const r = document.createRange();
      r.setStartBefore(made[0]);
      r.setEndAfter(made[made.length - 1]);
      const s2 = window.getSelection();
      s2.removeAllRanges();
      s2.addRange(r);
      wysiwygRange = r.cloneRange();
    }
    bar.querySelector('.wz-size').value = pt;
  };

  const exec = (cmd) => {
    const sizeBox = bar.querySelector('.wz-size');
    if (cmd === 'done') { finishTextEdit(); return; }
    if (cmd === 'unpage') { t.page = false; finishTextEdit(); return; }
    if (cmd === 'hl-none') { applyHighlight(null); return; }
    if (cmd === 'size+' || cmd === 'size-') {
      // Salta por la lista de tamaños, como los botones de aumentar y reducir fuente de Office
      const cur = +sizeBox.value || WZ_BASE_PT;
      const next = cmd === 'size+' ? WZ_SIZES.find(n => n > cur) : [...WZ_SIZES].reverse().find(n => n < cur);
      applySize(next || cur + (cmd === 'size+' ? 4 : -1));
      return;
    }
    restore();
    if (cmd === 'h1' || cmd === 'h2') document.execCommand('formatBlock', false, cmd);
    else if (cmd === 'p') document.execCommand('formatBlock', false, 'div');
    else if (cmd === 'quote') document.execCommand('formatBlock', false, 'blockquote');
    else if (cmd === 'clear') { document.execCommand('removeFormat'); document.execCommand('formatBlock', false, 'div'); }
    else if (cmd === 'code') {
      const txt = window.getSelection().toString();
      if (txt) document.execCommand('insertHTML', false, `<code class="rt-code">${escapeHtml(txt)}</code>`);
    } else if (cmd === 'link') {
      const url = prompt('Dirección del link (https://…)');
      if (url && url.trim()) { restore(); document.execCommand('createLink', false, url.trim()); }
    } else document.execCommand(cmd, false, null);
  };

  // Los botones no le quitan la selección al texto
  bar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  bar.addEventListener('pointerdown', (e) => e.stopPropagation());
  bar.addEventListener('click', (e) => {
    const sw = e.target.closest('.wz-sw');
    if (sw && sw.dataset.hl) { applyHighlight(sw.dataset.hl); return; }
    if (sw) { applyColor(sw.dataset.color); return; }
    const b = e.target.closest('button[data-cmd]');
    if (b) exec(b.dataset.cmd);
  });
  bar.querySelector('.wz-color').addEventListener('change', (e) => applyColor(e.target.value));
  const sizeInput = bar.querySelector('.wz-size');
  sizeInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); applySize(+sizeInput.value); }
  });
  sizeInput.addEventListener('change', () => applySize(+sizeInput.value));

  surface.addEventListener('keydown', (e) => {
    e.stopPropagation(); // que los atajos del lienzo no se activen mientras se escribe
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      finishTextEdit();
    }
  });
  surface.addEventListener('paste', (e) => {
    // Pegar como texto simple: el formato se hace con la barra
    e.preventDefault();
    e.stopPropagation();
    const txt = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    if (txt) document.execCommand('insertText', false, txt);
  });

  wzSetupPage(el, t);
  let pagRaf = 0;
  surface.addEventListener('input', () => {
    cancelAnimationFrame(pagRaf);
    pagRaf = requestAnimationFrame(() => wzPaginate(el, t));
  });

  wysiwygRange = null;
  surface.focus();
  const range = document.createRange();
  range.selectNodeContents(surface);
  range.collapse(false);
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(range);
}
