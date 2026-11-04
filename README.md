# Blackjack

Browser Blackjack dealt from a real 6-deck shoe by the free [Deck of Cards API](https://deckofcardsapi.com/).
Plain HTML, CSS and JavaScript — no framework, no build step, no API key.

## How to play

- Click chips to place a bet (minimum $5), then **Deal**.
- **Hit** (`H`) to take a card, **Stand** (`S`) to end your turn, **Double** (`D`) to double your bet on your first two cards and take exactly one more card.
- Your bankroll starts at $1,000 and is saved in your browser. Your last bet is placed again automatically for the next hand. If you run out, press **New game**.

### House rules

| Rule | Setting |
| --- | --- |
| Decks | 6, reshuffled when fewer than 78 cards remain (the "cut card") |
| Blackjack pays | 3 to 2 |
| Dealer | Stands on all 17s, including soft 17 |
| Dealer peek | A natural blackjack on either side ends the hand right away |
| Not included (yet) | Splitting pairs, insurance, surrender |

The rules live in `RULES` at the top of `public/js/blackjack.js`.

## How it uses the API

| Moment | Request |
| --- | --- |
| Page load | `GET /api/deck/new/shuffle/?deck_count=6` → a `deck_id` for the shoe |
| Deal | `GET /api/deck/<deck_id>/draw/?count=4` (player, dealer, player, dealer) |
| Hit / double / dealer draws | `GET /api/deck/<deck_id>/draw/?count=1` |
| Cut card reached | `GET /api/deck/<deck_id>/shuffle/` (returns all cards and reshuffles) |
| Card images | `card.image` from each draw, and `/static/img/back.png` for the dealer's hidden card |

Hands are tracked in the browser rather than with the API's "piles" feature, because the API documents that piles don't work with multi-deck shoes. If a shoe has expired (the API discards decks after two weeks of inactivity), the app opens a new one and retries. If a request fails, the game shows a **Retry** button for that step, and your bet stays on the table.

## Project layout

```
public/            ← what Netlify serves
  index.html
  css/styles.css
  js/blackjack.js  ← pure game rules (hand totals, dealer logic, payouts)
  js/api.js        ← Deck of Cards API wrapper (the shoe)
  js/app.js        ← UI and game flow
tests/             ← unit tests for the rules (node:test)
netlify.toml       ← publish = "public", security headers
```

## Run locally

ES modules don't load from `file://`, so serve the folder:

```bash
npx serve public
```

or

```bash
python3 -m http.server 8080 --directory public
```

Run the tests (Node 18+):

```bash
npm test
```

## Deploy to Netlify

`netlify.toml` already sets everything up: no build command, publish directory `public`.

- **From GitHub:** Netlify → Add new site → Import an existing project → pick this repo, branch `main`. Leave the build settings as `netlify.toml` provides them.
- **Manual drag-and-drop:** Netlify → Sites → drag the `public` folder onto the deploy area.

No environment variables are needed.
