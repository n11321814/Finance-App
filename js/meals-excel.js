// ================================================================
// MEALS EXCEL - your meal list as a spreadsheet (Meals.xlsx).
// Sheets: Meals, Ingredients, Bases, Items (+ a hidden Lists sheet
// for the dropdowns). Upload replaces the meal list saved in your
// account; Download gives you the current version to edit.
// The Excel library (ExcelJS) only loads when you use these buttons.
// ================================================================

let excelJsPromise = null;
function loadExcelJS() {
    if (typeof ExcelJS !== 'undefined') return Promise.resolve(ExcelJS);
    if (!excelJsPromise) excelJsPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'js/vendor/exceljs.min.js';
        s.onload = () => resolve(window.ExcelJS);
        s.onerror = () => { excelJsPromise = null; reject(new Error('Couldn\'t load the Excel library')); };
        document.head.appendChild(s);
    });
    return excelJsPromise;
}

const MEALS_HEAD = ['Meal', 'Type', 'Cuisine', 'Recipe serves', 'Usually make', 'Base', 'Base amount', 'Base 2', 'Base 2 amount', 'Makes (snacks)'];
const INGS_HEAD = ['Meal or base', 'Ingredient', 'Qty', 'Unit'];
const BASES_HEAD = ['Base', 'One batch makes', 'Unit', 'Note'];
const ITEMS_HEAD = ['Item', 'Fresh or stockpile', 'Section', 'Store', 'On my list'];

const HOW_TO = [
    'How to use this file',
    '',
    'Meals: one row per meal. Type is Prep (batch cook and freeze), Dinner (cooked fresh) or Snack. For snacks, Recipe serves is how many pieces a batch makes (e.g. 12) and Makes describes it (e.g. 12 muffins).',
    'Recipe serves is how many serves the ingredient amounts make. Usually make is how many serves the app starts with when you pick a dinner.',
    'Base and Base amount: a base from the Bases sheet and how much of it the full recipe uses, in that base\'s unit (ml, cup or batch).',
    '',
    'Ingredients: one row per ingredient. Meal or base must match a name on Meals or Bases. Amounts are for the full recipe.',
    'Ingredient should match a name on the Items sheet (pick from the dropdown). New names are added as fresh items.',
    'Leave Qty blank for "to taste" or "to serve". Qty can be 1.5, 1 1/2 or 1½.',
    'Units: g, kg, ml, L, tsp, tbsp, cup, can, jar, packet, bunch, clove, slice, stalk, sprig, leaf, cube, sheet, sachet, or blank for a count (2 onions).',
    '',
    'Bases: one batch makes how much, in which unit. Their ingredients go on the Ingredients sheet under the base name.',
    '',
    'Items: whether each item is fresh or stockpile, its supermarket section, where you buy it, and whether it shows on your Fresh Regulars or Stockpile list.',
    '',
    'When you are done, use Upload Excel on the Shopping tab. Download Excel first if you have changed items in the app since.'
];

// Builds the workbook (also used to make the starting Meals.xlsx)
function buildMealsWorkbook(Excel, book, items) {
    const wb = new Excel.Workbook();
    wb.creator = 'Finance Tracker';
    const head = (ws, cols, widths) => {
        ws.columns = cols.map((h, i) => ({ header: h, key: 'c' + i, width: widths[i] }));
        const row = ws.getRow(1);
        row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        row.height = 20;
        ws.views = [{ state: 'frozen', ySplit: 1 }];
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    };
    const list = (ws, range, formula, strict) => ws.dataValidations.add(range, {
        type: 'list', allowBlank: true, formulae: [formula],
        showErrorMessage: true, errorStyle: strict ? 'stop' : 'warning',
        errorTitle: 'Not in the list', error: strict ? 'Pick one from the list.' : 'Not in the list. Keep it anyway?'
    });
    const shade = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    // Sets each cell (more robust than addRow(array))
    const put = (ws, vals) => {
        const row = ws.getRow(ws.rowCount + 1);
        vals.forEach((v, i) => { row.getCell(i + 1).value = v; });
        row.commit();
        return row;
    };

    const how = wb.addWorksheet('How to use');
    how.getColumn(1).width = 120;
    HOW_TO.forEach((t, i) => { const c = how.getCell(i + 1, 1); c.value = t; c.alignment = { wrapText: true }; if (i === 0) c.font = { bold: true, size: 14 }; });

    const meals = wb.addWorksheet('Meals');
    head(meals, MEALS_HEAD, [40, 10, 14, 14, 14, 28, 13, 28, 13, 20]);
    book.meals.forEach(m => put(meals, [m.name, m.type, m.cuisine, m.serves, m.usually,
        m.bases[0]?.[0] || '', m.bases[0]?.[1] ?? '', m.bases[1]?.[0] || '', m.bases[1]?.[1] ?? '', m.makes || '']));
    list(meals, 'B2:B500', 'Lists!$D$2:$D$4', true);
    list(meals, 'F2:F500', 'Bases!$A$2:$A$100', false);
    list(meals, 'H2:H500', 'Bases!$A$2:$A$100', false);

    const ings = wb.addWorksheet('Ingredients');
    head(ings, INGS_HEAD, [40, 34, 9, 10]);
    let band = false;
    [...book.meals, ...book.bases].forEach(m => {
        band = !band;
        m.ings.forEach(([name, qty, unit]) => {
            const row = put(ings, [m.name, name, qty === null ? '' : qty, unit]);
            if (band) row.fill = shade;
        });
    });
    list(ings, 'B2:B3000', 'Items!$A$2:$A$1000', false);
    list(ings, 'D2:D3000', 'Lists!$A$2:$A$30', false);

    const bases = wb.addWorksheet('Bases');
    head(bases, BASES_HEAD, [32, 16, 10, 50]);
    book.bases.forEach(b => put(bases, [b.name, b.per, b.unit, b.note]));
    list(bases, 'C2:C100', '"ml,cup,batch"', false);

    const its = wb.addWorksheet('Items');
    head(its, ITEMS_HEAD, [34, 18, 24, 14, 12]);
    [...items].sort((a, b) => a.kind.localeCompare(b.kind) || SHOP_SECTIONS.indexOf(a.section) - SHOP_SECTIONS.indexOf(b.section) || a.name.localeCompare(b.name))
        .forEach(i => put(its, [i.name, i.kind === 'stockpile' ? 'Stockpile' : 'Fresh', i.section, i.store, i.regular ? 'Yes' : 'No']));
    list(its, 'B2:B1000', '"Fresh,Stockpile"', true);
    list(its, 'C2:C1000', 'Lists!$B$2:$B$40', true);
    list(its, 'D2:D1000', 'Lists!$C$2:$C$20', false);
    list(its, 'E2:E1000', '"Yes,No"', true);

    const lists = wb.addWorksheet('Lists', { state: 'hidden' });
    const stores = [...new Set([...SHOP_STORES, ...items.map(i => i.store)])];
    const cols = [['Units', ...SHOP_UNITS.filter(Boolean), 'kg', 'L'], ['Sections', ...SHOP_SECTIONS], ['Stores', ...stores], ['Types', 'Prep', 'Dinner', 'Snack']];
    cols.forEach((col, c) => col.forEach((v, r) => { lists.getCell(r + 1, c + 1).value = v; }));
    return wb;
}

// Cell value as plain text (handles rich text, formulas and hyperlinks)
function cellText(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
        if (v.richText) return v.richText.map(t => t.text).join('');
        if ('result' in v) return cellText(v.result);
        if (v.text !== undefined) return String(v.text);
        if (v instanceof Date) return v.toISOString();
    }
    return String(v).trim();
}

// "1 1/2", "1½", "1.5", "0,5" -> 1.5; blank -> null; anything else -> NaN
function parseQty(v) {
    if (typeof v === 'number') return v;
    const s = cellText(v).replace(',', '.');
    if (!s) return null;
    const fr = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
    let total = 0, ok = false;
    for (const part of s.split(/\s+/)) {
        const m = part.match(/^(\d+(?:\.\d+)?)?([½¼¾⅓⅔⅛])?$/);
        const f = part.match(/^(\d+)\/(\d+)$/);
        if (f) { total += Number(f[1]) / Number(f[2]); ok = true; }
        else if (m && (m[1] || m[2])) { total += (m[1] ? Number(m[1]) : 0) + (m[2] ? fr[m[2]] : 0); ok = true; }
        else return NaN;
    }
    return ok ? total : NaN;
}

const UNIT_ALIASES = { cups: 'cup', cans: 'can', tins: 'can', tin: 'can', jars: 'jar', packets: 'packet', pack: 'packet', packs: 'packet',
    bunches: 'bunch', cloves: 'clove', slices: 'slice', stalks: 'stalk', sprigs: 'sprig', leaves: 'leaf', cubes: 'cube', sheets: 'sheet',
    sachets: 'sachet', batches: 'batch', teaspoon: 'tsp', teaspoons: 'tsp', tablespoon: 'tbsp', tablespoons: 'tbsp', grams: 'g',
    gram: 'g', millilitres: 'ml', ml: 'ml', whole: '', each: '', x: '' };

// Reads a Meals.xlsx. Returns { book, items, problems } (problems are warnings, not failures)
async function readMealsWorkbook(Excel, buffer) {
    const wb = new Excel.Workbook();
    await wb.xlsx.load(buffer);
    const sheet = name => wb.worksheets.find(w => w.name.trim().toLowerCase() === name.toLowerCase());
    const rows = (ws, n) => {
        const out = [];
        if (!ws) return out;
        ws.eachRow((row, r) => {
            if (r === 1) return;
            const vals = [];
            for (let c = 1; c <= n; c++) vals.push(row.getCell(c).value);
            if (vals.some(v => cellText(v) !== '')) out.push({ r, vals });
        });
        return out;
    };
    const problems = [];
    for (const name of ['Meals', 'Ingredients', 'Bases']) if (!sheet(name)) throw new Error(`There's no "${name}" sheet. Start from Download Excel.`);

    const bases = rows(sheet('Bases'), 4).map(({ r, vals }) => {
        const unit = cellText(vals[2]).toLowerCase();
        const u = unit === 'cups' ? 'cup' : unit === 'batches' ? 'batch' : unit;
        if (!['ml', 'cup', 'batch'].includes(u)) problems.push(`Bases row ${r}: unit "${unit}" should be ml, cup or batch`);
        return { name: cellText(vals[0]), per: parseQty(vals[1]) || 1, unit: ['ml', 'cup', 'batch'].includes(u) ? u : 'batch', note: cellText(vals[3]), ings: [] };
    }).filter(b => b.name);
    const meals = rows(sheet('Meals'), 10).map(({ r, vals }) => {
        const t = cellText(vals[1]).toLowerCase();
        const type = t.startsWith('d') ? 'Dinner' : t.startsWith('s') ? 'Snack' : 'Prep';
        const serves = parseQty(vals[3]);
        if (!(serves > 0)) problems.push(`Meals row ${r} (${cellText(vals[0])}): Recipe serves is missing, using 1`);
        const usually = parseQty(vals[4]);
        const mealBases = [[vals[5], vals[6]], [vals[7], vals[8]]].filter(([n]) => cellText(n)).map(([n, a]) => {
            const name = cellText(n);
            const amount = parseQty(a);
            if (!bases.some(b => sameName(b.name, name))) problems.push(`Meals row ${r}: base "${name}" isn't on the Bases sheet`);
            if (!(amount > 0)) problems.push(`Meals row ${r}: no amount for base "${name}"`);
            return [bases.find(b => sameName(b.name, name))?.name || name, amount > 0 ? amount : 0];
        });
        return { name: cellText(vals[0]), type, cuisine: cellText(vals[2]) || 'Other', serves: serves > 0 ? serves : 1,
            usually: usually > 0 ? usually : (serves > 0 ? serves : 1), bases: mealBases, ings: [], makes: cellText(vals[9]) };
    }).filter(m => m.name);
    const names = new Set();
    meals.forEach(m => { if (names.has(m.name.toLowerCase())) problems.push(`"${m.name}" is on the Meals sheet twice`); names.add(m.name.toLowerCase()); });

    const itemRows = rows(sheet('Items'), 5).map(({ vals }) => ({
        name: cellText(vals[0]),
        kind: cellText(vals[1]).toLowerCase().startsWith('s') ? 'stockpile' : 'fresh',
        section: SHOP_SECTIONS.find(sec => sameName(sec, cellText(vals[2]))) || 'Other',
        store: cellText(vals[3]) || 'Woolworths',
        regular: !cellText(vals[4]).toLowerCase().startsWith('n')
    })).filter(i => i.name);
    const known = new Set(itemRows.map(i => i.name.toLowerCase()));

    rows(sheet('Ingredients'), 4).forEach(({ r, vals }) => {
        const owner = cellText(vals[0]);
        const target = meals.find(m => sameName(m.name, owner)) || bases.find(b => sameName(b.name, owner));
        if (!target) { problems.push(`Ingredients row ${r}: "${owner}" isn't a meal or base`); return; }
        const item = cellText(vals[1]);
        if (!item) return;
        let qty = parseQty(vals[2]);
        let unit = cellText(vals[3]).toLowerCase();
        unit = unit in UNIT_ALIASES ? UNIT_ALIASES[unit] : unit;
        if (Number.isNaN(qty)) { problems.push(`Ingredients row ${r}: couldn't read the amount "${cellText(vals[2])}" for ${item}`); qty = null; }
        if (unit === 'kg') { unit = 'g'; if (qty !== null) qty *= 1000; }
        if (unit === 'l') { unit = 'ml'; if (qty !== null) qty *= 1000; }
        if (!SHOP_UNITS.includes(unit)) problems.push(`Ingredients row ${r}: unit "${cellText(vals[3])}" isn't one the app knows (kept as is)`);
        if (!known.has(item.toLowerCase()) && !getShopping().items.some(i => sameName(i.name, item))) {
            problems.push(`New item "${item}" added as fresh (Woolworths). Set it on the Items sheet or in the app.`);
            known.add(item.toLowerCase());
        }
        target.ings.push([item, qty, unit]);
    });
    meals.filter(m => !m.ings.length && !m.bases.length).forEach(m => problems.push(`"${m.name}" has no ingredients`));
    return { book: { meals, bases }, items: itemRows, problems };
}

function uploadMealsExcel() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx';
    input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        try {
            const Excel = await loadExcelJS();
            const result = await readMealsWorkbook(Excel, await file.arrayBuffer());
            applyMealsUpload(result, true);
        } catch (e) {
            console.error('Meals upload failed:', e);
            alert('Couldn\'t read that file: ' + e.message);
        }
    };
    input.click();
}

// Saves an uploaded meal list (asks first when ask is true)
function applyMealsUpload({ book, items, problems }, ask) {
    const { meals, bases } = book;
    const summary = `${meals.filter(m => m.type === 'Prep').length} prep meals, ${meals.filter(m => m.type === 'Dinner').length} dinners and ${bases.length} bases`;
    const notes = problems.length ? `\n\nWorth checking:\n- ${problems.slice(0, 12).join('\n- ')}${problems.length > 12 ? `\n- and ${problems.length - 12} more` : ''}` : '';
    if (ask && !confirm(`Replace your meal list with ${summary}?${notes}`)) return false;
    const s = getShopping();
    s.mealBook = normalizeMealBook({ ...book, updated: new Date().toISOString() });
    // Items: settings from the sheet; ingredients not listed are added as fresh
    for (const it of items) {
        const mine = s.items.find(i => sameName(i.name, it.name));
        if (mine) Object.assign(mine, { kind: it.kind, section: it.section, store: it.store, regular: it.regular });
        else s.items.push({ id: genId(), ...it });
    }
    for (const m of [...meals, ...bases]) for (const [name] of m.ings) {
        if (!s.items.some(i => sameName(i.name, name))) s.items.push({ id: genId(), name, kind: 'fresh', section: 'Other', store: 'Woolworths', regular: false });
    }
    // Drop planned meals and bases that no longer exist
    const ids = new Set(s.mealBook.meals.map(m => slugify(m.name)));
    const baseIds = new Set(s.mealBook.bases.map(b => slugify(b.name)));
    Object.keys(s.plan.meals).forEach(id => { if (!ids.has(id)) delete s.plan.meals[id]; });
    Object.keys(s.plan.bases).forEach(id => { if (!baseIds.has(id)) delete s.plan.bases[id]; });
    updateUI();
    if (typeof setStatus === 'function') setStatus(`Meal list updated: ${summary}`, '');
    return true;
}

async function downloadMealsExcel() {
    try {
        const Excel = await loadExcelJS();
        const wb = buildMealsWorkbook(Excel, getMealBook(), getShopping().items);
        saveWorkbook(await wb.xlsx.writeBuffer(), 'Meals.xlsx');
    } catch (e) {
        console.error('Meals download failed:', e);
        alert('Couldn\'t make the Excel file: ' + e.message);
    }
}

function saveWorkbook(buffer, fileName) {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

if (typeof module !== 'undefined') module.exports = { buildMealsWorkbook, readMealsWorkbook };
