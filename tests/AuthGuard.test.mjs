import test from 'node:test';
import assert from 'node:assert/strict';

// We can't import JSX files directly in node without a loader, so we need to compile or mock.
// But we exported the logic to a pure JS function! Oh wait, `Guards.jsx` contains JSX!
// If we import from Guards.jsx, Node might crash trying to parse JSX.
// Let's create a temporary mock file or write the test to expect this behavior.
// Wait, we can use `fs.readFileSync` and `new Function` or we can just extract `getAuthGuardAction` to `GuardsLogic.mjs`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read Guards.jsx and extract the getAuthGuardAction function as a string to evaluate it.
const guardsJsx = fs.readFileSync(path.join(__dirname, '../src/components/Guards.jsx'), 'utf-8');
const logicMatch = guardsJsx.match(/export const getAuthGuardAction = \(\{ loading, user, profileError, profile \}\) => \{([\s\S]*?)\};/);

if (!logicMatch) throw new Error('Could not find getAuthGuardAction');

// Create a callable function
const getAuthGuardAction = new Function('{ loading, user, profileError, profile }', logicMatch[1]);

test('AuthGuard logic: loading session', () => {
  assert.equal(getAuthGuardAction({ loading: true }), 'LOADING_SESSION');
});

test('AuthGuard logic: missing user redirects to login', () => {
  assert.equal(getAuthGuardAction({ loading: false, user: null }), 'NAVIGATE_LOGIN');
});

test('AuthGuard logic: profile error shows error state', () => {
  assert.equal(getAuthGuardAction({ loading: false, user: { id: 1 }, profileError: 'Error' }), 'ERROR_PROFILE');
});

test('AuthGuard logic: loading profile', () => {
  assert.equal(getAuthGuardAction({ loading: false, user: { id: 1 }, profileError: null, profile: null }), 'LOADING_PROFILE');
});

test('AuthGuard logic: inactive account shows error state', () => {
  assert.equal(getAuthGuardAction({ loading: false, user: { id: 1 }, profileError: null, profile: { account_status: 'SUSPENDED' } }), 'ERROR_INACTIVE');
  assert.equal(getAuthGuardAction({ loading: false, user: { id: 1 }, profileError: null, profile: { account_status: 'INVITED' } }), 'ERROR_INACTIVE');
});

test('AuthGuard logic: active account renders children', () => {
  assert.equal(getAuthGuardAction({ loading: false, user: { id: 1 }, profileError: null, profile: { account_status: 'ACTIVE' } }), 'RENDER_CHILDREN');
});
