// Entry point: Google sign-in through Supabase Auth, then the game loads.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const $ = (sel) => document.querySelector(sel);
const el = {
  login: $('#login'),
  loginBtn: $('#btn-google'),
  loginError: $('#login-error'),
  table: $('#table'),
  avatar: $('#user-avatar'),
  initials: $('#user-initials'),
  greeting: $('#user-greeting'),
  email: $('#user-email'),
  signOut: $('#btn-signout'),
  playerLabel: $('#player-name'),
};

/** Name and photo from the Google profile Supabase stores in user_metadata. */
export function profileFrom(user) {
  const meta = user?.user_metadata ?? {};
  const fullName = meta.full_name || meta.name || user?.email?.split('@')[0] || 'Player';
  const firstName = fullName.trim().split(/\s+/)[0];
  const initials = fullName.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
  const avatar = meta.avatar_url || meta.picture || '';
  return { fullName, firstName, initials, avatar, email: user?.email ?? '' };
}

function showLoginError(message) {
  el.loginError.textContent = message;
  el.loginError.hidden = !message;
}

function showLogin() {
  el.table.hidden = true;
  el.login.hidden = false;
  el.loginBtn.disabled = false;
  document.title = 'Sign in · Blackjack';
}

let gameLoaded = false;
async function showTable(user) {
  const p = profileFrom(user);
  el.greeting.textContent = `Hi, ${p.firstName}!`;
  el.email.textContent = p.email;
  el.playerLabel.textContent = p.firstName;
  el.initials.textContent = p.initials;
  el.initials.hidden = Boolean(p.avatar);
  el.avatar.hidden = !p.avatar;
  if (p.avatar) {
    el.avatar.src = p.avatar;
    el.avatar.alt = `${p.fullName}'s profile picture`;
    el.avatar.onerror = () => { el.avatar.hidden = true; el.initials.hidden = false; };
  }
  el.login.hidden = true;
  el.table.hidden = false;
  document.title = 'Blackjack';

  if (!gameLoaded) {
    gameLoaded = true;
    document.body.dataset.userId = user.id; // bankroll is saved per player
    document.body.dataset.firstName = p.firstName;
    await import('./app.js');
  }
}

async function main() {
  // Surface OAuth errors Supabase sends back in the URL (e.g. the user cancelled).
  const params = new URLSearchParams(location.search + location.hash.replace(/^#/, '&'));
  const urlError = params.get('error_description') || params.get('error');

  if (!window.supabase?.createClient) {
    showLogin();
    showLoginError('Could not load the sign-in library. Please refresh the page.');
    return;
  }
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
  });

  el.loginBtn.addEventListener('click', async () => {
    el.loginBtn.disabled = true;
    showLoginError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}${location.pathname}` },
    });
    if (error) {
      el.loginBtn.disabled = false;
      showLoginError(`Google sign-in failed: ${error.message}`);
    }
  });

  el.signOut.addEventListener('click', async () => {
    el.signOut.disabled = true;
    await supabase.auth.signOut();
    location.replace(location.pathname); // reload so no game state from this player lingers
  });

  // getSession() also finishes the OAuth redirect (exchanges ?code= for a session).
  const { data, error } = await supabase.auth.getSession();
  if (location.search.includes('code=') || urlError) {
    history.replaceState(null, '', location.pathname); // tidy the address bar
  }

  if (data?.session) {
    await showTable(data.session.user);
  } else {
    showLogin();
    if (urlError) showLoginError(`Sign-in was not completed: ${urlError}`);
    else if (error) showLoginError(`Sign-in failed: ${error.message}`);
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') showLogin();
    else if (session && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
      // Defer: awaiting other Supabase calls inside this callback can deadlock.
      setTimeout(() => showTable(session.user), 0);
    }
  });
}

main();
