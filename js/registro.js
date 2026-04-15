        // ── Dynamic vars — set by initRegistro() ────────────────────────────
        let MAX_JUGADORES, MAX_PORTEROS, COSTO;
        let jugadoresRef = null; // Firestore ref: mejengas/{id}/jugadores
        let currentMejengaData = null; // full mejenga doc — used by panel.js

        // Estado global de la UI
        let currentPlayers   = [];
        let selectedPosition = null;
        let paymentAccepted  = false;
        let registroUnsub    = null;

        /*
         * ── initRegistro(mejengaData) ────────────────────────────────────────
         * Called by home.js before navigating to screen-registro.
         * Sets up the Firestore listener for the selected mejenga.
         */
        function initRegistro(mejengaData) {
            currentMejengaData = mejengaData; // expose for panel.js
            // Sub-collection: mejengas/{gameId}/jugadores
            jugadoresRef  = db.collection('mejengas').doc(mejengaData.id).collection('jugadores');
            MAX_JUGADORES = mejengaData.maxJugadores || 12;
            MAX_PORTEROS  = mejengaData.maxPorteros  || 2;
            COSTO         = mejengaData.costo        || 3500;

            // Reset state
            currentPlayers   = [];
            selectedPosition = null;
            paymentAccepted  = false;

            // Update header info
            const subtitle = document.getElementById('regSubtitle');
            if (subtitle) subtitle.textContent = mejengaData.nombre || '';

            const fechaText = document.getElementById('regFechaText');
            if (fechaText && mejengaData.fecha) {
                fechaText.textContent = ' ' + formatFechaReg(mejengaData.fecha);
            }

            const lugarText = document.getElementById('regLugarText');
            if (lugarText) lugarText.textContent = ' ' + (mejengaData.lugar || '');

            const horaText = document.getElementById('regHoraText');
            if (horaText && mejengaData.hora) horaText.textContent = mejengaData.hora;

            const horaChip = document.getElementById('regHoraChip');
            if (horaChip) {
                const canEdit = !!window.isOrganizer;
                horaChip.style.cursor = canEdit ? 'pointer' : 'default';
                horaChip.title = canEdit ? 'Editar hora' : '';
            }

            // Update spots totals
            const jugTotal = document.getElementById('jugadoresTotalCount');
            if (jugTotal) jugTotal.textContent = ' / ' + MAX_JUGADORES;

            const porTotal = document.getElementById('porterosTotalCount');
            if (porTotal) porTotal.textContent = ' / ' + MAX_PORTEROS;

            // Update payment text
            const payText = document.getElementById('paymentCheckText');
            if (payText) payText.textContent =
                'Acepto pagar \u20a1' + COSTO.toLocaleString() + ' para reservar mi cupo en la Mejenga';

            // Reset form UI
            const nameEl = document.getElementById('nameInput');
            const waEl   = document.getElementById('whatsappInput');
            if (nameEl) nameEl.value = '';
            if (waEl)   waEl.value   = '';
            document.getElementById('btnJugador')?.classList.remove('selected');
            document.getElementById('btnPortero')?.classList.remove('selected');
            document.getElementById('customCheck')?.classList.remove('checked');
            document.getElementById('paymentCheck')?.classList.remove('checked-active');
            const bancaNotice = document.getElementById('bancaPosNotice');
            if (bancaNotice) bancaNotice.style.display = 'none';
            const submitBtn = document.getElementById('submitBtn');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Confirmar Asistencia';
                submitBtn.classList.remove('banca-btn');
            }

            // Start real-time listener on subcollection
            if (registroUnsub) registroUnsub();
            let _regResolved = false;
            const _regTimeout = setTimeout(() => {
                if (!_regResolved) {
                    const el = document.getElementById('jugadorList');
                    if (el) el.innerHTML = '<div class="list-empty">Tiempo de espera agotado.<br>Revisá tu conexión.</div>';
                }
            }, 10000);
            registroUnsub = jugadoresRef
                .orderBy('timestamp', 'asc')
                .onSnapshot(snapshot => {
                    _regResolved = true;
                    clearTimeout(_regTimeout);
                    currentPlayers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    renderUI(currentPlayers);
                }, err => {
                    _regResolved = true;
                    clearTimeout(_regTimeout);
                    console.error(err);
                    const el = document.getElementById('jugadorList');
                    if (el) el.innerHTML =
                        '<div class="list-empty">Error al cargar. Recarg\u00e1 la p\u00e1gina.</div>';
                });
        }

        function formatFechaReg(fechaStr) {
            if (!fechaStr) return '';
            const [y, m, d] = fechaStr.split('-').map(Number);
            const days   = ['Dom','Lun','Mar','Mi\u00e9','Jue','Vie','S\u00e1b'];
            const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
            const date   = new Date(y, m - 1, d);
            return days[date.getDay()] + ' ' + d + ' ' + months[m - 1] + ', ' + y;
        }

        /*
         * ── RENDER ──────────────────────────────────────────────────────────
         * renderUI() se llama cada vez que Firestore manda una actualización.
         * Separa los jugadores en: porteros, jugadores de campo, y banca.
         * Actualiza los contadores, barras de progreso, y listas visibles.
         */
        function renderUI(players) {
            const activos      = players.filter(p => !p.retirado);
            const bancaPlayers = activos.filter(p => p.banca === true);
            const porteros     = activos.filter(p => p.position === 'portero' && !p.banca);
            const jugadores    = activos.filter(p => p.position === 'jugador'  && !p.banca);

            document.getElementById('porterosCount').textContent  = porteros.length;
            document.getElementById('jugadoresCount').textContent = jugadores.length;

            const jugadoresPagados = jugadores.filter(p => p.paid).length;
            const jugadoresEnLista = Math.min(jugadores.length, MAX_JUGADORES);
            const pctJPaid    = (jugadoresPagados / MAX_JUGADORES) * 100;
            const pctJPending = ((jugadoresEnLista - jugadoresPagados) / MAX_JUGADORES) * 100;
            document.getElementById('jugadoresPaidFill').style.width    = pctJPaid + '%';
            document.getElementById('jugadoresPendingFill').style.width = pctJPending + '%';
            document.getElementById('jugadoresPendingFill').style.left  = pctJPaid + '%';

            const porterosPagados = porteros.filter(p => p.paid).length;
            const porterosEnLista = Math.min(porteros.length, MAX_PORTEROS);
            const pctPPaid    = (porterosPagados / MAX_PORTEROS) * 100;
            const pctPPending = ((porterosEnLista - porterosPagados) / MAX_PORTEROS) * 100;
            document.getElementById('porterosPaidFill').style.width    = pctPPaid + '%';
            document.getElementById('porterosPendingFill').style.width = pctPPending + '%';
            document.getElementById('porterosPendingFill').style.left  = pctPPaid + '%';

            const porterosLlenos  = porteros.length  >= MAX_PORTEROS;
            const jugadoresLlenos = jugadores.length >= MAX_JUGADORES;

            const btnP = document.getElementById('btnPortero');
            const btnJ = document.getElementById('btnJugador');
            const tagP = document.getElementById('tagPortero');
            const tagJ = document.getElementById('tagJugador');
            if (btnP && btnJ) {
                btnP.classList.toggle('banca-available', porterosLlenos);
                btnJ.classList.toggle('banca-available', jugadoresLlenos);
                if (tagP) tagP.textContent = porterosLlenos  ? 'Campo lleno \u00b7 Banca' : '';
                if (tagJ) tagJ.textContent = jugadoresLlenos ? 'Campo lleno \u00b7 Banca' : '';
                if (selectedPosition) updateFormForSelection();
            }

            updateBadge(jugadoresLlenos && porterosLlenos);

            renderList('porteroList', 'porteroListCount', porteros,  MAX_PORTEROS);
            renderList('jugadorList', 'jugadorListCount', jugadores, MAX_JUGADORES);
            renderBancaSection(bancaPlayers);

            const bancaSpotsRow = document.getElementById('bancaSpotsRow');
            if (bancaSpotsRow) {
                const bancaJ = bancaPlayers.filter(p => p.position === 'jugador').length;
                const bancaP = bancaPlayers.filter(p => p.position === 'portero').length;
                if (bancaPlayers.length > 0) {
                    const parts = [];
                    if (bancaP > 0) parts.push(`${bancaP} portero${bancaP > 1 ? 's' : ''}`);
                    if (bancaJ > 0) parts.push(`${bancaJ} jugador${bancaJ > 1 ? 'es' : ''}`);
                    bancaSpotsRow.textContent = 'Banca: ' + parts.join(' \u00b7 ');
                    bancaSpotsRow.style.display = 'block';
                } else {
                    bancaSpotsRow.style.display = 'none';
                }
            }
        }

        function updateBadge(todoLleno) {
            const badge = document.getElementById('liveBadge');
            const dot   = document.getElementById('liveDot');
            const text  = document.getElementById('liveBadgeText');
            if (!badge) return;
            if (todoLleno) {
                badge.style.color       = '#94a3b8';
                badge.style.borderColor = 'rgba(148,163,184,0.25)';
                badge.style.background  = 'rgba(148,163,184,0.08)';
                dot.style.background    = '#94a3b8';
                text.textContent        = 'Banca';
            } else {
                badge.style.color       = '#A7EE43';
                badge.style.borderColor = 'rgba(167,238,67,0.2)';
                badge.style.background  = 'rgba(167,238,67,0.1)';
                dot.style.background    = '#A7EE43';
                text.textContent        = 'Abierta';
            }
        }

        function renderList(listId, countId, players, max) {
            const listEl  = document.getElementById(listId);
            const countEl = document.getElementById(countId);
            if (countEl) countEl.textContent = players.length + ' / ' + max;
            if (!listEl) return;
            if (players.length === 0) {
                listEl.innerHTML = '<div class="list-empty">Nadie todav\u00eda.</div>';
                return;
            }
            listEl.innerHTML = players.map((p, i) => {
                const confirmed = i < max;
                return `<div class="player-item">
                    <div class="player-number ${confirmed ? 'confirmed' : 'waitlist'}">${i + 1}</div>
                    <div class="player-info">
                        <div class="player-name">${escapeHtml(p.name)}</div>
                    </div>
                    <span class="player-status ${confirmed ? (p.paid ? 'in' : 'pending') : 'wait'}">${confirmed ? (p.paid ? 'Cupo asegurado' : 'Pago pendiente') : 'En espera'}</span>
                </div>`;
            }).join('');
        }

        function renderBancaSection(bancaPlayers) {
            const section = document.getElementById('bancaSection');
            const list    = document.getElementById('regBancaList');
            const count   = document.getElementById('bancaListCount');
            if (!section) return;
            if (bancaPlayers.length === 0) { section.style.display = 'none'; return; }
            section.style.display = 'block';
            if (count) count.textContent = bancaPlayers.length;
            list.innerHTML = bancaPlayers.map((p, i) => {
                const ts  = p.timestamp ? p.timestamp.toDate() : new Date();
                const pos = p.position === 'portero' ? 'Portero' : 'Jugador';
                return `<div class="player-item">
                    <div class="player-number banca-num">${i + 1}</div>
                    <div class="player-info">
                        <div class="player-name">${escapeHtml(p.name)}</div>
                        <div class="player-time">${formatTime(ts)} \u00b7 ${pos}</div>
                    </div>
                    <span class="player-status wait">A la espera</span>
                </div>`;
            }).join('');
        }

        /*
         * ── LÓGICA DEL FORMULARIO ───────────────────────────────────────────
         * selectPosition()       — el usuario elige si es jugador o portero
         * updateFormForSelection() — ajusta el botón si la posición está llena
         * registerPlayer()       — valida y guarda en Firestore
         *
         * Flujo de banca: si MAX_JUGADORES o MAX_PORTEROS están llenos,
         * el registro se guarda con { banca: true }. Cona contacta a esas
         * personas por WhatsApp 24h antes si alguien no paga.
         */
        // ── Form logic ──────────────────────────────────────────────────────
        function selectPosition(pos) {
            selectedPosition = pos;
            document.getElementById('btnJugador').classList.toggle('selected', pos === 'jugador');
            document.getElementById('btnPortero').classList.toggle('selected', pos === 'portero');
            document.getElementById('posToggle').classList.remove('error');
            updateFormForSelection();
        }

        function updateFormForSelection() {
            if (!selectedPosition) return;
            const jugadoresActuales = currentPlayers.filter(p => p.position === 'jugador' && !p.banca && !p.retirado);
            const porterosActuales  = currentPlayers.filter(p => p.position === 'portero' && !p.banca && !p.retirado);
            const posLlena = selectedPosition === 'jugador'
                ? jugadoresActuales.length >= MAX_JUGADORES
                : porterosActuales.length  >= MAX_PORTEROS;

            const notice     = document.getElementById('bancaPosNotice');
            const submitBtn  = document.getElementById('submitBtn');
            const checkText  = document.getElementById('paymentCheckText');
            const disclaimer = document.getElementById('paymentDisclaimer');
            const posNombre  = selectedPosition === 'jugador' ? 'jugadores' : 'porteros';

            if (posLlena) {
                notice.style.display = 'block';
                notice.innerHTML = `El campo de ${posNombre} est\u00e1 lleno. Anot\u00e1te en la <strong>banca</strong>: faltando 24hs, si alguien no pag\u00f3 ni respondi\u00f3 por WhatsApp, Cona te escribe y pod\u00e9s pagar para asegurar el cupo.`;
                submitBtn.textContent = 'Entrar a la Banca';
                submitBtn.classList.add('banca-btn');
                if (checkText) checkText.textContent = 'Pagar\u00e9 \u20a1' + (COSTO || 3500).toLocaleString() + ' si Cona me confirma campo';
                if (disclaimer) disclaimer.textContent = 'Solo te contactamos si qued\u00e1 un cupo libre. No hay cobro hasta que te confirmemos.';
            } else {
                notice.style.display = 'none';
                submitBtn.textContent = 'Confirmar Asistencia';
                submitBtn.classList.remove('banca-btn');
                if (checkText) checkText.textContent = 'Acepto pagar \u20a1' + (COSTO || 3500).toLocaleString() + ' para reservar mi cupo en la Mejenga';
                if (disclaimer) disclaimer.textContent = 'Un miembro del equipo Cona se va a comunicar con vos para completar el pago via SINPE por WhatsApp.';
            }
        }

        function togglePayment() {
            paymentAccepted = !paymentAccepted;
            document.getElementById('customCheck').classList.toggle('checked', paymentAccepted);
            document.getElementById('paymentCheck').classList.toggle('checked-active', paymentAccepted);
            document.getElementById('paymentCheck').classList.remove('error');
        }

        async function registerPlayer() {
            const nameInput     = document.getElementById('nameInput');
            const whatsappInput = document.getElementById('whatsappInput');
            const name          = nameInput.value.trim();
            const whatsapp      = whatsappInput.value.trim();
            let hasError = false;

            nameInput.classList.remove('error');
            if (!name) { nameInput.classList.add('error'); nameInput.focus(); hasError = true; }

            document.getElementById('posToggle').classList.remove('error');
            if (!selectedPosition) { document.getElementById('posToggle').classList.add('error'); hasError = true; }

            whatsappInput.classList.remove('error');
            if (!whatsapp) { whatsappInput.classList.add('error'); hasError = true; }

            document.getElementById('paymentCheck').classList.remove('error');
            if (!paymentAccepted) { document.getElementById('paymentCheck').classList.add('error'); hasError = true; }

            if (hasError) return;

            if (currentPlayers.some(p => p.name.toLowerCase() === name.toLowerCase())) {
                nameInput.classList.add('error');
                nameInput.value = '';
                const prev = nameInput.placeholder;
                nameInput.placeholder = 'Ya est\u00e1s registrado con ese nombre';
                setTimeout(() => { nameInput.placeholder = prev; nameInput.classList.remove('error'); }, 2500);
                return;
            }

            const btn = document.getElementById('submitBtn');
            btn.disabled = true;
            btn.textContent = 'Guardando...';

            const jugadoresActuales = currentPlayers.filter(p => p.position === 'jugador' && !p.banca && !p.retirado);
            const porterosActuales  = currentPlayers.filter(p => p.position === 'portero' && !p.banca && !p.retirado);
            const esBanca = selectedPosition === 'jugador'
                ? jugadoresActuales.length >= MAX_JUGADORES
                : porterosActuales.length  >= MAX_PORTEROS;

            try {
                const data = {
                    name,
                    position: selectedPosition,
                    whatsapp,
                    paid: false,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                };
                if (esBanca) data.banca = true;

                await jugadoresRef.add(data);

                nameInput.value = '';
                whatsappInput.value = '';
                selectedPosition = null;
                paymentAccepted = false;
                document.getElementById('btnJugador').classList.remove('selected');
                document.getElementById('btnPortero').classList.remove('selected');
                document.getElementById('customCheck').classList.remove('checked');
                document.getElementById('paymentCheck').classList.remove('checked-active');
                document.getElementById('bancaPosNotice').style.display = 'none';
                document.getElementById('submitBtn').textContent = esBanca ? 'Entrar a la Banca' : 'Confirmar Asistencia';
                document.getElementById('submitBtn').classList.toggle('banca-btn', esBanca);

                const toast = document.getElementById('successToast');
                if (esBanca) {
                    toast.innerHTML = '\u23f3 Anotado en la Banca';
                    toast.classList.add('banca-toast');
                } else {
                    toast.innerHTML = '\u26bd Registrado con exito';
                    toast.classList.remove('banca-toast');
                }
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 2500);

            } catch (e) {
                console.error(e);
                btn.textContent = 'Error. Intent\u00e1lo de nuevo.';
            } finally {
                setTimeout(() => {
                    if (btn) {
                        btn.disabled = false;
                        btn.textContent = btn.classList.contains('banca-btn') ? 'Entrar a la Banca' : 'Confirmar Asistencia';
                    }
                }, 1500);
            }
        }

        // ── Helpers ─────────────────────────────────────────────────────────
        function escapeHtml(t) {
            const d = document.createElement('div');
            d.textContent = t;
            return d.innerHTML;
        }

        function formatTime(date) {
            const h = date.getHours(), m = date.getMinutes().toString().padStart(2,'0');
            const ampm = h >= 12 ? 'pm' : 'am', h12 = h % 12 || 12;
            const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
            return `${date.getDate()} ${months[date.getMonth()]} - ${h12}:${m} ${ampm}`;
        }

        function goToReporteFromRegistro() {
            if (currentMejengaData && currentMejengaData.reporteId) {
                navigate('reporte');
                if (typeof initReporteFromId === 'function') initReporteFromId(currentMejengaData.reporteId);
            } else {
                openOrgPanel();
            }
        }

        function copyInviteLink() {
            const mejengaId = currentMejengaData?.id;
            if (!mejengaId) return;
            const base = window.location.origin + window.location.pathname;
            const link = base + '?mejenga=' + mejengaId;
            navigator.clipboard.writeText(link).then(() => {
                const toast = document.getElementById('successToast');
                toast.innerHTML = 'Link copiado al portapapeles';
                toast.classList.remove('banca-toast');
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 2500);
            }).catch(() => {
                // Fallback for older browsers
                const ta = document.createElement('textarea');
                ta.value = link;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                const toast = document.getElementById('successToast');
                toast.innerHTML = 'Link copiado';
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 2500);
            });
        }

        ['nameInput','whatsappInput'].forEach(id => {
            document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') registerPlayer(); });
            document.getElementById(id)?.addEventListener('input',   e => { e.target.classList.remove('error'); });
        });

        function editHora() {
            if (!window.isOrganizer) return;
            if (!currentMejengaData || !currentMejengaData.id) return;
            const current = (currentMejengaData.hora || '').toString();
            const next = prompt('Editar hora de la mejenga:', current);
            if (next === null) return;
            const clean = next.trim();
            if (!clean || clean === current) return;

            db.collection('mejengas').doc(currentMejengaData.id)
              .update({ hora: clean })
              .then(() => {
                  currentMejengaData.hora = clean;
                  const horaText = document.getElementById('regHoraText');
                  if (horaText) horaText.textContent = clean;
              })
              .catch(err => {
                  console.error('editHora error:', err);
                  alert('No se pudo actualizar la hora.');
              });
        }
