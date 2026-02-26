// ============================================================
// Trick — logika rozgrywki lew
// ============================================================

class Trick {
    constructor(leader, trumpSuit) {
        this.leader = leader;
        this.trumpSuit = trumpSuit;
        this.cards = {};       // { position: card }
        this.order = [];       // kolejność grania
        this.ledSuit = null;   // kolor wyjścia
        this.currentPlayer = leader;
        this.complete = false;
        this.winner = null;
    }

    playCard(player, card) {
        if (this.complete) return false;
        if (player !== this.currentPlayer) return false;

        this.cards[player] = card;
        this.order.push(player);

        if (!this.ledSuit) {
            this.ledSuit = card.suit;
        }

        if (this.order.length === 4) {
            this.complete = true;
            this._determineWinner();
        } else {
            this.currentPlayer = NEXT_PLAYER[this.currentPlayer];
        }

        return true;
    }

    _determineWinner() {
        let winnerPos = this.order[0];
        let winnerCard = this.cards[winnerPos];

        for (let i = 1; i < 4; i++) {
            const pos = this.order[i];
            const card = this.cards[pos];

            if (card.beats(winnerCard, this.trumpSuit)) {
                winnerPos = pos;
                winnerCard = card;
            }
        }

        this.winner = winnerPos;
    }

    getPlayableCards(hand, player) {
        if (player !== this.currentPlayer) return [];

        // Jeśli to pierwsza karta w lewie, wszystkie karty są grywalne
        if (!this.ledSuit) return [...hand];

        // Sprawdź obowiązek dołożenia do koloru
        const suitCards = hand.filter(c => c.suit === this.ledSuit);
        if (suitCards.length > 0) return suitCards;

        // Brak koloru — można zagrać cokolwiek
        return [...hand];
    }
}

class TrickManager {
    constructor(contract) {
        this.contract = contract;
        this.trumpSuit = contract.suit === 'NT' ? null : contract.suit;
        this.tricks = [];
        this.currentTrick = null;
        this.trickCount = { NS: 0, EW: 0 };
        this.allComplete = false;
    }

    startTrick(leader) {
        this.currentTrick = new Trick(leader, this.trumpSuit);
        this.tricks.push(this.currentTrick);
    }

    playCard(player, card) {
        const result = this.currentTrick.playCard(player, card);
        if (result && this.currentTrick.complete) {
            const winner = this.currentTrick.winner;
            this.trickCount[TEAM[winner]]++;

            if (this.tricks.length >= 13) {
                this.allComplete = true;
            }
        }
        return result;
    }

    get currentPlayer() {
        return this.currentTrick ? this.currentTrick.currentPlayer : null;
    }

    getPlayableCards(hand, player) {
        if (!this.currentTrick) return [];
        return this.currentTrick.getPlayableCards(hand, player);
    }
}
