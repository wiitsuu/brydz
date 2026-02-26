// ============================================================
// BridgeGame — główna maszyna stanów gry
// ============================================================

const GAME_STATES = {
    MENU: 'menu',
    DEALING: 'dealing',
    BIDDING: 'bidding',
    PLAYING: 'playing',
    TRICK_END: 'trick_end',
    SCORING: 'scoring',
    GAME_OVER: 'game_over'
};

class BridgeGame {
    constructor(isClient = false) {
        this.isClient = isClient;
        this.networkPlayers = { 'N': null, 'E': null, 'S': 'local', 'W': null }; // S = Host fallback
        this.myPosition = 'S'; // Gdzie wizualnie siedzimy my (zawsze S w UI, ale logicznie to się zmapuje)

        this.state = GAME_STATES.MENU;
        this.hands = {};
        this.dealer = 'N';
        this.playerNames = {
            'N': 'Kaczorex',
            'E': 'Kaszub',
            'S': window.gameSettings ? window.gameSettings.playerName : 'Gracz',
            'W': 'Witsu'
        };
        this.biddingManager = null;
        this.trickManager = null;
        this.contract = null;
        this.dummy = null;
        this.declarer = null;
        this.currentPlayer = null;
        this.ai = {};
        this.scores = { NS: 0, EW: 0 };
        this.roundHistory = [];
        this.roundNumber = 0;

        this.turnTimer = null;
        this.turnEndTime = null;
        this.timeLimit = 0;

        if (!this.isClient) {
            // AI tylko u Hosta/w singlu
            for (const pos of ['N', 'E', 'W']) {
                this.ai[pos] = new BridgeAI(pos);
            }
        }

        this.onStateChange = null;
        this.onCardPlayed = null;
        this.onBidMade = null;
        this.onTrickComplete = null;
    }

    // MAPOWANIE LOBBY
    setNetworkPlayers(players) {
        // Reset 
        this.networkPlayers = { 'N': null, 'E': null, 'S': null, 'W': null };
        // 'players' przychodzi z network.js: [{ id, position, name }]
        this.networkPlayers['S'] = 'local'; // Host to S na swoim ekranie (logicznie)

        players.forEach(p => {
            if (p.position && p.id !== network.myId) {
                this.networkPlayers[p.position] = p.id;
            }
            if (p.position && p.name) {
                this.playerNames[p.position] = p.name;
            }
        });

        // Brakujący to boty (null)
    }

    replacePlayerWithBot(pos) {
        if (this.isClient) return;

        this.networkPlayers[pos] = null;
        let defaultNames = { 'N': 'Kaczorex', 'E': 'Kaszub', 'W': 'Witsu', 'S': 'Gracz' };
        this.playerNames[pos] = defaultNames[pos];

        if (!this.ai[pos]) {
            this.ai[pos] = new BridgeAI(pos);
        }

        // Pchnij grę dalej jeśli stała na ruchu tego gracza
        if (this.state === GAME_STATES.BIDDING && this.biddingManager && this.biddingManager.currentPlayer === pos) {
            setTimeout(() => this._processAIBidding(), 1000);
        } else if (this.state === GAME_STATES.PLAYING && this.trickManager && this.trickManager.currentPlayer === pos) {
            setTimeout(() => this._processAIPlay(), 1000);
        }

        this._emitStateChange();
    }

    restorePlayer(pos, name, id) {
        if (this.isClient) return;

        this.networkPlayers[pos] = id;
        this.playerNames[pos] = name;
        this.ai[pos] = null; // Wywal bota, gracz przejął fotel!

        this._emitStateChange();
    }

    startNewRound() {
        if (this.isClient) return; // Klient nie startuje gry

        this.roundNumber++;
        const deck = new Deck();
        this.hands = deck.deal();
        this.biddingManager = new BiddingManager(this.dealer);
        this.trickManager = null;
        this.contract = null;
        this.dummy = null;
        this.declarer = null;

        this.state = GAME_STATES.BIDDING;
        this.currentPlayer = this.dealer;
        this._emitStateChange();

        if (this.currentPlayer !== 'S' && !this._isHumanControlled(this.currentPlayer)) {
            setTimeout(() => this._processAIBidding(), 600);
        }
    }

    // ---- LICYTACJA ----

    getValidBids() {
        if (this.state !== GAME_STATES.BIDDING) return [];
        return this.biddingManager.getValidBids();
    }

    playerBid(bid) {
        if (this.state !== GAME_STATES.BIDDING) return;

        // Zabezpieczenie przed grą poza swoją kolejką (nawet jako klient)
        const currentPos = this.biddingManager.currentPlayer;

        // Dla singla/hosta: Sklikanie w UI, więc "S". Dla klienta: klik w UI, wyślij do hosta.
        if (this.isClient) {
            if (network) network.sendBid(bid.suit ? `${bid.level}${bid.suit}` : bid.type);
            return;
        }

        if (currentPos !== 'S') return; // Tylko S klika lokalnie

        bid.player = 'S';
        this.biddingManager.makeBid(bid);
        if (this.onBidMade) this.onBidMade(bid);

        if (this.biddingManager.finished) {
            this._handleBiddingComplete();
        } else {
            this._emitStateChange(); // Sync
            if (!this._isHumanControlled(this.biddingManager.currentPlayer)) {
                setTimeout(() => this._processAIBidding(), 600);
            }
        }
    }

    // Wywoływane u Hosta, gdy network.js przekaże akcję
    handleNetworkBid(peerId, bidString) {
        if (this.state !== GAME_STATES.BIDDING) return;
        const currentPos = this.biddingManager.currentPlayer;
        if (this.networkPlayers[currentPos] !== peerId) return; // To nie jego kolej

        // Parsuj bidString spowrotem na obiekt bid
        const validBids = this.biddingManager.getValidBids();
        let bidObj = null;
        if (bidString === 'pass') bidObj = validBids.find(b => b.type === 'pass');
        else if (bidString === 'double') bidObj = validBids.find(b => b.type === 'double');
        else if (bidString === 'redouble') bidObj = validBids.find(b => b.type === 'redouble');
        else {
            const lvl = parseInt(bidString.charAt(0));
            const suit = bidString.substring(1);
            bidObj = validBids.find(b => b.type === 'bid' && b.level === lvl && b.suit === suit);
        }

        if (bidObj) {
            bidObj.player = currentPos;
            this.biddingManager.makeBid(bidObj);
            if (this.onBidMade) this.onBidMade(bidObj);

            if (this.biddingManager.finished) {
                this._handleBiddingComplete();
            } else {
                this._emitStateChange();
                if (!this._isHumanControlled(this.biddingManager.currentPlayer)) {
                    setTimeout(() => this._processAIBidding(), 600);
                }
            }
        }
    }

    _processAIBidding() {
        if (this.state !== GAME_STATES.BIDDING) return;
        if (this.biddingManager.finished) return;

        const currentPos = this.biddingManager.currentPlayer;
        if (currentPos === 'S') {
            this.currentPlayer = 'S';
            this._emitStateChange();
            return;
        }

        const ai = this.ai[currentPos];
        const bid = ai.chooseBid(this.hands[currentPos], this.biddingManager);
        bid.player = currentPos;
        this.biddingManager.makeBid(bid);
        if (this.onBidMade) this.onBidMade(bid);

        if (this.biddingManager.finished) {
            this._handleBiddingComplete();
        } else {
            setTimeout(() => this._processAIBidding(), 600);
        }
    }

    _handleBiddingComplete() {
        this.contract = this.biddingManager.contract;

        if (!this.contract) {
            this._nextDealer();
            setTimeout(() => this.startNewRound(), 1500);
            return;
        }

        this.declarer = this.contract.declarer;
        this.dummy = this.contract.dummy;

        this.trickManager = new TrickManager(this.contract);

        // Standardowa zasada brydża: przeciwnik po lewej od rozgrywającego wychodzi
        const leader = NEXT_PLAYER[this.declarer];

        this.state = GAME_STATES.PLAYING;
        this.trickManager.startTrick(leader);
        this.currentPlayer = leader;
        this._emitStateChange();

        // Use centralized check
        if (!this._isHumanControlled(leader)) {
            setTimeout(() => this._processAIPlay(), 800);
        }
    }

    // ---- ROZGRYWKA ----

    // Centralna metoda: czy dany gracz jest kontrolowany przez człowieka (Kogoś z wirtualnego stołu)?
    _isHumanControlled(position) {
        if (this.isClient) return false; // Klient uważa wszystko za AI, tylko Host decyduje co robić

        // Dziadek jest w pełni oddany pod rozkazy rozgrywającego
        if (position === this.dummy) {
            return !!this.networkPlayers[this.declarer];
        }

        const controller = this.networkPlayers[position];
        if (controller) return true; // Lokalny 'local' lub sieciowy peer id

        return false;
    }

    getPlayableCards() {
        if (this.state !== GAME_STATES.PLAYING) return [];

        const activePlayer = this.trickManager.currentPlayer;

        if (this._isHumanControlled(activePlayer)) {
            return this.trickManager.getPlayableCards(this.hands[activePlayer], activePlayer);
        }

        return [];
    }

    playerPlayCard(card) {
        if (this.state !== GAME_STATES.PLAYING) return;
        if (this.trickManager && this.trickManager.currentTrick && this.trickManager.currentTrick.complete) return;

        if (this.isClient) {
            if (this._waitingForHostResponse) return;
            this._waitingForHostResponse = true;

            if (network) network.sendPlayCard(card.id);
            return;
        }

        const activePlayer = this.trickManager.currentPlayer;

        // Tutaj akceptujemy tylko nasz ruch lub ruch dziadka, jeśli jesteśmy rozgrywającym
        let canLocalPlay = false;
        if (activePlayer === this.myPosition) canLocalPlay = true;
        if (activePlayer === this.dummy && this.declarer === this.myPosition) canLocalPlay = true;

        if (!canLocalPlay) return;

        const hand = this.hands[activePlayer];
        const playable = this.trickManager.getPlayableCards(hand, activePlayer);
        if (!playable.find(c => c.id === card.id)) return;

        const idx = hand.findIndex(c => c.id === card.id);
        hand.splice(idx, 1);

        this.trickManager.playCard(activePlayer, card);
        if (this.onCardPlayed) this.onCardPlayed(activePlayer, card);

        this._afterCardPlayed();
    }

    _processAIPlay() {
        if (this.state !== GAME_STATES.PLAYING) return;

        const activePlayer = this.trickManager.currentPlayer;
        if (!activePlayer) return;

        // If human controls this position, give control to human
        if (this._isHumanControlled(activePlayer)) {
            this.currentPlayer = activePlayer;
            this._emitStateChange();
            return;
        }

        // AI plays
        let aiPlayer;
        const hand = this.hands[activePlayer];

        if (activePlayer === this.dummy) {
            // Dummy's cards are played by the declarer's AI
            aiPlayer = this.ai[this.declarer];
        } else {
            aiPlayer = this.ai[activePlayer];
        }

        if (!aiPlayer) {
            console.error('No AI player for', activePlayer, 'declarer:', this.declarer);
            return;
        }

        const card = aiPlayer.chooseCard(hand, this.trickManager, this.hands, this.contract, activePlayer);
        if (!card) {
            console.warn('AI could not choose a card for', activePlayer, 'hand:', hand.length);
            return;
        }

        const idx = hand.findIndex(c => c.id === card.id);
        hand.splice(idx, 1);

        this.trickManager.playCard(activePlayer, card);
        if (this.onCardPlayed) this.onCardPlayed(activePlayer, card);

        this._afterCardPlayed();
    }

    _afterCardPlayed() {
        const trick = this.trickManager.currentTrick;

        if (trick.complete) {
            if (this.onTrickComplete) this.onTrickComplete(trick);

            if (this.trickManager.allComplete) {
                setTimeout(() => this._handleRoundEnd(), 3000);
            } else {
                setTimeout(() => {
                    this.trickManager.startTrick(trick.winner);
                    this.currentPlayer = trick.winner;
                    this._emitStateChange();

                    // Use centralized check
                    if (!this._isHumanControlled(trick.winner)) {
                        setTimeout(() => this._processAIPlay(), 600);
                    }
                }, 3500);
            }
        } else {
            setTimeout(() => this._processAIPlay(), 600);
        }
    }

    _handleRoundEnd() {
        const declarerTricks = this.trickManager.trickCount[TEAM[this.declarer]];
        const result = Scoring.calculate(this.contract, declarerTricks);

        if (result.team === 'NS') {
            this.scores.NS += result.total;
        } else {
            this.scores.EW += result.total;
        }

        this.roundHistory.push({
            round: this.roundNumber,
            contract: this.contract,
            tricks: declarerTricks,
            result: result
        });

        this.state = GAME_STATES.SCORING;
        this.lastResult = result;
        this._emitStateChange();
    }

    nextRound() {
        this._nextDealer();
        this.startNewRound();
    }

    _nextDealer() {
        this.dealer = NEXT_PLAYER[this.dealer];
    }

    _emitStateChange() {
        if (!this.isClient) {
            this._clearTurnTimer();
            if ((this.state === GAME_STATES.BIDDING && this.biddingManager && !this.biddingManager.finished) ||
                (this.state === GAME_STATES.PLAYING && this.trickManager && !this.trickManager.currentTrick.complete)) {

                const current = this.state === GAME_STATES.BIDDING ? this.biddingManager.currentPlayer : this.trickManager.currentPlayer;
                const limit = window.gameSettings ? window.gameSettings.timeLimit : 0;

                if (limit > 0 && this._isHumanControlled(current)) {
                    this.turnEndTime = Date.now() + limit * 1000;
                    this.timeLimit = limit;
                    this.turnTimer = setTimeout(() => this._onTurnTimeout(), limit * 1000);
                }
            }
        }

        if (this.onStateChange) this.onStateChange(this.state);

        // Host rozsyła stan do klientów po każdej najmniejszej zmianie
        if (!this.isClient && network && network.isHost) {
            network.broadcastState();
        }
    }

    // ---- TIMER TURY ----
    _clearTurnTimer() {
        if (this.turnTimer) clearTimeout(this.turnTimer);
        this.turnTimer = null;
        this.turnEndTime = null;
    }

    _onTurnTimeout() {
        if (this.state === GAME_STATES.BIDDING) {
            console.log(`[Host] Czas minął! Gracz automatycznie pasuje.`);
            this._forcePass();
        } else if (this.state === GAME_STATES.PLAYING) {
            console.log(`[Host] Czas minął! Gracz automatycznie zagrywa.`);
            this._forcePlay();
        }
    }

    _forcePass() {
        if (this.state !== GAME_STATES.BIDDING) return;
        const bid = new Bid('pass', null, null, this.biddingManager.currentPlayer);
        this.biddingManager.makeBid(bid);
        if (this.onBidMade) this.onBidMade(bid);

        if (this.biddingManager.finished) {
            this._handleBiddingComplete();
        } else {
            this._emitStateChange();
            if (!this._isHumanControlled(this.biddingManager.currentPlayer)) {
                setTimeout(() => this._processAIBidding(), 600);
            }
        }
    }

    _forcePlay() {
        if (this.state !== GAME_STATES.PLAYING) return;
        const activePlayer = this.trickManager.currentPlayer;
        const hand = this.hands[activePlayer];
        const playable = this.trickManager.getPlayableCards(hand, activePlayer);

        if (playable.length === 0) return;

        playable.sort((a, b) => a.value - b.value);
        const cardToPlay = playable[0];

        const idx = hand.findIndex(c => c.id === cardToPlay.id);
        hand.splice(idx, 1);

        this.trickManager.playCard(activePlayer, cardToPlay);
        if (this.onCardPlayed) this.onCardPlayed(activePlayer, cardToPlay);

        this._afterCardPlayed();
    }

    // Wywoływane u Hosta z sieci
    handleNetworkPlay(peerId, cardId) {
        if (this.state !== GAME_STATES.PLAYING) return;
        if (this.trickManager && this.trickManager.currentTrick && this.trickManager.currentTrick.complete) return;

        const activePlayer = this.trickManager.currentPlayer;

        let expectedController = this.networkPlayers[activePlayer];
        if (activePlayer === this.dummy) {
            expectedController = this.networkPlayers[this.declarer];
        }

        if (expectedController !== peerId) return;

        const hand = this.hands[activePlayer];
        const playable = this.trickManager.getPlayableCards(hand, activePlayer);
        const cardToPlay = playable.find(c => c.id === cardId);

        if (cardToPlay) {
            const idx = hand.findIndex(c => c.id === cardId);
            hand.splice(idx, 1);

            this.trickManager.playCard(activePlayer, cardToPlay);
            if (this.onCardPlayed) this.onCardPlayed(activePlayer, cardToPlay);
            this._afterCardPlayed();
        }
    }

    // ===================================
    // SYNC SIECIOWY
    // ===================================

    getState() {
        // Serializujemy stan tylko dla odczytu wizualnego
        let serializedHands = {};
        for (let pos of ['N', 'E', 'S', 'W']) {
            if (this.hands[pos]) {
                serializedHands[pos] = this.hands[pos].map(c => ({ id: c.id, value: c.value, suit: c.suit }));
            }
        }

        let trickData = null;
        if (this.trickManager) {
            let trickCards = {};
            if (this.trickManager.currentTrick) {
                for (let pos of ['N', 'E', 'S', 'W']) {
                    if (this.trickManager.currentTrick.cards[pos]) {
                        const c = this.trickManager.currentTrick.cards[pos];
                        trickCards[pos] = { id: c.id, value: c.value, suit: c.suit };
                    }
                }
            }

            trickData = {
                trickCount: this.trickManager.trickCount,
                currentPlayer: this.trickManager.currentPlayer,
                currentTrick: this.trickManager.currentTrick ? {
                    cards: trickCards,
                    order: this.trickManager.currentTrick.order,
                    winner: this.trickManager.currentTrick.winner,
                    ledSuit: this.trickManager.currentTrick.ledSuit,
                    complete: this.trickManager.currentTrick.complete
                } : null
            };
        }

        let biddingData = null;
        if (this.biddingManager) {
            biddingData = {
                bids: this.biddingManager.bids,
                contract: this.biddingManager.contract,
                currentPlayer: this.biddingManager.currentPlayer,
                finished: this.biddingManager.finished
            }
        }

        return {
            state: this.state,
            roundNumber: this.roundNumber,
            dealer: this.dealer,
            declarer: this.declarer,
            dummy: this.dummy,
            currentPlayer: this.currentPlayer,
            scores: this.scores,
            hands: serializedHands,
            trickManager: trickData,
            biddingManager: biddingData,
            networkPlayers: this.networkPlayers,
            playerNames: this.playerNames,
            turnEndTime: this.turnEndTime,
            timeLimit: this.timeLimit
        };
    }

    // ---- POŁĄCZENIE SIECIOWE (KLIENT ODBIERA) ----

    updateStateFromHost(statePayload) {
        if (!statePayload) return;

        // Zwalniamy blokadę klikania po otrzymaniu potwierdzenia od Hosta
        this._waitingForHostResponse = false;

        // Zrekonstruuj wszystko powierzchownie do rysowania w UI
        this.state = statePayload.state;
        this.turnEndTime = statePayload.turnEndTime;
        this.timeLimit = statePayload.timeLimit;

        if (statePayload.playerNames) {
            this.playerNames = statePayload.playerNames;
        }

        this.roundNumber = statePayload.roundNumber;
        this.dealer = statePayload.dealer;
        this.declarer = statePayload.declarer;
        this.dummy = statePayload.dummy;
        this.currentPlayer = statePayload.currentPlayer;
        this.scores = statePayload.scores;
        this.networkPlayers = statePayload.networkPlayers;

        // Magia: zawsze traktuj "S" jako gracza lokalnego. Ale w sieci klient N ma siebie u Hosta na N.
        // TBD: rotacja stołu tak, żeby klient zawsze siedział na dole. 
        if (this.isClient && typeof network !== 'undefined' && network) {
            let foundPos = null;
            for (const [pos, id] of Object.entries(this.networkPlayers)) {
                if (id === network.myId) {
                    foundPos = pos;
                    break;
                }
            }
            this.myPosition = foundPos || 'S';
        }

        // Hands
        this.hands = {};
        for (let pos of ['N', 'E', 'S', 'W']) {
            if (statePayload.hands[pos]) {
                this.hands[pos] = statePayload.hands[pos].map(c => new Card(c.suit, c.value));
            }
        }

        // Bidding
        if (statePayload.biddingManager) {
            const bm = new BiddingManager(statePayload.dealer);
            if (statePayload.biddingManager.bids) {
                statePayload.biddingManager.bids.forEach(b => {
                    const bid = new Bid(b.type, b.level, b.suit, b.player);
                    bm.makeBid(bid);
                });
            }
            // Mimo odtworzenia synchronizujemy z hostem
            bm.currentPlayer = statePayload.biddingManager.currentPlayer;
            bm.finished = statePayload.biddingManager.finished;
            bm.contract = statePayload.biddingManager.contract;

            this.biddingManager = bm;
        }

        // Tricks
        if (statePayload.trickManager) {
            this.trickManager = {
                trickCount: statePayload.trickManager.trickCount,
                currentPlayer: statePayload.trickManager.currentPlayer,
                currentTrick: statePayload.trickManager.currentTrick ? {
                    cards: {},
                    order: statePayload.trickManager.currentTrick.order,
                    winner: statePayload.trickManager.currentTrick.winner,
                    ledSuit: statePayload.trickManager.currentTrick.ledSuit,
                    complete: statePayload.trickManager.currentTrick.complete
                } : null,
                // fake method
                getPlayableCards: (hand, pos) => {
                    // Dla uproszczenia zwrócimy wszystkie (UI samo weryfikuje uderzeniem w Hosta)
                    return hand;
                }
            };

            if (statePayload.trickManager.currentTrick && this.trickManager.currentTrick) {
                for (let pos of ['N', 'E', 'S', 'W']) {
                    if (statePayload.trickManager.currentTrick.cards[pos]) {
                        const c = statePayload.trickManager.currentTrick.cards[pos];
                        this.trickManager.currentTrick.cards[pos] = new Card(c.suit, c.value);
                    }
                }
            }
        }
    }
}
