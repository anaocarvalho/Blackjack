// Pure Blackjack rules. No DOM, no network — easy to unit test.

export const RULES = Object.freeze({
  decks: 6,
  blackjackPays: 1.5, // 3:2
  dealerHitsSoft17: false, // dealer stands on all 17s
  reshuffleBelow: 78, // ~25% of a 6-deck shoe (the "cut card")
  startingBankroll: 1000,
  minBet: 5,
});

const FACE = { KING: 10, QUEEN: 10, JACK: 10 };

/** Point value of a single card as returned by deckofcardsapi.com. Aces count 11 here. */
export function cardPoints(card) {
  if (card.value === 'ACE') return 11;
  if (card.value in FACE) return FACE[card.value];
  const n = Number.parseInt(card.value, 10);
  if (Number.isNaN(n)) throw new Error(`Unknown card value: ${card.value}`);
  return n;
}

/** Best total for a hand. `soft` is true when an ace is still counted as 11. */
export function handTotal(cards) {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += cardPoints(card);
    if (card.value === 'ACE') aces += 1;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 };
}

export const isBlackjack = (cards) => cards.length === 2 && handTotal(cards).total === 21;
export const isBust = (cards) => handTotal(cards).total > 21;

export function dealerShouldHit(cards, rules = RULES) {
  const { total, soft } = handTotal(cards);
  if (total < 17) return true;
  return total === 17 && soft && rules.dealerHitsSoft17;
}

export const canDouble = (cards, bet, bankroll) => cards.length === 2 && bankroll >= bet;

/**
 * Decide a finished round. `bet` is the total stake on the table (already doubled if the
 * player doubled down). Returns the outcome and the amount paid back to the bankroll,
 * stake included (0 for a loss, bet for a push, 2x for a win, 2.5x for blackjack).
 */
export function settle(playerCards, dealerCards, bet, rules = RULES) {
  const player = handTotal(playerCards).total;
  const dealer = handTotal(dealerCards).total;
  const playerBJ = isBlackjack(playerCards);
  const dealerBJ = isBlackjack(dealerCards);

  if (playerBJ && dealerBJ) return { outcome: 'push', payout: bet };
  if (playerBJ) return { outcome: 'blackjack', payout: bet + bet * rules.blackjackPays };
  if (dealerBJ) return { outcome: 'dealer-blackjack', payout: 0 };
  if (player > 21) return { outcome: 'bust', payout: 0 };
  if (dealer > 21) return { outcome: 'dealer-bust', payout: bet * 2 };
  if (player > dealer) return { outcome: 'win', payout: bet * 2 };
  if (player < dealer) return { outcome: 'lose', payout: 0 };
  return { outcome: 'push', payout: bet };
}

export const OUTCOME_TEXT = {
  blackjack: 'Blackjack! You win 3:2.',
  win: 'You win!',
  'dealer-bust': 'Dealer busts — you win!',
  push: 'Push. Your bet is returned.',
  lose: 'Dealer wins.',
  bust: 'Bust! You went over 21.',
  'dealer-blackjack': 'Dealer has Blackjack.',
};

const NAMES = { ACE: 'Ace', KING: 'King', QUEEN: 'Queen', JACK: 'Jack' };
export function cardName(card) {
  const value = NAMES[card.value] ?? card.value;
  const suit = card.suit.charAt(0) + card.suit.slice(1).toLowerCase();
  return `${value} of ${suit}`;
}
