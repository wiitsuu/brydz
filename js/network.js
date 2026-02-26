// ============================================================
// Wymaga załadowanej biblioteki PeerJS
// ============================================================

const NETWORK_EVENTS = {
    STATE_UPDATE: 'STATE_UPDATE',
    ACTION_BID: 'ACTION_BID',
    ACTION_PLAY: 'ACTION_PLAY',
    CHAT_MSG: 'CHAT_MSG'
};

class NetworkManager {
    constructor() {
        this.peer = null;
        this.isHost = false;
        this.myId = null;
    }

    // Wygeneruj 5 znakowy kod pokoju typu A8K2M
    _generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Bez I, O, 0, 1 dla czytelności
        let result = '';
        for (let i = 0; i < 5; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return `BRYDZ-${result}`;
    }
}

class NetworkHost extends NetworkManager {
    constructor(onStateRequired, onPlayerJoined, onPlayerLeft, onBidReceived, onCardReceived, onPlayerReplaced, onPlayerReturned) {
        super();
        this.isHost = true;
        this.connections = {}; // id -> DataConnection
        this.players = [];     // Zarejestrowani gracze { id: peerId, position: 'N', name: 'Gracz 2' }
        this.disconnectedPlayers = {}; // name -> { position, botReplaced, reconnected } // TRACKS RECONNECTS

        // Callbacki od Game i UI
        this.onStateRequired = onStateRequired;
        this.onPlayerJoined = onPlayerJoined;
        this.onPlayerLeft = onPlayerLeft;
        this.onBidReceived = onBidReceived;
        this.onCardReceived = onCardReceived;
        this.onPlayerReplaced = onPlayerReplaced;
        this.onPlayerReturned = onPlayerReturned;
    }

    startHosting(callback) {
        const roomCode = this._generateRoomCode();

        // Tworzymy Peera przypisanego do naszego wygenerowanego kodu
        this.peer = new Peer(roomCode, {
            debug: 2
        });

        this.peer.on('open', (id) => {
            console.log('Otwarto pokój', id);
            this.myId = id;
            if (callback) callback(id.replace('BRYDZ-', '')); // Zwracamy sam kod np. XYA12
        });

        this.peer.on('connection', (conn) => {
            this._setupConnection(conn);
        });

        this.peer.on('error', (err) => {
            console.error('PeerJS Host Error:', err);
            // Tu można dodać UI fallback dla zajętego ID (bardzo rzadkie)
        });
    }

    _setupConnection(conn) {
        // Nowy klient chce się połączyć
        conn.on('open', () => {
            console.log(`[Host] Gracz ${conn.peer} dołączył`);
            this.connections[conn.peer] = conn;

            let baseClientName = (conn.metadata && conn.metadata.name) ? conn.metadata.name : `Gość ${Object.keys(this.connections).length}`;
            let clientName = baseClientName;
            let assignedPos = null;

            // Sprawdzamy czy ten gracz wraca do gry po rozłączeniu
            if (this.disconnectedPlayers[baseClientName]) {
                const info = this.disconnectedPlayers[baseClientName];
                assignedPos = info.position;
                info.reconnected = true;
                clientName = baseClientName;
                console.log(`[Host] Powrót gracza ${clientName} na pozycję ${assignedPos}!`);

                if (info.botReplaced && this.onPlayerReturned) {
                    this.onPlayerReturned(assignedPos, clientName, conn.peer);
                }

                delete this.disconnectedPlayers[baseClientName]; // Pomyślny powrót
            } else {
                let counter = 2;
                const getTakenNames = () => {
                    let taken = this.players.map(p => p.name);
                    if (window.gameSettings && window.gameSettings.playerName) {
                        taken.push(window.gameSettings.playerName);
                    }
                    return taken;
                };

                while (getTakenNames().includes(clientName)) {
                    clientName = `${baseClientName}(${counter})`;
                    counter++;
                }

                assignedPos = this._assignNextAvailablePosition();
            }

            const newPlayer = {
                id: conn.peer,
                name: clientName,
                position: assignedPos
            };

            // Wyrzuć zombie (stare widmo) z tego samego krzesła
            if (assignedPos !== null) {
                this.players = this.players.filter(p => p.position !== assignedPos);
            }
            this.players.push(newPlayer);

            if (this.onPlayerJoined) this.onPlayerJoined(this.players);

            // Wyślij nowemu pakiety powitalne i state
            this.broadcastLobbyUpdate();
            this.broadcastState();
        });

        conn.on('data', (data) => {
            console.log(`[Host] Otrzymano od ${conn.peer}:`, data);
            if (data.type === NETWORK_EVENTS.ACTION_BID) {
                if (this.onBidReceived) this.onBidReceived(conn.peer, data.payload);
            } else if (data.type === NETWORK_EVENTS.ACTION_PLAY) {
                if (this.onCardReceived) this.onCardReceived(conn.peer, data.payload);
            }
        });

        conn.on('close', () => {
            console.log(`[Host] Gracz ${conn.peer} rozłączył się`);

            const disconnectedPlayer = this.players.find(p => p.id === conn.peer);

            if (disconnectedPlayer) {
                // Rejestrujemy odejście na wypadek powrotu
                this.disconnectedPlayers[disconnectedPlayer.name] = {
                    position: disconnectedPlayer.position,
                    botReplaced: false,
                    reconnected: false
                };

                // Usuwamy id z bazy, ale zwalniamy miejsce tyko pośrednio
                this.players = this.players.filter(p => p.id !== conn.peer);
                delete this.connections[conn.peer];
                if (this.onPlayerLeft) this.onPlayerLeft(this.players);
                this.broadcastLobbyUpdate();

                // Ustawiamy timer 10s na zastąpienie botem, chyba że wróci
                setTimeout(() => {
                    const info = this.disconnectedPlayers[disconnectedPlayer.name];
                    if (info && !info.reconnected) { // Jeśli wpis wciąż istnieje i nie wrócil
                        console.log(`[Host] Gracz ${disconnectedPlayer.name} nie wrócił w 10s. Bot przejmuje stery (tymczasowo).`);
                        info.botReplaced = true;

                        // Zwróc bota w silniku
                        if (this.onPlayerReplaced) {
                            this.onPlayerReplaced(disconnectedPlayer.position);
                        }
                        this.broadcastState();
                    }
                }, 10000);
            } else {
                delete this.connections[conn.peer];
                this.players = this.players.filter(p => p.id !== conn.peer);
                if (this.onPlayerLeft) this.onPlayerLeft(this.players);
                this.broadcastLobbyUpdate();
            }
        });
    }

    _assignNextAvailablePosition() {
        // S = Host zawsze
        const taken = this.players.map(p => p.position).concat(['S']);
        const available = ['N', 'E', 'W'].filter(pos => !taken.includes(pos));
        return available[0] || null; // N, następnie E, na końcu W, jeśli brak miejsc => spectator
    }

    broadcastState() {
        // Pobierz najnowszy stan gry z logiki
        if (!this.onStateRequired) return;
        const state = this.onStateRequired();
        if (!state) return; // gra się jeszcze nie zaczęła

        // Wysyłamy go do wsyzstkich
        Object.values(this.connections).forEach(conn => {
            if (conn.open) {
                conn.send({
                    type: NETWORK_EVENTS.STATE_UPDATE,
                    payload: state
                });
            }
        });
    }

    broadcastLobbyUpdate() {
        Object.values(this.connections).forEach(conn => {
            if (conn.open) {
                conn.send({
                    type: NETWORK_EVENTS.STATE_UPDATE,
                    payload: {
                        isLobbyUpdate: true,
                        players: this.players,
                        hostId: this.myId,
                        hostName: window.gameSettings ? window.gameSettings.playerName : 'Host',
                        timeLimit: window.gameSettings ? window.gameSettings.timeLimit : 0
                    }
                });
            }
        });
    }
}

class NetworkClient extends NetworkManager {
    constructor(onStateReceived, onLobbyUpdate, onError) {
        super();
        this.isHost = false;
        this.conn = null;

        // Callbacks
        this.onStateReceived = onStateReceived;
        this.onLobbyUpdate = onLobbyUpdate; // do odświeżania listy na ekranie poczekalni
        this.onError = onError;
    }

    joinRoom(codeCode, callback) {
        const fullCode = `BRYDZ-${codeCode.toUpperCase()}`;

        // Klient dostaje losowe ID, nie interesuje nas ono zewnętrznie
        this.peer = new Peer({ debug: 2 });

        this.peer.on('open', (id) => {
            this.myId = id;
            console.log(`[Client] Zainicjowany. Próba łączenia z ${fullCode}...`);

            this.conn = this.peer.connect(fullCode, {
                reliable: true,
                metadata: { name: window.gameSettings ? window.gameSettings.playerName : 'Gracz' }
            });

            this.conn.on('open', () => {
                console.log(`[Client] Połączono z Hostem!`);
                if (callback) callback();
            });

            this.conn.on('data', (data) => {
                console.log(`[Client] Otrzymano od Hosta:`, data);
                if (data.type === NETWORK_EVENTS.STATE_UPDATE) {
                    if (data.payload.isLobbyUpdate) {
                        this.players = data.payload.players;
                        if (this.onLobbyUpdate) this.onLobbyUpdate(this.players, data.payload.hostId, data.payload.timeLimit, data.payload.hostName);
                        return;
                    }
                    if (this.onStateReceived) this.onStateReceived(data.payload);
                }
            });

            this.conn.on('close', () => {
                console.log('[Client] Host rozłączył się lub wyrzucił nas z pokoju');
                if (this.onError) this.onError('Połączenie z hostem utracone.');
            });
        });

        this.peer.on('error', (err) => {
            console.error('PeerJS Client Error:', err);
            if (this.onError) {
                if (err.type === 'peer-unavailable') {
                    this.onError('Nie znaleziono pokoju o tym kodzie.');
                } else {
                    this.onError('Błąd połączenia: ' + err.message);
                }
            }
        });
    }

    sendBid(bidString) {
        if (this.conn && this.conn.open) {
            this.conn.send({
                type: NETWORK_EVENTS.ACTION_BID,
                payload: bidString
            });
        }
    }

    sendPlayCard(cardId) {
        if (this.conn && this.conn.open) {
            this.conn.send({
                type: NETWORK_EVENTS.ACTION_PLAY,
                payload: cardId
            });
        }
    }
}
