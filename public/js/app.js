import {
  RULES, handTotal, isBlackjack, isBust, dealerShouldHit, canDouble, settle, OUTCOME_TEXT, cardName,
} from './blackjack.js';
import { Shoe, CARD_BACK } from './api.js';

// Saved per signed-in player (auth.js puts the Supabase user id on <body>).
const STORAGE_KEY = `blackjack.bankroll.${document.body.dataset.userId || 'guest'}`;
const DEAL_DELAY = 180;
const DEALER_DELAY = 600;

const $ = (sel) => document.querySelector(sel);
const el = {
  dealerCards: $('#dealer-cards'),
  playerCards: $('#player-cards'),
  dealerTotal: $('#dealer-total'),
  playerTotal: $('#player-total'),
  status: $('#status'),
  bankroll: $('#bankroll'),
  bet: $('#bet'),
  shoe: $('#shoe'),
  betControls: $('#bet-controls'),
  playControls: $('#play-controls'),
  chips: [...document.querySelectorAll('.chip')],
  clear: $('#btn-clear'),
  deal: $('#btn-deal'),
  hit: $('#btn-hit'),
  stand: $('#btn-stand'),
  double: $('#btn-double'),
  reset: $('#btn-reset'),
  retry: $('#btn-retry'),
};

const shoe = new Shoe(RULES.decks);
const state = {
  phase: 'loading', // loading | betting | player | dealer | error
  bankroll: loadBankroll(),
  bet: 0,
  lastBet: 0,
  doubled: false,
  player: [],
  dealer: [],
  holeHidden: true,
  busy: false,
  retry: null, // { action, phase } for the request that failed
};

// ---------- persistence ----------
function loadBankroll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = Number(raw);
    return raw !== null && Number.isFinite(n) && n >= 0 ? n : RULES.startingBankroll;
  } catch {
    return RULES.startingBankroll;
  }
}
function saveBankroll(amount) {
  try { localStorage.setItem(STORAGE_KEY, String(amount)); } catch { /* storage unavailable */ }
}

// ---------- helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const money = (n) => {
  const digits = Number.isInteger(n) ? 0 : 2;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: 2 })}`;
};

/** Resolve once an image has loaded (or failed, or 4s passed) so cards don't pop in blank. */
function preload(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    setTimeout(resolve, 4000);
    img.src = src;
  });
}

function setStatus(text, tone = '') {
  el.status.textContent = text;
  el.status.dataset.tone = tone;
}

// ---------- rendering ----------
function cardElement(card, faceDown = false) {
  const img = document.createElement('img');
  img.className = 'card';
  img.width = 226;
  img.height = 314;
  img.draggable = false;
  if (faceDown) {
    img.src = CARD_BACK;
    img.alt = 'Face-down card';
    img.dataset.hole = 'true';
  } else {
    img.src = card.image;
    img.alt = cardName(card);
  }
  return img;
}

function revealHole() {
  state.holeHidden = false;
  const hole = el.dealerCards.querySelector('[data-hole]');
  if (!hole) return;
  const card = state.dealer[1];
  hole.classList.add('flip');
  hole.src = card.image;
  hole.alt = cardName(card);
  hole.removeAttribute('data-hole');
}

function totalLabel(cards) {
  if (!cards.length) return '';
  if (isBlackjack(cards)) return 'Blackjack';
  const { total, soft } = handTotal(cards);
  return soft && total < 21 ? `${total - 10} / ${total}` : String(total);
}

function render() {
  const { phase, busy } = state;
  el.bankroll.textContent = money(state.bankroll);
  el.bet.textContent = money(state.bet);
  el.shoe.textContent = shoe.deckId ? `${shoe.remaining} cards left in shoe` : '';

  el.playerTotal.textContent = totalLabel(state.player);
  el.dealerTotal.textContent = state.holeHidden
    ? (state.dealer[0] ? totalLabel([state.dealer[0]]) : '')
    : totalLabel(state.dealer);

  const betting = phase === 'betting';
  el.betControls.hidden = !betting;
  el.playControls.hidden = phase !== 'player' && phase !== 'dealer';
  el.retry.hidden = phase !== 'error';

  for (const chip of el.chips) {
    chip.disabled = busy || !betting || Number(chip.dataset.value) > state.bankroll;
  }
  el.clear.disabled = busy || state.bet === 0;
  el.deal.disabled = busy || state.bet < RULES.minBet;

  const playing = phase === 'player' && !busy;
  el.hit.disabled = !playing;
  el.stand.disabled = !playing;
  el.double.disabled = !playing || !canDouble(state.player, state.bet, state.bankroll);

  el.reset.hidden = !(betting && state.bankroll + state.bet < RULES.minBet);
}

// ---------- error handling ----------
/** Run an async game step with buttons locked; on failure offer a Retry of that same step. */
async function guarded(action) {
  const phaseBefore = state.phase;
  state.busy = true;
  render();
  try {
    await action();
  } catch (err) {
    console.error(err);
    state.retry = { action, phase: phaseBefore };
    state.phase = 'error';
    setStatus(err.message, 'error');
  } finally {
    state.busy = false;
    render();
  }
}

// ---------- game flow ----------
async function init() {
  setStatus('Shuffling a 6-deck shoe…');
  await shoe.open();
  startBetting();
}

function startBetting() {
  state.phase = 'betting';
  // Re-place the previous bet as a convenience if it is still affordable.
  if (state.bet === 0 && state.lastBet && state.lastBet <= state.bankroll) {
    state.bet = state.lastBet;
    state.bankroll -= state.lastBet;
  }
  if (state.bankroll + state.bet < RULES.minBet) {
    setStatus('You are out of chips. Start a new game to play again.', 'lose');
  } else if (!state.player.length) {
    const name = document.body.dataset.firstName;
    setStatus(name ? `Welcome to the table, ${name}! Place your bet, then press Deal.` : 'Place your bet, then press Deal.');
  }
  saveBankroll(state.bankroll + state.bet);
}

function placeChip(value) {
  if (state.phase !== 'betting' || state.busy || value > state.bankroll) return;
  state.bet += value;
  state.bankroll -= value;
  saveBankroll(state.bankroll + state.bet);
  render();
}

function clearBet() {
  state.bankroll += state.bet;
  state.bet = 0;
  render();
}

async function deal() {
  if (state.bet < RULES.minBet) return;
  state.lastBet = state.bet;
  state.doubled = false;

  if (shoe.remaining < RULES.reshuffleBelow) {
    setStatus('Cut card reached — reshuffling the shoe…');
    await shoe.reshuffle();
  }

  setStatus('Dealing…');
  // One request for the opening four cards, dealt in casino order.
  const cards = await shoe.draw(4);
  await Promise.all([...cards.map((c) => preload(c.image)), preload(CARD_BACK)]);
  saveBankroll(state.bankroll); // the stake is committed once cards are dealt

  state.player = [];
  state.dealer = [];
  state.holeHidden = true;
  el.playerCards.replaceChildren();
  el.dealerCards.replaceChildren();
  state.phase = 'player';

  const [p1, d1, p2, d2] = cards;
  for (const [hand, card, container, faceDown] of [
    [state.player, p1, el.playerCards, false],
    [state.dealer, d1, el.dealerCards, false],
    [state.player, p2, el.playerCards, false],
    [state.dealer, d2, el.dealerCards, true],
  ]) {
    hand.push(card);
    container.appendChild(cardElement(card, faceDown));
    render();
    await sleep(DEAL_DELAY);
  }

  // Dealer peeks for blackjack; a natural on either side ends the hand immediately.
  if (isBlackjack(state.player) || isBlackjack(state.dealer)) {
    revealHole();
    finishRound();
    return;
  }
  setStatus('Hit, stand or double down?');
}

async function drawToPlayer() {
  const [card] = await shoe.draw(1);
  await preload(card.image);
  state.player.push(card);
  el.playerCards.appendChild(cardElement(card));
  render();
}

async function hit() {
  await drawToPlayer();
  if (isBust(state.player)) {
    revealHole();
    finishRound();
  } else if (handTotal(state.player).total === 21) {
    await dealerTurn();
  } else {
    setStatus('Hit or stand?');
  }
}

async function doubleDown() {
  if (!state.doubled) {
    if (!canDouble(state.player, state.bet, state.bankroll)) return;
    state.bankroll -= state.bet;
    state.bet *= 2;
    state.doubled = true;
    saveBankroll(state.bankroll);
  }
  if (state.player.length === 2) await drawToPlayer(); // skip if a retry already drew
  if (isBust(state.player)) {
    revealHole();
    finishRound();
  } else {
    await dealerTurn();
  }
}

async function dealerTurn() {
  state.phase = 'dealer';
  setStatus('Dealer’s turn…');
  revealHole();
  render();
  await sleep(DEALER_DELAY);
  while (dealerShouldHit(state.dealer)) {
    const [card] = await shoe.draw(1);
    await preload(card.image);
    state.dealer.push(card);
    el.dealerCards.appendChild(cardElement(card));
    render();
    await sleep(DEALER_DELAY);
  }
  finishRound();
}

function finishRound() {
  const { outcome, payout } = settle(state.player, state.dealer, state.bet);
  const net = payout - state.bet;
  state.bankroll += payout;
  state.bet = 0;
  saveBankroll(state.bankroll);

  const tone = net > 0 ? 'win' : net < 0 ? 'lose' : 'push';
  const delta = net > 0 ? ` +${money(net)}` : net < 0 ? ` −${money(-net)}` : '';
  setStatus(`${OUTCOME_TEXT[outcome]}${delta}`, tone);
  startBetting();
}

function resetGame() {
  state.bankroll = RULES.startingBankroll;
  state.bet = 0;
  state.lastBet = 0;
  saveBankroll(state.bankroll);
  setStatus(`New game — you have ${money(state.bankroll)}. Place your bet.`);
  render();
}

// ---------- events ----------
for (const chip of el.chips) chip.addEventListener('click', () => placeChip(Number(chip.dataset.value)));
el.clear.addEventListener('click', clearBet);
el.deal.addEventListener('click', () => guarded(deal));
el.hit.addEventListener('click', () => guarded(hit));
el.stand.addEventListener('click', () => guarded(dealerTurn));
el.double.addEventListener('click', () => guarded(doubleDown));
el.reset.addEventListener('click', resetGame);
el.retry.addEventListener('click', () => {
  const { action, phase } = state.retry ?? { action: init, phase: 'loading' };
  state.retry = null;
  state.phase = phase;
  setStatus('Retrying…');
  guarded(action);
});

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  const map = { h: el.hit, s: el.stand, d: el.double, enter: el.deal };
  const btn = map[e.key.toLowerCase()];
  if (!btn || btn.disabled || btn.closest('[hidden]')) return;
  if (e.key === 'Enter' && document.activeElement instanceof HTMLButtonElement) return; // let focused buttons handle Enter
  e.preventDefault();
  btn.click();
});

render();
guarded(init);
