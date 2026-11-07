// ================================================================
// INCOME - Hours, rates, shifts, public holiday support
// ================================================================

// ================================================================
// HELPERS - Thursday week start
// ================================================================

function getWeekNumber(date) {
    const d = typeof date === 'string' ? parseLocalDate(date) : new Date(date);
    d.setHours(0, 0, 0, 0);
    const fyStart = new Date(FY_START.getFullYear(), 6, 1);
    const diffDays = Math.round((d - fyStart) / (1000 * 60 * 60 * 24));
    const weekNum = Math.floor(diffDays / 7) + 1;
    return weekNum > 0 ? weekNum : 1;
}

// Weeks run Thursday - Wednesday: step back to the most recent Thursday
// (or stay put if the date already is one).
function getWeekStartDate(date) {
    const d = typeof date === 'string' ? parseLocalDate(date) : new Date(date);
    d.setHours(0, 0, 0, 0);
    const daysSinceThursday = (d.getDay() - 4 + 7) % 7;
    d.setDate(d.getDate() - daysSinceThursday);
    return d;
}

function getThursdayThisWeek() {
    const today = new Date();
    return getWeekStartDate(today);
}

// ================================================================
// JOBS
// Names and colours live here; rates and projection settings travel
// with the data file (appData.rates / phRates / jobSettings).
// ================================================================

// fixedPay: a job's pay day is a fixed rule rather than a setting.
// Avanale and Cinema both pay weekly on the Wednesday that ends each
// Thursday-Wednesday week.
const WEDNESDAY_WEEKLY = { payFrequency: 'weekly', payLagDays: 0 };
const JOBS = [
    { id: 1, name: 'Avanale', btnClass: 'avanale', chipClass: 'chip-job1', fixedPay: WEDNESDAY_WEEKLY },
    { id: 2, name: 'Cinema', btnClass: 'cinema', chipClass: 'chip-job2', fixedPay: WEDNESDAY_WEEKLY },
    { id: 3, name: 'Theiss', btnClass: 'theiss', chipClass: 'chip-job3' }
];

function getJobSettings(jobId) {
    return appData.jobSettings?.['job' + jobId] || { startDate: '', endDate: '', expectedWeeklyHours: 0 };
}

// A week runs Thursday - Wednesday; the job counts for that week if any
// day of it falls between the job's start and end dates.
function isJobActiveInWeek(jobId, weekStart) {
    const { startDate, endDate } = getJobSettings(jobId);
    const thursday = typeof weekStart === 'string' ? parseLocalDate(weekStart) : weekStart;
    const wednesday = new Date(thursday.getFullYear(), thursday.getMonth(), thursday.getDate() + 6);
    if (startDate && wednesday < parseLocalDate(startDate)) return false;
    if (endDate && thursday > parseLocalDate(endDate)) return false;
    return true;
}

// ================================================================
// RATES (including public holiday rates)
// ================================================================

// Pay for a single shift, using the PH rate when the shift is flagged.
// Shared by income.js, stats.js and budgets.js.
function shiftPay(s) {
    const job = 'job' + s.job;
    return ((s.ph ? appData.phRates?.[job] : appData.rates?.[job]) || 0) * s.hours;
}

// Logged hours and pay for one job, averaged over the finished logged
// weeks in which that job was active. This week and later are left out,
// so a partly logged week doesn't drag down every future week's estimate.
function getJobAverages(jobId) {
    const thisWeek = toLocalISODate(getThursdayThisWeek());
    const weeks = (appData.income || []).filter(w => w.date < thisWeek && isJobActiveInWeek(jobId, w.date));
    let hours = 0, pay = 0;
    weeks.forEach(w => (w.shifts || []).forEach(sh => {
        if (sh.job === jobId) { hours += sh.hours; pay += shiftPay(sh); }
    }));
    const n = Math.max(1, weeks.length);
    return { weeklyHours: hours / n, weeklyPay: pay / n, weeksLogged: weeks.length };
}

// Expected pay for one job in a future week: the expected hours at the
// base rate when they're set, otherwise the job's logged weekly average.
function expectedWeeklyPay(jobId) {
    const expectedHours = getJobSettings(jobId).expectedWeeklyHours || 0;
    if (expectedHours > 0) return expectedHours * (appData.rates?.['job' + jobId] || 0);
    return getJobAverages(jobId).weeklyPay;
}

// Share of a week's working days (Mon-Fri) that fall inside the job's
// dates, so a job starting or ending mid-week only counts part of it.
function jobWeekFraction(jobId, weekStart) {
    const { startDate, endDate } = getJobSettings(jobId);
    if (!startDate && !endDate) return 1;
    const thursday = typeof weekStart === 'string' ? parseLocalDate(weekStart) : weekStart;
    const start = startDate ? parseLocalDate(startDate) : null;
    const end = endDate ? parseLocalDate(endDate) : null;
    let workdays = 0;
    for (let i = 0; i < 7; i++) {
        const d = new Date(thursday.getFullYear(), thursday.getMonth(), thursday.getDate() + i);
        if (d.getDay() === 0 || d.getDay() === 6) continue;
        if ((!start || d >= start) && (!end || d <= end)) workdays++;
    }
    return workdays / 5;
}

// Every week-start Thursday in the current financial year.
function getFYThursdays() {
    const thursdays = [];
    const d = new Date(FY_START);
    d.setDate(d.getDate() + (4 - d.getDay() + 7) % 7);
    for (; d <= FY_END; d.setDate(d.getDate() + 7)) thursdays.push(new Date(d));
    return thursdays;
}

// ================================================================
// PAYDAYS
// Income counts on the day it lands in your account, not the week it
// was worked. Each job has a pay cycle: weekly or fortnightly, paid a
// set number of days after the pay period ends (the Wednesday).
// ================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

function getPayDate(jobId, weekStart) {
    const job = JOBS.find(j => j.id === Number(jobId));
    const s = job && job.fixedPay ? job.fixedPay : getJobSettings(jobId);
    const thursday = typeof weekStart === 'string' ? parseLocalDate(weekStart) : weekStart;
    const lag = s.payLagDays === undefined || s.payLagDays === null ? 0 : s.payLagDays;
    const earliest = new Date(thursday.getFullYear(), thursday.getMonth(), thursday.getDate() + 6 + lag);
    // Fortnightly: the first payday in the cycle on or after `earliest`.
    // Without a known payday to anchor the cycle, fall back to weekly.
    if (s.payFrequency === 'fortnightly' && s.payAnchor) {
        const anchor = parseLocalDate(s.payAnchor);
        const fortnights = Math.ceil(Math.round((earliest - anchor) / DAY_MS) / 14);
        return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + fortnights * 14);
    }
    return earliest;
}

// One entry per job per week: logged shifts (actual: true) plus expected
// pay for each job in each week from this week onwards where that job has
// no shifts logged yet, through to the end of the FY. Logging one job's
// shift doesn't stop the other jobs being projected for that week. Past
// weeks with nothing logged for a job count as $0 for it.
function getPayEvents() {
    const events = [];
    const loggedJobWeeks = new Set();
    (appData.income || []).forEach(w => {
        const byJob = {};
        (w.shifts || []).forEach(sh => { byJob[sh.job] = (byJob[sh.job] || 0) + shiftPay(sh); });
        Object.entries(byJob).forEach(([job, amount]) => {
            loggedJobWeeks.add(`${w.date}|${job}`);
            events.push({ jobId: Number(job), weekStart: w.date, payDate: getPayDate(Number(job), w.date), amount, actual: true });
        });
    });

    const expected = {};
    JOBS.forEach(job => { expected[job.id] = expectedWeeklyPay(job.id); });
    const thisWeek = getThursdayThisWeek();
    getFYThursdays().forEach(thursday => {
        if (thursday < thisWeek) return;
        const weekKey = toLocalISODate(thursday);
        JOBS.forEach(job => {
            if (loggedJobWeeks.has(`${weekKey}|${job.id}`)) return;
            const amount = expected[job.id] * jobWeekFraction(job.id, thursday);
            if (amount > 0) {
                events.push({ jobId: job.id, weekStart: toLocalISODate(thursday), payDate: getPayDate(job.id, thursday), amount, actual: false });
            }
        });
    });
    return events;
}

function sumPaidInMonth(events, year, month) {
    return events
        .filter(e => e.payDate.getFullYear() === year && e.payDate.getMonth() === month)
        .reduce((s, e) => s + e.amount, 0);
}

// Gross income paid to you this FY: logged pay plus expected pay for the
// weeks still to come. Like the ATO, it counts pay in the year it lands,
// so late-June work paid in July belongs to next year.
function getFYIncomeProjection() {
    const fyEvents = getPayEvents().filter(e => e.payDate >= FY_START && e.payDate <= FY_END);
    const byJob = {};
    JOBS.forEach(job => { byJob[job.id] = 0; });
    let actualToDate = 0, projectedRemaining = 0;
    fyEvents.forEach(e => {
        byJob[e.jobId] = (byJob[e.jobId] || 0) + e.amount;
        if (e.actual) actualToDate += e.amount; else projectedRemaining += e.amount;
    });
    return { annual: actualToDate + projectedRemaining, actualToDate, projectedRemaining, byJob };
}

function renderRates() {
    const projection = getFYIncomeProjection();
    JOBS.forEach(job => {
        const key = 'job' + job.id;
        const avg = getJobAverages(job.id);
        const s = getJobSettings(job.id);
        document.getElementById('rateJob' + job.id).value = appData.rates?.[key] || 0;
        document.getElementById('phRateJob' + job.id).value = appData.phRates?.[key] || 0;
        document.getElementById(key + 'Hours').textContent = avg.weeklyHours.toFixed(1);
        document.getElementById(key + 'Projected').textContent = '$' + (projection.byJob[job.id] || 0).toFixed(0);
        if (job.fixedPay) {
            document.getElementById(key + 'PayNote').textContent = 'Paid weekly on the Wednesday that ends each week.';
            return;
        }
        document.getElementById(key + 'PayFrequency').value = s.payFrequency || 'weekly';
        document.getElementById(key + 'PayAnchor').value = s.payAnchor || '';
        document.getElementById(key + 'PayLag').value = s.payLagDays ?? 0;
        document.getElementById(key + 'PayNote').textContent = s.payFrequency === 'fortnightly' && !s.payAnchor
            ? 'Enter a recent payday so the fortnightly cycle lines up (treated as weekly until then).'
            : `This week is paid ${getPayDate(job.id, getThursdayThisWeek()).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}.`;
    });

    const theiss = getJobSettings(3);
    document.getElementById('job3Start').value = theiss.startDate || '';
    document.getElementById('job3End').value = theiss.endDate || '';
    document.getElementById('job3ExpectedHours').value = theiss.expectedWeeklyHours || 0;
    document.getElementById('job3EndNote').textContent = theiss.endDate
        ? ''
        : 'No end date set, so it is projected through to 30 June.';
}

function updateRates() {
    const num = id => parseFloat(document.getElementById(id).value) || 0;
    const val = id => document.getElementById(id).value || '';
    JOBS.forEach(job => {
        const key = 'job' + job.id;
        appData.rates[key] = num('rateJob' + job.id);
        appData.phRates[key] = num('phRateJob' + job.id);
        if (job.fixedPay) return;
        appData.jobSettings[key] = {
            ...getJobSettings(job.id),
            payFrequency: val(key + 'PayFrequency') || 'weekly',
            payAnchor: val(key + 'PayAnchor'),
            payLagDays: Math.max(0, Math.round(num(key + 'PayLag')))
        };
    });
    appData.jobSettings.job3 = {
        ...appData.jobSettings.job3,
        startDate: val('job3Start'),
        endDate: val('job3End'),
        expectedWeeklyHours: num('job3ExpectedHours')
    };
    updateUI();
}

// ================================================================
// ADD EMPTY WEEK
// ================================================================

// The week the Add Week picker suggests: this week if it isn't there yet,
// otherwise the latest gap since your first logged week (weeks before you
// started tracking don't count), otherwise next week.
function suggestWeekToAdd() {
    const have = new Set((appData.income || []).map(w => w.date));
    const thisWeek = getThursdayThisWeek();
    const firstLogged = [...have].sort()[0];
    const firstWeek = firstLogged ? parseLocalDate(firstLogged) : thisWeek;
    for (let d = new Date(thisWeek); d >= firstWeek; d.setDate(d.getDate() - 7)) {
        if (!have.has(toLocalISODate(d))) return toLocalISODate(d);
    }
    const next = new Date(thisWeek);
    next.setDate(next.getDate() + 7);
    while (have.has(toLocalISODate(next))) next.setDate(next.getDate() + 7);
    return toLocalISODate(next);
}

// Weeks are added for you: the current week, and from Monday the week
// starting that Thursday. Each date is only ever added once, so a week
// you delete stays deleted. Nothing is added outside this file's year.
function autoAddWeeks(today = new Date()) {
    if (today < FY_START || today > FY_END) return false;
    const thisWeek = getWeekStartDate(today);
    const due = [thisWeek];
    if (today.getDay() >= 1 && today.getDay() <= 3) {   // Monday to Wednesday
        const next = new Date(thisWeek);
        next.setDate(next.getDate() + 7);
        due.push(next);
    }
    // New lists rather than edits, so the built-in default data is never changed
    const done = [...(appData.incomeAutoAdded || [])];
    const weeks = [...(appData.income || [])];
    let added = false;
    due.filter(d => d <= FY_END).map(toLocalISODate).forEach(date => {
        if (done.includes(date)) return;
        done.push(date);
        if (weeks.some(w => w.date === date)) return;
        weeks.push({ week: getWeekNumber(date), date, shifts: [] });
        added = true;
    });
    // Only recent dates matter for "already added"
    const keepFrom = new Date(thisWeek);
    keepFrom.setDate(keepFrom.getDate() - 28);
    const recent = done.filter(d => d >= toLocalISODate(keepFrom));
    if (recent.join() !== (appData.incomeAutoAdded || []).join()) appData.incomeAutoAdded = recent;
    if (added) appData.income = weeks.sort((a, b) => a.date.localeCompare(b.date));
    return added;
}

// The week after the latest one in the list (or next week)
function addFutureWeek() {
    const latest = [...(appData.income || []).map(w => w.date), toLocalISODate(getThursdayThisWeek())].sort().pop();
    const next = parseLocalDate(latest);
    next.setDate(next.getDate() + 7);
    const date = toLocalISODate(next);
    appData.income.push({ week: getWeekNumber(date), date, shifts: [] });
    appData.income.sort((a, b) => a.date.localeCompare(b.date));
    updateUI();
}

// Adds the Thursday-Wednesday week containing the picked date
function addEmptyWeek() {
    const picked = document.getElementById('addWeekDate')?.value || suggestWeekToAdd();
    const date = toLocalISODate(getWeekStartDate(picked));
    const week = getWeekNumber(date);

    const existing = appData.income.find(i => i.date === date);
    if (existing) {
        alert(`The week starting ${parseLocalDate(date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })} is already there - click it in the list to add shifts.`);
        return;
    }

    appData.income.push({ week, date, shifts: [] });
    appData.income.sort((a, b) => a.date.localeCompare(b.date));
    updateUI();
}

// ================================================================
// WEEK OPERATIONS
// ================================================================

function deleteWeek(idx) {
    if (!confirm('Delete this entire week?')) return;
    appData.income.splice(idx, 1);
    updateUI();
}

function updateWeekDate(weekIdx, newDate) {
    const week = appData.income[weekIdx];
    if (!newDate) return;
    if (appData.income.some((w, i) => i !== weekIdx && w.date === newDate)
        && !confirm(`There's already a week starting ${newDate}. Both would be counted, doubling that week's pay. Use this date anyway?`)) {
        updateUI();
        return;
    }
    week.date = newDate;
    week.week = getWeekNumber(newDate);
    appData.income.sort((a, b) => a.date.localeCompare(b.date));
    updateUI();
}

function toggleWeekExpanded(weekIdx) {
    const content = document.getElementById('week-content-' + weekIdx);
    const toggleBtn = document.getElementById('week-toggle-' + weekIdx);
    if (!content) return;

    const isExpanded = content.style.display !== 'none';
    content.style.display = isExpanded ? 'none' : 'block';
    if (toggleBtn) {
        toggleBtn.textContent = isExpanded ? '▼' : '▲';
    }
}

// ================================================================
// SHIFT OPERATIONS (with public holiday flag)
// ================================================================

function addShiftToWeek(weekIdx, job) {
    const input = document.getElementById('shiftInput_' + weekIdx + '_' + job);
    const phCheck = document.getElementById('shiftPH_' + weekIdx + '_' + job);
    if (!input) return;
    const hours = parseFloat(input.value);
    if (!hours || hours <= 0) {
        input.style.borderColor = 'var(--red)';
        setTimeout(() => input.style.borderColor = '', 1500);
        return;
    }
    const week = appData.income[weekIdx];
    if (!week.shifts) week.shifts = [];
    const isPH = phCheck ? phCheck.checked : false;
    week.shifts.push({ job, hours, id: genId(), ph: isPH });
    input.value = '';
    if (phCheck) phCheck.checked = false;
    updateUI();
    const content = document.getElementById('week-content-' + weekIdx);
    if (content) content.style.display = 'block';
}

function updateWeekShift(weekIdx, shiftId, newHours) {
    const week = appData.income[weekIdx];
    const shift = week.shifts.find(s => s.id === shiftId);
    if (shift) {
        shift.hours = parseFloat(newHours) || 0;
        if (shift.hours === 0) {
            week.shifts = week.shifts.filter(s => s.id !== shiftId);
        }
        updateUI();
        const content = document.getElementById('week-content-' + weekIdx);
        if (content) content.style.display = 'block';
    }
}

function toggleShiftPH(weekIdx, shiftId, checked) {
    const week = appData.income[weekIdx];
    const shift = week.shifts.find(s => s.id === shiftId);
    if (shift) {
        shift.ph = checked;
        updateUI();
        const content = document.getElementById('week-content-' + weekIdx);
        if (content) content.style.display = 'block';
    }
}

function deleteWeekShift(weekIdx, shiftId) {
    const week = appData.income[weekIdx];
    week.shifts = week.shifts.filter(s => s.id !== shiftId);
    updateUI();
    const content = document.getElementById('week-content-' + weekIdx);
    if (content) content.style.display = 'block';
}

// ================================================================
// RENDER INCOME LIST - Expandable weeks with PH support
// ================================================================

// One shift chip: editable hours, PH toggle, delete.
function shiftChipHtml(s, weekIdx, si, jobClass) {
    const isPH = s.ph || false;
    return `
        <div class="shift-chip-wrap ${isPH ? 'ph-active' : ''}">
            <span class="shift-index">#${si + 1}</span>
            <input class="inline-edit hours-input-wide ${isPH ? 'ph' : jobClass}" type="number" step="0.25" min="0"
                   value="${s.hours}"
                   onchange="updateWeekShift(${weekIdx}, '${s.id}', this.value)" />
            <span class="shift-unit">h</span>
            <label class="ph-toggle ${isPH ? 'active' : ''}" title="Public holiday rate">
                <input type="checkbox" ${isPH ? 'checked' : ''}
                       onchange="toggleShiftPH(${weekIdx}, '${s.id}', this.checked)" />
                <span class="ph-label">PH</span>
            </label>
            <button class="shift-delete" onclick="deleteWeekShift(${weekIdx}, '${s.id}')">✕</button>
        </div>
    `;
}

// Input + PH checkbox + button for adding a shift to a job.
function shiftAddHtml(weekIdx, job) {
    return `
        <input type="number" id="shiftInput_${weekIdx}_${job.id}" placeholder="${job.name} hrs" step="0.25" min="0" />
        <label class="ph-toggle ph-toggle-add" title="Public holiday rate">
            <input type="checkbox" id="shiftPH_${weekIdx}_${job.id}" />
            <span class="ph-label">PH</span>
        </label>
        <button onclick="addShiftToWeek(${weekIdx}, ${job.id})" class="add-btn ${job.btnClass}">+ ${job.name}</button>
    `;
}

function renderIncome() {
    const list = document.getElementById('incomeList');
    // Suggest the next week worth adding (unless you're picking one right now)
    const picker = document.getElementById('addWeekDate');
    if (picker && document.activeElement !== picker) picker.value = suggestWeekToAdd();
    if (!appData.income || appData.income.length === 0) {
        list.innerHTML = `<div class="empty-state"><div class="icon">📋</div><div class="message">No weeks entered yet</div><div class="sub">Click "Add Week" to start tracking your hours</div></div>`;
        return;
    }

    const sorted = [...appData.income].sort((a, b) => b.date.localeCompare(a.date));

    list.innerHTML = sorted.map((w) => {
        const originalIdx = appData.income.indexOf(w);
        const shifts = w.shifts || [];
        const totalIncome = getTotalIncome([w]);
        const totalHours = shifts.reduce((s, sh) => s + sh.hours, 0);

        // Show a job in this week if it was active then, or if the week
        // already has shifts for it.
        const weekJobs = JOBS
            .map(job => {
                const jobShifts = shifts.filter(s => s.job === job.id);
                return { job, jobShifts, hours: jobShifts.reduce((s, sh) => s + sh.hours, 0) };
            })
            .filter(({ job, jobShifts }) => jobShifts.length > 0 || isJobActiveInWeek(job.id, w.date));

        const jobColHtml = ({ job, jobShifts, hours }) => {
            const phRate = appData.phRates?.['job' + job.id] || 0;
            const shiftsHtml = jobShifts.map((s, si) => shiftChipHtml(s, originalIdx, si, job.chipClass)).join('');
            return `
            <div class="shift-job-col">
                <div class="job-label">${job.name} <span class="job-sub">(Job ${job.id})</span></div>
                <div class="shift-chips-container">
                    ${shiftsHtml || '<span class="empty-shifts">No shifts added</span>'}
                </div>
                <div class="shift-total-row">
                    Total: <strong>${hours.toFixed(1)}h</strong>
                    <span class="ph-rate-note" style="color:var(--text-muted);">paid ${getPayDate(job.id, w.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    ${phRate > 0 ? `<span class="ph-rate-note">PH rate: $${phRate}/h</span>` : ''}
                </div>
            </div>
        `;
        };

        return `
            <div class="week-card">
                <div class="week-header" onclick="toggleWeekExpanded(${originalIdx})">
                    <div class="week-header-left">
                        <span class="week-title">Week ${w.week}</span>
                        <span class="week-date">${w.date}</span>
                        ${appData.income.filter(other => other.date === w.date).length > 1
                            ? '<span class="week-shift-count empty" title="Another week has the same start date, so both are counted. Move these shifts into one week and delete the other.">⚠ duplicate week</span>'
                            : ''}
                        ${parseLocalDate(w.date).getDay() !== 4
                            ? '<span class="week-shift-count empty" title="Weeks run Thursday - Wednesday. Older versions of Add Week saved the wrong date - expand to fix.">⚠ not a Thursday</span>'
                            : ''}
                        <span class="week-hours-pill">${totalHours.toFixed(1)}h total</span>
                        ${shifts.length > 0
                            ? `<span class="week-shift-count">${shifts.length} shifts</span>`
                            : '<span class="week-shift-count empty">empty</span>'}
                    </div>
                    <div class="week-header-right">
                        <span class="week-income-display">$${totalIncome.toFixed(2)}</span>
                        <span id="week-toggle-${originalIdx}" class="week-toggle-arrow">▼</span>
                        <button class="delete-btn" onclick="event.stopPropagation();deleteWeek(${originalIdx})" style="margin:0;">✕</button>
                    </div>
                </div>
                <div id="week-content-${originalIdx}" class="week-content" style="display:none;">
                    <div class="week-date-row">
                        <span>Week starting:</span>
                        <input class="inline-edit week-date-input" type="date" value="${w.date}"
                               onchange="updateWeekDate(${originalIdx}, this.value)" />
                    </div>
                    <div class="shift-job-grid">
                        ${weekJobs.map(jobColHtml).join('')}
                    </div>
                    <div class="shift-add-area">
                        <span class="shift-add-label">+ Add:</span>
                        ${weekJobs.map(({ job }) => shiftAddHtml(originalIdx, job)).join('')}
                    </div>
                    <div class="week-footer-row">
                        <span class="week-footer-hours">
                            Total hours: <strong class="white">${totalHours.toFixed(1)}h</strong>
                            ${weekJobs.map(({ job, hours }) => `
                                <span class="dot">·</span>
                                ${job.name}: <strong class="job${job.id}">${hours.toFixed(1)}h</strong>
                            `).join('')}
                        </span>
                        <span class="week-footer-income">$${totalIncome.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ================================================================
// INCOME SUMMARY
// ================================================================

function renderIncomeSummary() {
    const container = document.getElementById('incomeSummary');
    const weeks = getWeeksLogged();

    const totalHours = (appData.income || []).reduce((sum, w) => sum + (w.shifts || []).reduce((s, sh) => s + sh.hours, 0), 0);
    const totalIncome = getTotalIncome();
    const projection = getFYIncomeProjection();
    const avgHours = totalHours / weeks;
    const avgWeeklyIncome = totalIncome / weeks;

    container.innerHTML = `
        <div class="income-summary-item">
            <div class="label">Total Hours Worked</div>
            <div class="value">${totalHours.toFixed(1)}</div>
        </div>
        <div class="income-summary-item">
            <div class="label">Average Weekly Hours</div>
            <div class="value">${avgHours.toFixed(1)}</div>
        </div>
        <div class="income-summary-item">
            <div class="label">Average Weekly Income</div>
            <div class="value" style="color:var(--green);">$${avgWeeklyIncome.toFixed(0)}</div>
        </div>
        <div class="income-summary-item" style="grid-column: span 1;">
            <div class="label">Projected EOFY Income</div>
            <div class="value" style="color:var(--blue);font-size:22px;">$${projection.annual.toFixed(0)}</div>
            <div class="label" style="margin-top:4px;">$${projection.actualToDate.toFixed(0)} logged + $${projection.projectedRemaining.toFixed(0)} expected (by payday)</div>
        </div>
    `;
}