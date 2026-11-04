import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cardPoints, handTotal, isBlackjack, isBust, dealerShouldHit, canDouble, settle, cardName,
} from '../public/js/blackjack.js';

// Build cards shaped like deckofcardsapi.com responses from short codes: "AS", "0H", "KD".
const VALUES = { A: 'ACE', K: 'KING', Q: 'QUEEN', J: 'JACK', 0: '10' };
const SUITS = { S: 'SPADES', H: 'HEARTS', D: 'DIAMONDS', C: 'CLUBS' };
const c = (code) => ({ code, value: VALUES[code[0]] ?? code[0], suit: SUITS[code[1]] });
const hand = (codes) => codes.split(' ').map(c);

test('card points', () => {
  assert.equal(cardPoints(c('AS')), 11);
  assert.equal(cardPoints(c('KH')), 10);
  assert.equal(cardPoints(c('QD')), 10);
  assert.equal(cardPoints(c('JC')), 10);
  assert.equal(cardPoints(c('0S')), 10);
  assert.equal(cardPoints(c('7H')), 7);
});

test('hand totals handle soft and hard aces', () => {
  assert.deepEqual(handTotal(hand('AS 6H')), { total: 17, soft: true });
  assert.deepEqual(handTotal(hand('AS 6H 9C')), { total: 16, soft: false });
  assert.deepEqual(handTotal(hand('AS AH')), { total: 12, soft: true });
  assert.deepEqual(handTotal(hand('AS AH AD AC')), { total: 14, soft: true });
  assert.deepEqual(handTotal(hand('AS AH 9D')), { total: 21, soft: true });
  assert.deepEqual(handTotal(hand('KS QH')), { total: 20, soft: false });
});

test('blackjack and bust', () => {
  assert.ok(isBlackjack(hand('AS KH')));
  assert.ok(!isBlackjack(hand('7S 7H 7D')), 'three-card 21 is not blackjack');
  assert.ok(isBust(hand('KS QH 2D')));
  assert.ok(!isBust(hand('AS KH QD')));
});

test('dealer stands on all 17s by default', () => {
  assert.ok(dealerShouldHit(hand('KS 6H')));
  assert.ok(!dealerShouldHit(hand('KS 7H')));
  assert.ok(!dealerShouldHit(hand('AS 6H')), 'soft 17 stands');
  assert.ok(dealerShouldHit(hand('AS 6H'), { dealerHitsSoft17: true }), 'H17 variant hits soft 17');
});

test('double down only on two cards with enough bankroll', () => {
  assert.ok(canDouble(hand('5S 6H'), 10, 10));
  assert.ok(!canDouble(hand('5S 6H'), 10, 9));
  assert.ok(!canDouble(hand('2S 3H 6D'), 10, 100));
});

test('settlement payouts include the stake', () => {
  const rules = { blackjackPays: 1.5 };
  assert.deepEqual(settle(hand('AS KH'), hand('9S 8H'), 10, rules), { outcome: 'blackjack', payout: 25 });
  assert.deepEqual(settle(hand('AS KH'), hand('AD QC'), 10, rules), { outcome: 'push', payout: 10 });
  assert.deepEqual(settle(hand('9S 8H'), hand('AD QC'), 10, rules), { outcome: 'dealer-blackjack', payout: 0 });
  assert.deepEqual(settle(hand('KS QH 5D'), hand('9S 8H'), 10, rules), { outcome: 'bust', payout: 0 });
  assert.deepEqual(settle(hand('KS 8H'), hand('KD 6C 9H'), 10, rules), { outcome: 'dealer-bust', payout: 20 });
  assert.deepEqual(settle(hand('KS 9H'), hand('KD 8C'), 10, rules), { outcome: 'win', payout: 20 });
  assert.deepEqual(settle(hand('KS 7H'), hand('KD 8C'), 10, rules), { outcome: 'lose', payout: 0 });
  assert.deepEqual(settle(hand('KS 8H'), hand('KD 8C'), 10, rules), { outcome: 'push', payout: 10 });
  assert.deepEqual(settle(hand('7S 7H 7D'), hand('KD QC'), 10, rules), { outcome: 'win', payout: 20 });
});

test('player bust loses even if dealer would also bust', () => {
  assert.equal(settle(hand('KS QH 5D'), hand('KD 6C 9H'), 10).outcome, 'bust');
});

test('card names', () => {
  assert.equal(cardName(c('AS')), 'Ace of Spades');
  assert.equal(cardName(c('0H')), '10 of Hearts');
});
