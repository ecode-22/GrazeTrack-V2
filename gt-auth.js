// ============================================================
//  gt-auth.js  —  Supabase auth + cloud sync
//  Handles: sign in, sign up, sign out, two-way data sync
// ============================================================
'use strict';

// ── CONFIG — replace with your Supabase project values ───────
//   Dashboard → Settings → API → Project URL / anon public key
const SUPABASE_URL      = 'sb_publishable_7un76FuhgSCl-YEd1JhFNw_fKnSKpz-';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4c3BndHV3c2phYnJpbW5ncmttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MDc5NTAsImV4cCI6MjA5OTE4Mzk1MH0.Zs7d6ZmaLhePZ2I6UY_maSN1z_6hXRldUJvWQknt5yc ';

// ── Globals ───────────────────────────────────────────────────
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window._sb = _sb; // exposed so gt-data.js can call scheduleSyncToSupabase

let _currentUser  = null;
let _syncTimer    = null;
let _syncPending  = false;

// ── Boot ──────────────────────────────────────────────────────
async function initAuth() {
    // Pick up an existing session immediately (page reload / return visit)
    const { data: { session } } = await _sb.auth.getSession();
    if (session?.user) {
        _currentUser = session.user;
        await _onSignIn(session.user, false); // false = don't show "syncing" on boot
    }
    _updateAuthUI();

    // Keep UI in sync whenever auth changes (login, logout, token refresh)
    _sb.auth.onAuthStateChange(async (event, session) => {
        const wasLoggedIn = !!_currentUser;
        _currentUser = session?.user || null;

        if (event === 'SIGNED_IN'  && !wasLoggedIn) await _onSignIn(session.user, true);
        if (event === 'SIGNED_OUT')                  _onSignOut();
        _updateAuthUI();
    });
}

// ── Auth actions ──────────────────────────────────────────────
async function authSignIn(email, password) {
    const { error } = await _sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
}

async function authSignUp(email, password) {
    const { error } = await _sb.auth.signUp({ email, password });
    if (error) throw error;
}

async function authSignOut() {
    if (!confirm('Sign out?\n\nYour data stays saved locally and in the cloud.')) return;
    await _sb.auth.signOut();
}

// ── Data sync ─────────────────────────────────────────────────

// Called when user logs in.  Cloud wins if they have cloud data;
// otherwise we upload whatever is already in localStorage.
async function _onSignIn(user, showStatus) {
    if (showStatus) setStatus('☁️ Signing in — syncing your data…');
    try {
        const { data, error } = await _sb
            .from('gt_user_data')
            .select('fields, events, groups')
            .eq('user_id', user.id)
            .maybeSingle(); // returns null if no row yet, not an error

        if (error) throw error;

        if (data) {
            // User has existing cloud data — pull it down
            localStorage.setItem('gt_fields', JSON.stringify(data.fields ?? []));
            localStorage.setItem('gt_events', JSON.stringify(data.events ?? []));
            localStorage.setItem('gt_groups', JSON.stringify(data.groups ?? []));
            _refreshMapAndUI();
            if (showStatus) setStatus('☁️ Data loaded from your account');
        } else {
            // First login — push whatever local data they already have
            await _pushNow();
            if (showStatus) setStatus('☁️ Local data backed up to your new account');
        }
        _showSyncDot('ok');
    } catch (e) {
        console.warn('[GrazingTrack] Sync error on sign-in:', e);
        if (showStatus) setStatus('⚠️ Signed in — cloud sync failed, using local data');
        _showSyncDot('err');
    }
}

function _onSignOut() {
    // Don't wipe localStorage — let the user keep working as a guest
    _refreshMapAndUI();
    setStatus('Signed out — data still saved locally');
}

// Called by gt-data.js save() after every local write
function scheduleSyncToSupabase() {
    if (!_currentUser) return;
    _syncPending = true;
    _showSyncDot('pending');
    if (_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = setTimeout(async () => {
        _syncTimer = null;
        _syncPending = false;
        await _pushNow();
    }, 1500); // 1.5 s debounce — batches rapid saves
}

async function _pushNow() {
    if (!_currentUser) return;
    try {
        const fields = JSON.parse(localStorage.getItem('gt_fields') || '[]');
        const events = JSON.parse(localStorage.getItem('gt_events') || '[]');
        const groups = JSON.parse(localStorage.getItem('gt_groups') || '[]');

        const { error } = await _sb.from('gt_user_data').upsert(
            { user_id: _currentUser.id, fields, events, groups },
            { onConflict: 'user_id' }
        );

        if (error) throw error;
        _showSyncDot('ok');
    } catch (e) {
        console.warn('[GrazingTrack] Push failed:', e);
        _showSyncDot('err');
    }
}

// ── Sync status dot ───────────────────────────────────────────
function _showSyncDot(state) {
    const dot = document.getElementById('syncDot');
    if (!dot) return;
    dot.className = 'sync-dot sync-' + state;
    const labels = { pending: 'Saving…', ok: 'Synced ✓', err: 'Sync failed' };
    dot.title = labels[state] || '';
    if (dot._clear) clearTimeout(dot._clear);
    if (state === 'ok') {
        dot._clear = setTimeout(() => { dot.className = 'sync-dot sync-idle'; }, 2500);
    }
}

// ── Refresh the map and all UI after a data pull ──────────────
function _refreshMapAndUI() {
    try {
        if (typeof drawnItems !== 'undefined' && drawnItems) drawnItems.clearLayers();
        if (typeof restoreFieldsOnMap === 'function') restoreFieldsOnMap();
        if (typeof renderFieldList    === 'function') renderFieldList();
        if (typeof updateStats        === 'function') updateStats();
        if (typeof updateStorageBar   === 'function') updateStorageBar();
        if (typeof refreshDashboard   === 'function') refreshDashboard();
    } catch (e) { /* non-critical */ }
}

// ── Auth UI in sidebar ────────────────────────────────────────
function _updateAuthUI() {
    const el = document.getElementById('sbAccountArea');
    if (!el) return;

    if (_currentUser) {
        const email    = _currentUser.email || '';
        const initials = email.slice(0, 2).toUpperCase();
        el.innerHTML = `
            <div class="sb-user-card">
                <div class="sb-avatar">${initials}</div>
                <div class="sb-user-info">
                    <div class="sb-user-email" title="${email}">${email}</div>
                    <div class="sb-user-sync">
                        <span class="sync-dot sync-idle" id="syncDot"></span>
                        <span class="sb-sync-label">Cloud sync active</span>
                    </div>
                </div>
                <button class="sb-signout-btn" onclick="authSignOut()" title="Sign out">⏏</button>
            </div>`;
    } else {
        el.innerHTML = `
            <button class="sb-signin-btn" onclick="openAuthModal()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 20a3 3 0 0 0-3-3H9a3 3 0 0 0-3 3"/><circle cx="12" cy="10" r="3"/><circle cx="12" cy="12" r="10"/></svg>
                Sign in / Create account
            </button>
            <p class="sb-guest-note">Data saved locally without an account</p>`;
    }
}

// ── Auth modal ────────────────────────────────────────────────
function openAuthModal(defaultTab) {
    document.getElementById('modalAuth').style.display = 'flex';
    _switchAuthTab(defaultTab || 'signin');
    document.getElementById('authSuccess').style.display = 'none';
    _clearAuthMsg();
    setTimeout(() => document.getElementById('authEmail')?.focus(), 80);
}

function closeAuthModal() {
    document.getElementById('modalAuth').style.display = 'none';
    _clearAuthMsg();
    // Clear password fields for security
    ['authPass', 'authPassNew', 'authPassConfirm'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

function _switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === tab)
    );
    document.getElementById('authSigninPanel').style.display = tab === 'signin' ? 'flex' : 'none';
    document.getElementById('authSignupPanel').style.display = tab === 'signup' ? 'flex' : 'none';
    _clearAuthMsg();
}

function _setAuthMsg(msg, isError) {
    const el = document.getElementById('authMsg');
    if (!el) return;
    el.textContent  = msg;
    el.className    = 'auth-msg ' + (isError ? 'auth-msg-err' : 'auth-msg-ok');
    el.style.display = msg ? 'block' : 'none';
}

function _clearAuthMsg() {
    const el = document.getElementById('authMsg');
    if (el) { el.textContent = ''; el.style.display = 'none'; }
}

function _setAuthLoading(loading) {
    document.querySelectorAll('.auth-submit').forEach(b => {
        b.disabled    = loading;
        b.textContent = loading ? '…' : b.dataset.label;
    });
}

async function submitSignIn() {
    const email = document.getElementById('authEmail').value.trim();
    const pass  = document.getElementById('authPass').value;
    if (!email || !pass) { _setAuthMsg('Enter your email and password.', true); return; }
    _clearAuthMsg();
    _setAuthLoading(true);
    try {
        await authSignIn(email, pass);
        closeAuthModal();
    } catch (e) {
        _setAuthMsg(e.message || 'Sign in failed — check your email and password.', true);
    } finally {
        _setAuthLoading(false);
    }
}

async function submitSignUp() {
    const email = document.getElementById('authEmailNew').value.trim();
    const pass  = document.getElementById('authPassNew').value;
    const pass2 = document.getElementById('authPassConfirm').value;
    if (!email || !pass)  { _setAuthMsg('Please fill in all fields.', true); return; }
    if (pass !== pass2)   { _setAuthMsg('Passwords do not match.', true); return; }
    if (pass.length < 6)  { _setAuthMsg('Password must be at least 6 characters.', true); return; }
    _clearAuthMsg();
    _setAuthLoading(true);
    try {
        await authSignUp(email, pass);
        document.getElementById('authSuccess').style.display = 'block';
        _setAuthMsg('Account created! Check your email to confirm, then sign in.', false);
    } catch (e) {
        _setAuthMsg(e.message || 'Sign up failed — try a different email.', true);
    } finally {
        _setAuthLoading(false);
    }
}

// Allow Enter key to submit
document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const modal = document.getElementById('modalAuth');
    if (!modal || modal.style.display === 'none') return;
    const activePanel = document.querySelector('.auth-panel[style*="flex"]');
    if (!activePanel) return;
    const id = activePanel.id;
    if (id === 'authSigninPanel') submitSignIn();
    if (id === 'authSignupPanel') submitSignUp();
});