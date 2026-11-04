// Entry point: Google sign-in through Supabase Auth, then the game and profile load.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { createProfileTab } from './profile.js';

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
  tabs: [$('#tab-table'), $('#tab-profile')],
  profileBadge: $('#profile-badge'),
  profileLoading: $('#profile-loading'),
  profileFields: $('#profile-fields'),
};

/** Name and photo from the Google profile Supabase stores in user_metadata. */
export function profileFrom(user) {
  const meta = user?.user_metadata ?? {};
  const fullName = meta.full_name || meta.name || user?.email?.split('@')[0] || 'Player';
  const avatar = meta.avatar_url || meta.picture || '';
  return { fullName, avatar, email: user?.email ?? '' };
}

const firstWord = (name) => name.trim().split(/\s+/)[0];
const initialsOf = (name) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

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

// ---------- tabs ----------
function selectTab(name, { focus = false } = {}) {
  for (const tab of el.tabs) {
    const selected = tab.id === `tab-${name}`;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    if (selected && focus) tab.focus();
  }
  const hash = name === 'profile' ? '#profile' : '';
  if (location.hash !== hash) history.replaceState(null, '', location.pathname + hash);
}

for (const tab of el.tabs) {
  tab.addEventListener('click', () => selectTab(tab.id.replace('tab-', '')));
  tab.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = el.tabs.indexOf(tab);
    const next = el.tabs[(i + (e.key === 'ArrowRight' ? 1 : el.tabs.length - 1)) % el.tabs.length];
    selectTab(next.id.replace('tab-', ''), { focus: true });
  });
}

/** Show the player's name everywhere: their profile name if they have one, else Google's. */
function applyName(displayName) {
  el.greeting.textContent = `Hi, ${firstWord(displayName)}!`;
  el.playerLabel.textContent = firstWord(displayName);
  el.initials.textContent = initialsOf(displayName);
  document.body.dataset.firstName = firstWord(displayName);
}

let started = false;
async function showTable(supabase, user) {
  if (started) return;
  started = true;
  const google = profileFrom(user);

  applyName(google.fullName);
  el.email.textContent = google.email;
  el.initials.hidden = Boolean(google.avatar);
  el.avatar.hidden = !google.avatar;
  if (google.avatar) {
    el.avatar.src = google.avatar;
    el.avatar.alt = `${google.fullName}'s profile picture`;
    el.avatar.onerror = () => { el.avatar.hidden = true; el.initials.hidden = false; };
  }
  el.login.hidden = true;
  el.table.hidden = false;
  document.title = 'Blackjack';
  selectTab(location.hash === '#profile' ? 'profile' : 'table');

  const profileTab = createProfileTab({
    supabase,
    user,
    google,
    onSaved(profile, created) {
      applyName(profile.display_name);
      el.profileBadge.hidden = true;
      if (created) setTimeout(() => selectTab('table'), 1200);
    },
  });

  let profile = null;
  try {
    profile = await profileTab.load();
    el.profileLoading.hidden = true;
    el.profileFields.hidden = false;
  } catch (err) {
    console.error(err);
    el.profileLoading.textContent = `Could not load your profile: ${err.message}. Refresh to try again.`;
  }
  if (profile) {
    applyName(profile.display_name);
  } else if (!el.profileFields.hidden) {
    // First visit: nudge them to create a profile before playing.
    el.profileBadge.hidden = false;
    selectTab('profile');
  }

  document.body.dataset.userId = user.id; // bankroll is saved per player
  await import('./app.js');
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
    await showTable(supabase, data.session.user);
  } else {
    showLogin();
    if (urlError) showLoginError(`Sign-in was not completed: ${urlError}`);
    else if (error) showLoginError(`Sign-in failed: ${error.message}`);
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') showLogin();
    else if (session && event === 'SIGNED_IN') {
      // Defer: awaiting other Supabase calls inside this callback can deadlock.
      setTimeout(() => showTable(supabase, session.user), 0);
    }
  });
}

main();
