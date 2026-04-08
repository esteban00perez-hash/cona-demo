// ── Home screen — mejengas list ──────────────────────────────────────────
let homeMejengasUnsub = null;
let mejengasCache = [];

function initHome() {
  const list = document.getElementById('homeList');
  if (list) list.innerHTML = '<div class="sh-loading">Cargando...</div>';

  if (homeMejengasUnsub) { homeMejengasUnsub(); homeMejengasUnsub = null; }

  let resolved = false;
  const timeoutId = setTimeout(() => {
    if (!resolved && list) list.innerHTML = '<div class="sh-empty">Tiempo de espera agotado.<br>Revisá tu conexión.</div>';
  }, 10000);

  homeMejengasUnsub = db.collection('mejengas')
    .orderBy('numero', 'desc')
    .onSnapshot(snapshot => {
      resolved = true;
      clearTimeout(timeoutId);
      mejengasCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderHomeList(mejengasCache);
    }, err => {
      resolved = true;
      clearTimeout(timeoutId);
      console.error(err);
      if (list) list.innerHTML = '<div class="sh-empty">Error al cargar mejengas.</div>';
    });
}

function renderHomeList(mejengas) {
  const list = document.getElementById('homeList');
  if (!list) return;

  if (mejengas.length === 0) {
    list.innerHTML = '<div class="sh-empty">No hay mejengas todavía.<br>Creá la primera arriba.</div>';
    return;
  }

  list.innerHTML = mejengas.map(m => {
    const parts = [];
    if (m.fecha) parts.push(formatFechaHome(m.fecha));
    if (m.lugar) parts.push(m.lugar);
    const meta = parts.map(p => escapeH(p)).join(' · ');
    const isFinished = !!m.finalizado;
    const badge = isFinished
      ? `<span class="sh-game-badge fin">Finalizada</span>`
      : '';
    const actionBtn = isFinished && m.reporteId
      ? `<button class="sh-report-btn" onclick="event.stopPropagation();selectMejengaRegistro('${m.id}')">Ver Reporte</button>`
      : '';
    return `<div class="sh-game-card${isFinished ? ' sh-game-card-done' : ''}" onclick="selectMejengaRegistro('${m.id}')">
      <div class="sh-game-num">${m.numero || '?'}</div>
      <div class="sh-game-info">
        <div class="sh-game-name">${escapeH(m.nombre || 'Mejenga')}${badge}</div>
        <div class="sh-game-meta">${meta || '&mdash;'}</div>
        ${actionBtn}
      </div>
      <div class="sh-game-arrow">&#8250;</div>
    </div>`;
  }).join('');
}

function selectMejengaRegistro(id) {
  const mejenga = mejengasCache.find(m => m.id === id);
  if (!mejenga) { console.warn('Mejenga not found in cache:', id); return; }
  if (mejenga.finalizado && mejenga.reporteId) {
    navigate('reporte');
    if (typeof initReporteFromId === 'function') initReporteFromId(mejenga.reporteId);
    return;
  }
  try { initRegistro(mejenga); } catch(e) { console.error('initRegistro error:', e); }
  navigate('registro');
}


function formatFechaHome(fechaStr) {
  if (!fechaStr) return '';
  const [y, m, d] = fechaStr.split('-').map(Number);
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${d} ${months[m - 1]} ${y}`;
}

function escapeH(t) {
  const el = document.createElement('div');
  el.textContent = String(t);
  return el.innerHTML;
}

function viewFinishedReport() {
  const banner = document.getElementById('finishedBanner');
  if (!banner) return;
  const id = banner.dataset.id;
  if (!id) return;
  navigate('reporte');
  if (typeof initReporteFromId === 'function') initReporteFromId(id);
}

// ── Deep link: ?mejenga=ID auto-navigates to that mejenga ───────────────
function checkDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const mejengaId = params.get('mejenga');
  if (!mejengaId) return;
  // Clean URL without reloading
  window.history.replaceState({}, '', window.location.pathname);
  // Fetch mejenga data and navigate
  db.collection('mejengas').doc(mejengaId).get().then(doc => {
    if (!doc.exists) return;
    const data = { id: doc.id, ...doc.data() };
    if (data.finalizado && data.reporteId) {
      navigate('reporte');
      if (typeof initReporteFromId === 'function') initReporteFromId(data.reporteId);
    } else {
      try { initRegistro(data); } catch(e) { console.error(e); }
      navigate('registro');
    }
  }).catch(err => console.error('Deep link error:', err));
}

// ── Crear screen ─────────────────────────────────────────────────────────
let nextMejengaNumero = 1;

function goToCrear() {
  // Reset form
  ['crearNombre','crearFecha','crearHora','crearLugar','crearMaxJ','crearMaxP','crearCosto'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('error');
  });
  const errEl = document.getElementById('crearError');
  if (errEl) errEl.textContent = '';
  const btn = document.getElementById('crearBtn');
  if (btn) { btn.disabled = false; btn.textContent = 'Crear Mejenga'; }

  // Auto-name: get next numero from Firebase
  db.collection('mejengas').orderBy('numero', 'desc').limit(1).get()
    .then(snap => {
      nextMejengaNumero = snap.empty ? 1 : ((snap.docs[0].data().numero || 0) + 1);
      const nameEl = document.getElementById('crearNombre');
      if (nameEl) nameEl.value = 'Mejenga ' + nextMejengaNumero;
    })
    .catch(() => {
      nextMejengaNumero = 1;
      const nameEl = document.getElementById('crearNombre');
      if (nameEl) nameEl.value = 'Mejenga 1';
    });

  // Set today as default date and current time
  const today = new Date();
  const fechaEl = document.getElementById('crearFecha');
  if (fechaEl && !fechaEl.value) {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    fechaEl.value = `${y}-${m}-${d}`;
  }

  navigate('crear');
}

function crearMejenga() {
  const nombre = document.getElementById('crearNombre').value.trim();
  const fecha  = document.getElementById('crearFecha').value;
  const hora   = document.getElementById('crearHora').value;
  const lugar  = document.getElementById('crearLugar').value.trim();
  const maxJ   = parseInt(document.getElementById('crearMaxJ').value) || 12;
  const maxP   = parseInt(document.getElementById('crearMaxP').value) || 2;
  const costo  = parseInt(document.getElementById('crearCosto').value) || 3500;
  const errEl  = document.getElementById('crearError');

  // Validate required fields
  let valid = true;
  [
    { id: 'crearNombre', val: nombre },
    { id: 'crearFecha',  val: fecha  },
    { id: 'crearLugar',  val: lugar  },
  ].forEach(({ id, val }) => {
    const el = document.getElementById(id);
    if (!val) { el.classList.add('error'); valid = false; }
    else el.classList.remove('error');
  });

  if (!valid) {
    if (errEl) errEl.textContent = 'Completá todos los campos obligatorios.';
    return;
  }
  if (errEl) errEl.textContent = '';

  const btn = document.getElementById('crearBtn');
  btn.disabled = true;
  btn.textContent = 'Creando...';

  db.collection('mejengas').add({
    nombre,
    numero:      nextMejengaNumero,
    fecha,
    hora,
    lugar,
    maxJugadores: maxJ,
    maxPorteros:  maxP,
    costo,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  })
  .then(docRef => {
    const mejengaData = {
      id: docRef.id,
      nombre,
      numero:      nextMejengaNumero,
      fecha,
      hora,
      lugar,
      maxJugadores: maxJ,
      maxPorteros:  maxP,
      costo
    };
    try {
      initRegistro(mejengaData);
    } catch(e) {
      console.error('initRegistro error:', e);
    }
    navigate('registro');
  })
  .catch(err => {
    console.error('Firebase create error:', err);
    if (errEl) errEl.textContent = 'Error al crear. Intentá de nuevo.';
    btn.disabled = false;
    btn.textContent = 'Crear Mejenga';
  });
}
