import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, validateProfile, suggestUsername } from '../public/js/profile-rules.js';

test('normalize trims and lowercases', () => {
  assert.deepEqual(normalize({ username: '  Ana_21 ', display_name: '  Ana   Carvalho ', bio: ' hi ' }),
    { username: 'ana_21', display_name: 'Ana Carvalho', bio: 'hi' });
});

test('valid profile has no errors', () => {
  assert.deepEqual(validateProfile({ username: 'ana_21', display_name: 'Ana', bio: '' }), {});
});

test('username rules match the database constraint', () => {
  for (const bad of ['ab', 'a'.repeat(21), 'ana carvalho', 'ana-c', 'ana!', '']) {
    assert.ok(validateProfile({ username: bad, display_name: 'Ana' }).username, `"${bad}" should be rejected`);
  }
  for (const good of ['abc', 'a'.repeat(20), 'ANA_21', 'player_007']) {
    assert.equal(validateProfile({ username: good, display_name: 'Ana' }).username, undefined, `"${good}" should pass`);
  }
});

test('display name and bio limits', () => {
  assert.ok(validateProfile({ username: 'ana', display_name: '   ' }).display_name);
  assert.ok(validateProfile({ username: 'ana', display_name: 'x'.repeat(41) }).display_name);
  assert.ok(validateProfile({ username: 'ana', display_name: 'Ana', bio: 'x'.repeat(161) }).bio);
  assert.equal(validateProfile({ username: 'ana', display_name: 'Ana', bio: 'x'.repeat(160) }).bio, undefined);
});

test('username suggestions are always valid', () => {
  assert.equal(suggestUsername('Ana Carvalho'), 'ana_carvalho');
  assert.equal(suggestUsername('José Núñez'), 'jose_nunez');
  assert.equal(suggestUsername('', 'ana.c@gmail.com'), 'ana_c');
  assert.equal(suggestUsername('Al'), 'al_player');
  for (const name of ['Ana Carvalho', '李', 'A very long name that goes on and on', '!!!', '']) {
    assert.deepEqual(validateProfile({ username: suggestUsername(name, 'x@y.z'), display_name: 'x' }), {}, name);
  }
});
