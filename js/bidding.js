// ============================================================
// Bidding — system licytacji brydżowej
// ============================================================

const BID_SUITS = ['C', 'D', 'H', 'S', 'NT'];
const BID_SUIT_SYMBOLS = { C: '♣', D: '♦', H: '♥', S: '♠', NT: 'NT' };
const BID_SUIT_ORDER = { C: 0, D: 1, H: 2, S: 3, NT: 4 };

class Bid {
    constructor(type, level = null, suit = null, player = null) {
        this.type = type; // 'bid', 'pass', 'double', 'redouble'
        this.level = level; // 1-7
        this.suit = suit;   // C, D, H, S, NT
        this.player = player;
    }

    get value() {
        if (this.type !== 'bid') return -1;
        return (this.level - 1) * 5 + BID_SUIT_ORDER[this.suit];
    }

    get display() {
        if (this.type === 'pass') return 'Pas';
        if (this.type === 'double') return 'Kontra';
        if (this.type === 'redouble') return 'Rekontra';
        return `${this.level}${BID_SUIT_SYMBOLS[this.suit]}`;
    }

    isHigherThan(other) {
        if (!other || other.type !== 'bid') return this.type === 'bid';
        if (this.type !== 'bid') return false;
        return this.value > other.value;
    }
}

class BiddingManager {
    constructor(dealer) {
        this.dealer = dealer;
        this.currentPlayer = dealer;
        this.bids = [];
        this.lastBid = null;      // ostatnia odzywka (nie pas)
        this.lastBidPlayer = null;
        this.isDoubled = false;
        this.isRedoubled = false;
        this.passCount = 0;
        this.bidCount = 0;         // ile odzywek (nie pasów)
        this.finished = false;
        this.contract = null;
    }

    getValidBids() {
        const valid = [];

        // Pas jest zawsze dozwolony
        valid.push(new Bid('pass'));

        // Odzywki wyższe niż ostatnia
        for (let level = 1; level <= 7; level++) {
            for (const suit of BID_SUITS) {
                const bid = new Bid('bid', level, suit);
                if (!this.lastBid || bid.isHigherThan(this.lastBid)) {
                    valid.push(bid);
                }
            }
        }

        // Kontra - można kontrować odzywkę przeciwnika
        if (this.lastBid && !this.isDoubled && !this.isRedoubled) {
            const lastTeam = TEAM[this.lastBidPlayer];
            const currentTeam = TEAM[this.currentPlayer];
            if (lastTeam !== currentTeam) {
                valid.push(new Bid('double'));
            }
        }

        // Rekontra - można rekontrować kontrę przeciwnika
        if (this.isDoubled && !this.isRedoubled) {
            const lastTeam = TEAM[this.lastBidPlayer];
            const currentTeam = TEAM[this.currentPlayer];
            if (lastTeam === currentTeam) {
                valid.push(new Bid('redouble'));
            }
        }

        return valid;
    }

    makeBid(bid) {
        bid.player = this.currentPlayer;
        this.bids.push(bid);

        if (bid.type === 'pass') {
            this.passCount++;
        } else {
            this.passCount = 0;
            if (bid.type === 'bid') {
                this.lastBid = bid;
                this.lastBidPlayer = this.currentPlayer;
                this.isDoubled = false;
                this.isRedoubled = false;
                this.bidCount++;
            } else if (bid.type === 'double') {
                this.isDoubled = true;
            } else if (bid.type === 'redouble') {
                this.isRedoubled = true;
            }
        }

        // Sprawdź koniec licytacji
        if (this.passCount >= 3 && this.bidCount > 0) {
            this.finished = true;
            this._determineContract();
        } else if (this.passCount >= 4 && this.bidCount === 0) {
            // 4 pasy = rozdanie przechodzi
            this.finished = true;
            this.contract = null;
        }

        this.currentPlayer = NEXT_PLAYER[this.currentPlayer];
    }

    _determineContract() {
        if (!this.lastBid) {
            this.contract = null;
            return;
        }

        // Rozgrywający = pierwszy gracz z drużyny, który licytował dany kolor
        const declarerTeam = TEAM[this.lastBidPlayer];
        let declarer = null;
        for (const bid of this.bids) {
            if (bid.type === 'bid' && bid.suit === this.lastBid.suit &&
                TEAM[bid.player] === declarerTeam) {
                declarer = bid.player;
                break;
            }
        }

        this.contract = {
            level: this.lastBid.level,
            suit: this.lastBid.suit,
            suitSymbol: BID_SUIT_SYMBOLS[this.lastBid.suit],
            declarer: declarer,
            dummy: PARTNER[declarer],
            doubled: this.isDoubled,
            redoubled: this.isRedoubled,
            tricksNeeded: this.lastBid.level + 6,
            display: `${this.lastBid.level}${BID_SUIT_SYMBOLS[this.lastBid.suit]}${this.isRedoubled ? ' XX' : this.isDoubled ? ' X' : ''}`
        };
    }
}
