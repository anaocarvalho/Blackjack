// Profile validation shared by the form. Mirrors the database constraints on public.profiles.

export const LIMITS = Object.freeze({ usernameMin: 3, usernameMax: 20, displayNameMax: 40, bioMax: 160 });
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function normalize(input) {
  return {
    username: String(input.username ?? '').trim().toLowerCase(),
    display_name: String(input.display_name ?? '').trim().replace(/\s+/g, ' '),
    bio: String(input.bio ?? '').trim(),
  };
}

/** Returns { field: message } for every invalid field; empty object when valid. */
export function validateProfile(input) {
  const p = normalize(input);
  const errors = {};
  if (!p.display_name) errors.display_name = 'Enter the name other players will see.';
  else if (p.display_name.length > LIMITS.displayNameMax) {
    errors.display_name = `Keep it to ${LIMITS.displayNameMax} characters or fewer.`;
  }
  if (!USERNAME_RE.test(p.username)) {
    errors.username = `Use ${LIMITS.usernameMin}–${LIMITS.usernameMax} lowercase letters, numbers or underscores.`;
  }
  if (p.bio.length > LIMITS.bioMax) errors.bio = `Keep it to ${LIMITS.bioMax} characters or fewer.`;
  return errors;
}

/** A starting username from the Google name or email, e.g. "Ana Carvalho" → "ana_carvalho". */
export function suggestUsername(fullName, email) {
  const base = (fullName || email?.split('@')[0] || 'player')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, LIMITS.usernameMax);
  return base.length >= LIMITS.usernameMin ? base : `${base}_player`.slice(0, LIMITS.usernameMax);
}
