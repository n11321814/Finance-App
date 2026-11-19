// ================================================================
// SHOPPING - fresh regulars, stockpile, meal planner (prep meals and
// fresh dinners) and the shopping list (split by store, aisle order).
//
// appData.shopping = {
//   items:    [{ id, name, kind: 'fresh'|'stockpile', section, store, regular }]
//   aisles:   { section: 'aisle number at your store' }
//   list:     [{ id, name, qty, store, section, done }]
//   plan:     { v: 2, meals: { mealId: serves to make }, bases: { baseId: batches to make } }
//   mealBook: { meals, bases, updated } - your Meals.xlsx (null = built-in)
// }
// ================================================================

// Items renamed when the recipe book was updated (Nov 2026)
const SHOP_RENAMED = { 'Shredded cheese': 'Grated cheese', 'Plain / Greek yoghurt': 'Greek yoghurt', 'Diced beef chuck': 'Diced beef',
    'Short pasta (rigatoni, penne)': 'Short pasta (penne, rigatoni)' };

function seedShoppingItems() {
    return DEFAULT_SHOP_ITEMS.map(i => ({ id: genId(), ...i }));
}

const slugify = name => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function normalizeMealBook(book) {
    if (!book || !Array.isArray(book.meals) || !Array.isArray(book.bases)) return null;
    const ing = i => [String(i[0]), i[1] === null || i[1] === undefined || i[1] === '' ? null : Number(i[1]), String(i[2] || '')];
    return {
        updated: book.updated || null,
        bases: book.bases.filter(b => b && b.name).map(b => ({
            name: String(b.name), per: Number(b.per) || 1, unit: String(b.unit || 'batch'), note: String(b.note || ''),
            ings: (b.ings || []).filter(i => i && i[0]).map(ing)
        })),
        meals: book.meals.filter(m => m && m.name).map(m => ({
            name: String(m.name), type: m.type === 'Dinner' ? 'Dinner' : 'Prep', cuisine: String(m.cuisine || 'Other'),
            serves: Number(m.serves) || 1, usually: Number(m.usually) || Number(m.serves) || 1,
            bases: (m.bases || []).filter(b => b && b[0]).map(b => [String(b[0]), Number(b[1]) || 0]),
            ings: (m.ings || []).filter(i => i && i[0]).map(ing)
        }))
    };
}

function normalizeShopping(s) {
    s = s || {};
    const items = Array.isArray(s.items) ? s.items : seedShoppingItems();
    const rename = n => SHOP_RENAMED[n] || n;
    const seen = new Set();
    const plan = s.plan?.v === 2 ? s.plan : { v: 2, meals: {}, bases: {} };   // older plans counted batches
    return {
        items: items.filter(i => i && i.name).map(i => ({
            id: i.id || genId(),
            name: rename(String(i.name)),
            kind: i.kind === 'stockpile' ? 'stockpile' : 'fresh',
            section: SHOP_SECTIONS.includes(i.section) ? i.section : 'Other',
            store: i.store || 'Woolworths',
            regular: i.regular !== false
        })).filter(i => !seen.has(i.name.toLowerCase()) && seen.add(i.name.toLowerCase())),
        aisles: { ...(s.aisles || {}) },
        list: (s.list || []).filter(e => e && e.name).map(e => ({
            id: e.id || genId(), name: rename(String(e.name)), qty: e.qty || '',
            store: e.store || 'Woolworths', section: SHOP_SECTIONS.includes(e.section) ? e.section : 'Other', done: !!e.done
        })),
        plan: { v: 2, meals: { ...(plan.meals || {}) }, bases: { ...(plan.bases || {}) } },
        mealBook: normalizeMealBook(s.mealBook)
    };
}

function getShopping() {
    if (!appData.shopping || !Array.isArray(appData.shopping.items)) appData.shopping = normalizeShopping(appData.shopping);
    return appData.shopping;
}

// Your uploaded meal list, or the built-in one; with ids for the planner
function getMealBook() {
    const book = getShopping().mealBook || normalizeMealBook(DEFAULT_MEAL_BOOK);
    book.meals.forEach(m => { m.id = m.id || slugify(m.name); });
    book.bases.forEach(b => { b.id = b.id || slugify(b.name); });
    return book;
}

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

// An item's details: your edited version if you have one, else the default
function shopItem(name) {
    const mine = getShopping().items.find(i => sameName(i.name, name));
    if (mine) return mine;
    const d = DEFAULT_SHOP_ITEMS.find(i => sameName(i.name, name));
    return d ? { ...d, regular: false } : { name, kind: 'fresh', section: 'Other', store: 'Woolworths', regular: false };
}

// All stores in use, Woolworths first
function shopStores() {
    const s = getShopping();
    const all = new Set(['Woolworths', ...SHOP_STORES, ...s.items.map(i => i.store), ...s.list.map(e => e.store)]);
    return [...all];
}

// Walk-through order: aisle numbers you've set come in number order,
// between the fresh sections at the front and dairy/freezer at the back
function sectionOrder(section) {
    const aisle = parseFloat(getShopping().aisles[section]);
    const front = ['Fruit & Veg', 'Bakery', 'Deli', 'Meat'];
    const back = ['Dairy & Eggs', 'Freezer', 'Liquor', 'Other'];
    if (front.includes(section) && isNaN(aisle)) return -10 + front.indexOf(section);
    if (back.includes(section) && isNaN(aisle)) return 900 + back.indexOf(section);
    if (!isNaN(aisle)) return aisle;
    return 500 + SHOP_SECTIONS.indexOf(section);
}

function sectionLabel(section) {
    const aisle = (getShopping().aisles[section] || '').toString().trim();
    return aisle ? `Aisle ${escapeHtml(aisle)} · ${escapeHtml(section)}` : escapeHtml(section);
}

// ================================================================
// QUANTITIES
// ================================================================

const UNIT_WORDS = {
    clove: ['clove', 'cloves'], can: ['can', 'cans'], jar: ['jar', 'jars'], slice: ['slice', 'slices'],
    stalk: ['stalk', 'stalks'], sprig: ['sprig', 'sprigs'], bunch: ['bunch', 'bunches'], leaf: ['leaf', 'leaves'],
    cube: ['cube', 'cubes'], cup: ['cup', 'cups'], tsp: ['tsp', 'tsp'], tbsp: ['tbsp', 'tbsp'], batch: ['batch', 'batches'],
    packet: ['packet', 'packets'], sheet: ['sheet', 'sheets'], sachet: ['sachet', 'sachets'], pinch: ['pinch', 'pinches']
};

// 1.5 -> "1½", 0.33 -> "⅓"
function niceNumber(n) {
    const whole = Math.floor(n + 1e-9);
    const frac = n - whole;
    const fracs = [[0, ''], [0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'], [1, '']];
    let best = fracs[0];
    for (const f of fracs) if (Math.abs(frac - f[0]) < Math.abs(frac - best[0])) best = f;
    const w = best[0] === 1 ? whole + 1 : whole;
    return (w ? String(w) : (best[1] ? '' : '0')) + best[1];
}

// Things you can only buy or use whole: scaled amounts round up
const WHOLE_UNITS = ['clove', 'sheet', 'slice', 'leaf', 'cube', 'sachet', 'can', 'jar', 'packet'];
const WHOLE_ITEMS = ['Eggs', 'Tortillas', 'Large flour tortillas', 'Pita breads', 'Burger buns', 'Corn cobs', "Bird's eye chillies",
    'Dried red chillies', 'Cardamom pods', 'Whole cloves', 'Star anise', 'Cinnamon sticks', 'Crumbed chicken schnitzels', 'Lebanese cucumber'];

// { unit: total } -> "1.6 kg + 2 cans". Spoons are combined (1 tbsp = 4 tsp, Australian).
// Pass the item name to round whole things (eggs, tortillas) up.
function formatQty(sums, hasSome, name = '') {
    const parts = [];
    const u = { ...sums };
    for (const unit of Object.keys(u)) {
        // Cans/jars/packets: round up unless it's a sensible part (½ can of tomatoes)
        if (WHOLE_UNITS.includes(unit) || (unit === '' && WHOLE_ITEMS.includes(name))) {
            const n = u[unit];
            u[unit] = ['can', 'jar', 'packet'].includes(unit) ? Math.ceil(n * 2 - 1e-9) / 2 : Math.ceil(n - 1e-9);
        }
    }
    if (u.tsp !== undefined || u.tbsp !== undefined) {
        const tsp = (u.tsp || 0) + (u.tbsp || 0) * 4;
        delete u.tsp; delete u.tbsp;
        parts.push(tsp >= 4 ? `${niceNumber(Math.round(tsp / 4 * 4) / 4)} tbsp` : `${niceNumber(tsp)} tsp`);
    }
    for (const [unit, n] of Object.entries(u)) {
        if (unit === 'g') parts.unshift(n >= 1000 ? `${+(n / 1000).toFixed(2)} kg` : `${Math.round(n)} g`);
        else if (unit === 'ml') parts.unshift(n >= 1000 ? `${+(n / 1000).toFixed(2)} L` : `${Math.round(n)} ml`);
        else if (unit === '') parts.push(niceNumber(n) + (u.g !== undefined || u.ml !== undefined ? ' whole' : ''));
        else {
            const w = UNIT_WORDS[unit] || [unit, unit];
            parts.push(`${niceNumber(n)} ${n > 1 ? w[1] : w[0]}`);
        }
    }
    if (!parts.length) return hasSome ? 'some' : '';
    return parts.join(' + ');
}

// What the week's plan needs: bases (needed vs making) and every ingredient,
// scaled to the serves you're making, plus any bases being made.
// plan.meals[id] = serves to make.
function mealPlanTotals(plan = getShopping().plan, book = getMealBook()) {
    const needed = {};
    const totals = new Map();
    const add = (name, qty, unit, times) => {
        if (!totals.has(name)) totals.set(name, { name, sums: {}, some: false, meals: new Set() });
        const t = totals.get(name);
        if (qty === null || qty === undefined) t.some = true;
        else t.sums[unit] = (t.sums[unit] || 0) + qty * times;
        return t;
    };
    for (const meal of book.meals) {
        const serves = Number(plan.meals[meal.id]) || 0;
        if (serves <= 0) continue;
        const scale = serves / (meal.serves || 1);
        for (const [base, amount] of meal.bases) {
            const id = slugify(base);
            needed[id] = (needed[id] || 0) + amount * scale;
        }
        for (const [name, qty, unit] of meal.ings) add(name, qty, unit, scale).meals.add(meal.name);
    }
    const bases = book.bases.map(b => {
        const batches = Number(plan.bases[b.id]) || 0;
        for (const [name, qty, unit] of b.ings) if (batches > 0) add(name, qty, unit, batches).meals.add(b.name);
        return { ...b, needed: needed[b.id] || 0, batches };
    });
    const items = [...totals.values()].map(t => {
        const info = shopItem(t.name);
        return { ...t, qty: formatQty(t.sums, t.some, t.name), kind: info.kind, store: info.store, section: info.section, meals: [...t.meals] };
    });
    items.sort((a, b) => sectionOrder(a.section) - sectionOrder(b.section) || a.name.localeCompare(b.name));
    return { bases, items };
}

// ================================================================
// SHOPPING LIST
// ================================================================

function listEntry(name) {
    return getShopping().list.find(e => !e.done && sameName(e.name, name));
}

function addToShoppingList(name, qty = '') {
    name = String(name || '').trim();
    if (!name) return;
    const s = getShopping();
    const existing = listEntry(name);
    if (existing) {
        if (qty && existing.qty && existing.qty !== qty) existing.qty = `${existing.qty} + ${qty}`;
        else if (qty) existing.qty = qty;
        return;
    }
    const info = shopItem(name);
    s.list.push({ id: genId(), name: info.name || name, qty, store: info.store, section: info.section, done: false });
}

function removeFromShoppingList(name) {
    const s = getShopping();
    s.list = s.list.filter(e => e.done || !sameName(e.name, name));
}

// Regulars, stockpile and meal ingredient ticks: on the list or not
function toggleShoppingItem(name, qty = '') {
    if (listEntry(name)) removeFromShoppingList(name);
    else addToShoppingList(name, qty);
    updateUI();
}

function addMealIngredients(kind) {
    mealPlanTotals().items.filter(i => i.kind === kind && !listEntry(i.name)).forEach(i => addToShoppingList(i.name, i.qty === 'some' ? '' : i.qty));
    updateUI();
}

function addManualShoppingItem() {
    const nameEl = document.getElementById('shopAddName');
    const qtyEl = document.getElementById('shopAddQty');
    const name = nameEl.value.trim();
    if (!name) return;
    addToShoppingList(name, qtyEl.value.trim());
    nameEl.value = '';
    qtyEl.value = '';
    updateUI();
    document.getElementById('shopAddName')?.focus();
}

function tickShoppingEntry(id) {
    const e = getShopping().list.find(x => x.id === id);
    if (e) e.done = !e.done;
    updateUI();
}

function deleteShoppingEntry(id) {
    const s = getShopping();
    s.list = s.list.filter(e => e.id !== id);
    updateUI();
}

function clearBoughtItems() {
    const s = getShopping();
    s.list = s.list.filter(e => !e.done || e.store !== shopListStore);
    updateUI();
}

function setShopEntryStore(id, store) {
    const e = getShopping().list.find(x => x.id === id);
    if (!e || !store) return;
    const chosen = pickStore(store);
    if (!chosen) { updateUI(); return; }
    e.store = chosen;
    updateUI();
}

// "Other…" in a store dropdown asks for a new store name
function pickStore(value) {
    if (value !== '__other') return value;
    const name = (prompt('Store name (e.g. Aldi, Indian grocer):') || '').trim();
    return name || null;
}

// ================================================================
// MEAL PLAN
// ================================================================

// Prep meals step by a whole batch (the recipe's serves); dinners by one serve
function changeMealServes(mealId, direction) {
    const plan = getShopping().plan;
    const meal = getMealBook().meals.find(m => m.id === mealId);
    if (!meal) return;
    const current = Number(plan.meals[mealId]) || 0;
    let n;
    if (!current && direction > 0) n = meal.type === 'Prep' ? meal.serves : meal.usually;
    else n = current + direction * (meal.type === 'Prep' ? meal.serves : 1);
    if (n > 0) plan.meals[mealId] = n; else delete plan.meals[mealId];
    updateUI();
}

function changeBaseBatches(baseId, delta) {
    const plan = getShopping().plan;
    const current = Number(plan.bases[baseId]) || 0;
    let n = Math.max(0, Math.round((current + delta) * 2) / 2);
    // First + makes enough for this week's meals (at least one batch)
    if (!current && delta > 0) {
        const base = mealPlanTotals(plan).bases.find(b => b.id === baseId);
        n = Math.max(1, Math.ceil((base?.needed || 0) / (base?.per || 1) * 2) / 2);
    }
    if (n) plan.bases[baseId] = n; else delete plan.bases[baseId];
    updateUI();
}

function clearMealPlan() {
    getShopping().plan = { v: 2, meals: {}, bases: {} };
    updateUI();
}

// ================================================================
// EDITING ITEMS (regulars and stockpile)
// ================================================================

let shopEditing = { fresh: false, stockpile: false };
let shopListStore = 'Woolworths';
let shopPlanOpen = true;
const shopOpenSections = new Set();   // "kind:section" folded open this session

function toggleShopEdit(kind) {
    shopEditing[kind] = !shopEditing[kind];
    renderShopping();
}

function updateShopItem(id, field, value) {
    const s = getShopping();
    const item = s.items.find(i => i.id === id);
    if (!item) return;
    if (field === 'store') {
        const chosen = pickStore(value);
        if (!chosen) { renderShopping(); return; }
        value = chosen;
    }
    if (field === 'name') {
        value = value.trim();
        if (!value) { renderShopping(); return; }
    }
    const oldName = item.name;
    item[field] = value;
    // Keep anything already on the list in step
    s.list.filter(e => sameName(e.name, oldName)).forEach(e => {
        if (field === 'name') e.name = value;
        if (field === 'store') e.store = value;
        if (field === 'section') e.section = value;
    });
    updateUI();
}

function removeShopItem(id) {
    const s = getShopping();
    const item = s.items.find(i => i.id === id);
    if (!item) return;
    // Meal ingredients stay known (for the planner) but leave this list
    const book = getMealBook();
    if ([...book.meals, ...book.bases].some(m => m.ings.some(i => sameName(i[0], item.name)))) item.regular = false;
    else s.items = s.items.filter(i => i.id !== id);
    updateUI();
}

function addShopItem(kind) {
    const input = document.getElementById(kind === 'fresh' ? 'shopNewFresh' : 'shopNewStock');
    const name = (input?.value || '').trim();
    if (!name) return;
    const s = getShopping();
    const existing = s.items.find(i => sameName(i.name, name));
    if (existing) { existing.regular = true; existing.kind = kind; }
    else s.items.push({
        id: genId(), name, kind,
        section: kind === 'fresh' ? 'Fruit & Veg' : 'Other',
        store: 'Woolworths', regular: true
    });
    updateUI();
    document.getElementById(kind === 'fresh' ? 'shopNewFresh' : 'shopNewStock')?.focus();
}

function setAisle(section, value) {
    const s = getShopping();
    const v = String(value || '').trim();
    if (v) s.aisles[section] = v; else delete s.aisles[section];
    updateUI();
}

function setShopListStore(store) {
    shopListStore = store;
    renderShopping();
}

function toggleShopSection(key) {
    if (shopOpenSections.has(key)) shopOpenSections.delete(key); else shopOpenSections.add(key);
    renderShopping();
}

function toggleShopPlan() {
    shopPlanOpen = !shopPlanOpen;
    renderShopping();
}

// ================================================================
// RENDER
// ================================================================

function storeOptions(current) {
    return shopStores().map(st => `<option value="${escapeHtml(st)}" ${st === current ? 'selected' : ''}>${escapeHtml(st)}</option>`).join('') +
        `<option value="__other">Other…</option>`;
}

function storeBadge(store) {
    if (store === 'Woolworths') return '';
    return `<span class="shop-store shop-store-${store === 'Amazon' ? 'amazon' : 'other'}">${escapeHtml(store)}</span>`;
}

const jsArg = str => escapeHtml(JSON.stringify(str));   // safe inside onclick="..."

function renderShopping() {
    const el = document.getElementById('shoppingContainer');
    if (!el) return;
    const s = getShopping();
    el.innerHTML = `
        <div class="grid-2 shop-grid">
            <div>${renderShopList(s)}</div>
            <div>${renderMealPlanner(s)}</div>
        </div>
        <div class="grid-2 shop-grid">
            <div>${renderShopRegulars(s, 'fresh')}</div>
            <div>${renderShopRegulars(s, 'stockpile')}</div>
        </div>`;
}

function renderShopList(s) {
    const stores = shopStores().filter(st => st === 'Woolworths' || s.list.some(e => e.store === st));
    if (!stores.includes(shopListStore)) shopListStore = 'Woolworths';
    const count = st => s.list.filter(e => e.store === st && !e.done).length;
    const entries = s.list.filter(e => e.store === shopListStore);
    const open = entries.filter(e => !e.done).sort((a, b) => sectionOrder(a.section) - sectionOrder(b.section) || a.name.localeCompare(b.name));
    const done = entries.filter(e => e.done);
    let lastSection = null;
    const rows = open.map(e => {
        const head = e.section !== lastSection ? `<div class="shop-section">${sectionLabel(e.section)}</div>` : '';
        lastSection = e.section;
        return head + `
            <div class="shop-row">
                <button class="shop-tick" onclick="tickShoppingEntry('${e.id}')" title="Got it"></button>
                <span class="shop-name">${escapeHtml(e.name)}</span>
                <span class="shop-qty">${escapeHtml(e.qty || '')}</span>
                <select class="shop-move" onchange="setShopEntryStore('${e.id}', this.value)" title="Buy somewhere else">
                    <option value="" selected>⇄</option>${shopStores().filter(st => st !== e.store).map(st => `<option value="${escapeHtml(st)}">Move to ${escapeHtml(st)}</option>`).join('')}<option value="__other">Other store…</option></select>
                <button class="list-icon-btn" onclick="deleteShoppingEntry('${e.id}')" title="Remove">×</button>
            </div>`;
    }).join('');
    const doneRows = done.map(e => `
            <div class="shop-row done">
                <button class="shop-tick" onclick="tickShoppingEntry('${e.id}')" title="Not got yet">✓</button>
                <span class="shop-name">${escapeHtml(e.name)}</span>
                <span class="shop-qty">${escapeHtml(e.qty || '')}</span>
            </div>`).join('');
    const aisleSections = [...new Set(s.list.filter(e => e.store === 'Woolworths').map(e => e.section).concat(SHOP_SECTIONS))];
    return `
        <div class="card">
            <div class="card-header">
                <div class="card-title">Shopping List</div>
                ${done.length ? `<button class="btn btn-outline btn-sm" onclick="clearBoughtItems()">Clear ticked (${done.length})</button>` : ''}
            </div>
            <div class="shop-stores">
                ${stores.map(st => `<button class="shop-store-tab ${st === shopListStore ? 'active' : ''}" onclick='setShopListStore(${JSON.stringify(st).replace(/'/g, '&#39;')})'>${escapeHtml(st)} <span>${count(st)}</span></button>`).join('')}
            </div>
            <div class="form-row" style="margin:10px 0 6px;">
                <input id="shopAddName" type="text" list="shopItemNames" placeholder="Add an item" onkeydown="if(event.key==='Enter')addManualShoppingItem()" />
                <input id="shopAddQty" type="text" placeholder="Qty" style="max-width:110px;" onkeydown="if(event.key==='Enter')addManualShoppingItem()" />
                <button class="btn btn-primary btn-sm" onclick="addManualShoppingItem()">+ Add</button>
            </div>
            <datalist id="shopItemNames">${s.items.map(i => `<option value="${escapeHtml(i.name)}">`).join('')}</datalist>
            ${open.length ? rows : `<div class="shop-empty">Nothing to buy at ${escapeHtml(shopListStore)}</div>`}
            ${done.length ? `<div class="shop-section">In the trolley</div>${doneRows}` : ''}
            <details class="shop-aisles">
                <summary>Aisles at your store</summary>
                <div class="shop-aisle-hint">Set the aisle number for each section and the list follows your walk through the store.</div>
                <div class="shop-aisle-grid">
                    ${SHOP_SECTIONS.filter(sec => aisleSections.includes(sec)).map(sec => `
                        <label>${escapeHtml(sec)}<input type="text" value="${escapeHtml(s.aisles[sec] || '')}" placeholder="–" onchange='setAisle(${JSON.stringify(sec).replace(/'/g, '&#39;')}, this.value)' /></label>`).join('')}
                </div>
            </details>
        </div>`;
}

let shopDinnersOpen = true;

function toggleShopDinners() {
    shopDinnersOpen = !shopDinnersOpen;
    renderShopping();
}

function renderMealPlanner(s) {
    const plan = s.plan;
    const book = getMealBook();
    const totals = mealPlanTotals(plan, book);
    const chip = m => {
        const n = Number(plan.meals[m.id]) || 0;
        if (!n) return `<button class="meal-chip" onclick="changeMealServes('${m.id}', 1)">${escapeHtml(m.name)}</button>`;
        const label = m.type === 'Prep'
            ? (n / m.serves !== 1 ? ` <b>×${niceNumber(n / m.serves)}</b>` : '')
            : ` <b>${n} serve${n === 1 ? '' : 's'}</b>`;
        return `<span class="meal-chip on ${m.type === 'Dinner' ? 'dinner' : ''}">
            <button onclick="changeMealServes('${m.id}', -1)" title="Less">−</button>
            ${escapeHtml(m.name)}${label}
            <button onclick="changeMealServes('${m.id}', 1)" title="More">+</button></span>`;
    };
    // One group of chips (prep or dinners), by cuisine; folded shows only what's chosen
    const group = (type, open, toggle, title) => {
        const meals = book.meals.filter(m => m.type === type);
        const chosen = meals.filter(m => plan.meals[m.id] > 0);
        const cuisines = [...new Set(meals.map(m => m.cuisine))];
        return `
            <div class="shop-section with-btn">${title}${chosen.length ? ` <span class="shop-fold-count">${chosen.length} chosen</span>` : ''}
                <button class="btn btn-outline btn-sm" onclick="${toggle}()">${open ? 'Hide' : 'Choose'}</button></div>
            ${open ? cuisines.map(c => `
                <div class="meal-cuisine">${escapeHtml(c)}</div>
                <div class="meal-chips">${meals.filter(m => m.cuisine === c).map(chip).join('')}</div>`).join('') : `
                <div class="meal-chips">${chosen.length ? chosen.map(chip).join('') : '<span class="shop-empty">None chosen</span>'}</div>`}`;
    };
    const baseUnit = (b, n) => b.unit === 'batch' ? (n === 1 ? 'batch' : 'batches') : b.unit === 'cup' ? (n === 1 ? 'cup' : 'cups') : b.unit;
    const bases = totals.bases.filter(b => b.needed > 0 || b.batches > 0).map(b => {
        const amount = b.unit === 'ml' ? Math.round(b.needed / 10) * 10 : Math.round(b.needed * 4) / 4;
        const needText = b.needed > 0
            ? `need ${b.unit === 'ml' ? amount : niceNumber(amount)} ${baseUnit(b, amount)}${b.unit !== 'batch' ? ` (${niceNumber(Math.max(0.25, Math.round(b.needed / b.per * 4) / 4))} batch)` : ''}`
            : 'making ahead';
        return `
            <div class="base-row">
                <div><div class="shop-name">${escapeHtml(b.name)}</div><div class="shop-qty">${needText}${b.note ? ` · ${escapeHtml(b.note)}` : ''}</div></div>
                <div class="base-make">
                    <span>${b.batches ? `Make ${niceNumber(b.batches)}` : 'From freezer'}</span>
                    <button class="list-icon-btn" onclick="changeBaseBatches('${b.id}', -0.5)" ${b.batches ? '' : 'disabled'}>−</button>
                    <button class="list-icon-btn" onclick="changeBaseBatches('${b.id}', 0.5)">+</button>
                </div>
            </div>`;
    }).join('');
    const otherBases = totals.bases.filter(b => !(b.needed > 0 || b.batches > 0));
    const ingRow = i => {
        const on = !!listEntry(i.name);
        return `
            <div class="shop-row ${on ? 'on-list' : ''}">
                <button class="shop-check ${on ? 'on' : ''}" onclick='toggleShoppingItem(${JSON.stringify(i.name).replace(/'/g, '&#39;')}, ${JSON.stringify(i.qty === 'some' ? '' : i.qty).replace(/'/g, '&#39;')})' title="${on ? 'On the list' : 'Add to list'}">${on ? '✓' : ''}</button>
                <span class="shop-name" title="${escapeHtml(i.meals.join(', '))}">${escapeHtml(i.name)}</span>
                <span class="shop-qty">${escapeHtml(i.qty)}</span>
                ${storeBadge(i.store)}
            </div>`;
    };
    const fresh = totals.items.filter(i => i.kind === 'fresh');
    const stock = totals.items.filter(i => i.kind === 'stockpile');
    const anything = Object.keys(plan.meals).length || Object.keys(plan.bases).length;
    const updated = s.mealBook?.updated ? `Your list, uploaded ${new Date(s.mealBook.updated).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Built-in list';
    return `
        <div class="card">
            <div class="card-header">
                <div class="card-title">Meals This Week</div>
                ${anything ? `<button class="btn btn-outline btn-sm" onclick="clearMealPlan()">New week</button>` : ''}
            </div>
            ${group('Prep', shopPlanOpen, 'toggleShopPlan', 'Meal prep')}
            ${group('Dinner', shopDinnersOpen, 'toggleShopDinners', 'Fresh dinners')}
            ${bases || otherBases.length ? `
                <div class="shop-section">Bases</div>
                ${bases}
                ${otherBases.length ? `<div class="base-ahead">Make ahead: ${otherBases.map(b => `<button class="meal-chip small" onclick="changeBaseBatches('${b.id}', 1)">+ ${escapeHtml(b.name)}</button>`).join('')}</div>` : ''}` : ''}
            ${fresh.length ? `
                <div class="shop-section with-btn">To buy (fresh) <button class="btn btn-outline btn-sm" onclick="addMealIngredients('fresh')">Add all</button></div>
                ${fresh.map(ingRow).join('')}` : ''}
            ${stock.length ? `
                <div class="shop-section with-btn">Check you have (stockpile) <button class="btn btn-outline btn-sm" onclick="addMealIngredients('stockpile')">Add all</button></div>
                ${stock.map(ingRow).join('')}` : ''}
            <div class="meal-file">
                <span>${updated} · ${book.meals.length} meals</span>
                <button class="btn btn-outline btn-sm" onclick="downloadMealsExcel()">Download Excel</button>
                <button class="btn btn-outline btn-sm" onclick="uploadMealsExcel()">Upload Excel</button>
            </div>
        </div>`;
}

function renderShopRegulars(s, kind) {
    const editing = shopEditing[kind];
    const items = s.items.filter(i => i.kind === kind && i.regular)
        .sort((a, b) => sectionOrder(a.section) - sectionOrder(b.section) || a.name.localeCompare(b.name));
    // Stockpile sections fold away (it's a long list); ones with something
    // already on the shopping list, and fresh regulars, stay open
    const sections = [...new Set(items.map(i => i.section))];
    const isOpen = sec => kind === 'fresh' || editing || shopOpenSections.has(kind + ':' + sec);
    const rowFor = i => {
        if (editing) return `
            <div class="shop-row editing">
                <input class="inline-edit shop-edit-name" type="text" value="${escapeHtml(i.name)}" onchange="updateShopItem('${i.id}', 'name', this.value)" />
                <select class="shop-mini-select" onchange="updateShopItem('${i.id}', 'section', this.value)">${SHOP_SECTIONS.map(sec => `<option ${sec === i.section ? 'selected' : ''}>${escapeHtml(sec)}</option>`).join('')}</select>
                <select class="shop-mini-select" onchange="updateShopItem('${i.id}', 'store', this.value)">${storeOptions(i.store)}</select>
                <button class="list-icon-btn" onclick="removeShopItem('${i.id}')" title="Remove from this list">×</button>
            </div>`;
        const on = !!listEntry(i.name);
        return `
            <div class="shop-row ${on ? 'on-list' : ''}">
                <button class="shop-check ${on ? 'on' : ''}" onclick='toggleShoppingItem(${JSON.stringify(i.name).replace(/'/g, '&#39;')})' title="${on ? 'On the list' : 'Need to buy'}">${on ? '✓' : ''}</button>
                <span class="shop-name">${escapeHtml(i.name)}</span>
                ${storeBadge(i.store)}
            </div>`;
    };
    const rows = sections.map(sec => {
        const inSec = items.filter(i => i.section === sec);
        const onList = inSec.filter(i => listEntry(i.name)).length;
        const open = isOpen(sec);
        const key = JSON.stringify(kind + ':' + sec).replace(/'/g, '&#39;');
        const head = kind === 'fresh' || editing
            ? `<div class="shop-section">${escapeHtml(sec)}</div>`
            : `<button class="shop-section shop-fold" onclick='toggleShopSection(${key})'>
                   <span>${open ? '▾' : '▸'} ${escapeHtml(sec)}</span>
                   <span class="shop-fold-count">${onList ? `${onList} on list · ` : ''}${inSec.length}</span></button>`;
        return `<div class="shop-block">${head}${open ? inSec.map(rowFor).join('') : ''}</div>`;
    }).join('');
    const title = kind === 'fresh' ? 'Fresh Regulars' : 'Stockpile';
    const hint = kind === 'fresh' ? 'Tick what you need to buy' : 'Open a section and tick anything running low';
    const inputId = kind === 'fresh' ? 'shopNewFresh' : 'shopNewStock';
    return `
        <div class="card">
            <div class="card-header">
                <div class="card-title">${title}</div>
                <button class="btn btn-outline btn-sm" onclick="toggleShopEdit('${kind}')">${editing ? 'Done' : 'Edit'}</button>
            </div>
            <div class="shop-aisle-hint">${editing ? 'Rename, move to a section, or change where to buy it' : hint}</div>
            <div class="shop-columns">${rows || '<div class="shop-empty">Nothing here yet</div>'}</div>
            <div class="form-row" style="margin-top:10px;">
                <input id="${inputId}" type="text" placeholder="Add ${kind === 'fresh' ? 'a regular' : 'a stockpile item'}" onkeydown="if(event.key==='Enter')addShopItem('${kind}')" />
                <button class="btn btn-outline btn-sm" onclick="addShopItem('${kind}')">+ Add</button>
            </div>
        </div>`;
}
