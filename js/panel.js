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
  // Suppress auto-recovery check so it doesn't use stale localStorage
  window._suppressOrgRecovery = true;
  _origNavigate('organizador');
  window._suppressOrgRecovery = false;

  // Try localStorage FIRST — but only if it matches this specific mejenga
  if (typeof loadState === 'function' && loadState(mejenga.id)) {
    if (typeof resumeState === 'function') resumeState();
    return;
  }

  // Fetch from Firestore — try direct ref first, then search by registroMejengaId
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
      // No saved state — offer to start fresh from equipos
      alert('Esta mejenga no tiene sesión en vivo guardada todavía. Te llevamos a Equipos para iniciarla.');
      _origNavigate('equipo');
      if (typeof initEquipo === 'function') initEquipo();
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

// Current snapshot of players on the equipo screen
let _equipoPlayers = [];

function renderEquipoList(players) {
  _equipoPlayers = players;
  const list = document.getElementById('equipoList');
  if (!list) return;

  const active = players.filter(p => !p.banca);
  const unassigned = active.filter(p => !p.equipo || (p.equipo !== 1 && p.equipo !== 2));
  const negro = active.filter(p => p.equipo === 1);
  const verde = active.filter(p => p.equipo === 2);

  let html = '';

  // Status banner
  if (unassigned.length > 0) {
    html += '<div class="equipo-warning">Faltan ' + unassigned.length + ' sin asignar — tap para elegir equipo</div>';
  } else if (active.length > 0) {
    html += '<div class="equipo-ready">Equipos listos &middot; ' + negro.length + 'v' + verde.length + '</div>';
  }

  // Unassigned players — tap chip to show quick team picker
  if (unassigned.length > 0) {
    html += '<div class="eq-group unassigned">';
    html += '<div class="eq-group-hd"><span class="eq-group-ti">Sin asignar</span></div>';
    html += '<div class="eq-chips">';
    unassigned.forEach(p => {
      html += equipoChip(p, 0);
    });
    html += '</div></div>';
  }

  // Equipo Negro group
  html += '<div class="eq-group t1">';
  html += '<div class="eq-group-hd"><span class="eq-dot t1"></span><span class="eq-group-ti">Equipo Negro</span><span class="eq-count">' + negro.length + '</span></div>';
  if (negro.length === 0) {
    html += '<div class="eq-empty">Sin jugadores</div>';
  } else {
    html += '<div class="eq-chips">';
    negro.forEach(p => { html += equipoChip(p, 1); });
    html += '</div>';
  }
  html += '</div>';

  // Equipo Verde group
  html += '<div class="eq-group t2">';
  html += '<div class="eq-group-hd"><span class="eq-dot t2"></span><span class="eq-group-ti">Equipo Verde</span><span class="eq-count">' + verde.length + '</span></div>';
  if (verde.length === 0) {
    html += '<div class="eq-empty">Sin jugadores</div>';
  } else {
    html += '<div class="eq-chips">';
    verde.forEach(p => { html += equipoChip(p, 2); });
    html += '</div>';
  }
  html += '</div>';

  // Share + legend footer
  if (unassigned.length === 0 && active.length > 0) {
    html += '<button class="eq-share-btn" onclick="shareEquipos()">Compartir equipos</button>';
  }
  html += '<div class="eq-hint">Tap un chip para cambiarlo de equipo</div>';

  list.innerHTML = html || '<div class="panel-empty">No hay jugadores.</div>';
}

function equipoChip(p, currentTeam) {
  const pos = p.position === 'portero' ? 'POR' : '';
  const posTag = pos ? `<span class="eq-chip-pos">${pos}</span>` : '';
  return `<button type="button" class="eq-chip t${currentTeam}" onclick="cycleEquipo('${p.id}')">
    <span class="eq-chip-name">${escapePanel(p.name)}</span>${posTag}
  </button>`;
}

// Tap a chip → cycle its team: unassigned → negro → verde → unassigned
function cycleEquipo(playerId) {
  if (!jugadoresRef) return;
  const p = _equipoPlayers.find(x => x.id === playerId);
  if (!p) return;
  const cur = p.equipo || 0;
  const next = cur === 0 ? 1 : cur === 1 ? 2 : 0;
  jugadoresRef.doc(playerId).update({ equipo: next }).then(() => {
    // Refresh local data then re-render
    p.equipo = next;
    renderEquipoList(_equipoPlayers);
  }).catch(err => console.error('cycleEquipo error:', err));
}

function shareEquipos() {
  const active = _equipoPlayers.filter(p => !p.banca);
  const negro = active.filter(p => p.equipo === 1);
  const verde = active.filter(p => p.equipo === 2);
  const title = document.getElementById('regSubtitle')?.textContent || 'Mejenga';
  let text = '*Equipos ' + title + '*\n\n';
  text += '*EQUIPO NEGRO*\n';
  if (negro.length === 0) {
    text += '(vacio)\n';
  } else {
    negro.forEach(p => {
      const pos = p.position === 'portero' ? ' (POR)' : '';
      text += '- ' + p.name + pos + '\n';
    });
  }
  text += '\n*EQUIPO VERDE*\n';
  if (verde.length === 0) {
    text += '(vacio)\n';
  } else {
    verde.forEach(p => {
      const pos = p.position === 'portero' ? ' (POR)' : '';
      text += '- ' + p.name + pos + '\n';
    });
  }
  text += '\nCona Futbol';

  // Try native share, fallback to WhatsApp URL, fallback to clipboard
  if (navigator.share) {
    navigator.share({ title: 'Equipos ' + title, text: text })
      .catch(err => {
        if (err.name !== 'AbortError') fallbackShareEquipos(text);
      });
  } else {
    fallbackShareEquipos(text);
  }
}

function fallbackShareEquipos(text) {
  // Open WhatsApp with pre-filled text, or copy to clipboard
  const waUrl = 'https://wa.me/?text=' + encodeURIComponent(text);
  // Try clipboard first
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      alert('Equipos copiados al portapapeles. Pegá en WhatsApp para compartir.');
    }).catch(() => window.open(waUrl, '_blank'));
  } else {
    window.open(waUrl, '_blank');
  }
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
