// ================================================================
// CALENDAR - Events with recurrence
// ================================================================

let calendarWeekOffset = 0;

function addEvent() {
    const title = document.getElementById('eventTitle').value.trim();
    const date = document.getElementById('eventDate').value;
    const startTime = document.getElementById('eventStart').value || '09:00';
    const endTime = document.getElementById('eventEnd').value || '10:00';
    const details = document.getElementById('eventDetails').value.trim();
    const recurrence = document.getElementById('eventRecurrence').value;
    const recurrenceEnd = document.getElementById('eventRecurrenceEnd').value || null;

    if (!title || !date) {
        setStatus('Enter a title and date', 'error');
        return;
    }
    if (endTime <= startTime) {
        setStatus('End time must be after start time', 'error');
        return;
    }

    appData.events = appData.events || [];
    appData.events.push({
        id: genId(),
        title, date, startTime, endTime, details, recurrence, recurrenceEnd
    });

    document.getElementById('eventTitle').value = '';
    document.getElementById('eventDetails').value = '';
    document.getElementById('eventRecurrenceEnd').value = '';
    document.getElementById('eventRecurrence').value = 'none';

    updateUI();
}

function deleteEvent(id) {
    appData.events = (appData.events || []).filter(e => e.id !== id);
    updateUI();
}

function deleteEventPrompt(id) {
    const title = (appData.events || []).find(e => e.id === id)?.title || 'this event';
    if (confirm(`Delete "${title}"? If this is a recurring event, this removes the whole series.`)) {
        deleteEvent(id);
    }
}

function calendarShiftWeek(delta) {
    calendarWeekOffset += delta;
    renderCalendar();
}

function calendarGoToday() {
    calendarWeekOffset = 0;
    renderCalendar();
}

function daysBetween(a, b) {
    const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((utcB - utcA) / 86400000);
}

function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

function eventOccursOn(event, day) {
    const origin = new Date(event.date + 'T00:00:00');
    if (isNaN(origin.getTime())) return false;
    if (day < new Date(origin.getFullYear(), origin.getMonth(), origin.getDate())) return false;
    if (event.recurrenceEnd) {
        const end = new Date(event.recurrenceEnd + 'T00:00:00');
        if (day > end) return false;
    }

    const diffDays = daysBetween(origin, day);

    switch (event.recurrence) {
        case 'weekly':
            return diffDays % 7 === 0;
        case 'fortnightly':
            return diffDays % 14 === 0;
        case 'monthly': {
            const targetDaysInMonth = daysInMonth(day.getFullYear(), day.getMonth());
            const expectedDate = Math.min(origin.getDate(), targetDaysInMonth);
            return day.getDate() === expectedDate;
        }
        case 'yearly':
            return day.getDate() === origin.getDate() && day.getMonth() === origin.getMonth();
        case 'none':
        default:
            return diffDays === 0;
    }
}

function getEventsForDay(day) {
    return (appData.events || []).filter(e => eventOccursOn(e, day));
}

function getWeekStart(offset) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dow = (today.getDay() + 6) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - dow + offset * 7);
    return monday;
}

const CAL_DAY_START_MIN = 7 * 60;
const CAL_DAY_END_MIN = 22 * 60;
const CAL_PX_PER_MIN = 0.9;
const CAL_MAX_LANES = 3;

function timeToMinutes(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function layoutDayEvents(items) {
    const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
    const laneEnds = [];
    const placed = sorted.map(item => {
        let lane = laneEnds.findIndex(end => end <= item.startMin);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(item.endMin); }
        else { laneEnds[lane] = item.endMin; }
        return { ...item, lane };
    });
    const totalLanes = laneEnds.length;

    if (totalLanes <= CAL_MAX_LANES) {
        return { visible: placed.map(p => ({ ...p, totalLanes })), overflowCount: 0, overflowItems: [] };
    }

    const visible = placed.filter(p => p.lane < CAL_MAX_LANES - 1).map(p => ({ ...p, totalLanes: CAL_MAX_LANES }));
    const hidden = placed.filter(p => p.lane >= CAL_MAX_LANES - 1);
    return { visible, overflowCount: hidden.length, overflowItems: hidden, totalLanes: CAL_MAX_LANES };
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const weekStart = getWeekStart(calendarWeekOffset);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return d;
    });

    const weekEnd = days[6];
    const fmtOpt = { day: 'numeric', month: 'short' };
    document.getElementById('calendarWeekLabel').textContent =
        calendarWeekOffset === 0
            ? `This Week · ${weekStart.toLocaleDateString('en-AU', fmtOpt)} - ${weekEnd.toLocaleDateString('en-AU', fmtOpt)}`
            : `${weekStart.toLocaleDateString('en-AU', fmtOpt)} - ${weekEnd.toLocaleDateString('en-AU', fmtOpt)}`;

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const totalMin = CAL_DAY_END_MIN - CAL_DAY_START_MIN;
    const gridHeight = totalMin * CAL_PX_PER_MIN;

    let headerCells = `<div class="calendar-header-cell"></div>`;
    days.forEach((d, i) => {
        const isToday = d.getTime() === today.getTime();
        headerCells += `
            <div class="calendar-header-cell ${isToday ? 'is-today' : ''}">
                ${dayNames[i]}
                <span class="daynum">${d.getDate()}</span>
            </div>`;
    });

    let timeAxis = `<div class="calendar-time-col" style="height:${gridHeight}px;">`;
    for (let m = CAL_DAY_START_MIN; m <= CAL_DAY_END_MIN; m += 60) {
        const top = (m - CAL_DAY_START_MIN) * CAL_PX_PER_MIN;
        const hour = Math.floor(m / 60);
        const label = hour === 12 ? '12pm' : hour > 12 ? `${hour - 12}pm` : `${hour}am`;
        timeAxis += `<span class="calendar-time-label" style="top:${top}px;">${label}</span>`;
    }
    timeAxis += `</div>`;

    let dayCols = '';
    days.forEach(day => {
        let hourLines = '';
        for (let m = CAL_DAY_START_MIN; m <= CAL_DAY_END_MIN; m += 30) {
            const top = (m - CAL_DAY_START_MIN) * CAL_PX_PER_MIN;
            hourLines += `<div class="calendar-hour-line ${m % 60 !== 0 ? 'half' : ''}" style="top:${top}px;"></div>`;
        }

        const dayEvents = getEventsForDay(day);
        const layoutItems = dayEvents.map(ev => {
            const startMin = Math.max(CAL_DAY_START_MIN, timeToMinutes(ev.startTime));
            const endMin = Math.min(CAL_DAY_END_MIN, timeToMinutes(ev.endTime));
            return { ev, startMin, endMin };
        }).filter(item => item.endMin > item.startMin);

        const { visible, overflowCount, overflowItems } = layoutDayEvents(layoutItems);

        let eventBlocks = '';
        visible.forEach(item => {
            const { ev, startMin, endMin, lane, totalLanes } = item;
            const top = (startMin - CAL_DAY_START_MIN) * CAL_PX_PER_MIN;
            const height = Math.max(18, (endMin - startMin) * CAL_PX_PER_MIN);
            const laneWidth = 100 / totalLanes;
            const left = lane * laneWidth;
            const isRecurring = ev.recurrence && ev.recurrence !== 'none';
            const showTime = height >= 28;
            const showDetails = ev.details && height >= (totalLanes === 1 ? 40 : 52);
            eventBlocks += `
                <div class="calendar-event ${isRecurring ? 'recurring' : ''}" 
                     style="top:${top}px;height:${height}px;left:calc(${left}% + 2px);width:calc(${laneWidth}% - 4px);" 
                     onclick="deleteEventPrompt('${escapeHtml(ev.id)}')" 
                     title="${escapeHtml(ev.title + (ev.details ? ' - ' + ev.details : ''))} (click to delete)">
                    <span class="ev-title">${escapeHtml(ev.title)}</span>
                    ${showTime ? `<span class="ev-time">${ev.startTime}-${ev.endTime}</span>` : ''}
                    ${showDetails ? `<span class="ev-details">${escapeHtml(ev.details)}</span>` : ''}
                </div>`;
        });

        if (overflowCount > 0) {
            const earliestStart = Math.min(...overflowItems.map(i => i.startMin));
            const top = (earliestStart - CAL_DAY_START_MIN) * CAL_PX_PER_MIN;
            const laneWidth = 100 / CAL_MAX_LANES;
            const left = (CAL_MAX_LANES - 1) * laneWidth;
            const titles = overflowItems.map(i => `${i.ev.title} (${i.ev.startTime}-${i.ev.endTime})`).join(', ');
            eventBlocks += `
                <div class="calendar-event overflow" 
                     style="top:${top}px;height:22px;left:calc(${left}% + 2px);width:calc(${laneWidth}% - 4px);" 
                     data-msg="${escapeHtml(overflowCount + ' more: ' + titles)}" onclick="alert(this.dataset.msg)" 
                     title="${escapeHtml(titles)}">
                    <span class="ev-title">+${overflowCount} more</span>
                </div>`;
        }

        dayCols += `<div class="calendar-day-col" style="height:${gridHeight}px;">${hourLines}${eventBlocks}</div>`;
    });

    grid.innerHTML = `
        <div class="calendar-grid">
            ${headerCells}
            ${timeAxis}
            ${dayCols}
        </div>
    `;
}

const RECURRENCE_LABELS = { none: '', weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly', yearly: 'Yearly' };

function renderEventList() {
    const container = document.getElementById('eventList');
    const events = appData.events || [];

    if (events.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="icon">🗓️</div><div class="message">No events yet</div><div class="sub">Add one above to start planning your week</div></div>`;
        return;
    }

    const sorted = [...events].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

    container.innerHTML = sorted.map(ev => `
        <div class="event-list-item">
            <div class="ev-main">
                <span class="ev-name">${escapeHtml(ev.title)}${RECURRENCE_LABELS[ev.recurrence] ? `<span class="recur-tag">${RECURRENCE_LABELS[ev.recurrence]}</span>` : ''}</span>
                <span class="ev-meta">${escapeHtml(`${ev.date} · ${ev.startTime}-${ev.endTime}${ev.details ? ' · ' + ev.details : ''}${ev.recurrenceEnd ? ' · until ' + ev.recurrenceEnd : ''}`)}</span>
            </div>
            <button class="delete-btn" onclick="deleteEventPrompt('${escapeHtml(ev.id)}')">✕</button>
        </div>
    `).join('');
}