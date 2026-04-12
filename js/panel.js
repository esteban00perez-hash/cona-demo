// ── Organizador Panel ─────────────────────────────────────────────────────
// Password gate, pagos confirmation, and team setup before live tracking.
// Relies on jugadoresRef (set by registro.js's initRegistro) and
// mejengaCache (set by home.js) for the current mejenga context.

const ORG_PANEL_PASS = 'messi';

// ── Password modal ───────────────────────────────────────────────────────

function openOrgPanel() {
  // If already organizer, skip the password modal and act directly
  if (window.isOrganizer) {
    // If viewing a live mejenga — jump directly to the tracker
    const cur = (typeof currentMejengaData !== 'undefined') ? currentMejengaData : null;
    if (cur && cur.enCurso && !cur.finalizado) {
      jumpToLiveFromPassword(cur);
      return;
    }
    // Otherwise go to pagos (the first organizer step)
    window.navigate('pagos');
    return;
  }
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
  console.log('[live] jumpToLiveFromPassword:', mejenga.id, mejenga.organizadorMejengaId);

  // Suppress auto-recovery check so it doesn't use stale localStorage
  window._suppressOrgRecovery = true;
  _origNavigate('organizador');
  window._suppressOrgRecovery = false;

  // Try localStorage FIRST — but only if it matches this specific mejenga
  if (typeof loadState === 'function' && loadState(mejenga.id)) {
    console.log('[live] loaded from localStorage');
    if (typeof resumeState === 'function') resumeState();
    return;
  }
  console.log('[live] localStorage empty/stale, fetching from Firestore');

  // Fetch from Firestore — try direct ref first, then search by registroMejengaId
  const tryDirect = mejenga.organizadorMejengaId
    ? db.collection('mejengas_organizador').doc(mejenga.organizadorMejengaId).get()
        .then(doc => {
          console.log('[live] direct fetch:', doc.exists);
          return doc.exists ? doc : null;
        })
    : Promise.resolve(null);

  tryDirect.then(doc => {
    if (doc) return doc;
    // Fallback: search by registroMejengaId field
    console.log('[live] searching mejengas_organizador by registroMejengaId=' + mejenga.id);
    return db.collection('mejengas_organizador')
      .where('registroMejengaId', '==', mejenga.id)
      .get()
      .then(snap => {
        console.log('[live] search result:', snap.empty ? 'empty' : (snap.size + ' docs'));
        if (snap.empty) return null;
        // Pick the most recent by ts field
        const docs = snap.docs.sort((a,b) => (b.data().ts||0) - (a.data().ts||0));
        return docs[0];
      });
  }).then(doc => {
    if (!doc) {
      console.warn('[live] no live state found for mejenga', mejenga.id);
      alert('Esta mejenga no tiene sesión en vivo guardada todavía.\n\nEsto puede pasar si se inició antes de los últimos cambios.\nTe llevamos a Equipos para iniciarla de nuevo.');
      _origNavigate('equipo');
      if (typeof initEquipo === 'function') initEquipo();
      return;
    }
    console.log('[live] got state doc:', doc.id);
    const data = doc.data();
    console.log('[live] state has', (data.P || []).length, 'players');
    if (typeof loadStateFromFirestore === 'function') {
      loadStateFromFirestore(data);
      if (typeof resumeState === 'function') resumeState();
      console.log('[live] resumed successfully');
    }
  }).catch(err => {
    console.error('[live] Error loading state:', err);
    alert('Error cargando la mejenga en vivo:\n' + (err.message || err));
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
  const onStepperScreen = ['screen-registro', 'screen-pagos', 'screen-equipo', 'screen-alistar'].includes(screenId);

  // Remove any existing stepper
  document.querySelectorAll('.org-stepper').forEach(el => el.remove());

  if (!window.isOrganizer || !onStepperScreen) return;

  const stepperHtml = `
    <div class="org-stepper">
      <button class="org-home-btn" type="button" onclick="orgStepperNav('home')" aria-label="Inicio">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      </button>
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
        <div class="org-step ${screenId === 'screen-alistar' ? 'active' : ''}" onclick="orgStepperNav('alistar')">
          <div class="org-step-num">4</div>
          <div class="org-step-lbl">Alistar</div>
        </div>
      </div>
    </div>
  `;
  activeScreen.insertAdjacentHTML('afterbegin', stepperHtml);
}

function orgStepperNav(dest) {
  if (dest === 'home') {
    window.navigate('home');
    return;
  }
  _origNavigate(dest);
  if (dest === 'pagos') initPagos();
  if (dest === 'equipo') initEquipo();
  if (dest === 'alistar') initAlistar();
  updateOrgStepper();
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
  if (screen === 'pagos')   initPagos();
  if (screen === 'equipo')  initEquipo();
  if (screen === 'alistar') initAlistar();
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
    html += '<div class="equipo-warning">Faltan ' + unassigned.length + ' jugador' + (unassigned.length > 1 ? 'es' : '') + ' sin asignar</div>';
  } else if (active.length > 0) {
    html += '<div class="equipo-ready">Equipos listos &middot; ' + negro.length + 'v' + verde.length + '</div>';
  }

  // Unassigned picker — each player has Negro/Verde buttons
  if (unassigned.length > 0) {
    html += '<div class="eq-pick-wrap">';
    html += '<div class="eq-pick-hd">Asignar a:</div>';
    unassigned.forEach(p => {
      const pos = p.position === 'portero' ? '<span class="eq-pick-pos">POR</span>' : '';
      html += `<div class="eq-pick-row">
        <div class="eq-pick-name">${escapePanel(p.name)}${pos}</div>
        <div class="eq-pick-btns">
          <button type="button" class="eq-pick-btn t1" onclick="assignTo('${p.id}',1)">Negro</button>
          <button type="button" class="eq-pick-btn t2" onclick="assignTo('${p.id}',2)">Verde</button>
        </div>
      </div>`;
    });
    html += '</div>';
  }

  // Two columns side by side: Negro | Verde
  html += '<div class="eq-cols">';

  // Negro column
  html += '<div class="eq-col t1">';
  html += '<div class="eq-col-hd"><span class="eq-dot t1"></span><span class="eq-col-ti">NEGRO</span><span class="eq-count">' + negro.length + '</span></div>';
  if (negro.length === 0) {
    html += '<div class="eq-empty">—</div>';
  } else {
    html += '<div class="eq-col-list">';
    negro.forEach(p => { html += equipoPill(p, 1); });
    html += '</div>';
  }
  html += '</div>';

  // Verde column
  html += '<div class="eq-col t2">';
  html += '<div class="eq-col-hd"><span class="eq-dot t2"></span><span class="eq-col-ti">VERDE</span><span class="eq-count">' + verde.length + '</span></div>';
  if (verde.length === 0) {
    html += '<div class="eq-empty">—</div>';
  } else {
    html += '<div class="eq-col-list">';
    verde.forEach(p => { html += equipoPill(p, 2); });
    html += '</div>';
  }
  html += '</div>';

  html += '</div>'; // /eq-cols

  // Share button
  if (unassigned.length === 0 && active.length > 0) {
    html += '<button class="eq-share-btn" onclick="shareEquipos()">Compartir equipos</button>';
  }
  html += '<div class="eq-hint">Tap un nombre para sacarlo del equipo</div>';

  list.innerHTML = html || '<div class="panel-empty">No hay jugadores.</div>';
}

function equipoPill(p, team) {
  const pos = p.position === 'portero' ? '<span class="eq-pill-pos">POR</span>' : '';
  const num = p.numero ? `<span class="eq-pill-num">${p.numero}</span>` : '';
  return `<button type="button" class="eq-pill t${team}" onclick="unassignPlayer('${p.id}')">
    ${num}<span class="eq-pill-name">${escapePanel(p.name)}</span>${pos}
  </button>`;
}

// Get next available number for a team (1, 2, 3...) skipping any already used
function nextNumForTeam(team) {
  const used = new Set(
    _equipoPlayers
      .filter(x => x.equipo === team && x.numero && x.position !== 'portero')
      .map(x => x.numero)
  );
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

function assignTo(playerId, team) {
  if (!jugadoresRef) return;
  const p = _equipoPlayers.find(x => x.id === playerId);
  if (!p) return;
  // Auto-assign number: porteros don't get numbers, field players get next available
  const update = { equipo: team };
  if (p.position !== 'portero' && !p.numero) {
    update.numero = nextNumForTeam(team);
  }
  jugadoresRef.doc(playerId).update(update).then(() => {
    p.equipo = team;
    if (update.numero) p.numero = update.numero;
    renderEquipoList(_equipoPlayers);
  }).catch(err => console.error('assignTo error:', err));
}

function unassignPlayer(playerId) {
  if (!jugadoresRef) return;
  const p = _equipoPlayers.find(x => x.id === playerId);
  if (!p) return;
  // Clear both team and number so the number becomes free again
  jugadoresRef.doc(playerId).update({ equipo: 0, numero: null }).then(() => {
    p.equipo = 0;
    p.numero = null;
    renderEquipoList(_equipoPlayers);
  }).catch(err => console.error('unassignPlayer error:', err));
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

// ── ALISTAR SCREEN (pre-game) ─────────────────────────────────────────────

let _alistarPlayers = [];
let _alistarSelected = null;

function initAlistar() {
  const list = document.getElementById('alistarList');
  if (!list) return;
  if (typeof jugadoresRef === 'undefined' || !jugadoresRef) {
    list.innerHTML = '<div class="panel-empty">Abrí una mejenga primero.</div>';
    return;
  }
  list.innerHTML = '<div class="panel-empty">Cargando...</div>';
  jugadoresRef.orderBy('timestamp', 'asc').get().then(snap => {
    _alistarPlayers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAlistar();
  }).catch(() => {
    list.innerHTML = '<div class="panel-empty">Error al cargar.</div>';
  });
}

function renderAlistar() {
  const list = document.getElementById('alistarList');
  if (!list) return;

  const active = _alistarPlayers.filter(p => !p.banca);
  const unassigned = active.filter(p => !p.equipo || (p.equipo !== 1 && p.equipo !== 2));
  const negro = active.filter(p => p.equipo === 1);
  const verde = active.filter(p => p.equipo === 2);

  // Sort by number (por first, then by number)
  const byNum = (a, b) => {
    if (a.position === 'portero' && b.position !== 'portero') return -1;
    if (b.position === 'portero' && a.position !== 'portero') return 1;
    return (a.numero || 99) - (b.numero || 99);
  };
  negro.sort(byNum);
  verde.sort(byNum);

  let html = '';

  // Status
  if (unassigned.length > 0) {
    html += '<div class="equipo-warning">Faltan ' + unassigned.length + ' sin equipo — volvé a Equipos para asignarlos.</div>';
  } else {
    html += '<div class="equipo-ready">Listo para arrancar · ' + negro.length + 'v' + verde.length + '</div>';
  }

  // Two columns with numbered chips
  html += '<div class="al-cols">';

  // Negro column
  html += '<div class="al-col t1"><div class="al-col-hd"><span class="eq-dot t1"></span><span class="al-col-ti">NEGRO</span><span class="eq-count">' + negro.length + '</span></div>';
  if (negro.length === 0) {
    html += '<div class="eq-empty">—</div>';
  } else {
    html += '<div class="al-col-list">';
    negro.forEach(p => { html += alistarRow(p, 1); });
    html += '</div>';
  }
  html += '</div>';

  // Verde column
  html += '<div class="al-col t2"><div class="al-col-hd"><span class="eq-dot t2"></span><span class="al-col-ti">VERDE</span><span class="eq-count">' + verde.length + '</span></div>';
  if (verde.length === 0) {
    html += '<div class="eq-empty">—</div>';
  } else {
    html += '<div class="al-col-list">';
    verde.forEach(p => { html += alistarRow(p, 2); });
    html += '</div>';
  }
  html += '</div>';

  html += '</div>'; // /al-cols

  list.innerHTML = html;
}

function alistarRow(p, team) {
  const numDisplay = p.position === 'portero' ? 'POR' : (p.numero || '-');
  const numClass = p.position === 'portero' ? 'al-row-num por' : 'al-row-num';
  return `<button type="button" class="al-row t${team}" onclick="openAlAction('${p.id}')">
    <div class="${numClass}">${numDisplay}</div>
    <div class="al-row-name">${escapePanel(p.name)}</div>
  </button>`;
}

function openAlAction(playerId) {
  const p = _alistarPlayers.find(x => x.id === playerId);
  if (!p) return;
  _alistarSelected = playerId;
  const bg = document.getElementById('alActionBg');
  document.getElementById('alActionTitle').textContent = p.name + (p.position === 'portero' ? ' (POR)' : '');
  // Swap team button label
  const swapBtn = document.getElementById('alActionSwap');
  const otherTeam = p.equipo === 1 ? 2 : 1;
  const otherName = otherTeam === 1 ? 'Negro' : 'Verde';
  swapBtn.textContent = 'Pasar a ' + otherName;
  swapBtn.onclick = () => { alSwapTeam(playerId); };
  // Change number button (hidden for porteros)
  const numBtn = document.getElementById('alActionNum');
  if (p.position === 'portero') {
    numBtn.style.display = 'none';
  } else {
    numBtn.style.display = '';
    numBtn.onclick = () => { alChangeNum(playerId); };
  }
  // Remove button
  document.getElementById('alActionRemove').onclick = () => { alRemove(playerId); };
  bg.classList.add('on');
}

function closeAlAction() {
  document.getElementById('alActionBg').classList.remove('on');
  _alistarSelected = null;
}

function alSwapTeam(playerId) {
  const p = _alistarPlayers.find(x => x.id === playerId);
  if (!p) return;
  const newTeam = p.equipo === 1 ? 2 : 1;
  // Assign next available number for new team (for field players)
  const update = { equipo: newTeam };
  if (p.position !== 'portero') {
    // Compute next available number against _alistarPlayers
    const used = new Set(_alistarPlayers.filter(x => x.equipo === newTeam && x.position !== 'portero' && x.id !== p.id && x.numero).map(x => x.numero));
    let n = 1;
    while (used.has(n)) n++;
    update.numero = n;
  }
  jugadoresRef.doc(playerId).update(update).then(() => {
    p.equipo = newTeam;
    if (update.numero) p.numero = update.numero;
    closeAlAction();
    renderAlistar();
  }).catch(err => console.error('alSwapTeam error:', err));
}

function alChangeNum(playerId) {
  const p = _alistarPlayers.find(x => x.id === playerId);
  if (!p) return;
  const newNum = prompt('Nuevo número para ' + p.name + ':', p.numero || '');
  if (newNum === null) return;
  const n = parseInt(newNum);
  if (isNaN(n) || n < 1 || n > 99) {
    alert('Número inválido (1-99)');
    return;
  }
  // Check for conflict — swap with whoever has it
  const conflict = _alistarPlayers.find(x =>
    x.id !== playerId &&
    x.equipo === p.equipo &&
    x.numero === n &&
    x.position !== 'portero'
  );
  const batch = db.batch();
  batch.update(jugadoresRef.doc(playerId), { numero: n });
  if (conflict) {
    batch.update(jugadoresRef.doc(conflict.id), { numero: p.numero || null });
  }
  batch.commit().then(() => {
    if (conflict) conflict.numero = p.numero || null;
    p.numero = n;
    closeAlAction();
    renderAlistar();
  }).catch(err => console.error('alChangeNum error:', err));
}

function alRemove(playerId) {
  if (!confirm('Quitar a este jugador del equipo?')) return;
  jugadoresRef.doc(playerId).update({ equipo: 0, numero: null }).then(() => {
    const p = _alistarPlayers.find(x => x.id === playerId);
    if (p) { p.equipo = 0; p.numero = null; }
    closeAlAction();
    renderAlistar();
  }).catch(err => console.error('alRemove error:', err));
}

function startFromAlistar() {
  const active = _alistarPlayers.filter(p => !p.banca);
  const unassigned = active.filter(p => !p.equipo || (p.equipo !== 1 && p.equipo !== 2));
  if (unassigned.length > 0) {
    alert('Hay ' + unassigned.length + ' jugador(es) sin equipo. Volvé a Equipos para asignarlos.');
    return;
  }
  // Use goToOrganizador which handles the final validation and start
  goToOrganizador();
}

// ── Util ──────────────────────────────────────────────────────────────────

function escapePanel(str) {
  const el = document.createElement('div');
  el.textContent = String(str || '');
  return el.innerHTML;
}
