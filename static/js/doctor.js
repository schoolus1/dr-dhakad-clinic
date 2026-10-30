/* doctor.js - Doctor Dashboard Logic */
'use strict';

let currentApptId = null;
let currentVisitId = null;
let currentPatientId = null;
let histCurrentPatientId = null;
let rxItems = [];
let allMedicines = [];

// ─── INIT ───
window.addEventListener('DOMContentLoaded', () => {
  loadQueue();
  loadMedicines();
  startClock();
  setInterval(loadQueue, 30000);
  // Set default dates for WhatsApp
  const today = new Date().toISOString().split('T')[0];
  ['wa_from','wa_to','wa_reopen'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });

  // Initialize smart interactive medicine autocomplete
  setupRxAutocomplete();
  const instInput = document.getElementById('rx_inst_input');
  if (instInput) {
    instInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addMedFromInputs();
      }
    });
  }
});

function startClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  setInterval(() => { el.textContent = new Date().toLocaleTimeString('hi-IN'); }, 1000);
}

// ─── NAV ───
function showSection(name) {
  ['queue','history','whatsapp','settings','audit'].forEach(s => {
    const el = document.getElementById(`section-${s}`);
    if (el) el.style.display = s === name ? '' : 'none';
    const nav = document.getElementById(`nav-${s}`);
    if (nav) nav.classList.toggle('active', s === name);
  });
  const titles = {
    queue: 'मरीजों की कतार (Patient Queue)',
    history: 'मरीज इतिहास (Patient History)',
    whatsapp: 'WhatsApp सूचना (Notice)',
    audit: 'ऑडिट रिपोर्ट व रद्द बिल (Anti-Fraud Audit Log)',
    settings: 'सेटिंग्स (Settings)'
  };
  document.getElementById('pageTitle').textContent = titles[name] || name;
  if (name === 'settings') loadSettings();
  if (name === 'whatsapp') { loadEligiblePatients(); loadWaLogs(); }
  if (name === 'audit') loadAuditReport();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarBackdrop').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('open');
}

// ─── TOAST ───
function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  const d = document.createElement('div');
  d.className = `toast-msg toast-${type}`;
  d.textContent = msg;
  t.appendChild(d);
  setTimeout(() => d.remove(), 4000);
}
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function showConfirmDialog({ title = 'पुष्टि करें', message = 'क्या आप जारी रखना चाहते हैं?', icon = '❓', okText = 'हाँ, करें', cancelText = 'रद्द करें (Cancel)', okClass = 'btn-primary' } = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirmModal');
    if (!modal) {
      resolve(confirm(message));
      return;
    }
    const iconEl = document.getElementById('confirmModalIcon');
    const titleEl = document.getElementById('confirmModalTitle');
    const msgEl = document.getElementById('confirmModalMsg');
    const okBtn = document.getElementById('confirmModalOkBtn');
    const cancelBtn = document.getElementById('confirmModalCancelBtn');

    if (iconEl) iconEl.textContent = icon;
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;

    if (okBtn) {
      okBtn.textContent = okText;
      okBtn.className = `btn ${okClass}`;
    }
    if (cancelBtn) {
      cancelBtn.textContent = cancelText;
    }

    const cleanup = () => {
      closeModal('confirmModal');
      if (okBtn) okBtn.onclick = null;
      if (cancelBtn) cancelBtn.onclick = null;
    };

    if (okBtn) okBtn.onclick = () => { cleanup(); resolve(true); };
    if (cancelBtn) cancelBtn.onclick = () => { cleanup(); resolve(false); };
    openModal('confirmModal');
  });
}

// ─── QUEUE ───
async function loadQueue() {
  const resp = await fetch('/api/queue');
  const queue = await resp.json();
  const el = document.getElementById('queueList');
  document.getElementById('queueCount').textContent = queue.filter(q => q.status === 'waiting' || q.status === 'in_progress').length;

  if (!queue.length) {
    el.innerHTML = '<div class="empty-state"><p>आज कोई मरीज नहीं (No patients today)</p></div>';
    return;
  }
  el.innerHTML = queue.map(a => {
    const isCancelled = a.status === 'cancelled';
    const isPri = a.is_priority;
    return `
    <div class="queue-item ${currentApptId === a.id ? 'active' : ''} ${isCancelled ? 'cancelled-item' : ''}" 
         style="${isCancelled ? 'opacity:0.6;background:#fef2f2;cursor:not-allowed;' : isPri ? 'border-left: 4px solid #f59e0b; background:#fffbeb;' : ''}"
         onclick="${isCancelled ? `toast('⚠️ टोकन #${a.token} (${a.name}) रद्द (Cancelled) हो चुका है', 'error')` : `openPatient(${a.id}, ${a.patient_id})`}">
      <div class="token-badge" style="${isCancelled ? 'background:#ef4444;color:#fff;' : isPri ? 'background:#d97706;color:#fff;' : ''}">${a.token}</div>
      <div class="queue-info">
        <div class="queue-name" style="${isCancelled ? 'text-decoration:line-through;color:#991b1b;' : ''}">
          ${a.name}
          ${isPri ? '<span class="badge" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;font-size:0.75rem;margin-left:6px;">⭐ VIP प्राथमिकता</span>' : ''}
        </div>
        <div class="queue-meta">${a.age || '-'} वर्ष/Y &bull; ${a.gender || '-'} &bull; ${a.mobile}</div>
      </div>
      <span class="badge badge-${a.status.replace('_','-')}">${statusLabel(a.status)}</span>
    </div>`;
  }).join('');
}

function statusLabel(s) {
  return { waiting: 'प्रतीक्षारत (Waiting)', in_progress: 'जारी (In-Progress)', completed: 'पूर्ण (Done)', cancelled: 'रद्द (Cancelled)' }[s] || s;
}

// ─── MEDICINES AUTO-SUGGEST & QUICK CHIPS ───
let autocompleteActiveIndex = -1;

async function loadMedicines() {
  try {
    const resp = await fetch('/api/medicines');
    allMedicines = await resp.json();
    // Sort descending by usage_count (most prescribed medicines come first)
    allMedicines.sort((a, b) => (b.usage_count || 1) - (a.usage_count || 1));
    renderMedicineSuggestions();
    renderQuickChips();
  } catch (e) {
    console.error('Error loading medicines:', e);
  }
}

function renderMedicineSuggestions() {
  // Native datalist removed to prevent duplicate dark overlapping popups
}

function renderQuickChips() {
  const container = document.getElementById('quickMedChips');
  if (!container) return;
  if (!allMedicines.length) {
    container.innerHTML = '<span style="font-size:0.8rem;color:var(--text2);">कोई दवाई उपलब्ध नहीं</span>';
    return;
  }
  // Show top 20 most frequently prescribed medicines
  const topMeds = [...allMedicines].sort((a, b) => (b.usage_count || 1) - (a.usage_count || 1)).slice(0, 20);
  container.innerHTML = topMeds.map(m => {
    const escapedMed = JSON.stringify(m).replace(/"/g, '&quot;');
    const countBadge = (m.usage_count && m.usage_count > 1) 
      ? `<span style="font-size:0.68rem;background:rgba(26,115,232,0.18);color:#1a73e8;padding:1px 6px;border-radius:10px;margin-left:4px;font-weight:700;">⭐ ${m.usage_count}</span>` 
      : '';
    return `
      <span class="med-chip" onclick="selectQuickMed(${escapedMed})" title="${m.name} (डोज़: ${m.dose || '-'}, ${m.timing || '-'})">
        💊 ${m.name}${countBadge}
      </span>
    `;
  }).join('');
}

function selectQuickMed(med) {
  if (typeof med === 'string') {
    try { med = JSON.parse(med); } catch (e) { med = { name: med }; }
  }
  document.getElementById('rx_name_input').value = med.name || '';
  if (med.dose) document.getElementById('rx_dose_input').value = med.dose;
  if (med.timing) document.getElementById('rx_timing_input').value = med.timing;
  if (med.days) document.getElementById('rx_days_input').value = med.days;
  if (med.instructions) document.getElementById('rx_inst_input').value = med.instructions;
  closeRxDropdown();
  document.getElementById('rx_name_input').focus();
}

// ─── INTERACTIVE RX AUTOCOMPLETE DROPDOWN ───
function setupRxAutocomplete() {
  const input = document.getElementById('rx_name_input');
  const dropdown = document.getElementById('rxAutocompleteDropdown');
  if (!input || !dropdown) return;

  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    autocompleteActiveIndex = -1;

    // Check if entered name directly matches an existing medicine, auto-fill dosage & timing!
    const exactMatch = allMedicines.find(m => m.name.toLowerCase() === query);
    if (exactMatch) {
      if (exactMatch.dose) document.getElementById('rx_dose_input').value = exactMatch.dose;
      if (exactMatch.timing) document.getElementById('rx_timing_input').value = exactMatch.timing;
      if (exactMatch.days) document.getElementById('rx_days_input').value = exactMatch.days;
      if (exactMatch.instructions) document.getElementById('rx_inst_input').value = exactMatch.instructions;
    }

    if (!query) {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
      return;
    }

    const matches = allMedicines.filter(m => m.name.toLowerCase().includes(query)).slice(0, 8);
    if (!matches.length) {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
      return;
    }

    dropdown.innerHTML = matches.map((m, idx) => {
      const escaped = JSON.stringify(m).replace(/"/g, '&quot;');
      const freqText = (m.usage_count && m.usage_count > 1) ? `⭐ ${m.usage_count} बार` : 'नया (New)';
      return `
        <div class="rx-autocomplete-item" data-index="${idx}" onclick="selectQuickMed(${escaped})">
          <div>
            <div class="rx-autocomplete-name">${m.name}</div>
            <div class="rx-autocomplete-meta">${m.dose || ''} &bull; ${m.timing || ''} &bull; ${m.days || ''}</div>
          </div>
          <span class="rx-autocomplete-freq">${freqText}</span>
        </div>
      `;
    }).join('');
    dropdown.style.display = 'block';
  });

  input.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.rx-autocomplete-item');
    if (dropdown.style.display !== 'none' && items.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        autocompleteActiveIndex = (autocompleteActiveIndex + 1) % items.length;
        updateAutocompleteHighlight(items);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        autocompleteActiveIndex = (autocompleteActiveIndex - 1 + items.length) % items.length;
        updateAutocompleteHighlight(items);
        return;
      } else if (e.key === 'Enter') {
        if (autocompleteActiveIndex >= 0 && autocompleteActiveIndex < items.length) {
          e.preventDefault();
          items[autocompleteActiveIndex].click();
          return;
        }
      } else if (e.key === 'Escape') {
        closeRxDropdown();
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      addMedFromInputs();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.rx-input-group-relative')) {
      closeRxDropdown();
    }
  });
}

function updateAutocompleteHighlight(items) {
  items.forEach((item, idx) => {
    item.classList.toggle('active', idx === autocompleteActiveIndex);
    if (idx === autocompleteActiveIndex) {
      item.scrollIntoView({ block: 'nearest' });
    }
  });
}

function closeRxDropdown() {
  const dropdown = document.getElementById('rxAutocompleteDropdown');
  if (dropdown) {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
  }
  autocompleteActiveIndex = -1;
}

function addMedFromInputs() {
  const nameEl = document.getElementById('rx_name_input');
  const name = (nameEl.value || '').trim();
  if (!name) {
    toast('कृपया दवाई का नाम लिखें (Please enter medicine name)', 'error');
    nameEl.focus();
    return;
  }
  const dose = document.getElementById('rx_dose_input').value;
  const timing = document.getElementById('rx_timing_input').value;
  const days = document.getElementById('rx_days_input').value;
  const instructions = document.getElementById('rx_inst_input').value.trim();

  rxItems.push({
    medicine_name: name,
    dose: dose,
    timing: timing,
    days: days,
    instructions: instructions
  });

  renderRxTable();

  // Instant catalog update so it immediately appears in top chips & auto-suggest
  fetch('/api/medicines', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name, dose: dose, timing: timing, days: days, instructions: instructions })
  }).then(r => r.json()).then(res => {
    if (res.success && res.medicine) {
      const idx = allMedicines.findIndex(m => m.name.toLowerCase() === name.toLowerCase());
      if (idx >= 0) {
        allMedicines[idx].usage_count = (allMedicines[idx].usage_count || 1) + 1;
        if (dose) allMedicines[idx].dose = dose;
        if (timing) allMedicines[idx].timing = timing;
        if (days) allMedicines[idx].days = days;
        if (instructions) allMedicines[idx].instructions = instructions;
      } else {
        allMedicines.unshift(res.medicine);
      }
      allMedicines.sort((a, b) => (b.usage_count || 1) - (a.usage_count || 1));
      renderQuickChips();
      renderMedicineSuggestions();
    }
  }).catch(() => {});

  // Reset inputs
  nameEl.value = '';
  document.getElementById('rx_inst_input').value = '';
  closeRxDropdown();
  nameEl.focus();
}

function removeMedItem(index) {
  rxItems.splice(index, 1);
  renderRxTable();
}

function renderRxTable() {
  const tbody = document.getElementById('rxTableBody');
  if (!tbody) return;
  if (!rxItems.length) {
    tbody.innerHTML = `
      <tr id="rxEmptyRow">
        <td colspan="7" style="text-align:center;color:var(--text2);padding:24px;">
          कोई दवाई नहीं जोड़ी गई। ऊपर से दवाई चुनें या लिखें और <strong>➕ जोड़ें</strong> दबाएं।
        </td>
      </tr>`;
    return;
  }
  tbody.innerHTML = rxItems.map((rx, idx) => `
    <tr>
      <td style="font-weight:700;color:var(--text2);">${idx + 1}</td>
      <td style="font-weight:600;color:var(--text);">${rx.medicine_name}</td>
      <td><span class="badge badge-waiting" style="font-size:0.75rem;">${rx.dose || '-'}</span></td>
      <td>${rx.timing || '-'}</td>
      <td><strong>${rx.days || '-'}</strong></td>
      <td style="color:var(--text2);font-size:0.82rem;">${rx.instructions || '-'}</td>
      <td style="text-align:center;">
        <button type="button" class="btn btn-icon btn-danger btn-sm" onclick="removeMedItem(${idx})" title="हटाएं">✕</button>
      </td>
    </tr>
  `).join('');
}

// ─── PATIENT CONSULTATION & CALLING ───
async function callNextPatient() {
  try {
    const resp = await fetch('/api/appointments/call-next', { method: 'POST' });
    const data = await resp.json();
    if (!resp.ok || !data.success) {
      toast(data.message || 'कोई प्रतीक्षारत मरीज नहीं है', 'error');
      return;
    }
    toast(`📢 टोकन #${data.token} (${data.name}) को टीवी पर बुलाया गया!`);
    await openPatient(data.appointment_id, data.patient_id, false);
    loadQueue();
  } catch (e) {
    toast('मरीज बुलाने में त्रुटि हुई', 'error');
  }
}

async function ringCurrentPatient() {
  if (!currentApptId) {
    toast('कोई मरीज चयनित नहीं है', 'error');
    return;
  }
  try {
    const resp = await fetch(`/api/appointments/${currentApptId}/call`, { method: 'POST' });
    const data = await resp.json();
    if (data.success) {
      toast(`🔔 टोकन #${data.token} (${data.name}) का साउंड टीवी पर बजाया गया!`);
      loadQueue();
    }
  } catch (e) {
    toast('घंटी बजाने में त्रुटि हुई', 'error');
  }
}

async function openPatient(apptId, patientId, triggerCall = true) {
  // Check queue for token and status first
  const queue = await fetch('/api/queue').then(r => r.json());
  const appt = queue.find(a => a.id === apptId);
  if (!appt) return;
  if (appt.status === 'cancelled') {
    toast('⚠️ यह अपॉइंटमेंट रद्द (Cancelled) हो चुका है। परामर्श नहीं किया जा सकता।', 'error');
    return;
  }

  currentApptId = apptId;
  currentPatientId = patientId;

  // Don't auto-call on TV if patient is already completed (just viewing record)
  if (appt.status === 'completed') {
    triggerCall = false;
  }

  if (triggerCall) {
    fetch(`/api/appointments/${apptId}/call`, { method: 'POST' }).catch(() => {});
  }
  loadQueue(); // refresh highlight

  // Load patient info
  const p = await fetch(`/api/patients/${patientId}`).then(r => r.json());
  document.getElementById('visitPatientName').textContent = `${p.name} — टोकन #${appt.token}`;
  document.getElementById('visitPatientMeta').textContent = `${p.age || '-'} वर्ष/Y, ${p.gender || '-'} · 📱 ${p.mobile} · 🩸 ${p.blood_group || 'Blood Group: N/A'}`;

  // Show form, hide placeholder
  document.getElementById('visitPlaceholder').style.display = 'none';
  document.getElementById('visitForm').style.display = '';

  // Check history for previous visits
  const history = await fetch(`/api/patients/${patientId}/history`).then(r => r.json());
  const prevVisits = history.filter(h => h.appointment_id !== apptId);
  const prevBanner = document.getElementById('prevVisitSummary');
  const prevBtn = document.getElementById('prevVisitBtn');
  if (prevVisits.length) {
    const last = prevVisits[0];
    prevBanner.innerHTML = `<strong>${last.date}:</strong> ${last.diagnosis || 'परामर्श'} &bull; ${last.prescriptions.length} दवाइयाँ`;
    if (prevBtn) prevBtn.style.display = 'inline-block';
  } else {
    prevBanner.textContent = 'कोई पुरानी पर्ची उपलब्ध नहीं (First Visit)';
    if (prevBtn) prevBtn.style.display = 'none';
  }

  // Check if today already has a draft or saved visit
  const todayVisit = history.find(h => h.appointment_id === apptId);
  if (todayVisit) {
    currentVisitId = todayVisit.visit_id;
    const vdata = await fetch(`/api/visits/${currentVisitId}`).then(r => r.json());
    fillVisitForm(vdata);
  } else {
    currentVisitId = null;
    clearVisitForm();
  }
}

function fillVisitForm(v) {
  document.getElementById('v_bp').value = v.bp || '';
  document.getElementById('v_pulse').value = v.pulse || '';
  document.getElementById('v_temp').value = v.temperature || '';
  document.getElementById('v_weight').value = v.weight || '';
  document.getElementById('v_spo2').value = v.spo2 || '';
  document.getElementById('v_complaints').value = v.complaints || '';
  document.getElementById('v_diagnosis').value = v.diagnosis || '';
  document.getElementById('v_notes').value = v.doctor_notes || '';
  document.getElementById('v_follow_up').value = v.follow_up || '';

  rxItems = (v.prescriptions || []).map(r => ({
    medicine_name: r.medicine_name,
    dose: r.dose,
    timing: r.timing,
    days: r.days,
    instructions: r.instructions
  }));
  renderRxTable();
}

function clearVisitForm() {
  ['v_bp','v_pulse','v_temp','v_weight','v_spo2','v_complaints','v_diagnosis','v_notes','v_follow_up','rx_name_input','rx_inst_input'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  rxItems = [];
  renderRxTable();
}

function getVisitData() {
  return {
    appointment_id: currentApptId,
    bp: document.getElementById('v_bp').value,
    pulse: document.getElementById('v_pulse').value,
    temperature: document.getElementById('v_temp').value,
    weight: document.getElementById('v_weight').value,
    spo2: document.getElementById('v_spo2').value,
    complaints: document.getElementById('v_complaints').value,
    diagnosis: document.getElementById('v_diagnosis').value,
    doctor_notes: document.getElementById('v_notes').value,
    follow_up: document.getElementById('v_follow_up').value,
    prescriptions: rxItems
  };
}

async function saveVisit() {
  if (!currentApptId) { toast('कोई मरीज नहीं चुना', 'error'); return; }
  const data = getVisitData();
  const resp = await fetch('/api/visits', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)
  });
  const result = await resp.json();
  if (result.success) {
    currentVisitId = result.visit_id;
    toast('✅ पर्ची और नई दवाइयाँ सुरक्षित हो गईं!');
    loadMedicines(); // Reload frequent medicines so new ones appear instantly
  } else {
    toast('त्रुटि हुई', 'error');
  }
}

async function finalizeAndPrint() {
  if (!currentApptId) { toast('कोई मरीज नहीं चुना (No patient selected)', 'error'); return; }
  await saveVisit();
  if (!currentVisitId) return;

  // Finalize visit and mark appointment completed
  await fetch(`/api/visits/${currentVisitId}/finalize`, { method: 'POST' });
  const printVid = currentVisitId;

  toast('✅ पर्ची फाइनल हो गई!');
  openPrintPopup(`/print/prescription/${printVid}`, 'पर्चा प्रिंट');

  // Reset and prepare for next patient
  currentApptId = null;
  currentVisitId = null;
  document.getElementById('visitForm').style.display = 'none';
  document.getElementById('visitPlaceholder').style.display = '';
  loadQueue();
}

async function finalizeVisit() {
  if (!currentVisitId) {
    await saveVisit();
    if (!currentVisitId) { toast('पहले सेव करें', 'error'); return; }
  }
  const ok = await showConfirmDialog({
    title: 'विजिट पूर्ण करें (Finalize Visit)?',
    message: 'क्या आप इस विजिट को पूर्ण करना चाहते हैं? पूर्ण होने के बाद यह लॉक हो जाएगी।',
    icon: '🔒',
    okText: '✅ हाँ, पूर्ण करें',
    cancelText: 'रद्द करें (Cancel)',
    okClass: 'btn-success'
  });
  if (!ok) return;
  await fetch(`/api/visits/${currentVisitId}/finalize`, { method: 'POST' });
  toast('✅ विजिट पूर्ण!');
  currentApptId = null;
  currentVisitId = null;
  document.getElementById('visitForm').style.display = 'none';
  document.getElementById('visitPlaceholder').style.display = '';
  loadQueue();
}

async function viewHistory() {
  if (!currentPatientId) return;
  openModal('historyModal');
  document.getElementById('historyModalBody').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const history = await fetch(`/api/patients/${currentPatientId}/history`).then(r => r.json());
  const p = await fetch(`/api/patients/${currentPatientId}`).then(r => r.json());
  if (!history.length) {
    document.getElementById('historyModalBody').innerHTML = '<div class="empty-state"><p>कोई पुरानी विजिट नहीं (No previous visits)</p></div>';
    return;
  }
  document.getElementById('historyModalBody').innerHTML = history.map(v => `
    <div class="card mb-2">
      <div class="d-flex justify-between align-center mb-1">
        <strong>${v.date}</strong>
        <span class="badge badge-${v.is_finalized ? 'completed' : 'waiting'}">${v.is_finalized ? 'फाइनल (Final)' : 'ड्राफ्ट (Draft)'}</span>
      </div>
      ${v.complaints ? `<div class="text-small"><strong>शिकायतें:</strong> ${v.complaints}</div>` : ''}
      ${v.bp ? `<div class="text-small">BP: ${v.bp} | Pulse: ${v.pulse || '-'} | SpO2: ${v.spo2 || '-'}% | Temp: ${v.temperature || '-'}°F</div>` : ''}
      ${v.diagnosis ? `<div class="text-small"><strong>निदान:</strong> ${v.diagnosis}</div>` : ''}
      ${v.doctor_notes ? `<div class="text-small text-muted"><strong>नोट्स:</strong> ${v.doctor_notes}</div>` : ''}
      ${v.follow_up ? `<div class="text-small text-muted"><strong>अगली विजिट:</strong> ${v.follow_up}</div>` : ''}
      ${v.prescriptions.length ? `
        <div style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px;">
          <strong style="font-size:0.8rem;">💊 दवाइयाँ:</strong>
          ${v.prescriptions.map(rx => `
            <div class="text-small">• <strong>${rx.medicine_name}</strong> — ${rx.dose} — ${rx.timing} — ${rx.days || '-'} ${rx.instructions ? '(' + rx.instructions + ')' : ''}</div>
          `).join('')}
        </div>` : ''}
      <div class="d-flex gap-1 mt-1">
        <button class="btn btn-sm btn-outline" onclick="openPrintPopup('/print/prescription/${v.visit_id}', 'पर्चा प्रिंट')">🖨️ प्रिंट (Print)</button>
        ${!v.is_finalized ? `<button class="btn btn-sm btn-primary" onclick="copyPrescription(${v.visit_id})">📋 कॉपी करें (Copy)</button>` : ''}
      </div>
    </div>`).join('');
}

async function copyPrescription(fromVisitId) {
  if (!currentApptId) { toast('पहले कोई मरीज चुनें (कतार से)', 'error'); return; }
  const ok = await showConfirmDialog({
    title: 'पर्ची कॉपी करें?',
    message: 'इस पर्ची को वर्तमान विजिट में कॉपी करें? डॉक्टर को पुनः समीक्षा करनी होगी।',
    icon: '📋',
    okText: 'हाँ, कॉपी करें',
    cancelText: 'रद्द करें'
  });
  if (!ok) return;
  const v = await fetch(`/api/visits/${fromVisitId}`).then(r => r.json());
  document.getElementById('v_diagnosis').value = v.diagnosis || '';
  document.getElementById('v_complaints').value = v.complaints || '';
  if (v.doctor_notes) document.getElementById('v_notes').value = v.doctor_notes;
  rxItems = (v.prescriptions || []).map(r => ({
    medicine_name: r.medicine_name,
    dose: r.dose,
    timing: r.timing,
    days: r.days,
    instructions: r.instructions
  }));
  renderRxTable();
  closeModal('historyModal');
  toast('📋 पर्ची कॉपी की गई — समीक्षा करके सेव करें', 'info');
}

// ─── PATIENT HISTORY SEARCH ───
let histSearchTimeout = null;
async function searchHistPatient(q) {
  clearTimeout(histSearchTimeout);
  histSearchTimeout = setTimeout(async () => {
    if (!q.trim()) { document.getElementById('histSearchResults').innerHTML = ''; return; }
    const patients = await fetch(`/api/patients?q=${encodeURIComponent(q)}`).then(r => r.json());
    const el = document.getElementById('histSearchResults');
    if (!patients.length) { el.innerHTML = '<div style="color:var(--text2);padding:8px;">कोई मरीज नहीं मिला</div>'; return; }
    el.innerHTML = patients.map(p => `
      <div class="queue-item" onclick="loadPatientHistory(${p.id},'${p.name}')">
        <div class="queue-info">
          <div class="queue-name">${p.name}</div>
          <div class="queue-meta">${p.mobile} &bull; ${p.age || '-'} वर्ष</div>
        </div>
        <button class="btn btn-sm btn-primary">इतिहास देखें</button>
      </div>`).join('');
  }, 300);
}

async function loadPatientHistory(pid, name) {
  histCurrentPatientId = pid;
  document.getElementById('historyPanel').style.display = '';
  document.getElementById('histPatientTitle').textContent = `📋 ${name} की विजिट`;
  document.getElementById('historyList').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const history = await fetch(`/api/patients/${pid}/history`).then(r => r.json());
  if (!history.length) {
    document.getElementById('historyList').innerHTML = '<div class="empty-state"><p>कोई पुरानी विजिट नहीं</p></div>';
    return;
  }
  document.getElementById('historyList').innerHTML = history.map(v => `
    <div class="card mb-2">
      <div class="d-flex justify-between align-center mb-1">
        <strong>${v.date}</strong>
        <span class="badge badge-${v.is_finalized ? 'completed' : 'waiting'}">${v.is_finalized ? 'फाइनल' : 'ड्राफ्ट'}</span>
      </div>
      ${v.complaints ? `<div class="text-small"><strong>शिकायतें:</strong> ${v.complaints}</div>` : ''}
      ${v.diagnosis ? `<div class="text-small"><strong>निदान:</strong> ${v.diagnosis}</div>` : ''}
      ${v.prescriptions.length ? `
        <div style="margin-top:6px;">
          ${v.prescriptions.map(rx => `
            <div class="text-small">• ${rx.medicine_name} ${rx.dose} — ${rx.timing} — ${rx.days || '-'} दिन</div>
          `).join('')}
        </div>` : ''}
      <button class="btn btn-sm btn-outline mt-1" onclick="openPrintPopup('/print/prescription/${v.visit_id}', 'पर्चा प्रिंट')">🖨️ प्रिंट</button>
    </div>`).join('');
}

// ─── WHATSAPP ───
async function previewMessage() {
  const data = {
    from_date: document.getElementById('wa_from').value,
    to_date: document.getElementById('wa_to').value,
    reopen_date: document.getElementById('wa_reopen').value,
    language: document.getElementById('wa_lang').value,
    custom_message: document.getElementById('wa_custom').value
  };
  const resp = await fetch('/api/whatsapp/preview', {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
  });
  const result = await resp.json();
  const el = document.getElementById('waPreview');
  el.textContent = result.message;
  el.style.display = '';
}

async function loadEligiblePatients() {
  const patients = await fetch('/api/whatsapp/eligible-patients').then(r => r.json());
  const el = document.getElementById('waPatientList');
  if (!patients.length) { el.innerHTML = '<div style="padding:10px;color:var(--text2);">कोई पात्र मरीज नहीं</div>'; return; }
  el.innerHTML = patients.map(p => `
    <label style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid var(--border);cursor:pointer;">
      <input type="checkbox" class="wa-patient-cb" value="${p.id}" checked>
      <span><strong>${p.name}</strong> &nbsp; ${p.mobile}</span>
    </label>`).join('');
}

function toggleSelectAll(checked) {
  document.querySelectorAll('.wa-patient-cb').forEach(cb => cb.checked = checked);
}

async function sendWaMessages() {
  const previewEl = document.getElementById('waPreview');
  if (!previewEl.textContent || previewEl.style.display === 'none') {
    await previewMessage();
  }
  const message = document.getElementById('waPreview').textContent;
  if (!message) { toast('पहले मैसेज प्रीव्यू करें', 'error'); return; }

  const selected = Array.from(document.querySelectorAll('.wa-patient-cb:checked')).map(cb => parseInt(cb.value));
  if (!selected.length) { toast('कम से कम एक मरीज चुनें', 'error'); return; }

  const ok = await showConfirmDialog({
    title: 'WhatsApp संदेश भेजें?',
    message: `${selected.length} मरीजों को WhatsApp मैसेज भेजना चाहते हैं?`,
    icon: '📱',
    okText: 'हाँ, भेजें',
    cancelText: 'रद्द करें',
    okClass: 'btn-success'
  });
  if (!ok) return;

  const resp = await fetch('/api/whatsapp/send', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ message, patient_ids: selected })
  });
  const result = await resp.json();

  if (!result.api_used) {
    // Open wa.me links for manual sending
    toast('WhatsApp API नहीं मिली — लिंक खुल रहे हैं (एक-एक करके भेजें)', 'info');
    result.logs.filter(l => l.status === 'pending' && l.wa_url).forEach((l, i) => {
      setTimeout(() => window.open(l.wa_url, '_blank'), i * 800);
    });
  } else {
    const sent = result.logs.filter(l => l.status === 'sent').length;
    const failed = result.logs.filter(l => l.status === 'failed').length;
    toast(`✅ ${sent} भेजे गए, ${failed} असफल`);
  }
  setTimeout(loadWaLogs, 1500);
}

async function loadWaLogs() {
  const logs = await fetch('/api/whatsapp/logs').then(r => r.json());
  const el = document.getElementById('waLogsSection');
  if (!logs.length) { el.innerHTML = '<div class="empty-state"><p>कोई लॉग नहीं</p></div>'; return; }
  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>मोबाइल</th><th>स्थिति</th><th>Batch</th><th>समय</th></tr></thead>
        <tbody>
          ${logs.map(l => `
            <tr>
              <td>${l.mobile}</td>
              <td><span class="wa-status-${l.status}">${l.status === 'sent' ? '✅ भेजा' : l.status === 'failed' ? '❌ असफल' : '⏳ लंबित'}</span></td>
              <td style="font-size:0.78rem;">${l.batch_id || '-'}</td>
              <td style="font-size:0.78rem;">${l.sent_at}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// ─── SETTINGS ───
async function loadSettings() {
  const s = await fetch('/api/settings').then(r => r.json());
  document.getElementById('set_clinic_name').value = s.clinic_name || '';
  document.getElementById('set_doctor_name').value = s.doctor_name || '';
  document.getElementById('set_address').value = s.clinic_address || '';
  document.getElementById('set_phone').value = s.clinic_phone || '';
  document.getElementById('set_fee').value = s.consultation_fee || '';
  document.getElementById('set_wa_token').value = s.wa_token || '';
  document.getElementById('set_wa_phone_id').value = s.wa_phone_id || '';

  // TV Screen Customization settings
  if (document.getElementById('set_doctor_qual')) document.getElementById('set_doctor_qual').value = s.doctor_qual || '';
  if (document.getElementById('set_doctor_role')) document.getElementById('set_doctor_role').value = s.doctor_role || '';
  if (document.getElementById('set_prescription_validity_days')) {
    document.getElementById('set_prescription_validity_days').value = s.prescription_validity_days || '14';
  }
  if (document.getElementById('set_billing_staff_list')) {
    document.getElementById('set_billing_staff_list').value = s.billing_staff_list || 'देवेन्द्र (Devendra), रानी (Rani), मोनिका (Monika)';
  }
  if (document.getElementById('set_doctor_photo')) {
    document.getElementById('set_doctor_photo').value = s.doctor_photo || '';
    const prev = document.getElementById('tvDocPhotoPreview');
    if (prev && s.doctor_photo) {
      prev.src = s.doctor_photo;
      prev.style.display = 'block';
    }
  }
  if (document.getElementById('set_doctor_bullet1')) document.getElementById('set_doctor_bullet1').value = s.doctor_bullet1 || '';
  if (document.getElementById('set_doctor_bullet2')) document.getElementById('set_doctor_bullet2').value = s.doctor_bullet2 || '';
  if (document.getElementById('set_doctor_bullet3')) document.getElementById('set_doctor_bullet3').value = s.doctor_bullet3 || '';
  if (document.getElementById('set_doctor_bullet4')) document.getElementById('set_doctor_bullet4').value = s.doctor_bullet4 || '';
  if (document.getElementById('set_tv_timings')) document.getElementById('set_tv_timings').value = s.tv_timings || '';
  if (document.getElementById('set_tv_notice')) document.getElementById('set_tv_notice').value = s.tv_notice || '';
  if (document.getElementById('set_tv_services')) document.getElementById('set_tv_services').value = s.tv_services || '';
}

async function uploadDoctorPhoto(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const formData = new FormData();
  formData.append('photo', file);

  try {
    toast('⏳ फोटो अपलोड हो रही है...');
    const resp = await fetch('/api/upload/doctor-photo', {
      method: 'POST',
      body: formData
    });
    const res = await resp.json();
    if (res.success && res.photo_url) {
      document.getElementById('set_doctor_photo').value = res.photo_url;
      const prev = document.getElementById('tvDocPhotoPreview');
      if (prev) {
        prev.src = res.photo_url;
        prev.style.display = 'block';
      }
      toast('✅ डॉक्टर की फोटो सफलता से अपलोड हो गई!');
    } else {
      toast(res.message || 'फोटो अपलोड विफल रहा', 'error');
    }
  } catch (err) {
    console.error('Photo upload error:', err);
    toast('फोटो अपलोड करने में त्रुटि आई', 'error');
  }
}

async function saveSettings() {
  const data = {
    clinic_name: document.getElementById('set_clinic_name').value,
    doctor_name: document.getElementById('set_doctor_name').value,
    clinic_address: document.getElementById('set_address').value,
    clinic_phone: document.getElementById('set_phone').value,
    consultation_fee: document.getElementById('set_fee').value,
    wa_token: document.getElementById('set_wa_token').value,
    wa_phone_id: document.getElementById('set_wa_phone_id').value,
    prescription_validity_days: document.getElementById('set_prescription_validity_days') ? document.getElementById('set_prescription_validity_days').value : '14',
    billing_staff_list: document.getElementById('set_billing_staff_list') ? document.getElementById('set_billing_staff_list').value : 'देवेन्द्र (Devendra), रानी (Rani), मोनिका (Monika)',
    doctor_qual: document.getElementById('set_doctor_qual') ? document.getElementById('set_doctor_qual').value : '',
    doctor_role: document.getElementById('set_doctor_role') ? document.getElementById('set_doctor_role').value : '',
    doctor_photo: document.getElementById('set_doctor_photo') ? document.getElementById('set_doctor_photo').value : '',
    doctor_bullet1: document.getElementById('set_doctor_bullet1') ? document.getElementById('set_doctor_bullet1').value : '',
    doctor_bullet2: document.getElementById('set_doctor_bullet2') ? document.getElementById('set_doctor_bullet2').value : '',
    doctor_bullet3: document.getElementById('set_doctor_bullet3') ? document.getElementById('set_doctor_bullet3').value : '',
    doctor_bullet4: document.getElementById('set_doctor_bullet4') ? document.getElementById('set_doctor_bullet4').value : '',
    tv_timings: document.getElementById('set_tv_timings') ? document.getElementById('set_tv_timings').value : '',
    tv_notice: document.getElementById('set_tv_notice') ? document.getElementById('set_tv_notice').value : '',
    tv_services: document.getElementById('set_tv_services') ? document.getElementById('set_tv_services').value : ''
  };
  await fetch('/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
  toast('✅ टीवी और क्लिनिक सेटिंग्स सेव हो गईं!');
}

function openPrintPopup(url, title) {
  const modal = document.getElementById('printModal');
  if (!modal) {
    window.open(url, '_blank');
    return;
  }
  document.getElementById('printModalTitle').textContent = title || '🖨️ पर्चा प्रिंट प्रिव्यू (Prescription Print)';
  const iframe = document.getElementById('printModalFrame');
  iframe.src = url;
  openModal('printModal');
}

function triggerPrintFrame() {
  const iframe = document.getElementById('printModalFrame');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  }
}

async function createBackup() {
  const resp = await fetch('/api/backup', { method: 'POST' });
  const result = await resp.json();
  if (result.success) toast(`✅ बैकअप बना: ${result.backup_file.split('\\').pop()}`);
  else toast('बैकअप त्रुटि', 'error');
}

// ─── AUDIT REPORT ───
async function loadAuditReport() {
  try {
    const data = await fetch('/api/reports/today').then(r => r.json());
    document.getElementById('doc-audit-earned').textContent = '₹' + (data.total_earned || 0);
    document.getElementById('doc-audit-patients').textContent = data.total_patients || 0;
    document.getElementById('doc-audit-cash').textContent = '₹' + (data.cash || 0);
    const cancSum = document.getElementById('doc-audit-cancelled-sum');
    if (cancSum) {
      cancSum.textContent = `${data.cancelled_count || 0} (₹${data.cancelled_amount || 0})`;
    }
    const badge = document.getElementById('docAuditBadge');
    if (badge) badge.textContent = data.cancelled_count || 0;

    const tbody = document.getElementById('docAuditTableBody');
    if (tbody) {
      const list = data.cancelled_list || [];
      if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:22px;color:#16a34a;font-weight:600;">✅ आज कोई भी बिल रद्द नहीं किया गया — सब सुरक्षित है (All Clean)</td></tr>';
      } else {
        tbody.innerHTML = list.map(b => `
          <tr style="background:#fff1f2;">
            <td><strong style="color:#b91c1c;">${b.bill_number}</strong></td>
            <td><strong>${b.patient_name || '-'}</strong></td>
            <td>${b.time || '-'}</td>
            <td><span style="font-weight:700;color:#b91c1c;">₹${b.amount}</span></td>
            <td style="color:#475569;font-size:0.85rem;">${b.desc || '-'}</td>
          </tr>
        `).join('');
      }
    }
  } catch (e) {
    console.error('Audit report load error:', e);
  }
}

