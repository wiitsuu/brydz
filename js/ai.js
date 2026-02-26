// ============================================================
// AI — sztuczna inteligencja dla botów brydżowych
// ============================================================

class BridgeAI {
    constructor(position) {
        this.position = position;
    }

    // ---- LICYTACJA ----

    chooseBid(hand, biddingManager) {
        const hcp = this._countHCP(hand);
        const distribution = this._analyzeDistribution(hand);
        const validBids = biddingManager.getValidBids();
        const partner = PARTNER[this.position];

        // Czy partner już licytował?
        const partnerBids = biddingManager.bids.filter(b => b.player === partner && b.type === 'bid');

        // Prosta strategia na podstawie HCP
        if (!biddingManager.lastBid || TEAM[biddingManager.lastBidPlayer] === TEAM[this.position]) {
            // Nikt nie licytował lub licytował partner
            return this._openingBid(hcp, distribution, validBids, biddingManager);
        } else {
            // Przeciwnik licytował
            return this._defensiveBid(hcp, distribution, validBids, biddingManager);
        }
    }

    _openingBid(hcp, dist, validBids, manager) {
        // Pas jeśli < 6 HCP
        if (hcp < 6) return validBids.find(b => b.type === 'pass');

        const longest = this._longestSuit(dist);
        const isBal = this._isBalanced(dist);

        const partnerBids = manager.bids.filter(b => b.player === PARTNER[this.position] && b.type === 'bid');
        const partnerBid = partnerBids.length > 0 ? partnerBids[partnerBids.length - 1] : null;

        if (partnerBid) {
            // ODPOWIEDŹ Z PARTNEREM
            const partnerSuit = partnerBid.suit;
            const mySupport = partnerSuit !== 'NT' ? (dist.suits[partnerSuit] || 0) : 0;
            const currentLevel = manager.lastBid ? manager.lastBid.level : 0;

            // Jeśli osiągnęliśmy bezpieczną końcówkę, pasuj
            if (currentLevel >= 4 || (currentLevel === 3 && partnerSuit === 'NT')) {
                return validBids.find(b => b.type === 'pass');
            }

            // Silne (13+ HCP) polecamy game (końcówkę)
            if (hcp >= 13) {
                if (mySupport >= 3 && (partnerSuit === 'H' || partnerSuit === 'S')) {
                    // Końcówka w major
                    return validBids.find(b => b.type === 'bid' && b.level === 4 && b.suit === partnerSuit) || validBids.find(b => b.type === 'pass');
                } else if (isBal) {
                    return validBids.find(b => b.type === 'bid' && b.level === 3 && b.suit === 'NT') || validBids.find(b => b.type === 'pass');
                } else {
                    // Nowy kolor
                    const bid = validBids.find(b => b.type === 'bid' && b.suit === longest && b.level === currentLevel + 1);
                    if (bid) return bid;
                }
            }

            // Inwit (10-12 HCP)
            if (hcp >= 10 && hcp <= 12) {
                if (mySupport >= 3 && partnerSuit !== 'NT') {
                    // Poparcie partnera
                    const bid = validBids.find(b => b.type === 'bid' && b.suit === partnerSuit && b.level === currentLevel + 1);
                    if (bid) return bid;
                } else if (isBal) {
                    const bid = validBids.find(b => b.type === 'bid' && b.suit === 'NT' && (b.level === currentLevel || b.level === currentLevel + 1));
                    if (bid) return bid;
                } else {
                    const bid = validBids.find(b => b.type === 'bid' && b.suit === longest && b.level === currentLevel + 1);
                    if (bid) return bid;
                }
            }

            // Słabe (6-9 HCP)
            if (hcp >= 6 && hcp <= 9) {
                if (mySupport >= 3 && partnerSuit !== 'NT') {
                    const bid = validBids.find(b => b.type === 'bid' && b.suit === partnerSuit && b.level === currentLevel + 1 && b.level <= 2);
                    if (bid) return bid;
                } else if (currentLevel === 1) {
                    // 1NT response
                    const bid = validBids.find(b => b.type === 'bid' && b.suit === 'NT' && b.level === 1);
                    if (bid) return bid;
                }
            }

            return validBids.find(b => b.type === 'pass');
        } else {
            // OTWÓCIE (Partner jeszcze nie licytował)
            const currentLevel = manager.lastBid ? manager.lastBid.level : 0;

            if (hcp >= 22) {
                const bid = validBids.find(b => b.type === 'bid' && b.level === 2 && b.suit === 'C');
                if (bid) return bid;
            }

            if (hcp >= 15 && hcp <= 17 && isBal) {
                const bid = validBids.find(b => b.type === 'bid' && b.level === 1 && b.suit === 'NT');
                if (bid) return bid;
            }

            // Normalne otwarcie (12+ HCP, lub 10-11 HCP z bardzo długim kolorem)
            if (hcp >= 12 || (hcp >= 10 && dist.suits[longest] >= 5)) {
                const targetLevel = currentLevel > 0 ? currentLevel + 1 : 1;
                // Rozsądne otwarcia tylko na 1 lub 2 poziomie
                if (targetLevel <= 2) {
                    const bid = validBids.find(b => b.type === 'bid' && b.level === targetLevel && b.suit === longest);
                    if (bid) return bid;
                }
            }

            return validBids.find(b => b.type === 'pass');
        }
    }

    _defensiveBid(hcp, dist, validBids, manager) {
        if (hcp < 8) return validBids.find(b => b.type === 'pass');

        if (hcp >= 10) {
            const longest = this._longestSuit(dist);
            const bid = validBids.find(b => b.type === 'bid' && b.suit === longest && b.level <= 2);
            if (bid) return bid;
        }

        // Kontra z 12+ HCP
        if (hcp >= 12) {
            const dbl = validBids.find(b => b.type === 'double');
            if (dbl) return dbl;
        }

        return validBids.find(b => b.type === 'pass');
    }

    // ---- GRA KARTAMI ----

    chooseCard(hand, trickManager, allHands, contract, playAsPosition) {
        const trick = trickManager.currentTrick;
        const pos = playAsPosition || this.position;
        const playable = trick.getPlayableCards(hand, pos);

        if (playable.length === 0) return null;
        if (playable.length === 1) return playable[0];

        // Jeśli jestem pierwszy w lewie (wist)
        if (!trick.ledSuit) {
            return this._chooseLeadCard(playable, hand, trickManager, contract);
        }

        // Dołożenie do koloru
        return this._chooseFollowCard(playable, trick, trickManager, contract);
    }

    _chooseLeadCard(playable, hand, trickManager, contract) {
        const trumpSuit = contract.suit === 'NT' ? null : contract.suit;

        // Graj od najdłuższego koloru (nie atutowego)
        const nonTrumps = playable.filter(c => c.suit !== trumpSuit);
        if (nonTrumps.length > 0) {
            // Najdłuższy kolor
            const suitCounts = {};
            for (const card of nonTrumps) {
                suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
            }
            const longestSuit = Object.entries(suitCounts).sort((a, b) => b[1] - a[1])[0][0];
            const suitCards = nonTrumps.filter(c => c.suit === longestSuit);

            // Graj najwyższą z sekwencji lub 4-tą najlepszą
            if (suitCards.length >= 4) {
                return suitCards[suitCards.length - 4]; // 4-ta najlepsza
            }
            return suitCards[suitCards.length - 1]; // najwyższa
        }

        // Tylko atuty — graj najniższego
        return playable[0];
    }

    _chooseFollowCard(playable, trick, trickManager, contract) {
        const trumpSuit = contract.suit === 'NT' ? null : contract.suit;
        const ledSuit = trick.ledSuit;

        // Czy dołożyliśmy do koloru?
        const followingSuit = playable[0].suit === ledSuit;

        if (followingSuit) {
            // Sprawdź czy mogę wygrać
            let highestInTrick = null;
            for (const pos of trick.order) {
                const card = trick.cards[pos];
                if (card.suit === ledSuit) {
                    if (!highestInTrick || card.valueOrder > highestInTrick.valueOrder) {
                        highestInTrick = card;
                    }
                }
            }

            // Czy mój partner wygrywa?
            const partner = PARTNER[this.position];
            const partnerCard = trick.cards[partner];
            let partnerWinning = false;
            if (partnerCard) {
                let currentWinner = trick.order[0];
                let currentWinnerCard = trick.cards[currentWinner];
                for (let i = 1; i < trick.order.length; i++) {
                    const pos = trick.order[i];
                    const card = trick.cards[pos];
                    if (card.beats(currentWinnerCard, trumpSuit)) {
                        currentWinner = pos;
                        currentWinnerCard = card;
                    }
                }
                partnerWinning = currentWinner === partner;
            }

            if (partnerWinning) {
                // Partner wygrywa — zagraj najniższą
                return playable[0];
            }

            // Spróbuj wygrać — zagraj najniższą wygrywającą
            const winners = playable.filter(c => c.valueOrder > (highestInTrick ? highestInTrick.valueOrder : -1));
            if (winners.length > 0) return winners[0]; // najniższa wygrywająca

            // Nie mogę wygrać — zagraj najniższą
            return playable[0];
        }

        // Nie mam koloru  
        if (trumpSuit && playable.some(c => c.suit === trumpSuit)) {
            // Mam atuty — sprawdź czy warto tnąc
            const partner = PARTNER[this.position];
            const partnerCard = trick.cards[partner];

            let currentWinner = trick.order[0];
            let currentWinnerCard = trick.cards[currentWinner];
            for (let i = 1; i < trick.order.length; i++) {
                const pos = trick.order[i];
                const card = trick.cards[pos];
                if (card.beats(currentWinnerCard, trumpSuit)) {
                    currentWinner = pos;
                    currentWinnerCard = card;
                }
            }

            if (currentWinner === partner) {
                // Partner wygrywa — nie tnij
                return playable.sort((a, b) => a.valueOrder - b.valueOrder)[0];
            }

            // Tnij najniższym atutem
            const trumps = playable.filter(c => c.suit === trumpSuit);
            if (trumps.length > 0) return trumps[0];
        }

        // Zagraj najniższą kartę (zrzutka)
        return playable.sort((a, b) => a.valueOrder - b.valueOrder)[0];
    }

    // ---- ANALIZA RĘKI ----

    _countHCP(hand) {
        return hand.reduce((sum, card) => sum + card.hcp, 0);
    }

    _analyzeDistribution(hand) {
        const suits = { C: 0, D: 0, H: 0, S: 0 };
        for (const card of hand) {
            suits[card.suit]++;
        }
        return { suits };
    }

    _longestSuit(dist) {
        let longest = 'S';
        let maxCount = 0;
        // Preferuj starsze kolory
        for (const suit of ['S', 'H', 'D', 'C']) {
            if (dist.suits[suit] > maxCount) {
                maxCount = dist.suits[suit];
                longest = suit;
            }
        }
        return longest;
    }

    _isBalanced(dist) {
        const counts = Object.values(dist.suits).sort();
        // 4-3-3-3, 4-4-3-2, 5-3-3-2
        return counts[0] >= 2 && counts[3] <= 5;
    }
}
