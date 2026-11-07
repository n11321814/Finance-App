// ================================================================
// LISTS - To-do lists
// ================================================================

let editingListId = null;
let editingItemKey = null;

function addList() {
    const nameInput = document.getElementById('newListName');
    const name = nameInput.value.trim();
    if (!name) { setStatus('Enter a list name', 'error'); return; }
    appData.lists = appData.lists || [];
    appData.lists.push({ id: genId(), name, items: [] });
    nameInput.value = '';
    updateUI();
}

function deleteList(listId) {
    const name = (appData.lists || []).find(l => l.id === listId)?.name || 'this list';
    if (!confirm(`Delete the list "${name}" and all its items? This can't be undone.`)) return;
    appData.lists = (appData.lists || []).filter(l => l.id !== listId);
    updateUI();
}

// Drag and drop: puts a list before or after another one
function reorderList(listId, targetId, after) {
    const lists = appData.lists || [];
    const from = lists.findIndex(l => l.id === listId);
    if (from === -1 || listId === targetId || !lists.some(l => l.id === targetId)) return;
    const [list] = lists.splice(from, 1);
    const to = lists.findIndex(l => l.id === targetId) + (after ? 1 : 0);
    lists.splice(to, 0, list);
    updateUI();
}

function startRenameList(listId) {
    editingListId = listId;
    renderLists();
    setTimeout(() => {
        const el = document.getElementById('listNameInput-' + listId);
        if (el) { el.focus(); el.select(); }
    }, 0);
}

function commitRenameList(listId, value) {
    const trimmed = (value || '').trim();
    editingListId = null;
    if (!trimmed) { renderLists(); return; }
    const list = (appData.lists || []).find(l => l.id === listId);
    if (list) list.name = trimmed;
    updateUI();
}

function cancelRenameList() {
    editingListId = null;
    renderLists();
}

function addListItem(listId) {
    const input = document.getElementById('listItemInput-' + listId);
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    const list = (appData.lists || []).find(l => l.id === listId);
    if (!list) return;
    list.items.push({ id: genId(), text, done: false, starred: false });
    updateUI();
    setTimeout(() => {
        const el = document.getElementById('listItemInput-' + listId);
        if (el) el.focus();
    }, 0);
}

function toggleListItem(listId, itemId) {
    const list = (appData.lists || []).find(l => l.id === listId);
    if (!list) return;
    const item = list.items.find(i => i.id === itemId);
    if (!item) return;
    item.done = !item.done;
    updateUI();
}

// Starring puts an item at the top (it can be dragged anywhere after);
// unstarring leaves it where it is
function toggleStarItem(listId, itemId) {
    const list = (appData.lists || []).find(l => l.id === listId);
    if (!list) return;
    const idx = list.items.findIndex(i => i.id === itemId);
    if (idx === -1) return;
    const item = list.items[idx];
    item.starred = !item.starred;
    if (item.starred) list.items.unshift(...list.items.splice(idx, 1));
    updateUI();
}

function deleteListItem(listId, itemId) {
    const list = (appData.lists || []).find(l => l.id === listId);
    if (!list) return;
    list.items = list.items.filter(i => i.id !== itemId);
    updateUI();
}

// Drag and drop: puts an item before or after another one. Open items
// only, since done items are shown apart.
function canDropListItem(listId, itemId, targetId) {
    const list = (appData.lists || []).find(l => l.id === listId);
    if (!list || itemId === targetId) return false;
    const a = list.items.find(i => i.id === itemId), b = list.items.find(i => i.id === targetId);
    return !!a && !!b && !a.done && !b.done;
}

function reorderListItem(listId, itemId, targetId, after) {
    if (!canDropListItem(listId, itemId, targetId)) return;
    const list = appData.lists.find(l => l.id === listId);
    const [item] = list.items.splice(list.items.findIndex(i => i.id === itemId), 1);
    list.items.splice(list.items.findIndex(i => i.id === targetId) + (after ? 1 : 0), 0, item);
    updateUI();
}

// What is being dragged: { kind: 'item', listId, itemId } or { kind: 'list', listId }
let listDrag = null;

function clearDropMarks() {
    document.querySelectorAll('.drop-before, .drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after'));
}

// The drop target under the pointer, and which side of it
function listDropTarget(e) {
    if (!listDrag) return null;
    if (listDrag.kind === 'item') {
        const row = e.target.closest('.list-item-row[data-item]');
        if (!row || row.dataset.list !== listDrag.listId || !canDropListItem(listDrag.listId, listDrag.itemId, row.dataset.item)) return null;
        const r = row.getBoundingClientRect();
        return { el: row, id: row.dataset.item, after: e.clientY > r.top + r.height / 2 };
    }
    const card = e.target.closest('.list-card[data-list]');
    if (!card || card.dataset.list === listDrag.listId) return null;
    const r = card.getBoundingClientRect();
    return { el: card, id: card.dataset.list, after: e.clientX > r.left + r.width / 2 };
}

// Set up once: the container keeps its listeners when its contents re-render
function initListDragAndDrop(container) {
    if (container.dataset.dnd) return;
    container.dataset.dnd = '1';
    container.addEventListener('dragstart', e => {
        const row = e.target.closest('.list-item-row[draggable="true"]');
        const head = e.target.closest('.list-card-header[draggable="true"]');
        if (row) listDrag = { kind: 'item', listId: row.dataset.list, itemId: row.dataset.item };
        else if (head) listDrag = { kind: 'list', listId: head.dataset.list };
        else return;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', '');
        (row || head.closest('.list-card')).classList.add('dragging');
        if (head) e.dataTransfer.setDragImage(head.closest('.list-card'), 20, 20);
    });
    container.addEventListener('dragover', e => {
        const t = listDropTarget(e);
        clearDropMarks();
        if (!t) return;
        e.preventDefault();
        t.el.classList.add(t.after ? 'drop-after' : 'drop-before');
    });
    container.addEventListener('drop', e => {
        const t = listDropTarget(e);
        const drag = listDrag;
        clearDropMarks();
        listDrag = null;
        if (!t) return;
        e.preventDefault();
        if (drag.kind === 'item') reorderListItem(drag.listId, drag.itemId, t.id, t.after);
        else reorderList(drag.listId, t.id, t.after);
    });
    container.addEventListener('dragend', () => {
        listDrag = null;
        clearDropMarks();
        container.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    });
}

function startEditItem(listId, itemId) {
    editingItemKey = listId + ':' + itemId;
    renderLists();
    setTimeout(() => {
        const el = document.getElementById('itemTextInput-' + itemId);
        if (el) { el.focus(); el.select(); }
    }, 0);
}

function commitEditItem(listId, itemId, value) {
    const trimmed = (value || '').trim();
    editingItemKey = null;
    if (!trimmed) { renderLists(); return; }
    const list = (appData.lists || []).find(l => l.id === listId);
    if (list) {
        const item = list.items.find(i => i.id === itemId);
        if (item) item.text = trimmed;
    }
    updateUI();
}

function cancelEditItem() {
    editingItemKey = null;
    renderLists();
}

function clearDoneItems(listId) {
    const list = (appData.lists || []).find(l => l.id === listId);
    if (!list) return;
    list.items = list.items.filter(i => !i.done);
    updateUI();
}

// Which lists have their Done section open (just for this session)
const openDoneSections = new Set();
function toggleDoneSection(listId) {
    if (openDoneSections.has(listId)) openDoneSections.delete(listId); else openDoneSections.add(listId);
    renderLists();
}

// The same vibrant set as the top bar, one per list in turn
const LIST_ACCENT_COLORS = ['var(--c-blue)', 'var(--c-yellow)', 'var(--c-purple)', 'var(--c-cyan)', 'var(--c-orange)', 'var(--stat-disposable)'];

function renderLists() {
    const container = document.getElementById('listsContainer');
    if (container.addEventListener) initListDragAndDrop(container);
    const lists = appData.lists || [];
    const newListTile = `
        <div class="list-card list-new">
            <input type="text" id="newListName" placeholder="+ New list" onkeydown="if(event.key==='Enter') addList()">
            <button class="list-add-btn" onclick="addList()" title="Create list">Create</button>
        </div>`;

    // Open items can be dragged to reorder (not while being edited)
    const itemRow = (list, item) => {
        const isEditing = editingItemKey === (list.id + ':' + item.id);
        const drag = !item.done && !isEditing;
        return `
            <div class="list-item-row ${item.done ? 'done' : ''} ${item.starred ? 'starred' : ''}" data-list="${list.id}" data-item="${item.id}" ${drag ? 'draggable="true" title="Drag to reorder"' : ''}>
                <button class="list-check" onclick="toggleListItem('${list.id}','${item.id}')" title="${item.done ? 'Mark not done' : 'Mark done'}">${item.done ? '✓' : ''}</button>
                <button class="list-star" onclick="toggleStarItem('${list.id}','${item.id}')" title="${item.starred ? 'Unstar' : 'Star (move to top)'}">${item.starred ? '★' : ''}</button>
                ${isEditing ? `
                    <input type="text" id="itemTextInput-${item.id}" class="list-item-edit-input" value="${escapeHtml(item.text)}"
                           onkeydown="if(event.key==='Enter'){this.blur();}else if(event.key==='Escape'){this.dataset.cancelled='1';this.blur();}"
                           onblur="this.dataset.cancelled ? cancelEditItem() : commitEditItem('${list.id}','${item.id}', this.value)">
                ` : `
                    <span class="list-item-text" onclick="startEditItem('${list.id}','${item.id}')" title="Click to edit">${escapeHtml(item.text)}</span>
                `}
                <span class="list-item-tools">
                    <button class="list-icon-btn danger" onclick="deleteListItem('${list.id}','${item.id}')" title="Delete item">✕</button>
                </span>
            </div>`;
    };

    container.innerHTML = lists.map((list, idx) => {
        const open = list.items.filter(i => !i.done);
        const done = list.items.filter(i => i.done);
        const total = list.items.length;
        const pct = total > 0 ? Math.round((done.length / total) * 100) : 0;
        const accent = LIST_ACCENT_COLORS[idx % LIST_ACCENT_COLORS.length];
        const showDone = openDoneSections.has(list.id);

        return `
            <div class="list-card" data-list="${list.id}" style="--list-accent:${accent};">
                <div class="list-card-header" data-list="${list.id}" ${editingListId === list.id ? '' : 'draggable="true" title="Drag to move the list"'}>
                    ${editingListId === list.id ? `
                        <input type="text" id="listNameInput-${list.id}" class="list-name-edit-input" value="${escapeHtml(list.name)}"
                               onkeydown="if(event.key==='Enter'){this.blur();}else if(event.key==='Escape'){this.dataset.cancelled='1';this.blur();}"
                               onblur="this.dataset.cancelled ? cancelRenameList() : commitRenameList('${list.id}', this.value)">
                    ` : `
                        <span class="list-name" onclick="startRenameList('${list.id}')" title="Click to rename">${escapeHtml(list.name)}</span>
                    `}
                    <span class="list-count">${total === 0 ? 'empty' : open.length === 0 ? 'all done ✓' : `${open.length} left`}</span>
                    <div class="list-actions">
                        <button class="list-icon-btn danger" onclick="deleteList('${list.id}')" title="Delete list">✕</button>
                    </div>
                </div>
                <div class="list-progress-track"><div class="list-progress-fill" style="width:${pct}%;"></div></div>
                <div class="list-items">
                    ${open.map(item => itemRow(list, item)).join('')}
                    ${total === 0 ? '<div class="list-empty-items">Nothing here yet</div>' : ''}
                </div>
                <div class="list-add-row">
                    <span class="list-add-plus">+</span>
                    <input type="text" id="listItemInput-${list.id}" placeholder="Add an item" onkeydown="if(event.key==='Enter') addListItem('${list.id}')">
                </div>
                ${done.length ? `
                <div class="list-done-bar">
                    <button class="list-done-toggle" onclick="toggleDoneSection('${list.id}')">${showDone ? '▾' : '▸'} Done (${done.length})</button>
                    <button class="list-done-clear" onclick="clearDoneItems('${list.id}')" title="Remove the done items">Clear done</button>
                </div>
                ${showDone ? `<div class="list-items done-items">${done.map(item => itemRow(list, item)).join('')}</div>` : ''}` : ''}
            </div>
        `;
    }).join('') + newListTile;
}