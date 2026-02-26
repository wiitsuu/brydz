// ============================================================
// Scoring — punktacja brydżowa
// ============================================================

class Scoring {
    static calculate(contract, tricksMade, vulnerable = false) {
        const tricksNeeded = contract.level + 6;
        const overtricks = tricksMade - tricksNeeded;
        const undertricks = tricksNeeded - tricksMade;

        if (overtricks >= 0) {
            return Scoring._calcMade(contract, overtricks, vulnerable);
        } else {
            return Scoring._calcDown(contract, undertricks, vulnerable);
        }
    }

    static _calcMade(contract, overtricks, vulnerable) {
        let trickScore = 0;
        const level = contract.level;

        // Punkty za lewy kontraktowe
        if (contract.suit === 'C' || contract.suit === 'D') {
            // Minor suits: 20 za lewę
            trickScore = level * 20;
        } else if (contract.suit === 'H' || contract.suit === 'S') {
            // Major suits: 30 za lewę
            trickScore = level * 30;
        } else {
            // NT: 40 za pierwszą, 30 za kolejne
            trickScore = 40 + (level - 1) * 30;
        }

        let multiplier = 1;
        if (contract.doubled) multiplier = 2;
        if (contract.redoubled) multiplier = 4;
        trickScore *= multiplier;

        // Premia za spełnienie
        let bonus = 0;
        if (trickScore < 100) {
            // Częściówka
            bonus = 50;
        } else {
            // Końcówka
            bonus = vulnerable ? 500 : 300;
        }

        // Premia za szlemika (level 6)
        if (level === 6) {
            bonus += vulnerable ? 750 : 500;
        }
        // Premia za szlema (level 7)
        if (level === 7) {
            bonus += vulnerable ? 1500 : 1000;
        }

        // Nadróbki
        let overtrickScore = 0;
        if (contract.doubled) {
            overtrickScore = overtricks * (vulnerable ? 200 : 100);
        } else if (contract.redoubled) {
            overtrickScore = overtricks * (vulnerable ? 400 : 200);
        } else {
            if (contract.suit === 'C' || contract.suit === 'D') {
                overtrickScore = overtricks * 20;
            } else {
                overtrickScore = overtricks * 30;
            }
        }

        // Bonus za kontrę/rekontrę spełnioną
        let insultBonus = 0;
        if (contract.doubled) insultBonus = 50;
        if (contract.redoubled) insultBonus = 100;

        const total = trickScore + bonus + overtrickScore + insultBonus;
        return {
            team: TEAM[contract.declarer],
            made: true,
            trickScore,
            bonus,
            overtrickScore,
            insultBonus,
            total,
            description: `${contract.display} spełniony${overtricks > 0 ? ` +${overtricks}` : ''}`
        };
    }

    static _calcDown(contract, undertricks, vulnerable) {
        let penalty = 0;

        if (contract.redoubled) {
            for (let i = 1; i <= undertricks; i++) {
                if (i === 1) penalty += vulnerable ? 400 : 200;
                else if (i <= 3) penalty += vulnerable ? 600 : 400;
                else penalty += vulnerable ? 600 : 400;  // simplified
            }
        } else if (contract.doubled) {
            for (let i = 1; i <= undertricks; i++) {
                if (i === 1) penalty += vulnerable ? 200 : 100;
                else if (i <= 3) penalty += vulnerable ? 300 : 200;
                else penalty += vulnerable ? 300 : 300;
            }
        } else {
            penalty = undertricks * (vulnerable ? 100 : 50);
        }

        const otherTeam = TEAM[contract.declarer] === 'NS' ? 'EW' : 'NS';
        return {
            team: otherTeam,
            made: false,
            penalty,
            total: penalty,
            description: `${contract.display} minus ${undertricks}`
        };
    }
}
