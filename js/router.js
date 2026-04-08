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

function navigate(screen) {
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
}

// Password gate
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
    navigate(_passwordDest);
  } else {
    const err = document.getElementById('passwordError');
    err.textContent = 'Contraseña incorrecta';
    document.getElementById('modal-password').querySelector('.modal-card').classList.add('shake');
    setTimeout(() => document.getElementById('modal-password').querySelector('.modal-card').classList.remove('shake'), 500);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  navigate('home');
  // Check for deep link (?mejenga=ID) after home loads
  setTimeout(() => { if (typeof checkDeepLink === 'function') checkDeepLink(); }, 500);
});
