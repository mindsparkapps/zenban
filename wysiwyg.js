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
    if (/^#[0-9a-f]{3,8}$/i.test(c)) return c;
    const m = String(c).match(/\d+/g);
    return m && m.length >= 3 ? '#' + m.slice(0, 3).map(v => (+v).toString(16).padStart(2, '0')).join('') : '';
  };

  // Color y tamaño en px de la selección, línea por línea (la marca no cruza saltos de línea)
  function styledMd(n, inner) {
    const col = toHex(n.style.color || n.getAttribute('color') || '');
    const px = /px$/.test(n.style.fontSize) ? Math.round(parseFloat(n.style.fontSize)) : 0;
    if (!col && !px) return inner;
    return inner.split('\n').map(line => {
      if (!line.trim()) return line;
      const pre = (line.match(/^\s*(?:[-*+]|\d{1,3}[.)]|#{1,6}|>)\s+/) || [''])[0];
      let body = line.slice(pre.length);
      if (px) body = '{{size:' + px + '|' + body + '}}';
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
    if (n.nodeType !== 1) return '';
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
    const s = nodeMd(c);
    const isBlock = c.nodeType === 1 && /^(DIV|P|H[1-6]|UL|OL|BLOCKQUOTE|TABLE|HR|PRE)$/.test(c.tagName);
    md += isBlock && md && !endsNl(md) ? '\n' + s : s;
  });
  return md.replace(/[ \t]+\n/g, '\n').replace(/\s+$/, '');
}

let wysiwygRange = null;

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
      const node = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
      if (node) sizeInput.value = Math.round(parseFloat(getComputedStyle(node).fontSize) || 0);
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
    ${swatches}
    <input type="color" class="wz-color" value="#dc2626" title="Colorear selección (otro color)">
    <span class="wz-sep"></span>
    <button type="button" data-cmd="size-" title="Reducir 2 px la selección">−</button>
    <input type="number" class="wz-size" min="4" max="400" step="1" value="${Math.round(t.size)}" title="Tamaño de la selección en píxeles">
    <span class="wz-px">px</span>
    <button type="button" data-cmd="size+" title="Aumentar 2 px la selección">+</button>
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

  const applyColor = (c) => {
    const sel = restore();
    if (!sel.rangeCount || sel.isCollapsed) { showToast('Selecciona el texto que quieres colorear', 'info'); return; }
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('foreColor', false, c);
  };

  const applySize = (px) => {
    px = Math.max(4, Math.min(400, Math.round(px)));
    const sel = restore();
    if (!sel.rangeCount || sel.isCollapsed) { showToast('Selecciona el texto que quieres cambiar de tamaño', 'info'); return; }
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('fontSize', false, '7');
    const made = [];
    surface.querySelectorAll('font[size="7"]').forEach(f => {
      const sp = document.createElement('span');
      sp.style.fontSize = `${px}px`;
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
    bar.querySelector('.wz-size').value = px;
  };

  const exec = (cmd) => {
    const sizeBox = bar.querySelector('.wz-size');
    if (cmd === 'done') { finishTextEdit(); return; }
    if (cmd === 'unpage') { t.page = false; finishTextEdit(); return; }
    if (cmd === 'size+' || cmd === 'size-') { applySize((+sizeBox.value || t.size) + (cmd === 'size+' ? 2 : -2)); return; }
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

  wysiwygRange = null;
  surface.focus();
  const range = document.createRange();
  range.selectNodeContents(surface);
  range.collapse(false);
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(range);
}
