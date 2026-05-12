// 請在此填入您的 Google Apps Script 部署後的 Web App URL
const API_URL = 'https://script.google.com/macros/s/AKfycbxu6DPIsLjtokHSUfW6b-QHCbLGQJRs6FBo1ov5VdBol3xOGga3aY17Piw79vicO8XL/exec';

let currentYear = new Date().getFullYear();
let currentData = {
    annualLeaveDays: 0,
    holidays: [],
    overtimes: [],
    records: []
};

let editingRecordId = null;
let sortConfig = { key: 'date', direction: 'desc' };

// DOM Elements
const currentYearDisplay = document.getElementById('currentYearDisplay');
const prevYearBtn = document.getElementById('prevYear');
const nextYearBtn = document.getElementById('nextYear');
const addLeaveBtn = document.getElementById('addLeaveBtn');
const settingsBtn = document.getElementById('settingsBtn');
const reportBtn = document.getElementById('reportBtn');

const addLeaveModal = document.getElementById('addLeaveModal');
const settingsModal = document.getElementById('settingsModal');
const reportModal = document.getElementById('reportModal');
const closeBtns = document.querySelectorAll('.close-btn');
const cancelBtns = document.querySelectorAll('.cancel-btn');

const addLeaveForm = document.getElementById('addLeaveForm');
const settingsForm = document.getElementById('settingsForm');

const totalDaysEl = document.getElementById('annualLeaveTotal');
const usedDaysEl = document.getElementById('annualLeaveUsed');
const usedHoursEl = document.getElementById('annualLeaveUsedHours');
const remainingDaysEl = document.getElementById('annualLeaveRemaining');
const remainingHoursEl = document.getElementById('annualLeaveRemainingHours');
const recordsBody = document.getElementById('recordsBody');
const noRecordsMsg = document.getElementById('noRecordsMsg');
const filterType = document.getElementById('filterType');
const otherStatsList = document.getElementById('otherStatsList');

const loadingOverlay = document.getElementById('loadingOverlay');
const toast = document.getElementById('toast');

const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const loginPasswordInput = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');

const enablePasswordToggle = document.getElementById('enablePasswordToggle');
const passwordSettingGroup = document.getElementById('passwordSettingGroup');
const systemPasswordSetting = document.getElementById('systemPasswordSetting');

const holidaysList = document.getElementById('holidaysList');
const addHolidayBtn = document.getElementById('addHolidayBtn');
let tempHolidays = [];
let tempOvertimes = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateYearDisplay();
    loadData();
    setupEventListeners();
    setupLoginLogic();
});

function updateYearDisplay() {
    currentYearDisplay.textContent = currentYear;
    const settingYear = document.getElementById('settingYearDisplay');
    if (settingYear) settingYear.textContent = currentYear;
}

function setupEventListeners() {
    prevYearBtn.addEventListener('click', () => { currentYear--; updateYearDisplay(); loadData(); });
    nextYearBtn.addEventListener('click', () => { currentYear++; updateYearDisplay(); loadData(); });

    addLeaveBtn.addEventListener('click', () => {
        editingRecordId = null;
        addLeaveModal.querySelector('h2').textContent = '新增休假紀錄';
        addLeaveForm.reset();
        document.getElementById('leaveDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('holidaySelectGroup').style.display = 'none';
        document.getElementById('overtimeSelectGroup').style.display = 'none';
        document.getElementById('holidayTargetDate').value = '';
        openModal(addLeaveModal);
    });

    settingsBtn.addEventListener('click', () => {
        document.getElementById('annualLeaveDaysSetting').value = currentData.annualLeaveDays;
        
        if (enablePasswordToggle) {
            enablePasswordToggle.checked = currentData.passwordEnabled || false;
            passwordSettingGroup.style.display = enablePasswordToggle.checked ? 'block' : 'none';
        }
        if (systemPasswordSetting) systemPasswordSetting.value = currentData.password || '';
        
        tempHolidays = [...currentData.holidays];
        tempOvertimes = [...(currentData.overtimes || [])];
        renderHolidaysList();
        renderOvertimesSettingsList();
        openModal(settingsModal);
    });

    if (enablePasswordToggle) {
        enablePasswordToggle.addEventListener('change', () => {
            passwordSettingGroup.style.display = enablePasswordToggle.checked ? 'block' : 'none';
        });
    }

    reportBtn.addEventListener('click', () => {
        updateReport();
        openModal(reportModal);
    });

    closeBtns.forEach(btn => btn.addEventListener('click', () => closeModal()));
    cancelBtns.forEach(btn => btn.addEventListener('click', () => closeModal()));

    filterType.addEventListener('change', renderRecords);

    const holidaySelectGroup = document.getElementById('holidaySelectGroup');
    const holidaySelect = document.getElementById('holidaySelect');
    const overtimeSelectGroup = document.getElementById('overtimeSelectGroup');
    const overtimeSelect = document.getElementById('overtimeSelect');
    const leaveTypeSelect = document.getElementById('leaveType');
    const leaveDateInput = document.getElementById('leaveDate');
    const leaveHoursInput = document.getElementById('leaveHours');

    leaveTypeSelect.addEventListener('change', () => {
        holidaySelectGroup.style.display = 'none';
        overtimeSelectGroup.style.display = 'none';
        if (leaveTypeSelect.value === '國定假日') {
            refreshHolidayDropdownInModal();
            holidaySelectGroup.style.display = 'block';
        } else if (leaveTypeSelect.value === '加班補休') {
            refreshOvertimeDropdownInModal();
            overtimeSelectGroup.style.display = 'block';
        }
    });

    holidaySelect.addEventListener('change', () => {
        const selectedOption = holidaySelect.options[holidaySelect.selectedIndex];
        if (selectedOption.value) {
            if (!leaveDateInput.value) leaveDateInput.value = selectedOption.value;
            document.getElementById('holidayTargetDate').value = selectedOption.value;
            const remaining = parseFloat(selectedOption.dataset.remaining);
            if (remaining > 0) leaveHoursInput.value = remaining;
        }
    });

    overtimeSelect.addEventListener('change', () => {
        const selectedOption = overtimeSelect.options[overtimeSelect.selectedIndex];
        if (selectedOption.value) {
            document.getElementById('holidayTargetDate').value = selectedOption.value;
            const remaining = parseFloat(selectedOption.dataset.remaining);
            if (remaining > 0) leaveHoursInput.value = remaining;
        }
    });

    addHolidayBtn.addEventListener('click', () => {
        const dateEl = document.getElementById('newHolidayDate');
        const nameEl = document.getElementById('newHolidayName');
        const date = dateEl.value;
        const name = nameEl.value;
        if (!date || !name) {
            showToast('請選擇日期並輸入名稱', 'error');
            return;
        }
        tempHolidays.push({ date: date, name: name });
        renderHolidaysList();
        dateEl.value = ''; nameEl.value = '';
    });

    const addOvertimeBtn = document.getElementById('addOvertimeBtn');
    addOvertimeBtn.addEventListener('click', () => {
        const date = document.getElementById('newOvertimeDate').value;
        const hours = parseFloat(document.getElementById('newOvertimeHours').value);
        const note = document.getElementById('newOvertimeNote').value;
        if (!date || isNaN(hours) || !note) {
            showToast('請填寫完整加班資訊', 'error');
            return;
        }
        tempOvertimes.push({ id: Date.now().toString(), date, hours, note });
        renderOvertimesSettingsList();
        document.getElementById('newOvertimeDate').value = '';
        document.getElementById('newOvertimeHours').value = '';
        document.getElementById('newOvertimeNote').value = '';
    });

    addLeaveForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const date = document.getElementById('leaveDate').value;
        const type = document.getElementById('leaveType').value;
        const hours = document.getElementById('leaveHours').value;
        const note = document.getElementById('leaveNote').value;
        const holidayTargetDate = document.getElementById('holidayTargetDate').value;

        if (new Date(date).getFullYear() !== currentYear) {
            showToast('請選擇當前年度的日期！', 'error');
            return;
        }

        if (type === '國定假日' || type === '加班補休') {
            const selectId = (type === '國定假日') ? 'holidaySelect' : 'overtimeSelect';
            const selectEl = document.getElementById(selectId);
            const selectedOption = selectEl.options[selectEl.selectedIndex];
            
            if (!holidayTargetDate) {
                showToast('請選擇補休來源！', 'error');
                return;
            }

            const remaining = parseFloat(selectedOption.dataset.remaining || 0);
            if (Number(hours) > remaining) {
                showToast(`輸入時數 (${hours}h) 超過該項目的剩餘時數 (${remaining}h)！`, 'error');
                return;
            }
        }

        const data = {
            action: editingRecordId ? 'editRecord' : 'saveRecord',
            id: editingRecordId,
            date: date,
            type: type,
            hours: Number(hours),
            note: note,
            holidayTargetDate: (type === '國定假日' || type === '加班補休') ? holidayTargetDate : ''
        };

        try {
            await sendRequest(data);
            closeModal();
            loadData();
            showToast(editingRecordId ? '修改成功！' : '新增休假成功！');
        } catch (err) { showToast('儲存失敗', 'error'); }
    });

    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            action: 'saveSettings',
            year: currentYear,
            annualLeaveDays: Number(document.getElementById('annualLeaveDaysSetting').value),
            holidays: tempHolidays,
            overtimes: tempOvertimes,
            passwordEnabled: enablePasswordToggle.checked,
            password: systemPasswordSetting.value.trim()
        };
        try {
            await sendRequest(data);
            closeModal();
            loadData();
            showToast('設定已儲存');
        } catch (err) { showToast('儲存失敗', 'error'); }
    });
}

function renderHolidaysList() {
    const list = document.getElementById('holidaysList');
    list.innerHTML = '';
    tempHolidays.forEach((h, index) => {
        const item = document.createElement('div');
        item.className = 'holiday-item';
        item.innerHTML = `<span>${h.date} ${h.name}</span><button type="button" class="btn btn-danger btn-sm" onclick="removeHolidaySetting(${index})">移除</button>`;
        list.appendChild(item);
    });
}

function renderOvertimesSettingsList() {
    const list = document.getElementById('overtimesSettingsList');
    list.innerHTML = '';
    tempOvertimes.forEach((ot, index) => {
        const item = document.createElement('div');
        item.className = 'holiday-item';
        item.innerHTML = `<span>${ot.date} - ${ot.hours}h (${ot.note})</span><button type="button" class="btn btn-danger btn-sm" onclick="removeOvertimeSetting(${index})">移除</button>`;
        list.appendChild(item);
    });
}

window.removeHolidaySetting = (index) => { tempHolidays.splice(index, 1); renderHolidaysList(); };
window.removeOvertimeSetting = (index) => { tempOvertimes.splice(index, 1); renderOvertimesSettingsList(); };

function updateDashboard() {
    const totalDays = currentData.annualLeaveDays;
    let usedAnnualHours = 0;
    const otherStats = {};

    currentData.records.forEach(record => {
        if (record.type === '特休假') usedAnnualHours += record.hours;
        else {
            if (!otherStats[record.type]) otherStats[record.type] = 0;
            otherStats[record.type] += record.hours;
        }
    });

    const usedAnnualDaysPart = Math.floor(usedAnnualHours / 8);
    const usedAnnualHoursPart = usedAnnualHours % 8;
    const remTotalHours = (totalDays * 8) - usedAnnualHours;
    const remDaysPart = Math.floor(remTotalHours / 8);
    const remHoursPart = remTotalHours % 8;

    totalDaysEl.textContent = `${totalDays} 天`;
    usedDaysEl.innerHTML = usedAnnualHoursPart > 0 ? `${usedAnnualDaysPart} 天 <small style="font-size: 0.7em; opacity: 0.8;">+ ${usedAnnualHoursPart}/8 天</small>` : `${usedAnnualDaysPart} 天`;
    usedHoursEl.textContent = `(已用 ${usedAnnualHours} 小時)`;
    
    remainingDaysEl.innerHTML = remHoursPart > 0 ? `${remDaysPart} 天 <small style="font-size: 0.7em; opacity: 0.8;">+ ${remHoursPart}/8 天</small>` : `${remDaysPart} 天`;
    remainingHoursEl.textContent = `(剩餘 ${remTotalHours} 小時)`;
    remainingDaysEl.style.color = remTotalHours < 0 ? 'var(--danger-color)' : '';

    otherStatsList.innerHTML = '';
    for (const [type, hours] of Object.entries(otherStats)) {
        const div = document.createElement('div');
        div.className = 'stat-item';
        div.innerHTML = `<div class="stat-label"><div class="stat-dot" style="background: ${getColorForType(type)}"></div>${type}</div><div class="stat-value">${hours / 8} 天 (${hours} 小時)</div>`;
        otherStatsList.appendChild(div);
    }
    if (Object.keys(otherStats).length === 0) otherStatsList.innerHTML = '<div class="empty-state">尚無紀錄</div>';

    renderHolidayStatusList();
    renderOvertimeStatusList();
    renderRecords();
}

function renderHolidayStatusList() {
    const list = document.getElementById('dashboardHolidaysList');
    list.innerHTML = '';
    const usedHoursMap = {};
    currentData.records.forEach(r => {
        if (r.type === '國定假日') {
            const target = r.holidayTargetDate || r.date;
            const key = normalizeDate(target);
            usedHoursMap[key] = (usedHoursMap[key] || 0) + r.hours;
        }
    });
    currentData.holidays.forEach(h => {
        const hKey = normalizeDate(h.date);
        const used = usedHoursMap[hKey] || 0;
        const isUsed = used >= 8;
        const div = document.createElement('div');
        div.className = 'stat-item';
        div.style.opacity = isUsed ? '0.6' : '1';
        div.innerHTML = `<div class="stat-label"><div class="stat-dot" style="background: ${isUsed ? 'var(--text-secondary)' : 'var(--success-color)'}"></div><span>${formatDateToChinese(h.date)} ${h.name}</span></div><div class="stat-value" style="color: ${isUsed ? 'var(--text-secondary)' : 'var(--success-color)'}">${isUsed ? '已休' : (used > 0 ? '已休 '+used+'h' : '未休')}</div>`;
        list.appendChild(div);
    });
}

function renderOvertimeStatusList() {
    const list = document.getElementById('dashboardOvertimesList');
    list.innerHTML = '';
    const usedHoursMap = {};
    currentData.records.forEach(r => {
        if (r.type === '加班補休' && r.holidayTargetDate) {
            usedHoursMap[r.holidayTargetDate] = (usedHoursMap[r.holidayTargetDate] || 0) + r.hours;
        }
    });
    currentData.overtimes.forEach(ot => {
        const used = usedHoursMap[ot.id] || usedHoursMap[ot.date] || 0;
        const remaining = Math.max(0, ot.hours - used);
        const isUsed = remaining <= 0;
        const div = document.createElement('div');
        div.className = 'stat-item';
        div.style.opacity = isUsed ? '0.6' : '1';
        div.innerHTML = `<div class="stat-label"><div class="stat-dot" style="background: ${isUsed ? 'var(--text-secondary)' : '#ec4899'}"></div><span>${ot.date} ${ot.note} (${ot.hours}h)</span></div><div class="stat-value" style="color: ${isUsed ? 'var(--text-secondary)' : '#ec4899'}">${isUsed ? '已扣完' : '剩餘 ' + remaining + 'h'}</div>`;
        list.appendChild(div);
    });
}

function refreshHolidayDropdownInModal(selectedDate = null) {
    const holidaySelect = document.getElementById('holidaySelect');
    holidaySelect.innerHTML = '<option value="">-- 請選擇國定假日 --</option>';
    const usedHoursMap = {};
    currentData.records.forEach(r => {
        if (r.type === '國定假日') {
            if (editingRecordId && r.id === editingRecordId) return;
            const targetDate = normalizeDate(r.holidayTargetDate || r.date);
            usedHoursMap[targetDate] = (usedHoursMap[targetDate] || 0) + r.hours;
        }
    });
    const normalizedSelectedDate = normalizeDate(selectedDate);
    currentData.holidays.forEach(h => {
        const hKey = normalizeDate(h.date);
        const used = usedHoursMap[hKey] || 0;
        const remaining = Math.max(0, 8 - used);
        const isFull = used >= 8;
        const option = document.createElement('option');
        option.value = h.date;
        option.textContent = `${h.date} ${h.name} (${isFull ? '已休滿' : '剩餘 ' + remaining + ' 小時'})`;
        option.dataset.remaining = remaining;
        if (hKey === normalizedSelectedDate) option.selected = true;
        holidaySelect.appendChild(option);
    });
}

function refreshOvertimeDropdownInModal(selectedId = null) {
    const select = document.getElementById('overtimeSelect');
    select.innerHTML = '<option value="">-- 請選擇加班來源 --</option>';
    const usedHoursMap = {};
    currentData.records.forEach(r => {
        if (r.type === '加班補休') {
            if (editingRecordId && r.id === editingRecordId) return;
            const target = r.holidayTargetDate || r.date;
            usedHoursMap[target] = (usedHoursMap[target] || 0) + r.hours;
        }
    });
    currentData.overtimes.forEach(ot => {
        const used = usedHoursMap[ot.id] || usedHoursMap[ot.date] || 0;
        const remaining = Math.max(0, ot.hours - used);
        const option = document.createElement('option');
        option.value = ot.id || ot.date;
        option.textContent = `${ot.date} ${ot.note} (剩 ${remaining} / 共 ${ot.hours}h)`;
        option.dataset.remaining = remaining;
        if (option.value === selectedId) option.selected = true;
        if (remaining <= 0) option.style.color = '#94a3b8';
        select.appendChild(option);
    });
}

window.openEditModal = function(id) {
    const record = currentData.records.find(r => r.id === id);
    if (!record) return;
    editingRecordId = id;
    addLeaveModal.querySelector('h2').textContent = '編輯休假紀錄';
    document.getElementById('leaveDate').value = normalizeDate(record.date);
    document.getElementById('leaveType').value = record.type;
    const holidaySelectGroup = document.getElementById('holidaySelectGroup');
    const overtimeSelectGroup = document.getElementById('overtimeSelectGroup');
    const holidayTargetDateInput = document.getElementById('holidayTargetDate');
    holidaySelectGroup.style.display = 'none'; overtimeSelectGroup.style.display = 'none';
    if (record.type === '國定假日') {
        holidayTargetDateInput.value = record.holidayTargetDate || '';
        refreshHolidayDropdownInModal(record.holidayTargetDate || record.date);
        holidaySelectGroup.style.display = 'block';
    } else if (record.type === '加班補休') {
        holidayTargetDateInput.value = record.holidayTargetDate || '';
        refreshOvertimeDropdownInModal(record.holidayTargetDate || record.date);
        overtimeSelectGroup.style.display = 'block';
    } else { holidayTargetDateInput.value = ''; }
    document.getElementById('leaveHours').value = record.hours;
    document.getElementById('leaveNote').value = record.note;
    openModal(addLeaveModal);
};

window.confirmDelete = async function(id, date) {
    if (confirm(`確定要刪除 ${date} 的紀錄嗎？`)) {
        try { await sendRequest({ action: 'deleteRecord', id: id, date: date }); loadData(); showToast('已刪除'); } catch (err) { showToast('刪除失敗', 'error'); }
    }
};

function formatDateToChinese(dateString) {
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}(${weekdays[date.getDay()]})`;
    } catch(e) { return dateString; }
}

function getColorForType(type) {
    const colors = { '特休假': '#3b82f6', '事假': '#ef4444', '病假': '#f59e0b', '公假': '#10b981', '國定假日': '#a855f7', '加班補休': '#ec4899' };
    return colors[type] || '#94a3b8';
}

function showToast(message, type = 'success') {
    toast.textContent = message; toast.className = `toast show ${type}`;
    setTimeout(() => toast.className = `toast ${type}`, 3000);
}

function openModal(modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; }
function closeModal() { document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); document.body.style.overflow = 'auto'; }

async function loadData() {
    loadingOverlay.style.display = 'flex';
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getDashboardData', year: currentYear }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
        const result = await response.json();
        if (result.status === 'success') { 
            currentData = result.data; 
            checkAuthentication();
            updateDashboard(); 
        }
        else { showToast('載入失敗: ' + result.message, 'error'); }
    } catch (error) { showToast('網路錯誤', 'error'); }
    finally { loadingOverlay.style.display = 'none'; }
}

function setupLoginLogic() {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const inputPwd = String(loginPasswordInput.value).trim();
        const targetPwd = String(currentData.password).trim();
        
        if (inputPwd === targetPwd) {
            sessionStorage.setItem('leave_manager_verified', 'true');
            loginOverlay.classList.add('hidden');
            showToast('登入成功');
        } else {
            loginError.style.display = 'block';
            loginPasswordInput.value = '';
            loginPasswordInput.focus();
        }
    });
}

function checkAuthentication() {
    const isVerified = sessionStorage.getItem('leave_manager_verified') === 'true';
    if (currentData.passwordEnabled && currentData.password && !isVerified) {
        loginOverlay.classList.remove('hidden');
    } else {
        loginOverlay.classList.add('hidden');
    }
}

async function sendRequest(data) {
    loadingOverlay.style.display = 'flex';
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
        const result = await response.json();
        if (result.status !== 'success') throw new Error(result.message);
        return result;
    } catch (error) { throw error; }
    finally { loadingOverlay.style.display = 'none'; }
}

const normalizeDate = (d) => {
    if (!d) return "";
    if (typeof d === 'string') d = d.split('(')[0].trim();
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return String(d);
    return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
};

function updateReport() {
    document.getElementById('reportYearDisplay').textContent = currentYear;
    
    // 1. 統計週數
    const now = new Date();
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31);
    
    const getWeek = (date) => {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
    };

    const currentWeek = (now.getFullYear() === currentYear) ? getWeek(now) : (now.getFullYear() > currentYear ? 53 : 0);
    const totalWeeks = getWeek(endOfYear);
    
    document.getElementById('reportToday').textContent = now.toLocaleDateString();
    document.getElementById('reportCurrentWeek').textContent = currentWeek;
    document.getElementById('reportTotalWeeks').textContent = totalWeeks;
    document.getElementById('reportRemainingWeeks').textContent = Math.max(0, totalWeeks - currentWeek);

    // 2. 統計假別 (細分項目)
    const leaveTypes = ['特休假', '事假', '病假', '公假', '國定假日', '加班補休'];
    // 也找出紀錄中是否有其他自定義假別
    currentData.records.forEach(r => {
        if (!leaveTypes.includes(r.type)) leaveTypes.push(r.type);
    });

    const stats = {};
    leaveTypes.forEach(t => stats[t] = { quota: 0, used: 0 });

    // 設定 Quota
    stats['特休假'].quota = currentData.annualLeaveDays;
    stats['國定假日'].quota = currentData.holidays.length; // 國定假日以天數計
    stats['加班補休'].quota = (currentData.overtimes || []).reduce((sum, ot) => sum + ot.hours, 0) / 8;

    currentData.records.forEach(r => {
        if (stats[r.type]) stats[r.type].used += r.hours;
    });

    const renderRow = (label, data) => {
        const usedDays = Math.floor(data.used / 8);
        const usedHours = data.used % 8;
        const remTotalHours = (data.quota * 8) - data.used;
        const remDays = Math.floor(remTotalHours / 8);
        const remHours = remTotalHours % 8;

        return `
            <tr>
                <td style="text-align: left; padding-left: 2rem;">${label}</td>
                <td>${data.quota.toFixed(1)}</td>
                <td>${usedDays}天+${usedHours}時</td>
                <td style="color: ${remTotalHours < 0 ? 'var(--danger-color)' : 'var(--success-color)'}; font-weight: bold;">
                    ${remDays}天+${remHours}時
                </td>
                <td>
                    <span style="color: var(--danger-color)">${data.used}</span> / 
                    <span style="color: var(--success-color)">${(data.quota * 8).toFixed(1)}</span> h
                </td>
            </tr>
        `;
    };

    let html = '';
    leaveTypes.forEach(t => {
        if (stats[t].quota > 0 || stats[t].used > 0 || ['特休假', '國定假日', '加班補休'].includes(t)) {
            html += renderRow(t, stats[t]);
        }
    });

    document.getElementById('reportTableBody').innerHTML = html;

    // 總計 (不含事假、病假)
    const filteredStats = Object.entries(stats)
        .filter(([type]) => type !== '事假' && type !== '病假')
        .map(([_, data]) => data);

    const totalQuota = filteredStats.reduce((s, i) => s + i.quota, 0);
    const totalUsed = filteredStats.reduce((s, i) => s + i.used, 0);
    const totalRemHours = (totalQuota * 8) - totalUsed;
    
    document.getElementById('reportTableFoot').innerHTML = `
        <tr style="background: rgba(59, 130, 246, 0.1); font-weight: bold;">
            <td style="text-align: left; padding-left: 2rem;">總計 (總可休假)</td>
            <td>${totalQuota.toFixed(1)}</td>
            <td>${Math.floor(totalUsed/8)}天+${totalUsed%8}時</td>
            <td>${Math.floor(totalRemHours/8)}天+${totalRemHours%8}時</td>
            <td style="font-size: 0.8rem; color: var(--text-secondary); font-weight: normal;">(事/病假未納入計算)</td>
        </tr>
    `;
}

window.handleSort = function(key) {
    if (sortConfig.key === key) sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
    else { sortConfig.key = key; sortConfig.direction = 'asc'; }
    renderRecords();
};

function renderRecords() {
    recordsBody.innerHTML = '';
    const filter = filterType.value;
    ['date', 'type', 'hours'].forEach(k => { const el = document.getElementById(`sort-${k}`); if (el) el.textContent = ''; });
    const indicator = document.getElementById(`sort-${sortConfig.key}`);
    if (indicator) indicator.textContent = sortConfig.direction === 'asc' ? ' 🔼' : ' 🔽';
    let filtered = currentData.records.filter(r => filter === 'all' || r.type === filter);
    filtered.sort((a, b) => {
        let vA = a[sortConfig.key], vB = b[sortConfig.key];
        if (sortConfig.key === 'date') { vA = new Date(vA).getTime(); vB = new Date(vB).getTime(); }
        if (vA < vB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (vA > vB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });
    if (filtered.length === 0) { noRecordsMsg.style.display = 'block'; document.querySelector('table').style.display = 'none'; }
    else {
        noRecordsMsg.style.display = 'none'; document.querySelector('table').style.display = 'table';
        filtered.forEach(r => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${formatDateToChinese(r.date)}</td><td><span style="color: ${getColorForType(r.type)}; font-weight: 500;">${r.type}</span></td><td>${r.hours} 小時</td><td>${r.note || '-'}</td><td><button class="action-btn edit-btn" onclick="openEditModal('${r.id}')" title="編輯">📝</button><button class="action-btn delete-btn" onclick="confirmDelete('${r.id}', '${r.date}')" title="刪除">🗑️</button></td>`;
            recordsBody.appendChild(tr);
        });
    }
}
