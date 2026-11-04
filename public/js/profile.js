// Profile tab: create or edit the signed-in player's row in public.profiles.
import { LIMITS, normalize, validateProfile, suggestUsername } from './profile-rules.js';

const $ = (sel) => document.querySelector(sel);

export function createProfileTab({ supabase, user, google, onSaved }) {
  const el = {
    form: $('#profile-form'),
    heading: $('#profile-heading'),
    intro: $('#profile-intro'),
    avatar: $('#profile-avatar'),
    displayName: $('#pf-display-name'),
    username: $('#pf-username'),
    bio: $('#pf-bio'),
    bioCount: $('#pf-bio-count'),
    save: $('#btn-profile-save'),
    status: $('#profile-status'),
    since: $('#profile-since'),
  };
  let profile = null;

  el.displayName.maxLength = LIMITS.displayNameMax;
  el.username.maxLength = LIMITS.usernameMax;
  el.bio.maxLength = LIMITS.bioMax;

  if (google.avatar) {
    el.avatar.src = google.avatar;
    el.avatar.alt = 'Your Google profile picture';
    el.avatar.hidden = false;
  }

  const setStatus = (text, tone = '') => {
    el.status.textContent = text;
    el.status.dataset.tone = tone;
  };

  function showFieldErrors(errors) {
    for (const [field, input] of [['display_name', el.displayName], ['username', el.username], ['bio', el.bio]]) {
      const msg = errors[field] || '';
      const out = document.getElementById(`${input.id}-error`);
      out.textContent = msg;
      out.hidden = !msg;
      input.setAttribute('aria-invalid', String(Boolean(msg)));
    }
  }

  const updateBioCount = () => { el.bioCount.textContent = `${el.bio.value.length}/${LIMITS.bioMax}`; };
  el.bio.addEventListener('input', updateBioCount);
  el.username.addEventListener('input', () => {
    const pos = el.username.selectionStart;
    el.username.value = el.username.value.toLowerCase().replace(/\s/g, '_');
    el.username.setSelectionRange(pos, pos);
  });

  function fill() {
    const creating = !profile;
    el.heading.textContent = creating ? 'Create your profile' : 'Your profile';
    el.intro.textContent = creating
      ? 'Pick a username and tell the table a little about yourself.'
      : 'Update how other players see you.';
    el.save.textContent = creating ? 'Create profile' : 'Save changes';
    el.displayName.value = profile?.display_name ?? google.fullName;
    el.username.value = profile?.username ?? suggestUsername(google.fullName, google.email);
    el.bio.value = profile?.bio ?? '';
    el.since.textContent = profile
      ? `Member since ${new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`
      : '';
    updateBioCount();
    showFieldErrors({});
  }

  async function load() {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) throw error;
    profile = data;
    fill();
    return profile;
  }

  el.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = normalize({ username: el.username.value, display_name: el.displayName.value, bio: el.bio.value });
    const errors = validateProfile(values);
    showFieldErrors(errors);
    if (Object.keys(errors).length) {
      setStatus('Please fix the highlighted fields.', 'error');
      el.form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    el.save.disabled = true;
    setStatus('Saving…');
    const row = { ...values, bio: values.bio || null, avatar_url: google.avatar || null };
    const creating = !profile;
    const query = creating
      ? supabase.from('profiles').insert({ id: user.id, ...row })
      : supabase.from('profiles').update(row).eq('id', user.id);
    const { data, error } = await query.select().single();
    el.save.disabled = false;

    if (error) {
      if (error.code === '23505') {
        showFieldErrors({ username: 'That username is taken. Try another.' });
        setStatus('That username is taken.', 'error');
        el.username.focus();
      } else {
        setStatus(`Could not save your profile: ${error.message}`, 'error');
      }
      return;
    }
    profile = data;
    fill();
    setStatus(creating ? 'Profile created! Welcome to the table.' : 'Profile saved.', 'win');
    onSaved?.(profile, creating);
  });

  return { load, get profile() { return profile; } };
}
