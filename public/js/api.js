// Thin wrapper around https://deckofcardsapi.com/
// Note: the API's "piles" feature does not work with multi-deck shoes, so hands are
// kept in the browser and the API is only used as the shoe (shuffle + draw).

const BASE = 'https://deckofcardsapi.com/api/deck';

async function request(path) {
  let res;
  try {
    res = await fetch(`${BASE}/${path}`);
  } catch {
    throw new Error('Could not reach the Deck of Cards API. Check your connection.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body (e.g. a 404 page for an expired deck) */
  }
  if (!res.ok || !data || data.success === false) {
    const err = new Error(data?.error || `Deck of Cards API error (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export class Shoe {
  constructor(deckCount) {
    this.deckCount = deckCount;
    this.deckId = null;
    this.remaining = 0;
  }

  async open() {
    const data = await request(`new/shuffle/?deck_count=${this.deckCount}`);
    this.deckId = data.deck_id;
    this.remaining = data.remaining;
    return data;
  }

  /** Put every card back in the shoe and shuffle it. */
  async reshuffle() {
    if (!this.deckId) return this.open();
    const data = await request(`${this.deckId}/shuffle/`);
    this.remaining = data.remaining;
    return data;
  }

  async draw(count) {
    if (!this.deckId) await this.open();
    let data;
    try {
      data = await request(`${this.deckId}/draw/?count=${count}`);
    } catch (err) {
      // Decks are discarded after two weeks of inactivity — open a fresh shoe and retry once.
      if (err.status === 404) {
        await this.open();
        data = await request(`${this.deckId}/draw/?count=${count}`);
      } else {
        throw err;
      }
    }
    this.remaining = data.remaining;
    if (data.cards.length < count) throw new Error('The shoe ran out of cards.');
    return data.cards;
  }
}

export const CARD_BACK = 'https://deckofcardsapi.com/static/img/back.png';
