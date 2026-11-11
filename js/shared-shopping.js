// ================================================================
// SHARED SHOPPING - the Shopping tab lives in its own document that
// you own and can share with other Google accounts:
//   shared/{your uid}    { owner, ownerName, members: [emails], json, rev }
//   members/{email}      { owner, ownerName }   (how an added person finds it)
// Finances stay in users/{uid}/years, readable by your account only.
//
// Changes save a moment after you make them and appear on the other
// person's screen straight away. If you both change something at the
// same time, both changes are kept (see mergeShopping).
// ================================================================

let shoppingState = null;          // the Shopping tab's data (getShopping() returns it)
const shopSync = {
    owner: null,                   // uid of the shared document's owner (null = not syncing)
    member: false,                 // true when you're viewing someone else's shopping
    ownerName: '',
    members: [],
    rev: 0,                        // the document's rev when we last read or wrote it
    baseJson: null,                // our data as last read or written
    timer: null,
    saving: false,
    unsubscribe: null
};
const SHOP_SAVE_DELAY_MS = 800;

const shoppingJson = () => JSON.stringify(getShopping());

// ---------------------------------------------------------------
// Merging: base = last synced, local = this screen, remote = theirs.
// Keeps both sides' changes; where both changed the same thing, this
// screen's change wins.
// ---------------------------------------------------------------
function mergeById(base = [], local = [], remote = []) {
    const b = new Map(base.map(x => [x.id, x]));
    const l = new Map(local.map(x => [x.id, x]));
    const out = remote.map(x => ({ ...x }));
    const at = new Map(out.map((x, i) => [x.id, i]));
    for (const [id, mine] of l) {
        const was = b.get(id);
        if (!was) {
            if (!at.has(id)) { out.push({ ...mine }); at.set(id, out.length - 1); }   // added here
        } else if (JSON.stringify(was) !== JSON.stringify(mine) && at.has(id)) {
            const target = out[at.get(id)];                                        // changed here
            for (const k of Object.keys(mine)) if (JSON.stringify(mine[k]) !== JSON.stringify(was[k])) target[k] = mine[k];
        }
    }
    const removedHere = new Set([...b.keys()].filter(id => !l.has(id)));
    return out.filter(x => !removedHere.has(x.id));
}

function mergeMap(base = {}, local = {}, remote = {}) {
    const out = { ...remote };
    for (const k of new Set([...Object.keys(base), ...Object.keys(local)])) {
        if (JSON.stringify(base[k]) === JSON.stringify(local[k])) continue;
        if (k in local) out[k] = local[k]; else delete out[k];
    }
    return out;
}

function mergeShopping(base, local, remote) {
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    return {
        ...remote,
        items: mergeById(base.items, local.items, remote.items),
        list: mergeById(base.list, local.list, remote.list),
        history: mergeById(base.history, local.history, remote.history),
        aisles: mergeMap(base.aisles, local.aisles, remote.aisles),
        plan: {
            v: 2,
            started: local.plan?.started !== base.plan?.started ? local.plan?.started : remote.plan?.started,
            meals: mergeMap(base.plan?.meals, local.plan?.meals, remote.plan?.meals),
            bases: mergeMap(base.plan?.bases, local.plan?.bases, remote.plan?.bases)
        },
        mealBook: same(base.mealBook, local.mealBook) ? remote.mealBook : local.mealBook
    };
}

// ---------------------------------------------------------------
// Starting and stopping
// ---------------------------------------------------------------

// Owner: legacyShopping is shopping data found in an older year file,
// used to start the shared document if there isn't one yet.
async function startSharedShopping(ownerUid, { member = false, ownerName = '', legacyShopping = null } = {}) {
    stopSharedShopping();
    let doc = await cloudStore.getShared(ownerUid);
    if (!doc) {
        if (member) throw new Error('the shared shopping list wasn\'t found');
        shoppingState = normalizeShopping(legacyShopping);
        const json = shoppingJson();
        const r = await cloudStore.putShared(ownerUid, json, 0, false, { ownerName });
        doc = { json, rev: r.rev, members: [] };
    }
    // Only start syncing once it's loaded
    Object.assign(shopSync, { owner: ownerUid, member, ownerName, failures: 0 });
    adoptRemoteShopping(doc);
    shopSync.unsubscribe = cloudStore.watchShared(ownerUid, onRemoteShopping);
}

function stopSharedShopping() {
    if (shopSync.unsubscribe) shopSync.unsubscribe();
    clearTimeout(shopSync.timer);
    Object.assign(shopSync, { owner: null, member: false, ownerName: '', members: [], rev: 0, baseJson: null, timer: null, saving: false, unsubscribe: null });
}

function adoptRemoteShopping(doc) {
    shoppingState = normalizeShopping(JSON.parse(doc.json));
    shopSync.rev = doc.rev;
    shopSync.baseJson = shoppingJson();
    shopSync.members = doc.members || [];
    if (typeof renderShopping === 'function') renderShopping();
}

// Someone (maybe us) saved: take their version, keeping our unsaved changes
function onRemoteShopping(doc) {
    if (!doc || !shopSync.owner) return;
    shopSync.members = doc.members || shopSync.members;
    if (doc.rev <= shopSync.rev) { if (typeof renderShopping === 'function') renderShopping(); return; }
    const local = shoppingJson();
    if (local === shopSync.baseJson) { adoptRemoteShopping(doc); return; }
    const merged = mergeShopping(JSON.parse(shopSync.baseJson), JSON.parse(local), JSON.parse(doc.json));
    shoppingState = normalizeShopping(merged);
    shopSync.rev = doc.rev;
    shopSync.baseJson = JSON.stringify(normalizeShopping(JSON.parse(doc.json)));
    if (typeof renderShopping === 'function') renderShopping();
    scheduleShoppingSave();
}

// ---------------------------------------------------------------
// Saving
// ---------------------------------------------------------------

function shoppingHasUnsaved() {
    return !!shopSync.owner && shoppingJson() !== shopSync.baseJson;
}

// Called after every render (from updateUI)
function refreshShoppingSync() {
    if (shoppingHasUnsaved()) scheduleShoppingSave();
}

function scheduleShoppingSave() {
    clearTimeout(shopSync.timer);
    shopSync.timer = setTimeout(saveSharedShopping, SHOP_SAVE_DELAY_MS);
}

async function saveSharedShopping() {
    if (!shopSync.owner || shopSync.saving || !shoppingHasUnsaved()) return;
    shopSync.saving = true;
    try {
        for (let attempt = 0; attempt < 4; attempt++) {
            const json = shoppingJson();
            const r = await cloudStore.putShared(shopSync.owner, json, shopSync.rev, false);
            if (!r.conflict) {
                shopSync.rev = Math.max(shopSync.rev, r.rev);
                shopSync.baseJson = json;
                break;
            }
            // Saved by someone else in the meantime: merge and try again
            const remote = await cloudStore.getShared(shopSync.owner);
            const merged = mergeShopping(JSON.parse(shopSync.baseJson), JSON.parse(json), JSON.parse(remote.json));
            shoppingState = normalizeShopping(merged);
            shopSync.rev = remote.rev;
            shopSync.baseJson = JSON.stringify(normalizeShopping(JSON.parse(remote.json)));
            if (typeof renderShopping === 'function') renderShopping();
        }
        shopSync.failures = 0;
    } catch (e) {
        console.warn('Shopping save failed:', e);
        shopSync.failures = (shopSync.failures || 0) + 1;
        setStatus('Shopping not saved - check your connection', 'error');
    } finally {
        shopSync.saving = false;
        // Retry, waiting longer after each failure (up to a minute)
        if (shopSync.owner && shoppingHasUnsaved()) {
            clearTimeout(shopSync.timer);
            shopSync.timer = setTimeout(saveSharedShopping, shopSync.failures ? Math.min(60000, 2000 * 2 ** shopSync.failures) : SHOP_SAVE_DELAY_MS);
        }
    }
}

// ---------------------------------------------------------------
// Sharing (owner only)
// ---------------------------------------------------------------

async function shareShoppingWith() {
    const input = document.getElementById('shareEmail');
    const email = (input?.value || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { alert('Enter their Google account email address'); return; }
    if (signedInUser && email === (signedInUser.email || '').toLowerCase()) { alert('That\'s your own account'); return; }
    try {
        shopSync.members = await cloudStore.setShoppingMembers([...new Set([...shopSync.members, email])], { add: email });
        renderShopping();
    } catch (e) {
        alert('Couldn\'t share: ' + e.message + '\n\nIf this keeps happening, check the database rules from SETUP.md are published.');
    }
}

async function stopSharingWith(email) {
    if (!confirm(`Stop sharing your shopping with ${email}?`)) return;
    try {
        shopSync.members = await cloudStore.setShoppingMembers(shopSync.members.filter(m => m !== email), { remove: email });
        renderShopping();
    } catch (e) {
        alert('Couldn\'t update sharing: ' + e.message);
    }
}

function renderSharingCard() {
    if (!shopSync.owner) return '';
    if (shopSync.member) {
        return `<div class="share-note">Shared by ${escapeHtml(shopSync.ownerName || 'the owner')} · changes save for both of you</div>`;
    }
    return `
        <div class="card share-card">
            <div class="card-header"><div class="card-title">Sharing</div></div>
            <div class="shop-aisle-hint">People you add sign in with Google and see only this Shopping tab. They can't see your finances.</div>
            ${shopSync.members.map(m => `
                <div class="shop-row"><span class="shop-name">${escapeHtml(m)}</span>
                    <button class="btn btn-outline btn-sm" onclick='stopSharingWith(${JSON.stringify(m).replace(/'/g, '&#39;')})'>Remove</button></div>`).join('')}
            <div class="form-row" style="margin-top:10px;">
                <input id="shareEmail" type="email" placeholder="Their Gmail address" onkeydown="if(event.key==='Enter')shareShoppingWith()" />
                <button class="btn btn-outline btn-sm" onclick="shareShoppingWith()">Share</button>
            </div>
        </div>`;
}
