// ============================================================
// Card & Deck — klasy kart i talii do brydża
// ============================================================

const SUITS = ['C', 'D', 'H', 'S'];           // ♣ ♦ ♥ ♠
const SUIT_NAMES = { C: 'Trefl', D: 'Karo', H: 'Kier', S: 'Pik' };
const SUIT_SYMBOLS = { C: '♣\uFE0E', D: '♦\uFE0E', H: '♥\uFE0E', S: '♠\uFE0E' };
const SUIT_ORDER = { C: 0, D: 1, H: 2, S: 3 };

const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const VALUE_ORDER = {};
VALUES.forEach((v, i) => VALUE_ORDER[v] = i);

const HCP_VALUES = { J: 1, Q: 2, K: 3, A: 4 };

const POSITIONS = ['S', 'W', 'N', 'E'];       // South=gracz, West, North, East
const PARTNER = { N: 'S', S: 'N', E: 'W', W: 'E' };
const TEAM = { N: 'NS', S: 'NS', E: 'EW', W: 'EW' };
const NEXT_PLAYER = { N: 'E', E: 'S', S: 'W', W: 'N' };

class Card {
    constructor(suit, value) {
        this.suit = suit;
        this.value = value;
        this.id = `${value}${suit}`;
    }

    get suitSymbol() { return SUIT_SYMBOLS[this.suit]; }
    get suitName() { return SUIT_NAMES[this.suit]; }
    get valueOrder() { return VALUE_ORDER[this.value]; }
    get suitOrder() { return SUIT_ORDER[this.suit]; }
    get hcp() { return HCP_VALUES[this.value] || 0; }
    get isRed() { return this.suit === 'H' || this.suit === 'D'; }

    get displayValue() {
        return this.value;
    }

    beats(other, trumpSuit) {
        if (this.suit === other.suit) {
            return this.valueOrder > other.valueOrder;
        }
        if (trumpSuit && this.suit === trumpSuit) {
            return true;
        }
        return false;
    }

    toString() {
        return `${this.displayValue}${this.suitSymbol}`;
    }
}

class Deck {
    constructor() {
        this.cards = [];
        for (const suit of SUITS) {
            for (const value of VALUES) {
                this.cards.push(new Card(suit, value));
            }
        }
    }

    shuffle() {
        // Fisher-Yates
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    deal() {
        this.shuffle();
        const hands = { N: [], E: [], S: [], W: [] };
        for (let i = 0; i < 52; i++) {
            hands[POSITIONS[i % 4]].push(this.cards[i]);
        }
        // Sortuj ręce
        for (const pos of POSITIONS) {
            hands[pos].sort((a, b) => {
                if (a.suitOrder !== b.suitOrder) return a.suitOrder - b.suitOrder;
                return a.valueOrder - b.valueOrder;
            });
        }
        return hands;
    }
}
