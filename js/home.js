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

  // Group by state
  const enVivo = mejengas.filter(m => m.enCurso === true && !m.finalizado);
  const activas = mejengas.filter(m => !m.enCurso && !m.finalizado);
  const finalizadas = mejengas.filter(m => m.finalizado === true);

  let html = '';

  if (enVivo.length > 0) {
    html += '<div class="sh-section-label sh-live-label"><span class="sh-live-dot"></span>En Vivo</div>';
    html += enVivo.map(m => renderMejengaCard(m, 'vivo')).join('');
  }
  if (activas.length > 0) {
    html += '<div class="sh-section-label">Próximas</div>';
    html += activas.map(m => renderMejengaCard(m, 'activa')).join('');
  }
  if (finalizadas.length > 0) {
    html += '<div class="sh-section-label">Finalizadas</div>';
    html += finalizadas.map(m => renderMejengaCard(m, 'final')).join('');
  }

  list.innerHTML = html;
}

function renderMejengaCard(m, state) {
  const parts = [];
  if (m.fecha) parts.push(formatFechaHome(m.fecha));
  if (m.lugar) parts.push(m.lugar);
  const meta = parts.map(p => escapeH(p)).join(' · ');

  let badge = '';
  let cardClass = '';
  let action = '';

  if (state === 'vivo') {
    badge = `<span class="sh-game-badge live"><span class="sh-game-live-dot"></span>En vivo</span>`;
    cardClass = ' sh-game-card-live';
    action = `onclick="jumpToLiveOrganizador('${m.id}')"`;
  } else if (state === 'final') {
    badge = `<span class="sh-game-badge fin">Finalizada</span>`;
    cardClass = ' sh-game-card-done';
    action = `onclick="viewMejengaReport('${m.id}')"`;
  } else {
    badge = `<span class="sh-game-badge open">Abierta</span>`;
    action = `onclick="selectMejengaRegistro('${m.id}')"`;
  }

  return `<div class="sh-game-card${cardClass}" ${action}>
    <div class="sh-game-num">${m.numero || '?'}</div>
    <div class="sh-game-info">
      <div class="sh-game-name">${escapeH(m.nombre || 'Mejenga')}${badge}</div>
      <div class="sh-game-meta">${meta || '&mdash;'}</div>
    </div>
    <div class="sh-game-arrow">&#8250;</div>
  </div>`;
}

function selectMejengaRegistro(id) {
  const mejenga = mejengasCache.find(m => m.id === id);
  if (!mejenga) { console.warn('Mejenga not found in cache:', id); return; }
  try { initRegistro(mejenga); } catch(e) { console.error('initRegistro error:', e); }
  navigate('registro');
}

function viewMejengaReport(id) {
  const mejenga = mejengasCache.find(m => m.id === id);
  if (!mejenga) return;
  if (mejenga.reporteId) {
    navigate('reporte');
    if (typeof initReporteFromId === 'function') initReporteFromId(mejenga.reporteId);
  } else {
    alert('Esta mejenga no tiene reporte disponible.');
  }
}

// Direct jump to organizador for a live mejenga (bypasses registro/pagos/equipo)
function jumpToLiveOrganizador(id) {
  const mejenga = mejengasCache.find(m => m.id === id);
  if (!mejenga) return;
  // Set the current mejenga context so panel.js functions work
  if (typeof initRegistro === 'function') {
    try { initRegistro(mejenga); } catch(e) { console.error(e); }
  }
  // Open password gate → navigates to organizador on success,
  // and checkOrgRecovery() auto-fires from router to show recovery dialog
  if (typeof openPasswordGate === 'function') {
    openPasswordGate('organizador');
  } else {
    navigate('organizador');
  }
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
      // Always go to registro for deep links (invited players)
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
