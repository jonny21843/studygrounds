const assert = require('node:assert/strict');
const fs = require('node:fs');

const auth = fs.readFileSync('auth.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const notes = fs.readFileSync('notes.js', 'utf8');
const callback = fs.readFileSync('auth/callback.js', 'utf8');
const legal = fs.readFileSync('legal.js', 'utf8');

// Distinct public controls and routes, without depending on live Cognito.
assert.match(html, /id="sign-in-btn"[^>]*>Sign In<\/button>/);
assert.match(html, /id="sign-up-btn"[^>]*>Sign Up<\/button>/);
assert.match(html, /id="home-sign-up"/);
assert.match(html, /id="hero-sign-up-btn"/);
assert.match(auth, /function signIn\(\)\s*\{[\s\S]*?startHostedAuth\("authorize"\);\s*\}/);
assert.match(auth, /function signUp\(\)\s*\{[\s\S]*?age-signup-gate/);
assert.match(auth, /if \(!age\.checked\) return;/);
assert.match(notes, /"home-sign-up"\)\.addEventListener\("click", signUp\)/);
assert.match(callback, /identityCheck\.status === 423/);
assert.match(legal, /response\.status === 423/);
console.log('Signup and pending-deletion routing checks passed.');
