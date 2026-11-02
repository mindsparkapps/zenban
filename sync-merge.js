// ===== ZenBan - Combinar datos entre dispositivos =====
// Funciones puras (sin estado de la app): combinación en tres vías de proyectos, tareas, etiquetas y
// borrados. Las usan la sincronización (sync.js), la mezcla entre ventanas (app.js) y los tests del conector.

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Combina listas de objetos con id (tareas, columnas, tableros, dibujos, imágenes):
// lo que cambió solo aquí se queda, lo que cambió solo en Drive se trae, y si cambió en ambos gana lo de aquí
function mergeArrays(L, R, B) {
  L = L || [];
  R = R || [];
  const hasIds = arr => arr.every(x => x && typeof x === 'object' && x.id != null);
  if (!hasIds(L) || !hasIds(R) || (B && !hasIds(B))) return B && sameJson(L, B) ? R : L;
  const lm = new Map(L.map(x => [x.id, x]));
  const rm = new Map(R.map(x => [x.id, x]));
  const bm = new Map((B || []).map(x => [x.id, x]));
  const out = new Map();
  for (const id of new Set([...lm.keys(), ...rm.keys(), ...bm.keys()])) {
    const l = lm.get(id), r = rm.get(id), b = bm.get(id);
    let v;
    if (!B || b === undefined) v = l !== undefined ? l : r;
    else if (sameJson(l, b)) v = r;
    else if (sameJson(r, b)) v = l;
    else v = l !== undefined ? l : r; // cambió en ambos lados; si uno lo borró y el otro lo editó, se conserva la edición
    if (v !== undefined) out.set(id, v);
  }
  // Si aquí no se cambió el orden, se respeta el orden que viene de Drive
  const common = id => lm.has(id) && rm.has(id) && bm.has(id);
  const localOrderKept = B && sameJson(L.map(x => x.id).filter(common), B.map(x => x.id).filter(common));
  const order = localOrderKept ? [...R, ...L] : [...L, ...R];
  const result = [];
  const seen = new Set();
  order.forEach(x => {
    if (out.has(x.id) && !seen.has(x.id)) {
      seen.add(x.id);
      result.push(out.get(x.id));
    }
  });
  return result;
}

function mergeProject(l, r, b) {
  const out = {};
  const newer = (l.updatedAt || 0) >= (r.updatedAt || 0) ? l : r;
  const older = newer === l ? r : l;
  for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
    if (k === 'updatedAt') continue;
    if (Array.isArray(l[k]) || Array.isArray(r[k])) out[k] = mergeArrays(l[k], r[k], b ? b[k] : null);
    else if (b) out[k] = sameJson(l[k], b[k]) ? r[k] : l[k];
    else out[k] = k in newer ? newer[k] : older[k];
  }
  out.updatedAt = Math.max(l.updatedAt || 0, r.updatedAt || 0);
  return out;
}

// Etiquetas: combinación en tres vías por id (como las tareas), para que una etiqueta borrada o
// renombrada en otro dispositivo (o desde el conector de Claude) no reaparezca. Sin ids, unión por nombre.
function mergeTags(L, R, B) {
  L = L || [];
  R = R || [];
  const withIds = arr => arr.every(t => t && t.id != null);
  const merged = withIds(L) && withIds(R) && (!B || withIds(B))
    ? mergeArrays(L, R, B)
    : [...R, ...L];
  const seen = new Map();
  merged.forEach(t => {
    const key = String(t.name || '').toLowerCase();
    if (!seen.has(key) || L.includes(t)) seen.set(key, t);
  });
  return [...seen.values()];
}

function mergePayloads(local, remote, base = null) {
  // Un borrado solo cuenta del lado que ya no tiene el proyecto: si un lado tiene el proyecto y
  // también su borrado, ese borrado quedó viejo (el proyecto siguió vivo) y se ignora
  const tombs = new Map();
  [remote, local].forEach(side => {
    const alive = new Set((side.projects || []).map(p => p.id));
    (side.deletedProjects || []).forEach(t => {
      if (alive.has(t.id)) return;
      if (!tombs.has(t.id) || tombs.get(t.id) < t.at) tombs.set(t.id, t.at);
    });
  });
  const lm = new Map((local.projects || []).map(p => [p.id, p]));
  const bm = new Map(((base && base.projects) || []).map(p => [p.id, p]));
  const merged = [];
  const seen = new Set();
  [...(remote.projects || []), ...(local.projects || [])].forEach(p => {
    if (seen.has(p.id)) return;
    seen.add(p.id);
    const l = lm.get(p.id);
    const r = (remote.projects || []).find(x => x.id === p.id);
    merged.push(l && r ? mergeProject(l, r, bm.get(p.id) || null) : (l || r));
  });

  // Un proyecto borrado no vuelve aunque otro dispositivo atrasado lo haya editado después (su copia
  // queda en las copias de seguridad de ese dispositivo). Solo vuelve si se recuperó a propósito
  // desde una copia de seguridad (restoredAt) después de borrarlo.
  const alive = merged.filter(p => !tombs.has(p.id) || (p.restoredAt || 0) > tombs.get(p.id));
  const kept = new Set(alive.map(p => p.id));
  return {
    version: 1,
    projects: alive,
    tags: mergeTags(local.tags, remote.tags, base ? base.tags : null),
    deletedProjects: [...tombs.entries()].filter(([id]) => !kept.has(id)).map(([id, at]) => ({ id, at }))
  };
}

function dataPart(p) {
  return { projects: p.projects || [], tags: p.tags || [], deletedProjects: p.deletedProjects || [] };
}
