// ── Organizador Panel ─────────────────────────────────────────────────────
// Password gate, pagos confirmation, and team setup before live tracking.
// Relies on jugadoresRef (set by registro.js's initRegistro) and
// mejengaCache (set by home.js) for the current mejenga context.

const ORG_PANEL_PASS = 'messi';

// ── Password modal ───────────────────────────────────────────────────────

function openOrgPanel() {
  const overlay = document.getElementById('opOverlay');
  const input   = document.getElementById('opInput');
  const errEl   = document.getElementById('opError');
  if (!overlay) return;
  errEl.textContent = '';
  input.value = '';
  overlay.classList.remove('hidden');
  setTimeout(() => input.focus(), 100);
}

function closeOrgPanel() {
  document.getElementById('opOverlay').classList.add('hidden');
}

function checkOrgPass() {
  const val   = document.getElementById('opInput').value;
  const errEl = document.getElementById('opError');
  if (val.toLowerCase() === ORG_PANEL_PASS) {
    closeOrgPanel();
    // Unlock organizer mode — persists until reload
    window.isOrganizer = true;
    sessionStorage.setItem('cona_org_mode', '1');
    // Check if this mejenga is live — jump directly to the live tracker
    const cur = (typeof currentMejengaData !== 'undefined') ? currentMejengaData : null;
    if (cur && cur.enCurso && !cur.finalizado) {
      jumpToLiveFromPassword(cur);
      return;
    }
    // Otherwise go to the next logical step: Pagos
    window.navigate('pagos');
  } else {
    errEl.textContent = 'Contraseña incorrecta';
    const card = document.getElementById('opCard');
    card.classList.add('op-shake');
    setTimeout(() => card.classList.remove('op-shake'), 400);
  }
}

// Jump to organizador for a live mejenga (fetches state from Firestore)
function jumpToLiveFromPassword(mejenga) {
  _origNavigate('organizador');
  // Try localStorage first
  if (typeof loadState === 'function' && loadState()) {
    if (typeof resumeState === 'function') resumeState();
    return;
  }
  // Fetch from Firestore — try direct ref first, then search
  const tryDirect = mejenga.organizadorMejengaId
    ? db.collection('mejengas_organizador').doc(mejenga.organizadorMejengaId).get()
        .then(doc => doc.exists ? doc : null)
    : Promise.resolve(null);

  tryDirect.then(doc => {
    if (doc) return doc;
    // Fallback: search by registroMejengaId field (no orderBy to avoid needing composite index)
    return db.collection('mejengas_organizador')
      .where('registroMejengaId', '==', mejenga.id)
      .get()
      .then(snap => {
        if (snap.empty) return null;
        // Pick the most recent by ts field
        const docs = snap.docs.sort((a,b) => (b.data().ts||0) - (a.data().ts||0));
        return docs[0];
      });
  }).then(doc => {
    if (!doc) {
      alert('No se encontró el estado de esta mejenga en vivo en Firebase. Podés iniciar una nueva desde Equipos.');
      _origNavigate('registro');
      return;
    }
    if (typeof loadStateFromFirestore === 'function') {
      loadStateFromFirestore(doc.data());
      if (typeof resumeState === 'function') resumeState();
    }
  }).catch(err => {
    console.error('Error loading live state:', err);
    alert('Error cargando la mejenga en vivo: ' + (err.message || err));
  });
}

// Restore organizer mode on page reload within same session
if (sessionStorage.getItem('cona_org_mode') === '1') {
  window.isOrganizer = true;
}

// ── ORGANIZER STEPPER ────────────────────────────────────────────────
// Persistent navigation between Registro → Pagos → Equipos → Iniciar
// Visible only when the user has entered the organizer password
function updateOrgStepper() {
  const activeScreen = document.querySelector('.screen.active');
  if (!activeScreen) return;
  const screenId = activeScreen.id; // screen-registro, screen-pagos, etc.
  const onStepperScreen = ['screen-registro', 'screen-pagos', 'screen-equipo'].includes(screenId);

  // Remove any existing stepper
  document.querySelectorAll('.org-stepper').forEach(el => el.remove());

  if (!window.isOrganizer || !onStepperScreen) return;

  const stepperHtml = `
    <div class="org-stepper">
      <div class="org-stepper-inner">
        <div class="org-step ${screenId === 'screen-registro' ? 'active' : ''}" onclick="orgStepperNav('registro')">
          <div class="org-step-num">1</div>
          <div class="org-step-lbl">Registro</div>
        </div>
        <div class="org-step-sep"></div>
        <div class="org-step ${screenId === 'screen-pagos' ? 'active' : ''}" onclick="orgStepperNav('pagos')">
          <div class="org-step-num">2</div>
          <div class="org-step-lbl">Pagos</div>
        </div>
        <div class="org-step-sep"></div>
        <div class="org-step ${screenId === 'screen-equipo' ? 'active' : ''}" onclick="orgStepperNav('equipo')">
          <div class="org-step-num">3</div>
          <div class="org-step-lbl">Equipos</div>
        </div>
        <div class="org-step-sep"></div>
        <div class="org-step go" onclick="orgStepperStart()">
          <div class="org-step-num">▶</div>
          <div class="org-step-lbl">Iniciar</div>
        </div>
      </div>
    </div>
  `;
  activeScreen.insertAdjacentHTML('afterbegin', stepperHtml);
}

function orgStepperNav(dest) {
  _origNavigate(dest);
  if (dest === 'pagos') initPagos();
  if (dest === 'equipo') initEquipo();
  updateOrgStepper();
}

function orgStepperStart() {
  goToOrganizador();
}

document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('opInput');
  if (inp) {
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') checkOrgPass(); });
  }
});

// ── Choice modal ─────────────────────────────────────────────────────────
// DEPRECATED: The choice modal has been removed in favor of the persistent
// stepper. These functions are kept as no-ops for backwards compatibility.
function openChoice() { /* deprecated */ }

function goToReporteFromPanel() {
  closeChoice();
  // Look up fresh data from mejengasCache (always up-to-date via onSnapshot)
  const data = (typeof currentMejengaData !== 'undefined') ? currentMejengaData : null;
  const mejengaId = data && data.id;
  const cached = mejengaId && typeof mejengasCache !== 'undefined'
    ? mejengasCache.find(m => m.id === mejengaId)
    : null;
  const reporteId = (cached && cached.reporteId) || (data && data.reporteId);
  if (reporteId) {
    _origNavigate('reporte');
    if (typeof initReporteFromId === 'function') initReporteFromId(reporteId);
  } else {
    alert('Esta mejenga todavía no tiene reporte. Finalizá la mejenga desde el Organizador.');
  }
}

function closeChoice() { /* deprecated */ }

// ── Navigate override: init pagos/equipo screens on navigate ────────────
// Hook into router.js navigate by wrapping it.
const _origNavigate = navigate;
window.navigate = function(screen) {
  _origNavigate(screen);
  if (screen === 'pagos')  initPagos();
  if (screen === 'equipo') initEquipo();
  // Reset organizer mode when leaving the stepper screens
  if (screen === 'home') {
    window.isOrganizer = false;
    sessionStorage.removeItem('cona_org_mode');
  }
  updateOrgStepper();
};

// ── PAGOS SCREEN ─────────────────────────────────────────────────────────

function initPagos() {
  const list = document.getElementById('pagosList');
  const sub  = document.getElementById('pagosSubtitle');
  if (!list) return;

  const subtitle = document.getElementById('regSubtitle');
  if (sub && subtitle) sub.textContent = subtitle.textContent || '';

  if (typeof jugadoresRef === 'undefined' || !jugadoresRef) {
    list.innerHTML = '<div class="panel-empty">Abrí una mejenga primero.</div>';
    return;
  }

  list.innerHTML = '<div class="panel-empty">Cargando...</div>';

  jugadoresRef.orderBy('timestamp', 'asc').get().then(snap => {
    if (snap.empty) {
      list.innerHTML = '<div class="panel-empty">No hay jugadores registrados.</div>';
      return;
    }
    renderPagosList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }).catch(() => {
    list.innerHTML = '<div class="panel-empty">Error al cargar.</div>';
  });
}

function renderPagosList(players) {
  const list = document.getElementById('pagosList');
  if (!list) return;

  const active = players.filter(p => !p.banca);
  const banca  = players.filter(p => p.banca);

  let html = '';

  if (active.length > 0) {
    html += '<div class="panel-section-label">En lista</div>';
    html += active.map(p => pagosRow(p)).join('');
  }
  if (banca.length > 0) {
    html += '<div class="panel-section-label">Banca</div>';
    html += banca.map(p => pagosRow(p)).join('');
  }

  list.innerHTML = html || '<div class="panel-empty">No hay jugadores.</div>';
}

function pagosRow(p) {
  const pos  = p.position === 'portero' ? 'Portero' : 'Jugador';
  const paid = !!p.paid;
  return `<div class="pagos-row" id="prow-${p.id}">
    <div class="pagos-info">
      <div class="pagos-name">${escapePanel(p.name)}</div>
      <div class="pagos-pos">${pos}</div>
    </div>
    <button class="pagos-toggle ${paid ? 'paid' : 'unpaid'}"
            onclick="togglePago('${p.id}', ${paid})">
      ${paid ? 'Pagado' : 'Pendiente'}
    </button>
  </div>`;
}

function togglePago(playerId, currentlyPaid) {
  if (typeof jugadoresRef === 'undefined' || !jugadoresRef) return;
  const newVal = !currentlyPaid;
  jugadoresRef.doc(playerId).update({ paid: newVal }).then(() => {
    // Re-fetch and re-render
    initPagos();
  }).catch(err => console.error('togglePago error:', err));
}

// ── EQUIPO SCREEN ─────────────────────────────────────────────────────────

function initEquipo() {
  const list = document.getElementById('equipoList');
  const sub  = document.getElementById('equipoSubtitle');
  if (!list) return;

  const subtitle = document.getElementById('regSubtitle');
  if (sub && subtitle) sub.textContent = subtitle.textContent || '';

  if (typeof jugadoresRef === 'undefined' || !jugadoresRef) {
    list.innerHTML = '<div class="panel-empty">Abrí una mejenga primero.</div>';
    return;
  }

  list.innerHTML = '<div class="panel-empty">Cargando...</div>';

  jugadoresRef.orderBy('timestamp', 'asc').get().then(snap => {
    if (snap.empty) {
      list.innerHTML = '<div class="panel-empty">No hay jugadores registrados.</div>';
      return;
    }
    renderEquipoList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }).catch(() => {
    list.innerHTML = '<div class="panel-empty">Error al cargar.</div>';
  });
}

function renderEquipoList(players) {
  const list = document.getElementById('equipoList');
  if (!list) return;

  const active  = players.filter(p => !p.banca);
  const porteros = active.filter(p => p.position === 'portero');
  const jugadores = active.filter(p => p.position === 'jugador');
  const unassigned = active.filter(p => !p.equipo || (p.equipo !== 1 && p.equipo !== 2));

  let html = '';

  if (unassigned.length > 0) {
    html += '<div class="equipo-warning">Faltan ' + unassigned.length + ' jugador' +
            (unassigned.length > 1 ? 'es' : '') + ' sin equipo asignado</div>';
  } else if (active.length > 0) {
    html += '<div class="equipo-ready">Todos los jugadores asignados</div>';
  }

  if (porteros.length > 0) {
    html += '<div class="panel-section-label">Porteros</div>';
    html += porteros.map(p => equipoRow(p, true)).join('');
  }
  if (jugadores.length > 0) {
    html += '<div class="panel-section-label">Jugadores de Campo</div>';
    html += jugadores.map(p => equipoRow(p, false)).join('');
  }

  list.innerHTML = html || '<div class="panel-empty">No hay jugadores.</div>';
}

function equipoRow(p, isPortero) {
  const eq = p.equipo || 0; // 0=unassigned, 1=negro, 2=verde
  const num = p.numero || '';
  return `<div class="equipo-row" id="erow-${p.id}">
    <div class="equipo-info">
      <div class="equipo-name">${escapePanel(p.name)}</div>
      ${!isPortero ? `<input class="equipo-num-input"
        type="number" min="1" max="99" placeholder="#"
        value="${escapePanel(String(num))}"
        onchange="updateNumero('${p.id}', this.value)"
        oninput="this.value=this.value.slice(0,2)">` : '<span class="equipo-gk-badge">GK</span>'}
    </div>
    <div class="equipo-team-btns">
      <button class="eq-btn t1-btn ${eq === 1 ? 'active' : ''}"
              onclick="updateEquipo('${p.id}', 1, this)">Negro</button>
      <button class="eq-btn t2-btn ${eq === 2 ? 'active' : ''}"
              onclick="updateEquipo('${p.id}', 2, this)">Verde</button>
    </div>
  </div>`;
}

function updateEquipo(playerId, equipo, btn) {
  if (typeof jugadoresRef === 'undefined' || !jugadoresRef) return;
  jugadoresRef.doc(playerId).update({ equipo }).then(() => {
    // Update buttons in the row
    const row = document.getElementById('erow-' + playerId);
    if (!row) return;
    row.querySelectorAll('.eq-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }).catch(err => console.error('updateEquipo error:', err));
}

function updateNumero(playerId, val) {
  if (typeof jugadoresRef === 'undefined' || !jugadoresRef) return;
  const num = parseInt(val);
  if (isNaN(num) || num < 1 || num > 99) return;
  jugadoresRef.doc(playerId).update({ numero: num })
    .catch(err => console.error('updateNumero error:', err));
}

function goToOrganizador() {
  if (typeof jugadoresRef === 'undefined' || !jugadoresRef) {
    navigate('organizador');
    return;
  }

  const mejengaData = (typeof currentMejengaData !== 'undefined' && currentMejengaData)
    ? currentMejengaData
    : { nombre: document.getElementById('regSubtitle')?.textContent || 'Mejenga', lugar: '' };

  jugadoresRef.orderBy('timestamp', 'asc').get().then(snap => {
    const players = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const active = players.filter(p => !p.banca);
    const unassigned = active.filter(p => !p.equipo || (p.equipo !== 1 && p.equipo !== 2));

    if (unassigned.length > 0) {
      const names = unassigned.map(p => p.name).join(', ');
      alert('Faltan ' + unassigned.length + ' jugador' + (unassigned.length > 1 ? 'es' : '') +
            ' sin equipo asignado:\n\n' + names +
            '\n\nAsigná todos los jugadores a Negro o Verde antes de iniciar.');
      return;
    }

    // Activate the organizador screen first
    _origNavigate('organizador');
    // Then immediately launch the live match — no timeout needed
    startFromRegistro(mejengaData, players);
  }).catch(err => {
    console.error('goToOrganizador error:', err);
    _origNavigate('organizador');
  });
}

// ── Util ──────────────────────────────────────────────────────────────────

function escapePanel(str) {
  const el = document.createElement('div');
  el.textContent = String(str || '');
  return el.innerHTML;
}
