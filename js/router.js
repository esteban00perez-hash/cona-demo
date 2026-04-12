// ── App state ──────────────────────────────────────────────────────────────
const ORGANIZADOR_PASS = 'messi';

let currentUnsub = null; // active Firestore listener

// Ensure scrolling works on page load (organizador.css no longer sets global overflow:hidden)
document.documentElement.style.overflow = 'auto';
document.documentElement.style.height   = 'auto';
document.documentElement.style.overscrollBehavior = '';
document.body.style.overflow = 'auto';
document.body.style.height   = 'auto';
document.body.style.overscrollBehavior = '';

// ── Access control ───────────────────────────────────────────────────────
// Two modes:
//   - Organizer mode: full access (home, create, delete, live tracking, etc.)
//     Protected by password. Persists in sessionStorage.
//   - Public mode: only the specific mejenga view (registro/equipo/reporte).
//     Used when a share link is opened. Hides all organizer UI.

// Screens that REQUIRE organizer mode — public users never reach these
const ORGANIZER_ONLY = ['home', 'crear', 'pagos', 'equipo', 'alistar', 'organizador'];
// Screens that are public-safe
const PUBLIC_ALLOWED = ['registro', 'reporte', 'gate'];

window.isOrganizer = sessionStorage.getItem('cona_org_mode') === '1';
window.publicMode  = false;

function setOrganizerMode(on) {
  window.isOrganizer = !!on;
  if (on) {
    sessionStorage.setItem('cona_org_mode', '1');
    window.publicMode = false;
    document.body.classList.remove('public-mode');
  } else {
    sessionStorage.removeItem('cona_org_mode');
  }
}

function setPublicMode(on) {
  window.publicMode = !!on;
  if (on) {
    document.body.classList.add('public-mode');
    window.isOrganizer = false;
    sessionStorage.removeItem('cona_org_mode');
  } else {
    document.body.classList.remove('public-mode');
  }
}

function navigate(screen) {
  // Access guard: organizer-only screens redirect to gate if not organizer
  if (ORGANIZER_ONLY.indexOf(screen) !== -1 && !window.isOrganizer) {
    screen = 'gate';
  }

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + screen);
  if (el) { el.classList.add('active'); }

  if (screen === 'organizador') {
    // Organizador needs fixed-height overflow:hidden (its own app layout)
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.height   = '100%';
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overflow = 'hidden';
    document.body.style.height   = '100%';
    document.body.style.overscrollBehavior = 'none';
    document.body.style.background = '';
  } else {
    // All other screens: normal scrolling
    document.documentElement.style.overflow = 'auto';
    document.documentElement.style.height   = 'auto';
    document.documentElement.style.overscrollBehavior = '';
    document.body.style.overflow = 'auto';
    document.body.style.height   = 'auto';
    document.body.style.overscrollBehavior = '';
    const bg = (screen === 'registro' || screen === 'reporte' || screen === 'pagos' || screen === 'equipo') ? '#142029' : '#0e1a22';
    document.body.style.background = bg;
    window.scrollTo(0, 0);
  }

  if (screen === 'home' && typeof initHome === 'function') initHome();
  if (screen === 'organizador' && typeof checkOrgRecovery === 'function') checkOrgRecovery();
  if (screen === 'gate') {
    const gp = document.getElementById('gatePass');
    if (gp) setTimeout(() => gp.focus(), 150);
  }
}

// Gate screen password check
function tryGate() {
  const val = document.getElementById('gatePass').value;
  const err = document.getElementById('gateError');
  if (val.toLowerCase() === ORGANIZADOR_PASS) {
    setOrganizerMode(true);
    err.textContent = '';
    navigate('home');
  } else {
    err.textContent = 'Contraseña incorrecta';
    const card = document.querySelector('#screen-gate .gate-card');
    if (card) { card.classList.add('shake'); setTimeout(() => card.classList.remove('shake'), 400); }
    document.getElementById('gatePass').value = '';
    document.getElementById('gatePass').focus();
  }
}

// Password modal (legacy) — kept for back-compat
let _passwordDest = 'organizador';

function openPasswordGate(dest) {
  _passwordDest = dest || 'organizador';
  document.getElementById('modal-password').classList.remove('hidden');
  document.getElementById('passwordInput').value = '';
  document.getElementById('passwordError').textContent = '';
  setTimeout(() => document.getElementById('passwordInput').focus(), 100);
}

function closePasswordModal() {
  document.getElementById('modal-password').classList.add('hidden');
}

function checkPassword() {
  const val = document.getElementById('passwordInput').value;
  if (val.toLowerCase() === ORGANIZADOR_PASS) {
    closePasswordModal();
    setOrganizerMode(true);
    navigate(_passwordDest);
  } else {
    const err = document.getElementById('passwordError');
    err.textContent = 'Contraseña incorrecta';
    document.getElementById('modal-password').querySelector('.modal-card').classList.add('shake');
    setTimeout(() => document.getElementById('modal-password').querySelector('.modal-card').classList.remove('shake'), 500);
  }
}

function logoutOrganizer() {
  setOrganizerMode(false);
  navigate('gate');
}

document.addEventListener('DOMContentLoaded', () => {
  // Check for deep link first — if present, force public mode
  const params = new URLSearchParams(window.location.search);
  const deepMejenga = params.get('mejenga');

  if (deepMejenga) {
    // Public mode: only show the mejenga view (registro or report)
    setPublicMode(true);
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
    // Fetch the mejenga and route to appropriate view
    if (typeof db !== 'undefined') {
      db.collection('mejengas').doc(deepMejenga).get().then(doc => {
        if (!doc.exists) {
          alert('Mejenga no encontrada');
          setPublicMode(false);
          navigate('gate');
          return;
        }
        const data = { id: doc.id, ...doc.data() };
        if (data.finalizado && data.reporteId) {
          navigate('reporte');
          if (typeof initReporteFromId === 'function') initReporteFromId(data.reporteId);
        } else {
          try { if (typeof initRegistro === 'function') initRegistro(data); } catch(e) { console.error(e); }
          navigate('registro');
        }
      }).catch(err => {
        console.error('Deep link error:', err);
        alert('Error cargando mejenga');
        setPublicMode(false);
        navigate('gate');
      });
    }
    return;
  }

  // No deep link — check organizer mode
  if (window.isOrganizer) {
    navigate('home');
  } else {
    navigate('gate');
  }
});

// Enter key on gate password
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const activeGate = document.querySelector('#screen-gate.active');
    if (activeGate && document.activeElement === document.getElementById('gatePass')) {
      tryGate();
    }
  }
});
