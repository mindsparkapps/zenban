// Editor WYSIWYG de los textos del lienzo.
// El texto sigue guardándose como marcas ligeras (Markdown, ver richMarks en app.js); este editor lo
// muestra ya con formato, deja editarlo con una barra de herramientas y lo devuelve a esas marcas.

// DOM del editor -> marcas (**negrita**, *cursiva*, ~~tachado~~, `código`, # títulos, - listas, > citas)
function wysiwygToMarks(root) {
  const endsNl = (s) => !s || s.endsWith('\n');
  const kids = (node) => Array.from(node.childNodes).map(nodeMd).join('');
  const wrap = (mark, inner) => (inner.trim() ? mark + inner + mark : inner);

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
        return kids(n);
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

let wysiwygTextId = null;

function openWysiwyg(textId) {
  const t = getTexts().find(x => x.id === textId);
  if (!t || Array.isArray(t.ytLists) || t.web) return;
  if (typeof editingTextId !== 'undefined' && editingTextId) finishTextEdit();
  closeWysiwyg();
  wysiwygTextId = textId;

  const ov = document.createElement('div');
  ov.className = 'wz-overlay';
  ov.innerHTML = `
    <div class="wz-dialog" role="dialog" aria-label="Editor de texto">
      <div class="wz-toolbar">
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
        <button type="button" data-cmd="clear" title="Quitar formato">⌫</button>
      </div>
      <div class="wz-surface canvas-text" contenteditable="true" spellcheck="true"></div>
      <div class="wz-footer">
        <span class="wz-hint">Ctrl+Enter guarda · Esc cancela</span>
        <button type="button" class="wz-cancel">Cancelar</button>
        <button type="button" class="wz-save">Guardar</button>
      </div>
    </div>`;
  const surface = ov.querySelector('.wz-surface');
  surface.style.fontSize = `${Math.max(14, Math.min(22, t.size || 16))}px`;
  surface.innerHTML = richMarks(escapeHtml(t.text || ''));
  document.body.appendChild(ov);

  const save = () => {
    const md = wysiwygToMarks(surface);
    const tt = getTexts().find(x => x.id === wysiwygTextId);
    closeWysiwyg();
    if (!tt) return;
    if (md !== tt.text) {
      tt.text = md;
      persist();
      renderTexts();
    }
  };

  const exec = (cmd) => {
    surface.focus();
    if (cmd === 'h1' || cmd === 'h2') document.execCommand('formatBlock', false, cmd);
    else if (cmd === 'p') document.execCommand('formatBlock', false, 'div');
    else if (cmd === 'quote') document.execCommand('formatBlock', false, 'blockquote');
    else if (cmd === 'clear') { document.execCommand('removeFormat'); document.execCommand('formatBlock', false, 'div'); }
    else if (cmd === 'code') {
      const sel = window.getSelection();
      const txt = sel.toString();
      if (txt) document.execCommand('insertHTML', false, `<code class="rt-code">${escapeHtml(txt)}</code>`);
    } else if (cmd === 'link') {
      const url = prompt('Dirección del link (https://…)');
      if (url && url.trim()) document.execCommand('createLink', false, url.trim());
    } else document.execCommand(cmd, false, null);
  };

  ov.querySelector('.wz-toolbar').addEventListener('mousedown', (e) => e.preventDefault()); // conserva la selección
  ov.querySelector('.wz-toolbar').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cmd]');
    if (b) exec(b.dataset.cmd);
  });
  ov.querySelector('.wz-save').addEventListener('click', save);
  ov.querySelector('.wz-cancel').addEventListener('click', closeWysiwyg);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeWysiwyg(); });
  ov.addEventListener('keydown', (e) => {
    e.stopPropagation(); // que los atajos del lienzo no se activen mientras se escribe
    if (e.key === 'Escape') { e.preventDefault(); closeWysiwyg(); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
  });
  ov.addEventListener('paste', (e) => {
    // Pegar como texto simple: el formato se hace con la barra
    e.preventDefault();
    const txt = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    if (txt) document.execCommand('insertText', false, txt);
  });
  surface.focus();
  const range = document.createRange();
  range.selectNodeContents(surface);
  range.collapse(false);
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(range);
}

function closeWysiwyg() {
  wysiwygTextId = null;
  document.querySelectorAll('.wz-overlay').forEach(o => o.remove());
}
