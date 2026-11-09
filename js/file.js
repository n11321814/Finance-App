// ================================================================
// STORAGE - Your data in Firebase (Firestore), behind Google sign-in.
//
// Each financial year is one document:
//   users/{your uid}/years/{FY start year}  { json, rev, updatedAt, closedOn }
//   users/{your uid}                        { currentYear }
// Only your signed-in account can read or write these (see
// firestore.rules). "rev" counts saves, so a save never overwrites
// changes made on another device without asking.
// ================================================================

// The backend. Tests swap this for a fake with the same methods.
let cloudStore = null;
let signedInUser = null;           // { uid, email, name } once signed in
let currentYear = null;            // FY start year on screen
let lastKnownRev = 0;              // the year document's rev when we last read or wrote it

// Firestore allows 1 MiB per document; leave room for the other fields
const MAX_YEAR_DOC_CHARS = 1000000;

function isFirebaseConfigured() {
    return typeof FIREBASE_CONFIG === 'object' && FIREBASE_CONFIG.apiKey && !/PASTE/.test(FIREBASE_CONFIG.apiKey);
}

function makeFirestoreStore(uid) {
    const db = firebase.firestore();
    const userRef = db.collection('users').doc(uid);
    const yearRef = year => userRef.collection('years').doc(String(year));
    return {
        async getUser() {
            const snap = await userRef.get();
            return snap.exists ? snap.data() : null;
        },
        async setCurrentYear(year) {
            await userRef.set({ currentYear: year }, { merge: true });
        },
        async listYears() {
            const snap = await userRef.collection('years').get();
            return snap.docs.map(d => ({ year: Number(d.id), closedOn: d.data().closedOn || null }));
        },
        async getYear(year) {
            const snap = await yearRef(year).get();
            return snap.exists ? { json: snap.data().json, rev: snap.data().rev || 0 } : null;
        },
        async getYearRev(year) {
            const snap = await yearRef(year).get();
            return snap.exists ? (snap.data().rev || 0) : 0;
        },
        // Writes only if the stored rev is still expectRev (unless force)
        putYear(year, json, expectRev, force, meta = {}) {
            const ref = yearRef(year);
            return db.runTransaction(async tx => {
                const snap = await tx.get(ref);
                const rev = snap.exists ? (snap.data().rev || 0) : 0;
                if (!force && rev !== expectRev) return { conflict: true, rev };
                tx.set(ref, {
                    json, rev: rev + 1, closedOn: meta.closedOn || null,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                return { ok: true, rev: rev + 1 };
            });
        }
    };
}

// ================================================================
// SIGN IN / OUT
// ================================================================

function initCloud() {
    if (typeof FIREBASE_CONFIG !== 'object') {
        showSignIn('js/firebase-config.js didn\'t load. Check it\'s in the js folder.');
        return;
    }
    if (!isFirebaseConfigured()) {
        showSignIn('js/firebase-config.js still has the PASTE placeholders. If you\'ve just updated it, wait a few minutes and refresh.');
        return;
    }
    if (typeof firebase === 'undefined') {
        showSignIn('The Firebase files in js/vendor didn\'t load. Check that folder is uploaded.');
        return;
    }
    firebase.initializeApp(FIREBASE_CONFIG);
    firebase.auth().onAuthStateChanged(async user => {
        if (!user) {
            signedInUser = null;
            cloudStore = null;
            showSignIn();
            return;
        }
        signedInUser = { uid: user.uid, email: user.email, name: user.displayName };
        cloudStore = makeFirestoreStore(user.uid);
        hideSignIn();
        await openStartYear();
    });
}

async function signIn() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        await firebase.auth().signInWithPopup(provider);
    } catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
            return firebase.auth().signInWithRedirect(provider);
        }
        if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
            showSignIn('Sign-in failed: ' + (e.message || e.code));
        }
    }
}

async function signOut() {
    if (hasUnsavedChanges() && !(await saveData())) {
        if (!confirm('Your latest changes aren\'t saved. Sign out anyway and lose them?')) return;
    }
    markClean();
    await firebase.auth().signOut();
    appData = normalizeAppData(DEFAULT_DATA);
    markCleanAfterRender = true;
    updateUI();
}

function showSignIn(message) {
    const screen = document.getElementById('signinScreen');
    if (!screen) return;
    screen.style.display = 'flex';
    const msg = document.getElementById('signinMessage');
    if (msg) msg.textContent = message || '';
    const btn = document.getElementById('signinBtn');
    if (btn) btn.style.display = isFirebaseConfigured() && typeof firebase !== 'undefined' ? '' : 'none';
}

function hideSignIn() {
    const screen = document.getElementById('signinScreen');
    if (screen) screen.style.display = 'none';
    const who = document.getElementById('signedInAs');
    if (who && signedInUser) who.textContent = signedInUser.email || signedInUser.name || '';
}

// ================================================================
// OPEN A YEAR
// ================================================================

// After sign-in: the year you were last working in, or this FY
async function openStartYear() {
    setStatus('Loading…', '');
    try {
        const user = await cloudStore.getUser();
        const year = user?.currentYear ?? getCurrentFinancialYear().start.getFullYear();
        const found = await openYear(year);
        if (!found) setStatus('No data yet - Import your file, or just start entering', '');
    } catch (e) {
        console.error('Load failed:', e);
        setStatus('Couldn\'t load your data: ' + e.message, 'error');
    }
}

// Shows one financial year. Returns false if it has no saved data yet.
async function openYear(year) {
    const doc = await cloudStore.getYear(year);
    appData = normalizeAppData(doc ? JSON.parse(doc.json) : { ...DEFAULT_DATA, financialYear: year });
    currentYear = year;
    lastKnownRev = doc ? doc.rev : 0;
    markCleanAfterRender = true;
    updateUI();
    await renderYearPicker();
    if (doc) setStatus('Loaded', '');
    return !!doc;
}

// The year dropdown: every saved year, plus the one on screen
async function renderYearPicker() {
    const select = document.getElementById('yearPicker');
    if (!select || !cloudStore) return;
    let years = [];
    try { years = await cloudStore.listYears(); } catch (e) { console.warn('Could not list years:', e); }
    if (!years.some(y => y.year === currentYear)) years.push({ year: currentYear, closedOn: null });
    years.sort((a, b) => b.year - a.year);
    const label = y => `${y.year}–${String(y.year + 1).slice(-2)}${y.closedOn ? ' (archived)' : ''}`;
    select.innerHTML = years.map(y => `<option value="${y.year}" ${y.year === currentYear ? 'selected' : ''}>${label(y)}</option>`).join('');
}

async function switchYear(value) {
    const year = Number(value);
    if (!cloudStore || year === currentYear) return;
    if (hasUnsavedChanges() && !(await saveData()) &&
        !confirm('Your latest changes aren\'t saved. Switch year anyway and lose them?')) {
        await renderYearPicker();
        return;
    }
    try {
        await openYear(year);
    } catch (e) {
        setStatus('Couldn\'t open that year: ' + e.message, 'error');
        await renderYearPicker();
    }
}

// Re-reads this year, discarding edits not yet saved
async function forceReloadData() {
    if (!cloudStore) { setStatus('Sign in first', 'error'); return false; }
    if (hasUnsavedChanges() && !confirm('You have unsaved changes. Reload and lose them?')) return false;
    try {
        await openYear(currentYear);
        setStatus('Reloaded', '');
        return true;
    } catch (e) {
        setStatus('Reload failed: ' + e.message, 'error');
        return false;
    }
}

// ================================================================
// SAVE
// ================================================================

// 'saved', or 'conflict' if another device saved this year since we
// last read it (nothing is written then, unless force)
async function writeCurrentYear(force = false) {
    const json = serializeAppData();
    const compact = JSON.stringify(appData);
    if (compact.length > MAX_YEAR_DOC_CHARS) throw new Error('this year\'s data is too large to store (over 1 MB)');
    const r = await cloudStore.putYear(currentYear, compact, lastKnownRev, force, { closedOn: appData.yearClosedOn || null });
    if (r.conflict) return 'conflict';
    lastKnownRev = r.rev;
    markClean(json);
    return 'saved';
}

// Returns true once the data is safely saved, false if not
async function saveData() {
    if (!cloudStore) { setStatus('Sign in to save', 'error'); return false; }
    try {
        let result = await writeCurrentYear();
        if (result === 'conflict') {
            if (!confirm('This year was changed on another device since you opened it.\n\nSave anyway and replace those changes with what\'s on this screen? (Cancel, then Reload, to see the other version.)')) {
                setStatus('Not saved - changed on another device', 'error');
                return false;
            }
            result = await writeCurrentYear(true);
        }
        setStatus('Saved', '');
        return true;
    } catch (e) {
        console.error('Save failed:', e);
        setStatus('Save failed: ' + e.message, 'error');
        return false;
    }
}

// ================================================================
// UNSAVED CHANGES & AUTOSAVE
// "Unsaved" means what's on screen differs from what was last loaded
// or saved. Changes are saved automatically a few seconds after you
// stop editing - unless another device saved this year in the
// meantime, in which case nothing is overwritten.
// ================================================================

const AUTOSAVE_DELAY_MS = 4000;
let lastSavedJson = null;          // appData as last loaded or saved
let lastSeenJson = null;           // appData at the previous check
let markCleanAfterRender = false;  // set by loads; the next render counts as saved
let autosaveTimer = null;
let autosaveRunning = false;

function serializeAppData() {
    return JSON.stringify(appData, null, 2);
}

function hasUnsavedChanges() {
    return lastSavedJson !== null && serializeAppData() !== lastSavedJson;
}

function markClean(json = serializeAppData()) {
    lastSavedJson = json;
    lastSeenJson = json;
    clearTimeout(autosaveTimer);
    updateUnsavedBadge(false);
}

function updateUnsavedBadge(dirty) {
    const badge = document.getElementById('unsavedBadge');
    if (badge) badge.style.display = dirty ? '' : 'none';
}

// Called after every render (see updateUI) and on a timer, so edits that
// don't re-render the whole page are noticed too.
function refreshUnsavedState() {
    if (markCleanAfterRender) {
        markCleanAfterRender = false;
        markClean();
        return;
    }
    if (lastSavedJson === null) { markClean(); return; }
    const json = serializeAppData();
    const dirty = json !== lastSavedJson;
    updateUnsavedBadge(dirty);
    // Restart the autosave countdown only when something actually changed
    if (dirty && json !== lastSeenJson) scheduleAutosave();
    lastSeenJson = json;
}

function scheduleAutosave() {
    if (!cloudStore) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(autosave, AUTOSAVE_DELAY_MS);
}

async function autosave() {
    if (autosaveRunning || !cloudStore || !hasUnsavedChanges()) return;
    autosaveRunning = true;
    try {
        if (await writeCurrentYear() === 'conflict') {
            setStatus('Not autosaved - changed on another device. Reload, or Save to overwrite', 'error');
            return;
        }
        setStatus('Autosaved ' + new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }), '');
    } catch (e) {
        console.warn('Autosave failed:', e);
        setStatus('Autosave failed - press Save', 'error');
    } finally {
        autosaveRunning = false;
    }
}

// When you come back to the tab: pick up saves made on another device.
// If you have unsaved edits here, nothing is replaced; you're told instead.
let remoteCheckRunning = false;
async function checkForRemoteChanges() {
    if (!cloudStore || currentYear === null || remoteCheckRunning || autosaveRunning) return;
    remoteCheckRunning = true;
    try {
        const rev = await cloudStore.getYearRev(currentYear);
        if (rev === lastKnownRev) return;
        if (hasUnsavedChanges()) {
            setStatus('Changed on another device. Reload, or Save to overwrite', 'error');
            return;
        }
        await openYear(currentYear);
        setStatus('Updated from another device', '');
    } catch (e) {
        console.warn('Change check failed:', e);
    } finally {
        remoteCheckRunning = false;
    }
}

function warnBeforeLeaving(e) {
    if (!hasUnsavedChanges()) return;
    e.preventDefault();
    e.returnValue = '';
}

// ================================================================
// IMPORT & BACKUP
// ================================================================

// Pick one or more backups (e.g. this year and archived years): Excel
// backups from the Backup button, or older JSON data files.
function importFiles() {
    if (!cloudStore) { setStatus('Sign in first', 'error'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.json,application/json';
    input.multiple = true;
    input.onchange = async () => {
        try {
            const texts = await readBackupFiles([...input.files]);
            if (texts) await importDataTexts(texts);
        } catch (e) {
            alert(e.message);
        }
    };
    input.click();
}

// Files -> [{ name, text }] ready for importDataTexts, or null if cancelled
async function readBackupFiles(files) {
    const texts = [];
    const edited = [];
    for (const f of files) {
        if (/\.xlsx$/i.test(f.name)) {
            let result;
            try {
                result = await readBackupWorkbook(await loadExcelJS(), await f.arrayBuffer());
            } catch (e) {
                throw new Error(`Couldn't import "${f.name}": ${e.message}.`);
            }
            if (result.warnings.length) edited.push(`${f.name} (${result.warnings.join(' and ')})`);
            texts.push({ name: f.name, text: result.text });
        } else {
            texts.push({ name: f.name, text: await f.text() });
        }
    }
    if (edited.length && !confirm(`Changes made in Excel to ${edited.join(', ')} won't be imported. Import restores the data as it was when the backup was made.\n\nImport anyway?`)) return null;
    return texts;
}

// texts: [{ name, text }]. Each file becomes the year it belongs to.
async function importDataTexts(texts) {
    const years = [];
    for (const { name, text } of texts) {
        try {
            years.push({ name, data: normalizeAppData(JSON.parse(text)) });
        } catch (e) {
            alert(`"${name}" isn't a valid data file. Nothing was imported.`);
            return false;
        }
    }
    if (!years.length) return false;
    const label = y => `${y}–${String(y + 1).slice(-2)}`;
    const existing = new Set((await cloudStore.listYears()).map(y => y.year));
    const clashes = years.filter(y => existing.has(y.data.financialYear));
    if (clashes.length && !confirm(`Replace what's saved for ${clashes.map(y => label(y.data.financialYear)).join(', ')} with the imported file${clashes.length > 1 ? 's' : ''}?`)) return false;
    if (hasUnsavedChanges() && !(await saveData()) &&
        !confirm('Your latest changes aren\'t saved. Import anyway and lose them?')) return false;

    try {
        for (const { data } of years) {
            const compact = JSON.stringify(data);
            if (compact.length > MAX_YEAR_DOC_CHARS) throw new Error(`${label(data.financialYear)} is too large to store (over 1 MB)`);
            await cloudStore.putYear(data.financialYear, compact, 0, true, { closedOn: data.yearClosedOn || null });
        }
        // Work in the latest year from now on
        const user = await cloudStore.getUser();
        const latest = Math.max(user?.currentYear ?? 0, ...years.map(y => y.data.financialYear));
        await cloudStore.setCurrentYear(latest);
        await openYear(latest);
        setStatus(`Imported ${years.length} file${years.length > 1 ? 's' : ''}`, '');
        return true;
    } catch (e) {
        console.error('Import failed:', e);
        setStatus('Import failed: ' + e.message, 'error');
        return false;
    }
}

// Backup: the year on screen as an Excel file (see backup-excel.js)
function downloadBackup() {
    return downloadBackupExcel();
}

// The year on screen as a JSON file (the older backup format)
function downloadBackupJson() {
    const blob = new Blob([serializeAppData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getDefaultFileName();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus('Backup downloaded', '');
}

// ================================================================
// NEW FINANCIAL YEAR - archive this year, start the next
// ================================================================

async function startNewFinancialYear() {
    if (!cloudStore) { setStatus('Sign in first', 'error'); return; }
    const oldYear = appData.financialYear;
    const newYear = oldYear + 1;
    const label = y => `${y}–${String(y + 1).slice(-2)}`;
    const stillRunning = new Date() <= FY_END;
    if ((await cloudStore.listYears()).some(y => y.year === newYear)) {
        alert(`${label(newYear)} has already been started. Pick it from the year list.`);
        return;
    }
    const message = [
        `Start ${label(newYear)}?`,
        '',
        `1. Your ${label(oldYear)} data is saved and marked as archived. You can still open it from the year list.`,
        '2. A new year is started.',
        '',
        'Carried over: categories, budgets, pay rates and pay cycles, loan, assets and liabilities, tax brackets, rate tracker, calendar, lists and renovation items.',
        'Starting fresh: expenses and the home office log. Income starts fresh too, except late-June work that is paid in July.',
        stillRunning ? `\nNote: ${label(oldYear)} doesn't end until 30 June ${oldYear + 1}.` : ''
    ].join('\n');
    if (!confirm(message)) return;

    // 1. Save and archive the old year. Stop if that fails.
    appData.yearClosedOn = toLocalISODate();
    if (!(await saveData())) {
        delete appData.yearClosedOn;
        alert(`Couldn't save ${label(oldYear)}, so the new year wasn't started. Nothing has changed.`);
        return;
    }

    // 2. Build and save the new year
    appData = normalizeAppData(buildNewYearData(appData, newYear));
    currentYear = newYear;
    lastKnownRev = 0;
    updateUI();
    const saved = await saveData();
    if (saved) await cloudStore.setCurrentYear(newYear);
    else setStatus(`${label(newYear)} not saved yet - press Save`, 'error');
    await renderYearPicker();
    alert([
        `${label(newYear)} started.${saved ? '' : ' Press Save to keep it.'}`,
        '',
        'Worth updating now:',
        '- Tax tab: check the brackets on ato.gov.au (the 15% rate is legislated to drop to 14% from 1 July 2027).',
        '- Home tab: current loan balance and offset.',
        '- Net Worth: asset values.'
    ].join('\n'));
}

// ================================================================
// STATUS
// ================================================================

function setStatus(text, type = '') {
    const el = document.getElementById('fileStatus');
    el.textContent = '● ' + text;
    el.className = 'header-status ' + (type || '');
}
