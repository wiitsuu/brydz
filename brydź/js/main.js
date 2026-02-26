// ============================================================
// Main — inicjalizacja i sterowanie aplikacją (Lobby & UI)
// ============================================================

let game;
let ui;
let network = null;

let currentLang = 'pl';

function init() {
    window.gameSettings = { timeLimit: 0, playerName: 'Gracz', lang: 'pl', maxRounds: 0 };

    // === TŁUMACZENIA ===
    function applyLanguage(lang) {
        document.querySelectorAll('.i18n').forEach(el => {
            const text = el.getAttribute('data-' + lang);
            if (text) el.innerHTML = text;
        });

        document.querySelectorAll('.i18n-input').forEach(el => {
            const text = el.getAttribute('data-' + lang);
            if (text) el.placeholder = text;
        });

        const timeDisplay = document.getElementById('time-limit-display');
        if (timeDisplay) {
            if (window.gameSettings.timeLimit === 0) {
                timeDisplay.textContent = lang === 'pl' ? 'Brak limitu' : (lang === 'es' ? 'Sin límite' : 'No limit');
            } else {
                timeDisplay.textContent = window.gameSettings.timeLimit + ' s';
            }
        }
    }

    const langToggleBtn = document.getElementById('lang-toggle');
    if (langToggleBtn) {
        langToggleBtn.addEventListener('click', (e) => {
            const langs = ['pl', 'en', 'es'];
            const idx = langs.indexOf(currentLang);
            currentLang = langs[(idx + 1) % langs.length];
            window.gameSettings.lang = currentLang;

            const flagImg = document.getElementById('lang-flag-img');
            if (flagImg) {
                if (currentLang === 'pl') {
                    flagImg.src = 'https://flagcdn.com/w40/pl.png';
                    flagImg.alt = 'PL';
                } else if (currentLang === 'en') {
                    flagImg.src = 'https://flagcdn.com/w40/gb.png';
                    flagImg.alt = 'EN';
                } else {
                    flagImg.src = 'https://flagcdn.com/w40/es.png';
                    flagImg.alt = 'ES';
                }
            }

            applyLanguage(currentLang);
        });
    }
    // === THEME LOBBY & LOGIC ===
    const savedCardTheme = localStorage.getItem('brydz_theme_card') || 'default';
    const savedBgTheme = localStorage.getItem('brydz_theme_bg') || 'default';

    function applyThemes(cardT, bgT) {
        document.body.className = ''; // reset
        if (cardT !== 'default') document.body.classList.add(`theme-${cardT}`);
        if (bgT !== 'default') document.body.classList.add(`bg-${bgT}`);
    }
    applyThemes(savedCardTheme, savedBgTheme);

    // Set active buttons
    document.querySelectorAll('.theme-select-btn[data-type="card"]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === savedCardTheme);
    });
    document.querySelectorAll('.theme-select-btn[data-type="bg"]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === savedBgTheme);
    });

    document.getElementById('btn-themes').addEventListener('click', () => {
        showMenuPane('menu-themes');
    });

    document.getElementById('btn-close-themes').addEventListener('click', () => {
        showMenuPane('menu-main-buttons');
    });

    // Theme Tabs (Karty / Tło)
    document.querySelectorAll('.theme-tabs .bid-level-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.theme-tabs .bid-level-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');

            const targetType = e.target.dataset.tab;
            document.getElementById('theme-pane-cards').style.display = targetType === 'cards' ? 'flex' : 'none';
            document.getElementById('theme-pane-bg').style.display = targetType === 'bg' ? 'flex' : 'none';
        });
    });

    // Theme Selection Click
    document.querySelectorAll('.theme-select-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const type = e.target.dataset.type;
            const val = e.target.dataset.val;

            document.querySelectorAll(`.theme-select-btn[data-type="${type}"]`).forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

            localStorage.setItem(`brydz_theme_${type}`, val);

            const currentCard = localStorage.getItem('brydz_theme_card') || 'default';
            const currentBg = localStorage.getItem('brydz_theme_bg') || 'default';
            applyThemes(currentCard, currentBg);
        });
    });

    // Odczytaj z localStorage (Nickname)
    const savedName = localStorage.getItem('brydz_nickname');
    if (savedName) {
        document.getElementById('input-nickname').value = savedName;
    }

    // Obsługa ekranu nicku
    document.getElementById('btn-save-nickname').addEventListener('click', () => {
        let name = document.getElementById('input-nickname').value.trim();
        if (!name) name = 'Gracz';
        window.gameSettings.playerName = name;
        localStorage.setItem('brydz_nickname', name);

        // Przejdź do menu głównego
        document.getElementById('nickname-screen').classList.remove('active');
        document.getElementById('menu-screen').classList.add('active');
        showMenuPane('menu-main-buttons');
    });

    // === OBSŁUGA LIMITU CZASU ===
    const timeSlider = document.getElementById('time-limit-slider');
    const timeDisplay = document.getElementById('time-limit-display');
    if (timeSlider && timeDisplay) {
        timeSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            window.gameSettings.timeLimit = val;
            timeDisplay.textContent = val === 0 ? (currentLang === 'pl' ? 'Brak limitu' : (currentLang === 'es' ? 'Sin límite' : 'No limit')) : val + ' s';
            if (network && network.isHost) {
                network.broadcastLobbyUpdate();
            }
        });
    }
    // === OBSŁUGA LIMITU ROZDAŃ ===
    function updateMaxRounds(val) {
        window.gameSettings.maxRounds = val;
        let text = val.toString();
        if (val === 0) {
            text = currentLang === 'pl' ? 'Brak limitu' : (currentLang === 'es' ? 'Sin límite' : 'No limit');
        }

        const spDisplay = document.getElementById('sp-rounds-display');
        const mpDisplay = document.getElementById('mp-rounds-display');
        if (spDisplay) spDisplay.textContent = text;
        if (mpDisplay) mpDisplay.textContent = text;

        const spSlider = document.getElementById('sp-rounds-slider');
        const mpSlider = document.getElementById('mp-rounds-slider');
        if (spSlider && parseInt(spSlider.value) !== val) spSlider.value = val;
        if (mpSlider && parseInt(mpSlider.value) !== val) mpSlider.value = val;

        if (network && network.isHost) {
            network.broadcastLobbyUpdate();
        }
    }

    const spSlider = document.getElementById('sp-rounds-slider');
    if (spSlider) spSlider.addEventListener('input', (e) => updateMaxRounds(parseInt(e.target.value)));
    const mpSlider = document.getElementById('mp-rounds-slider');
    if (mpSlider) mpSlider.addEventListener('input', (e) => updateMaxRounds(parseInt(e.target.value)));

    // === GRA LOKALNA (SINGLEPLAYER) ===
    document.getElementById('btn-new-game').addEventListener('click', () => {
        showMenuPane('menu-sp-setup');
    });

    document.getElementById('btn-cancel-sp').addEventListener('click', () => {
        showMenuPane('menu-main-buttons');
    });

    document.getElementById('btn-start-sp').addEventListener('click', () => {
        network = null;
        startGameWithCurrentSettings();
    });

    // === STWÓRZ POKÓJ (HOST) ===
    document.getElementById('btn-host-mp').addEventListener('click', () => {
        showMenuPane('menu-lobby-host');
        document.getElementById('lobby-room-code').innerText = "ŁĄCZENIE Z SERWEREM...";

        network = new NetworkHost(
            () => game ? game.getState() : null, // onStateRequired
            updateHostLobbyPlayers,              // onPlayerJoined
            updateHostLobbyPlayers,              // onPlayerLeft
            (peerId, bid) => { if (game) game.handleNetworkBid(peerId, bid); }, // onBid
            (peerId, card) => { if (game) game.handleNetworkPlay(peerId, card); }, // onPlay
            (pos) => {
                if (game) {
                    game.replacePlayerWithBot(pos);
                    network.broadcastState();
                }
            }, // onPlayerReplaced
            (pos, name, peerId) => {
                if (game) {
                    game.restorePlayer(pos, name, peerId);
                    network.broadcastState();
                }
            } // onPlayerReturned
        );

        network.startHosting((roomCode) => {
            document.getElementById('lobby-room-code').innerText = roomCode;
            updateHostLobbyPlayers(network.players);
            // Kiedy jestesmy polaczeni jako host, aktywuj przycisk startu
            document.getElementById('btn-start-mp').disabled = false;
        });
    });

    document.getElementById('btn-start-mp').addEventListener('click', () => {
        if (!network || !network.isHost) return;
        startGameWithCurrentSettings(true);
    });

    // === DOŁĄCZ DO POKOJU (CLIENT) ===
    document.getElementById('btn-join-mp').addEventListener('click', () => {
        showMenuPane('menu-join');
        document.getElementById('input-room-code').value = '';
        document.getElementById('join-status-msg').innerText = '';
    });

    document.getElementById('btn-connect').addEventListener('click', () => {
        const code = document.getElementById('input-room-code').value.trim();
        if (code.length !== 5) {
            document.getElementById('join-status-msg').innerText = "Kod musi mieć 5 znaków.";
            return;
        }

        document.getElementById('btn-connect').disabled = true;
        document.getElementById('join-status-msg').innerText = "Łączenie...";

        network = new NetworkClient(
            (state) => {
                // Gdy otrzymamy stan gry od Hosta:
                if (!game || !ui) {
                    // Inicjalizacja "pustej" gry klienta (Tylko rysowanie UI)
                    game = new BridgeGame(true); // IsClient = true
                    ui = new BridgeUI(game);
                    hideMenu();
                }
                game.updateStateFromHost(state);
                ui.renderState(state);
            },
            updateClientLobbyPlayers, // onLobbyUpdate
            (errStr) => {
                document.getElementById('join-status-msg').innerText = errStr;
                document.getElementById('btn-connect').disabled = false;
            }
        );

        network.joinRoom(code, () => {
            // Połączono z sukcesem! Przejdź do poczekalni
            showMenuPane('menu-lobby-client');
            document.getElementById('client-room-code-display').innerText = code.toUpperCase();
        });
    });

    // === ZASADY GRY ===
    document.getElementById('btn-how-to-play').addEventListener('click', () => {
        showMenuPane('menu-rules');
    });

    document.getElementById('btn-close-rules').addEventListener('click', () => {
        showMenuPane('menu-main-buttons');
    });

    // === PRZYCISKI POWROTU / ANULOWANIA ===
    document.querySelectorAll('#btn-cancel-lobby, #btn-disconnect-client, #btn-cancel-join').forEach(btn => {
        btn.addEventListener('click', () => {
            if (network && network.peer) {
                network.peer.destroy();
            }
            network = null;
            document.getElementById('btn-start-mp').disabled = true;
            document.getElementById('btn-connect').disabled = false;
            showMenuPane('menu-main-buttons');
        });
    });
}

function startGameWithCurrentSettings(isMultiplayerHost = false) {
    hideMenu();
    game = new BridgeGame();
    ui = new BridgeUI(game);

    // Jeśli hostujemy, upewnijmy się, że przypisaliśmy ludziom pozycje, reszta boty
    if (isMultiplayerHost && network) {
        // TBD: Logika przekazywania przypisań graczy do BridgeGame
        game.setNetworkPlayers(network.players);
    }

    // Rozpocznij normalnie lokalnie/jako serwer
    game.startNewRound();
    if (network && network.isHost) {
        network.broadcastState(); // Wyślij pierwszy stan
    }
}

// ---- Funkcje pomocnicze UI Lobby ----

function showMenuPane(paneId) {
    document.querySelectorAll('.menu-buttons, .menu-lobby').forEach(el => {
        el.classList.add('hidden');
    });
    document.getElementById(paneId).classList.remove('hidden');
}

function hideMenu() {
    document.getElementById('menu-screen').classList.remove('active');
    setTimeout(() => {
        document.getElementById('game-screen').classList.add('active');
    }, 400); // Mniej więcej czas trwania opacity
}

function updateHostLobbyPlayers(players) {
    const list = document.getElementById('host-players-list');
    const myName = window.gameSettings ? window.gameSettings.playerName : (currentLang === 'pl' ? 'Gracz' : (currentLang === 'es' ? 'Jugador' : 'Player'));
    const hostPrefixPl = 'Ty (Host)';
    const hostPrefixEn = 'You (Host)';
    const hostPrefixEs = 'Tú (Anfitrión)';
    const hostPrefix = currentLang === 'pl' ? hostPrefixPl : (currentLang === 'es' ? hostPrefixEs : hostPrefixEn);

    const posLabelPl = 'Pozycja:';
    const posLabelEn = 'Position:';
    const posLabelEs = 'Posición:';
    const posLabel = currentLang === 'pl' ? posLabelPl : (currentLang === 'es' ? posLabelEs : posLabelEn);

    list.innerHTML = `<li>${myName} - <span class="i18n" data-pl="${hostPrefixPl}" data-en="${hostPrefixEn}" data-es="${hostPrefixEs}">${hostPrefix}</span></li>`;
    players.forEach(p => {
        list.innerHTML += `<li>${p.name}(<span class="i18n" data-pl="${posLabelPl}" data-en="${posLabelEn}" data-es="${posLabelEs}">${posLabel}</span>${p.position})</li>`;
    });
}

function updateClientLobbyPlayers(players, hostId, timeLimit, hostName) {
    if (timeLimit !== undefined) {
        const display = document.getElementById('client-time-limit-display');
        if (display) display.textContent = timeLimit === 0 ? (currentLang === 'pl' ? 'Brak limitu' : (currentLang === 'es' ? 'Sin límite' : 'No limit')) : timeLimit + ' s';
    }

    const list = document.getElementById('client-players-list');
    const hName = hostName || 'Host';
    list.innerHTML = `<li>${hName} (Host)</li>`;

    const posLabelPl = 'Pozycja:';
    const posLabelEn = 'Position:';
    const posLabelEs = 'Posición:';
    const posLabel = currentLang === 'pl' ? posLabelPl : (currentLang === 'es' ? posLabelEs : posLabelEn);

    players.forEach(p => {
        const li = document.createElement('li');
        const name = p.name || (currentLang === 'pl' ? 'Gracz' : (currentLang === 'es' ? 'Jugador' : 'Player'));
        li.innerHTML = `${name}(<span class="i18n" data-pl="${posLabelPl}" data-en="${posLabelEn}" data-es="${posLabelEs}">${posLabel}</span>${p.position})`;
        list.appendChild(li);
    });
}

// Start
document.addEventListener('DOMContentLoaded', init);

// Wymuszenie szybkiego rozłączenia PeerJS przy zamykaniu karty/przeglądarki
window.addEventListener('beforeunload', () => {
    if (typeof network !== 'undefined' && network && network.peer) {
        network.peer.destroy();
    }
});

window.addEventListener('pagehide', () => {
    if (typeof network !== 'undefined' && network && network.peer && !network.peer.destroyed) {
        network.peer.destroy();
    }
});
