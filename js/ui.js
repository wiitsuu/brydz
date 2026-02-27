// ============================================================
// UI — renderowanie interfejsu gry w brydża
// ============================================================

class BridgeUI {
    constructor(game) {
        this.game = game;
        this.elements = {};
        this.selectedBidLevel = 1;
        this._cacheElements();
        this._bindEvents();
    }

    _cacheElements() {
        this.elements = {
            menuScreen: document.getElementById('menu-screen'),
            gameScreen: document.getElementById('game-screen'),
            scoringOverlay: document.getElementById('scoring-overlay'),

            southHand: document.getElementById('south-hand'),
            northHand: document.getElementById('north-hand'),
            westHand: document.getElementById('west-hand'),
            eastHand: document.getElementById('east-hand'),

            trickArea: document.getElementById('trick-area'),
            biddingPanel: document.getElementById('bidding-panel'),
            biddingHistory: document.getElementById('bidding-history'),
            bidGrid: document.getElementById('bid-grid'),
            bidActions: document.getElementById('bid-actions'),
            bidLevelTabs: document.getElementById('bid-level-tabs'),

            statusBar: document.getElementById('status-bar'),
            contractInfo: document.getElementById('contract-info'),
            contractValue: document.getElementById('contract-value'),
            trumpInfo: document.getElementById('trump-info'),
            trumpSuitValue: document.getElementById('trump-suit-value'),
            tricksInfo: document.getElementById('tricks-info'),
            scorePanelNS: document.getElementById('score-ns'),
            scorePanelEW: document.getElementById('score-ew'),
            waitingIndicator: document.getElementById('waiting-indicator'),

            scoringCard: document.getElementById('scoring-card'),

            playerLabels: {
                S: document.getElementById('label-south'),
                N: document.getElementById('label-north'),
                W: document.getElementById('label-west'),
                E: document.getElementById('label-east'),
            }
        };
    }

    _bindEvents() {
        // Game callbacks
        this.game.onStateChange = (state) => this._onStateChange(state);
        this.game.onCardPlayed = (player, card) => this._onCardPlayed(player, card);
        this.game.onBidMade = (bid) => this._onBidMade(bid);
        this.game.onTrickComplete = (trick) => this._onTrickComplete(trick);
    }

    // ---- SCREENS ----

    showMenu() {
        this.elements.menuScreen.classList.add('active');
        this.elements.gameScreen.classList.remove('active');
    }

    showGame() {
        this.elements.menuScreen.classList.remove('active');
        this.elements.gameScreen.classList.add('active');
        this.elements.scoringOverlay.classList.remove('active');
    }

    // ---- STATE CHANGES ----

    renderState(statePayload) {
        // Pełne odświeżenie UI na podstawie pakietu sieciowego
        this._lastState = null; // Wymuś pełne przejście przez enter-*

        this._onStateChange(this.game.state);

        // Odbudowa historii licytacji z tablicy
        if (this.game.state === GAME_STATES.BIDDING && this.game.biddingManager) {
            this._clearBiddingHistory();
            // Rekonstruuj grid bidingowy z uwzględnieniem podanej pozycji 
            if (this.game.biddingManager.bids) {
                this.game.biddingManager.bids.forEach(bid => this._addBidToHistory(bid));
            }
            this._updateBiddingUI();
        }

        // Odbudowa lewy na stole
        if (this.game.state === GAME_STATES.PLAYING && this.game.trickManager) {
            this._clearTrickArea();
            if (this.game.trickManager.currentTrick && this.game.trickManager.currentTrick.cards) {
                const trickCards = this.game.trickManager.currentTrick.cards;
                for (const pos of ['N', 'E', 'S', 'W']) {
                    if (trickCards[pos]) {
                        this._addCardToTrick(pos, trickCards[pos]);
                    }
                }
            }
        }
    }

    _onStateChange(state) {
        // Only run enter-* methods on actual state transitions
        if (state === this._lastState) {
            // Same state — just refresh dynamic elements
            if (state === GAME_STATES.PLAYING) {
                this._renderAllHands();
                this._updatePlayingStatus();
                this._updatePlayerLabels();
            }
            this._updateTimeProgress();
            return;
        }

        this._lastState = state;

        switch (state) {
            case GAME_STATES.BIDDING:
                this._enterBidding();
                break;
            case GAME_STATES.PLAYING:
                this._enterPlaying();
                break;
            case GAME_STATES.SCORING:
                this._enterScoring();
                break;
        }
        this._updateTimeProgress();
    }

    _updateTimeProgress() {
        const bar = document.getElementById('time-progress-bar');
        if (!bar) return;

        if (!this.game.turnEndTime || !this.game.timeLimit) {
            bar.style.transition = 'none';
            bar.style.width = '0%';
            bar.className = 'time-progress-bar';
            if (this._timerColorTimeout) clearTimeout(this._timerColorTimeout);
            this._lastTurnEndTime = null;
            return;
        }

        if (this._lastTurnEndTime === this.game.turnEndTime) return;
        this._lastTurnEndTime = this.game.turnEndTime;

        const timeLeft = this.game.turnEndTime - Date.now();
        if (timeLeft <= 0) {
            bar.style.transition = 'none';
            bar.style.width = '0%';
            return;
        }

        const pct = (timeLeft / (this.game.timeLimit * 1000)) * 100;

        bar.style.transition = 'none';
        bar.style.width = pct + '%';
        bar.className = 'time-progress-bar'; // reset colors

        void bar.offsetWidth; // Force reflow

        bar.style.transition = `width ${timeLeft}ms linear, background-color 0.3s ease`;
        bar.style.width = '0%';

        if (this._timerColorTimeout) clearTimeout(this._timerColorTimeout);

        const timeToWarning = timeLeft - 5000;
        const timeToDanger = timeLeft - 2000;

        if (timeToWarning > 0) {
            this._timerColorTimeout = setTimeout(() => {
                bar.classList.add('warning');
                this._timerColorTimeout = setTimeout(() => {
                    bar.classList.add('danger');
                }, 3000);
            }, timeToWarning);
        } else if (timeToDanger > 0) {
            bar.classList.add('warning');
            this._timerColorTimeout = setTimeout(() => bar.classList.add('danger'), timeToDanger);
        } else {
            bar.classList.add('danger');
        }
    }

    _enterBidding() {
        this.showGame();
        this._renderAllHands();
        this._showBiddingPanel();
        this._clearTrickArea();
        this._updateStatus('Licytacja — Twoja kolej!');
        this._updateScores();
        this._hideContractInfo();
        this._updatePlayerLabels();
        this._updateBiddingUI();
    }

    _enterPlaying() {
        this._hideBiddingPanel();
        this._renderAllHands();
        this._clearTrickArea();
        this._showContractInfo();
        this._updateScores();
        this._updatePlayerLabels();
        this._updateTricks();
        this._updatePlayingStatus();
    }

    _enterScoring() {
        this._showScoringOverlay();
    }

    // ---- DYNAMIC TABLE ROTATION & NAMES ----

    _getPlayerName(pos) {
        let defaultNames = { 'N': 'Kaczorex', 'E': 'Kaszub', 'W': 'Witsu', 'S': 'Gracz' };
        let name = defaultNames[pos];

        if (this.game && this.game.playerNames && this.game.playerNames[pos]) {
            name = this.game.playerNames[pos];
        }

        const lang = window.gameSettings ? window.gameSettings.lang : 'pl';
        if (this.game && pos === this.game.myPosition && !name.includes('(Ty)') && !name.includes('(You)') && !name.includes('(Tú)')) {
            name += lang === 'pl' ? ' (Ty)' : (lang === 'es' ? ' (Tú)' : ' (You)');
        }
        return name;
    }

    _getDisplayPositions() {
        const my = this.game.myPosition || 'S';
        const order = ['N', 'E', 'S', 'W'];
        const idx = order.indexOf(my);
        return {
            S: my,                         // Bottom
            W: order[(idx + 1) % 4],       // Left
            N: order[(idx + 2) % 4],       // Top
            E: order[(idx + 3) % 4]        // Right
        };
    }

    // ---- RENDER HANDS ----

    _renderAllHands() {
        const pos = this._getDisplayPositions();
        this._renderBottomHand(pos.S);
        this._renderTopHand(pos.N);
        this._renderLeftHand(pos.W);
        this._renderRightHand(pos.E);
    }

    _renderBottomHand(logicalPos) {
        const hand = this.game.hands[logicalPos] || [];
        const container = this.elements.southHand;
        container.innerHTML = '';

        const isPlaying = this.game.state === GAME_STATES.PLAYING;
        const isMyTurn = isPlaying && this.game.trickManager && this.game.trickManager.currentPlayer === logicalPos;
        const amIDummy = isPlaying && this.game.dummy === logicalPos;

        // CZY JA MOGĘ KLIKAĆ W MOJE KARTY NA DOLE?
        // Tak, jeśli to moja tura (i nie jestem dziadkiem zarządzanym przez AI)
        // ALBO jeśli na dole jest dziadek, a JA jestem rozgrywającym. 
        // W "bottom hand" zawsze widzimy siebie, więc to musi być nasz ruch.
        const canPlay = isMyTurn && !amIDummy;
        const playable = canPlay ? this.game.getPlayableCards() : [];

        // TEMP DEBUG — widoczny debug na ekranie
        if (isPlaying && this.game.isClient) {
            let dbg = document.getElementById('_debug_overlay');
            if (!dbg) {
                dbg = document.createElement('div');
                dbg.id = '_debug_overlay';
                dbg.style.cssText = 'position:fixed;top:40px;right:10px;background:rgba(0,0,0,0.85);color:#0f0;font:11px monospace;padding:6px 10px;z-index:9999;border-radius:4px;pointer-events:none;';
                document.body.appendChild(dbg);
            }
            const cp = this.game.trickManager ? this.game.trickManager.currentPlayer : 'null';
            const tComplete = this.game.trickManager && this.game.trickManager.currentTrick ? this.game.trickManager.currentTrick.complete : '?';
            dbg.innerHTML = `pos=${logicalPos} cp=${cp} myTurn=${isMyTurn}<br>dummy=${this.game.dummy} amDummy=${amIDummy} canPlay=${canPlay}<br>playable=${playable.length} hand=${hand.length} tComplete=${tComplete}<br>waitHost=${this.game._waitingForHostResponse}`;
        }

        for (const card of hand) {
            const cardEl = this._createCardElement(card, true); // always face-up at bottom
            const isPlayable = playable.some(c => c.id === card.id);

            if (canPlay && isPlayable) {
                cardEl.classList.add('playable');
                cardEl.addEventListener('click', () => this._onPlayerCardClick(card));
            } else {
                cardEl.classList.add('all-playable'); // No hover lift
            }

            container.appendChild(cardEl);
        }
    }

    _renderTopHand(logicalPos) {
        this._renderSideHand(logicalPos, this.elements.northHand);
    }

    _renderLeftHand(logicalPos) {
        this._renderSideHand(logicalPos, this.elements.westHand);
    }

    _renderRightHand(logicalPos) {
        this._renderSideHand(logicalPos, this.elements.eastHand);
    }

    _renderNorthHand() {
        const hand = this.game.hands['N'];
        const container = this.elements.northHand;
        container.innerHTML = '';

        const isDummy = this.game.dummy === 'N' && this.game.state === GAME_STATES.PLAYING;
        const isPlayerDummy = isDummy && this.game.declarer === 'S';
        const playable = isPlayerDummy ? this.game.trickManager.getPlayableCards(hand, 'N') : [];
        const isMyTurn = isPlayerDummy && this.game.trickManager.currentPlayer === 'N';

        // Always add/remove dummy-hand class based on dummy status
        if (isDummy) {
            container.classList.add('dummy-hand');
        } else {
            container.classList.remove('dummy-hand');
        }

        for (const card of hand) {
            const cardEl = this._createCardElement(card, isDummy);

            if (isPlayerDummy) {
                const isPlayable = playable.some(c => c.id === card.id);
                if (isPlayable && isMyTurn) {
                    cardEl.classList.add('playable');
                    cardEl.addEventListener('click', () => this._onDummyCardClick(card, 'N'));
                }
            }

            container.appendChild(cardEl);
        }
    }

    _renderWestHand() {
        this._renderSideHand('W', this.elements.westHand);
    }

    _renderEastHand() {
        this._renderSideHand('E', this.elements.eastHand);
    }

    _renderSideHand(logicalPos, container) {
        const hand = this.game.hands[logicalPos] || [];
        container.innerHTML = '';

        const isDummy = this.game.dummy === logicalPos && this.game.state === GAME_STATES.PLAYING;
        // Czy MY gramy jako dziadek?
        const amIDeclarer = this.game.declarer === this.game.myPosition;
        const isPlayerDummy = isDummy && amIDeclarer;

        let playable = [];
        if (isPlayerDummy && this.game.trickManager) {
            playable = this.game.trickManager.getPlayableCards(hand, logicalPos);
        }

        const isMyTurn = isPlayerDummy && this.game.trickManager && this.game.trickManager.currentPlayer === logicalPos;

        // TEMP DEBUG — dummy na ekranie
        if (isDummy && this.game.isClient) {
            let dbg2 = document.getElementById('_debug_overlay2');
            if (!dbg2) {
                dbg2 = document.createElement('div');
                dbg2.id = '_debug_overlay2';
                dbg2.style.cssText = 'position:fixed;top:100px;right:10px;background:rgba(0,0,0,0.85);color:#ff0;font:11px monospace;padding:6px 10px;z-index:9999;border-radius:4px;pointer-events:none;';
                document.body.appendChild(dbg2);
            }
            const cp = this.game.trickManager ? this.game.trickManager.currentPlayer : 'null';
            dbg2.innerHTML = `DUMMY: pos=${logicalPos} cp=${cp}<br>isDummy=${isDummy} amDecl=${amIDeclarer}<br>isPlayerDummy=${isPlayerDummy} myTurn=${isMyTurn}<br>playable=${playable.length} hand=${hand.length}`;
        }

        if (isDummy) {
            container.classList.add('dummy-hand');
        } else {
            container.classList.remove('dummy-hand');
        }

        for (const card of hand) {
            // Odwróć if Dummy LUB z jakiegoś powodu widzimy karty (np Game Over)
            let showFaceUp = isDummy || this.game.state === GAME_STATES.GAME_OVER;

            // Jeśli JA jestem dziadkiem, pokaż mi karty rozgrywającego (mojego partnera)
            if (this.game.state === GAME_STATES.PLAYING && this.game.myPosition === this.game.dummy && logicalPos === this.game.declarer) {
                showFaceUp = true;
            }

            // Compact tylko na bocznych (pionowych) rękach dziadka
            const isVerticalSide = container === this.elements.westHand || container === this.elements.eastHand;
            const cardEl = this._createCardElement(card, showFaceUp, isDummy && isVerticalSide);

            if (isPlayerDummy) {
                const isPlayable = playable.some(c => c.id === card.id);
                if (isPlayable && isMyTurn) {
                    cardEl.classList.add('playable');
                    cardEl.addEventListener('click', () => this._onDummyCardClick(card, logicalPos));
                }
            }

            container.appendChild(cardEl);
        }
    }

    _createCardElement(card, faceUp = true, compact = false) {
        const el = document.createElement('div');
        el.className = `card ${faceUp ? 'face-up' : 'face-down'} ${card.isRed ? 'red' : 'black'}`;
        if (compact) el.classList.add('compact');
        el.dataset.cardId = card.id;

        if (faceUp) {
            el.innerHTML = `
                <span class="card-value">${card.displayValue}</span>
                <span class="card-suit">${card.suitSymbol}</span>
                ${!compact ? `<span class="card-center-suit">${card.suitSymbol}</span>` : ''}
            `;
        }

        return el;
    }

    // ---- CARD CLICKS ----

    _onPlayerCardClick(card) {
        if (this.game.state !== GAME_STATES.PLAYING) return;
        if (this.game.trickManager.currentPlayer !== this.game.myPosition) return;

        this.game.playerPlayCard(card);
        this._renderAllHands();
        if (this.game.trickManager) this._updateTricks();
    }

    _onDummyCardClick(card, logicalPos) {
        if (this.game.state !== GAME_STATES.PLAYING) return;
        if (this.game.trickManager.currentPlayer !== logicalPos) return;
        if (this.game.declarer !== this.game.myPosition) return;

        this.game.playerPlayCard(card); // Game.js must know it's coming from dummy logically
        // Zrobimy lekką optymalizację do API u Hosta w game.js: "playerPlayCard" pobiera currentPlayer, wiec to zagra z dummy
        this._renderAllHands();
        if (this.game.trickManager) this._updateTricks();
    }

    // ---- TRICK AREA ----

    _onCardPlayed(player, card) {
        const oldCard = document.querySelector(`.card[data-card-id="${card.id}"]`);
        let originRect = null;
        if (oldCard) {
            originRect = oldCard.getBoundingClientRect();
        }

        this._renderAllHands();
        this._addCardToTrick(player, card, originRect);
        this._updateTricks();
        this._updatePlayingStatus();
        this._updatePlayerLabels();
    }

    _addCardToTrick(logicalPos, card, originRect) {
        const layout = this._getDisplayPositions(); // { S: 'N', W: 'E', N: 'S', E: 'W' } mapuje UI -> Logic
        // Trzeba odwrócić żeby dowiedzieć się na którym slocie UI siedzi logicalPos
        let slotClass = '';
        if (layout.S === logicalPos) slotClass = 'south-trick';
        if (layout.W === logicalPos) slotClass = 'west-trick';
        if (layout.N === logicalPos) slotClass = 'north-trick';
        if (layout.E === logicalPos) slotClass = 'east-trick';

        const cardEl = this._createCardElement(card, true);
        cardEl.classList.add('trick-card', slotClass);

        if (originRect) {
            // Bez !important czasami nie działa ignorowanie keyframe'ów
            cardEl.style.setProperty('animation', 'none', 'important');
        }

        this.elements.trickArea.appendChild(cardEl);

        if (originRect) {
            const destRect = cardEl.getBoundingClientRect();
            const deltaX = originRect.left - destRect.left;
            const deltaY = originRect.top - destRect.top;

            cardEl.style.setProperty('--anim-x', `${deltaX}px`);
            cardEl.style.setProperty('--anim-y', `${deltaY}px`);
            cardEl.style.zIndex = '100';

            // Force reflow
            void cardEl.offsetWidth;

            setTimeout(() => {
                cardEl.style.transition = 'transform 0.35s ease-out';
                cardEl.style.setProperty('--anim-x', '0px');
                cardEl.style.setProperty('--anim-y', '0px');

                setTimeout(() => {
                    cardEl.style.zIndex = '';
                    cardEl.style.transition = '';
                    cardEl.style.removeProperty('animation');
                }, 350);
            }, 20); // Dłuższe opóźnienie wyklucza zduplikowany rendering
        }
    }

    _onTrickComplete(trick) {
        // Wait 2s so player can see all 4 cards, then animate fly-to-winner
        const winner = trick.winner;
        const trickArea = this.elements.trickArea;

        setTimeout(() => {
            const trickCards = trickArea.querySelectorAll('.trick-card');

            // Kierunki odlotu lew względem UI (a nie fizycznych pozycji!)
            const layout = this._getDisplayPositions();
            let winnerUISlot = 'S';
            if (layout.W === winner) winnerUISlot = 'W';
            if (layout.N === winner) winnerUISlot = 'N';
            if (layout.E === winner) winnerUISlot = 'E';

            // Direction offsets for where cards should fly
            const flyOffsets = {
                'N': { x: 0, y: -220 },
                'S': { x: 0, y: 220 },
                'W': { x: -300, y: 0 },
                'E': { x: 300, y: 0 }
            };
            const offset = flyOffsets[winnerUISlot] || { x: 0, y: 0 };

            trickCards.forEach(card => {
                card.style.transition = 'transform 0.6s ease-in, opacity 0.5s ease-in';
                const currentTransform = card.style.transform || '';
                card.style.transform = currentTransform + ` translate(${offset.x}px, ${offset.y}px) scale(0.4)`;
                card.style.opacity = '0';
            });

            // Clear trick area after animation completes
            setTimeout(() => {
                this._clearTrickArea();
                this._updateTricks();
            }, 700);
        }, 2000);
    }

    _clearTrickArea() {
        this.elements.trickArea.innerHTML = '';
    }

    // ---- BIDDING UI ----

    _showBiddingPanel() {
        this.elements.biddingPanel.style.display = 'block';
        this._clearBiddingHistory();
        this._renderBidLevelTabs();
        this._renderBidGrid();
        this._renderBidActions();
    }

    _hideBiddingPanel() {
        this.elements.biddingPanel.style.display = 'none';
    }

    _updateBiddingUI() {
        if (this.game.state !== GAME_STATES.BIDDING) return;

        const isMyTurn = this.game.biddingManager.currentPlayer === this.game.myPosition;
        const lang = window.gameSettings ? window.gameSettings.lang : 'pl';

        if (isMyTurn) {
            this._updateStatus(lang === 'pl' ? 'Licytacja — Twoja kolej!' : (lang === 'es' ? 'Subasta — ¡Tu turno!' : 'Bidding — Your turn!'));
            this._renderBidGrid();
            this._renderBidActions();
        } else {
            const pos = this.game.biddingManager.currentPlayer;
            const name = this._getPlayerName(pos);
            this._updateStatus(lang === 'pl' ? `Licytacja — ${name} myśli...` : (lang === 'es' ? `Subasta — ${name} está pensando...` : `Bidding — ${name} is thinking...`));
        }
    }

    _onBidMade(bid) {
        this._addBidToHistory(bid);
        this._updateBiddingUI();
        this._updatePlayerLabels();
    }

    _clearBiddingHistory() {
        this.elements.biddingHistory.innerHTML = '';
        // Headers
        for (const pos of ['N', 'E', 'S', 'W']) {
            const header = document.createElement('div');
            header.className = 'bidding-history-header';
            header.textContent = this._getPlayerName(pos);
            this.elements.biddingHistory.appendChild(header);
        }
    }

    _addBidToHistory(bid) {
        // Dodaj puste komórki jeśli potrzeba
        const bids = this.game.biddingManager.bids;
        const bidIndex = bids.length - 1;
        const dealerIndex = POSITIONS.indexOf(this.game.dealer);

        // Oblicz pozycję w siatce
        const totalCells = document.querySelectorAll('#bidding-history .bidding-history-cell').length;
        const playerIndex = POSITIONS.indexOf(bid.player);

        // Offset od dealera
        const firstRow = bidIndex === 0;
        if (firstRow) {
            // Dodaj puste komórki przed dealerem
            const posOrder = ['N', 'E', 'S', 'W'];
            for (const pos of posOrder) {
                if (pos === bid.player) break;
                const empty = document.createElement('div');
                empty.className = 'bidding-history-cell';
                empty.textContent = '';
                this.elements.biddingHistory.appendChild(empty);
            }
        }

        const cell = document.createElement('div');
        cell.className = `bidding-history-cell ${bid.type}`;
        cell.textContent = bid.display;
        this.elements.biddingHistory.appendChild(cell);
    }

    _renderBidLevelTabs() {
        const tabs = this.elements.bidLevelTabs;
        tabs.innerHTML = '';

        for (let level = 1; level <= 7; level++) {
            const tab = document.createElement('button');
            tab.className = `bid-level-tab ${level === this.selectedBidLevel ? 'active' : ''}`;
            tab.textContent = level;
            tab.addEventListener('click', () => {
                this.selectedBidLevel = level;
                this._renderBidLevelTabs();
                this._renderBidGrid();
            });
            tabs.appendChild(tab);
        }
    }

    _renderBidGrid() {
        const grid = this.elements.bidGrid;
        grid.innerHTML = '';

        const isMyTurn = this.game.biddingManager.currentPlayer === this.game.myPosition;
        const validBids = isMyTurn ? this.game.getValidBids() : [];
        const level = this.selectedBidLevel;

        for (const suit of BID_SUITS) {
            const bid = new Bid('bid', level, suit);
            const isValid = validBids.some(v => v.type === 'bid' && v.level === level && v.suit === suit);

            const btn = document.createElement('button');
            btn.className = `bid-btn suit-${suit}`;
            btn.textContent = `${level}${BID_SUIT_SYMBOLS[suit]}`;
            btn.disabled = !isValid || !isMyTurn;

            if (isValid && isMyTurn) {
                btn.addEventListener('click', () => {
                    this.game.playerBid(new Bid('bid', level, suit));
                });
            }

            grid.appendChild(btn);
        }
    }

    _renderBidActions() {
        const actions = this.elements.bidActions;
        actions.innerHTML = '';

        const isMyTurn = this.game.biddingManager.currentPlayer === this.game.myPosition;
        const validBids = isMyTurn ? this.game.getValidBids() : [];
        const lang = window.gameSettings ? window.gameSettings.lang : 'pl';

        // Pas
        const passBtn = document.createElement('button');
        passBtn.className = 'bid-btn pass-btn';
        passBtn.textContent = lang === 'pl' ? 'Pas' : (lang === 'es' ? 'Paso' : 'Pass');
        passBtn.disabled = !isMyTurn;
        if (isMyTurn) {
            passBtn.addEventListener('click', () => {
                this.game.playerBid(new Bid('pass'));
            });
        }
        actions.appendChild(passBtn);

        // Kontra
        const canDouble = validBids.some(v => v.type === 'double');
        const dblBtn = document.createElement('button');
        dblBtn.className = 'bid-btn double-btn';
        dblBtn.textContent = lang === 'pl' ? 'Kontra' : (lang === 'es' ? 'Doblo' : 'Double');
        dblBtn.disabled = !canDouble;
        if (canDouble) {
            dblBtn.addEventListener('click', () => {
                this.game.playerBid(new Bid('double'));
            });
        }
        actions.appendChild(dblBtn);

        // Rekontra
        const canRedouble = validBids.some(v => v.type === 'redouble');
        const rdblBtn = document.createElement('button');
        rdblBtn.className = 'bid-btn redouble-btn';
        rdblBtn.textContent = lang === 'pl' ? 'Rekontra' : (lang === 'es' ? 'Redoblo' : 'Redouble');
        rdblBtn.disabled = !canRedouble;
        if (canRedouble) {
            rdblBtn.addEventListener('click', () => {
                this.game.playerBid(new Bid('redouble'));
            });
        }
        actions.appendChild(rdblBtn);
    }

    // ---- INFO DISPLAYS ----

    _updateStatus(text) {
        this.elements.statusBar.innerHTML = text;
    }

    _updatePlayingStatus() {
        if (this.game.state !== GAME_STATES.PLAYING) return;

        const currentPlayer = this.game.trickManager.currentPlayer;
        if (!currentPlayer) return;

        const isDummy = this.game.dummy;
        const declarer = this.game.declarer;
        const lang = window.gameSettings ? window.gameSettings.lang : 'pl';

        if (currentPlayer === this.game.myPosition && isDummy !== this.game.myPosition) {
            this._updateStatus(lang === 'pl' ? 'Twoja kolej — zagraj kartę' : (lang === 'es' ? 'Tu turno — juega una carta' : 'Your turn — play a card'));
        } else if (currentPlayer === isDummy && declarer === this.game.myPosition) {
            const pName = this._getPlayerName(isDummy);
            this._updateStatus(lang === 'pl' ? `Zagraj kartę dziadka <span class="highlight">(${pName})</span>` : (lang === 'es' ? `Juega la carta del muerto <span class="highlight">(${pName})</span>` : `Play dummy's card <span class="highlight">(${pName})</span>`));
        } else if (currentPlayer === this.game.myPosition && isDummy === this.game.myPosition) {
            const decName = this._getPlayerName(declarer).replace(' (Ty)', '').replace(' (You)', '').replace(' (Tú)', '');
            this._updateStatus(lang === 'pl' ? `${decName} gra twoją kartą z dziadka...` : (lang === 'es' ? `${decName} está jugando tu carta de muerto...` : `${decName} is playing your dummy card...`));
        } else {
            const pName = this._getPlayerName(currentPlayer);
            this._updateStatus(lang === 'pl' ? `${pName} myśli...` : (lang === 'es' ? `${pName} está pensando...` : `${pName} is thinking...`));
        }
    }

    _showContractInfo() {
        const contract = this.game.contract;
        if (contract) {
            this.elements.contractInfo.style.display = 'block';
            this.elements.trumpInfo.style.display = 'flex';
            this.elements.contractValue.textContent = `${contract.display} — ${this._getPlayerName(contract.declarer)}`;

            let suitSymbol = 'BA';
            let colorStr = 'white';
            const lang = window.gameSettings ? window.gameSettings.lang : 'pl';

            if (contract.suit !== 'NT') {
                suitSymbol = contract.suit === 'C' ? '♣\uFE0E' : (contract.suit === 'D' ? '♦\uFE0E' : (contract.suit === 'H' ? '♥\uFE0E' : '♠\uFE0E'));
            } else {
                suitSymbol = lang === 'en' ? 'NT' : (lang === 'es' ? 'ST' : 'BA');
            }

            this.elements.trumpSuitValue.innerHTML = `<span class="trump-symbol">${suitSymbol}</span>`;
        }
    }

    _hideContractInfo() {
        this.elements.contractInfo.style.display = 'none';
        this.elements.trumpInfo.style.display = 'none';
    }

    _updateTricks() {
        if (!this.game.trickManager) return;
        const tc = this.game.trickManager.trickCount;
        const lang = window.gameSettings ? window.gameSettings.lang : 'pl';

        // Oblicz cel kontraktu
        let goalHtml = '';
        if (this.game.contract && this.game.declarer) {
            const required = this.game.contract.level + 6;
            const declarerTeam = TEAM[this.game.declarer]; // 'NS' lub 'EW'
            const declarerTricks = tc[declarerTeam] || 0;
            const onTrack = declarerTricks >= (required - (13 - declarerTricks - tc[declarerTeam === 'NS' ? 'EW' : 'NS']));
            const colorStyle = declarerTricks >= required
                ? 'color: var(--accent-emerald)'
                : `color: var(--accent-red)`;
            const goalLabel = lang === 'pl' ? 'CEL' : (lang === 'es' ? 'META' : 'GOAL');

            goalHtml = `
                <div class="trick-count" style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 6px; margin-top: 4px;">
                    <div class="count-label">${goalLabel}</div>
                    <div class="count-value" style="${colorStyle}; font-size: 1.1em;">${declarerTricks} / ${required}</div>
                </div>
            `;
        }

        this.elements.tricksInfo.innerHTML = `
            <div class="tricks-display">
                <div class="trick-count">
                    <div class="count-label">N-S</div>
                    <div class="count-value" style="color: var(--accent-emerald)">${tc.NS}</div>
                </div>
                <div class="trick-count">
                    <div class="count-label">E-W</div>
                    <div class="count-value" style="color: var(--accent-red)">${tc.EW}</div>
                </div>
                ${goalHtml}
            </div>
        `;
    }

    _updateScores() {
        this.elements.scorePanelNS.textContent = this.game.scores.NS;
        this.elements.scorePanelEW.textContent = this.game.scores.EW;
    }

    _updatePlayerLabels() {
        const layout = this._getDisplayPositions();
        // Wpisujemy logikę etykiet na podstawie aktualnego układu
        // Na dole (S) jest layout.S, na lewo (W) jest layout.W

        const uiMap = {
            'S': this.elements.playerLabels.S,
            'N': this.elements.playerLabels.N,
            'W': this.elements.playerLabels.W,
            'E': this.elements.playerLabels.E
        };

        for (const uiSlot of ['S', 'N', 'W', 'E']) {
            const logicalPos = layout[uiSlot]; // NP. na uiSlot 'N' siedzi logicznie 'W'
            const label = uiMap[uiSlot];
            if (!label) continue;

            const nameSpan = label.querySelector('.player-name');
            const dirSpan = label.querySelector('.player-direction');
            if (nameSpan) nameSpan.textContent = this._getPlayerName(logicalPos);
            if (dirSpan) dirSpan.textContent = logicalPos;

            label.classList.remove('active', 'declarer', 'dummy');

            if (this.game.state === GAME_STATES.BIDDING && this.game.biddingManager) {
                if (this.game.biddingManager.currentPlayer === logicalPos) {
                    label.classList.add('active');
                }
            } else if (this.game.state === GAME_STATES.PLAYING && this.game.trickManager) {
                if (this.game.trickManager.currentPlayer === logicalPos) {
                    label.classList.add('active');
                }
                if (this.game.declarer === logicalPos) label.classList.add('declarer');
                if (this.game.dummy === logicalPos) label.classList.add('dummy');
            }
        }
    }

    // ---- SCORING OVERLAY ----

    _showScoringOverlay() {
        const result = this.game.lastResult;
        if (!result) return;

        const card = this.elements.scoringCard;
        const contract = this.game.contract;

        const isPlayerTeam = result.team === 'NS';
        const lang = window.gameSettings ? window.gameSettings.lang : 'pl';
        const isGameOver = window.gameSettings && window.gameSettings.maxRounds > 0 && this.game.roundNumber >= window.gameSettings.maxRounds;

        card.innerHTML = `
            <h2 class="${result.made ? 'result-made' : 'result-down'}">
                ${result.made ? (lang === 'pl' ? '✓ Kontrakt spełniony!' : (lang === 'es' ? '✓ ¡Contrato cumplido!' : '✓ Contract made!')) : (lang === 'pl' ? '✗ Kontrakt niedobrany' : (lang === 'es' ? '✗ Contrato fallido' : '✗ Contract down'))}
            </h2>
            <div class="scoring-detail">
                <div class="contract-display">${contract.display}</div>
                <div>${lang === 'pl' ? 'Rozgrywający' : (lang === 'es' ? 'Declarante' : 'Declarer')}: ${this._getPlayerName(contract.declarer)}</div>
                <div>${lang === 'pl' ? 'Lew' : (lang === 'es' ? 'Bazas' : 'Tricks')}: ${this.game.trickManager.trickCount[TEAM[contract.declarer]]} / ${contract.tricksNeeded}</div>
            </div>
            <div class="scoring-points ${isPlayerTeam ? 'positive' : 'negative'}">
                ${isPlayerTeam ? '+' : '-'}${result.total}
            </div>
            <div class="scoring-breakdown">
                <div class="scoring-breakdown-row">
                    <span class="label">${result.made ? (lang === 'pl' ? 'Punkty za lewy' : (lang === 'es' ? 'Puntos por bazas' : 'Trick points')) : (lang === 'pl' ? 'Kara' : (lang === 'es' ? 'Multa' : 'Penalty'))}</span>
                    <span class="value">${result.made ? result.trickScore : result.penalty}</span>
                </div>
                ${result.made ? `
                    <div class="scoring-breakdown-row">
                        <span class="label">${lang === 'pl' ? 'Premia' : (lang === 'es' ? 'Bono' : 'Bonus')}</span>
                        <span class="value">${result.bonus}</span>
                    </div>
                    ${result.overtrickScore > 0 ? `
                    <div class="scoring-breakdown-row">
                        <span class="label">${lang === 'pl' ? 'Nadróbki' : (lang === 'es' ? 'Bazas extras' : 'Overtricks')}</span>
                        <span class="value">${result.overtrickScore}</span>
                    </div>` : ''}
                ` : ''}
            </div>
            <div style="display: flex; gap: 12px; justify-content: center; margin-top: 16px;">
                <div class="score-team ns">
                    <div class="team-label">N-S</div>
                    <div class="team-score">${this.game.scores.NS}</div>
                </div>
                <div class="score-team ew">
                    <div class="team-label">E-W</div>
                    <div class="team-score">${this.game.scores.EW}</div>
                </div>
            </div>
            <button class="btn btn-${isGameOver ? 'secondary' : 'primary'}" style="margin-top: 24px;" id="next-round-btn">
                ${isGameOver ? (lang === 'pl' ? 'Koniec Gry - Wróć do Menu' : (lang === 'es' ? 'Fin del Juego - Menú' : 'Game Over - Menu')) : (lang === 'pl' ? 'Następne rozdanie' : (lang === 'es' ? 'Siguiente ronda' : 'Next round'))}
            </button>
        `;

        this.elements.scoringOverlay.classList.add('active');

        document.getElementById('next-round-btn').addEventListener('click', () => {
            this.elements.scoringOverlay.classList.remove('active');
            if (isGameOver) {
                location.reload();
            } else {
                this.game.nextRound();
            }
        });
    }

}
