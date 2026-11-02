// ===== ZenBan - Recortar imágenes del lienzo =====
// Botón "Recortar" en la barra de la imagen: se abre una ventana con la imagen completa y un recuadro que se
// mueve arrastrándolo y se agranda con sus manijas (libre o con una proporción fija). Al aplicar, la imagen
// del lienzo pasa a usar un archivo nuevo con solo esa parte: queda en el mismo lugar, con el mismo nombre y
// con sus destacados ajustados. El archivo original no se borra (se puede deshacer con Ctrl+Z).

const CROP_RATIOS = [
  { label: 'Libre', r: 0 },
  { label: '1:1', r: 1 },
  { label: '4:3', r: 4 / 3 },
  { label: '3:4', r: 3 / 4 },
  { label: '16:9', r: 16 / 9 },
  { label: '9:16', r: 9 / 16 }
];
const CROP_MIN = 0.03; // tamaño mínimo del recuadro (fracción de la imagen)

async function cropSourceBlob(ref) {
  if (isRemoteImage(ref)) {
    const r = await fetch(ref);
    if (!r.ok) throw new Error('imagen');
    return r.blob();
  }
  return (await ImageStore.get(ref).catch(() => null)) || await xferImageBlob(ref);
}

function cropModal() {
  let m = document.getElementById('cropModal');
  if (m) return m;
  m = document.createElement('div');
  m.className = 'modal-backdrop';
  m.id = 'cropModal';
  m.innerHTML = `
    <div class="modal-card crop-card">
      <div class="modal-header">
        <h2>✂️ Recortar imagen</h2>
        <button class="modal-close-btn" type="button" data-close aria-label="Cerrar">&times;</button>
      </div>
      <div class="crop-body">
        <div class="crop-stage">
          <div class="crop-frame">
            <img class="crop-img" alt="" draggable="false">
            <div class="crop-box">
              ${['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(h => `<span class="crop-handle crop-${h}" data-h="${h}"></span>`).join('')}
            </div>
          </div>
        </div>
        <div class="crop-ratios">${CROP_RATIOS.map((x, i) => `<button type="button" class="btn btn-ghost btn-sm" data-ratio="${i}">${x.label}</button>`).join('')}</div>
        <div class="crop-actions">
          <span class="crop-size"></span>
          <button type="button" class="btn btn-ghost" data-reset>Toda la imagen</button>
          <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
          <button type="button" class="btn btn-primary" data-apply>Recortar</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(m);
  return m;
}

async function openCropTool(imgId) {
  const img = bgImageData(imgId);
  if (!img) return;
  const ref = bgImageRef(img);
  let blob;
  try {
    blob = await cropSourceBlob(ref);
    if (!blob) throw new Error('sin imagen');
  } catch (e) {
    showToast('No se pudo abrir esa imagen para recortarla. Revisa tu conexión e inténtalo de nuevo.', 'warning');
    return;
  }
  let bmp;
  try { bmp = await createImageBitmap(blob); } catch (e) {
    showToast('Esa imagen no se puede recortar (formato no compatible).', 'warning');
    return;
  }
  const NW = bmp.width, NH = bmp.height;

  const m = cropModal();
  const frame = m.querySelector('.crop-frame');
  const imgEl = m.querySelector('.crop-img');
  const box = m.querySelector('.crop-box');
  const sizeEl = m.querySelector('.crop-size');
  const url = URL.createObjectURL(blob);
  imgEl.src = url;

  // Recuadro en fracciones de la imagen (0 a 1)
  let c = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
  let ratio = 0;
  const paint = () => {
    box.style.left = `${c.x * 100}%`;
    box.style.top = `${c.y * 100}%`;
    box.style.width = `${c.w * 100}%`;
    box.style.height = `${c.h * 100}%`;
    sizeEl.textContent = `${Math.round(c.w * NW)} × ${Math.round(c.h * NH)} px`;
    m.querySelectorAll('[data-ratio]').forEach(b => b.classList.toggle('is-active', CROP_RATIOS[Number(b.dataset.ratio)].r === ratio));
  };
  // Alto (en fracción) que corresponde a un ancho con la proporción elegida
  const hFor = (w) => w * NW / (NH * ratio);
  const wFor = (h) => h * NH * ratio / NW;
  const fitRatio = () => {
    if (!ratio) return;
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    let w = c.w, h = hFor(w);
    if (h > 1) { h = 1; w = wFor(h); }
    if (w > 1) { w = 1; h = hFor(w); }
    c = { w, h, x: markClamp(cx - w / 2, 0, 1 - w), y: markClamp(cy - h / 2, 0, 1 - h) };
  };

  m.querySelector('.crop-ratios').onclick = (e) => {
    const b = e.target.closest('[data-ratio]');
    if (!b) return;
    ratio = CROP_RATIOS[Number(b.dataset.ratio)].r;
    fitRatio();
    paint();
  };

  // Arrastrar el recuadro (moverlo) o una manija (cambiar su tamaño)
  box.onpointerdown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.target.closest('[data-h]');
    const h = handle ? handle.dataset.h : '';
    const rect = frame.getBoundingClientRect();
    const start = { ...c }, sx = e.clientX, sy = e.clientY;
    box.setPointerCapture(e.pointerId);
    const onMove = (ev) => {
      const dx = (ev.clientX - sx) / rect.width;
      const dy = (ev.clientY - sy) / rect.height;
      if (!h) {
        c = { ...start, x: markClamp(start.x + dx, 0, 1 - start.w), y: markClamp(start.y + dy, 0, 1 - start.h) };
      } else {
        let { x, y, w, h: hh } = start;
        const right = start.x + start.w, bottom = start.y + start.h;
        if (h.includes('w')) { x = markClamp(start.x + dx, 0, right - CROP_MIN); w = right - x; }
        if (h.includes('e')) { w = markClamp(start.w + dx, CROP_MIN, 1 - start.x); }
        if (h.includes('n')) { y = markClamp(start.y + dy, 0, bottom - CROP_MIN); hh = bottom - y; }
        if (h.includes('s')) { hh = markClamp(start.h + dy, CROP_MIN, 1 - start.y); }
        if (ratio) {
          // Con proporción fija manda el lado que se arrastra (en las esquinas, el ancho)
          if (h === 'n' || h === 's') {
            w = wFor(hh);
            if (start.x + w > 1) { w = 1 - start.x; hh = hFor(w); }
          } else {
            hh = hFor(w);
            const maxH = h.includes('n') ? bottom : 1 - start.y;
            if (hh > maxH) { hh = maxH; w = wFor(hh); }
            if (h.includes('w')) x = right - w;
          }
          if (h.includes('n')) y = bottom - hh;
        }
        c = { x, y, w, h: hh };
      }
      paint();
    };
    const onUp = () => {
      box.removeEventListener('pointermove', onMove);
      box.removeEventListener('pointerup', onUp);
      box.removeEventListener('pointercancel', onUp);
    };
    box.addEventListener('pointermove', onMove);
    box.addEventListener('pointerup', onUp);
    box.addEventListener('pointercancel', onUp);
  };

  const close = () => {
    m.style.display = 'none';
    document.removeEventListener('keydown', onKey, true);
    URL.revokeObjectURL(url);
    bmp.close();
  };
  const apply = async () => {
    const sx = Math.round(c.x * NW), sy = Math.round(c.y * NH);
    const sw = Math.max(1, Math.round(c.w * NW)), sh = Math.max(1, Math.round(c.h * NH));
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    canvas.getContext('2d').drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
    const type = blob.type === 'image/png' ? 'image/png' : 'image/webp';
    const out = await new Promise(res => canvas.toBlob(res, type, 0.92));
    close();
    if (!out) { showToast('No se pudo recortar la imagen.', 'warning'); return; }
    const target = bgImageData(imgId);
    if (!target) return;
    const { id: fileId } = await storeImageFile(new File([out], 'recorte', { type }));
    // Queda en el mismo lugar del lienzo: la parte recortada no se mueve
    target.x = Math.round(target.x + c.x * target.w);
    target.y = Math.round(target.y + c.y * target.h);
    target.w = Math.max(10, Math.round(c.w * target.w));
    target.h = Math.max(10, Math.round(c.h * target.h));
    target.src = fileId;
    // Los destacados se ajustan al recorte (los que quedan fuera se quitan)
    if (Array.isArray(target.marks)) {
      target.marks = target.marks.map(mk => {
        const x1 = markClamp((mk.x - c.x) / c.w, 0, 1), y1 = markClamp((mk.y - c.y) / c.h, 0, 1);
        const x2 = markClamp((mk.x + mk.w - c.x) / c.w, 0, 1), y2 = markClamp((mk.y + mk.h - c.y) / c.h, 0, 1);
        return { ...mk, x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      }).filter(mk => mk.w >= 0.01 && mk.h >= 0.01);
    }
    // Si el nombre estaba guardado a mano (Biblioteca), el recorte lo conserva
    if (target.name && imageNameEntries().some(e => e.id === ref)) setSavedImageName(fileId, target.name);
    persist();
    renderBgImages();
    updateContextBar();
    showToast('Imagen recortada. Ctrl+Z para deshacer.', 'success');
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); apply(); }
  };
  m.onclick = (e) => {
    if (e.target.closest('[data-close]')) close();
    else if (e.target.closest('[data-apply]')) apply();
    else if (e.target.closest('[data-reset]')) { ratio = 0; c = { x: 0, y: 0, w: 1, h: 1 }; paint(); }
  };
  document.addEventListener('keydown', onKey, true);
  paint();
  m.style.display = 'flex';
}

document.getElementById('ctxImgCrop').addEventListener('click', () => {
  const first = selectedImages()[0];
  if (first) openCropTool(first.id);
});
