/* doctor.js - Doctor Dashboard Logic */
'use strict';

let currentApptId = null;
let currentVisitId = null;
let currentPatientId = null;
let histCurrentPatientId = null;
let rxCounter = 0;

// ─── INIT ───
window.addEventListener('DOMContentLoaded', () => {
  loadQueue();
  startClock();
  setInterval(loadQueue, 30000);
  // Set default dates for WhatsApp
  const today = new Date().toISOString().split('T')[0];
  ['wa_from','wa_to','wa_reopen'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
});

function startClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  setInterval(() => { el.textContent = new Date().toLocaleTimeString('hi-IN'); }, 1000);
}

// ─── NAV ───
function showSection(name) {
  ['queue','history','whatsapp','settings'].forEach(s => {
    document.getElementById(`section-${s}`).style.display = s === name ? '' : 'none';
    const nav = document.getElementById(`nav-${s}`);
    if (nav) nav.classList.toggle('active', s === name);
  });
  const titles = { queue: 'मरीजों की कतार', history: 'मरीज इतिहास', whatsapp: 'WhatsApp छुट्टी', settings: 'सेटिंग्स' };
  document.getElementById('pageTitle').textContent = titles[name] || name;
  if (name === 'settings') loadSettings();
  if (name === 'whatsapp') { loadEligiblePatients(); loadWaLogs(); }
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

// ─── QUEUE ───
async function loadQueue() {
  const resp = await fetch('/api/queue');
  const queue = await resp.json();
  const el = document.getElementById('queueList');
  document.getElementById('queueCount').textContent = queue.filter(q => q.status === 'waiting' || q.status === 'in_progress').length;

  if (!queue.length) {
    el.innerHTML = '<div class="empty-state"><p>आज कोई मरीज नहीं</p></div>';
    return;
  }
  el.innerHTML = queue.map(a => `
    <div class="queue-item ${currentApptId === a.id ? 'active' : ''}" onclick="openPatient(${a.id}, ${a.patient_id})">
      <div class="token-badge">${a.token}</div>
      <div class="queue-info">
        <div class="queue-name">${a.name}</div>
        <div class="queue-meta">${a.age || '-'} वर्ष &bull; ${a.gender || '-'}</div>
      </div>
      <span class="badge badge-${a.status.replace('_','-')}">${statusLabel(a.status)}</span>
    </div>`).join('');
}

function statusLabel(s) {
  return { waiting: 'प्रतीक्षारत', in_progress: 'जारी', completed: 'पूर्ण', cancelled: 'रद्द' }[s] || s;
}

async function openPatient(apptId, patientId) {
  currentApptId = apptId;
  currentPatientId = patientId;
  loadQueue(); // refresh highlight

  // Check if existing visit
  const queue = await fetch('/api/queue').then(r => r.json());
  const appt = queue.find(a => a.id === apptId);
  if (!appt) return;

  // Load patient info
  const p = await fetch(`/api/patients/${patientId}`).then(r => r.json());
  document.getElementById('visitPatientName').textContent = `${p.name} — टोकन #${appt.token}`;
  document.getElementById('visitPatientMeta').textContent = `${p.age || '-'} वर्ष, ${p.gender || '-'} · ${p.mobile} · ${p.blood_group || ''}`;

  // Show form, hide placeholder
  document.getElementById('visitPlaceholder').style.display = 'none';
  document.getElementById('visitForm').style.display = '';

  // Try to load existing visit
  if (p.visits.length) {
    const latestVisit = p.visits.find(v => {
      // Find today's draft
    });
  }

  // Check if appointment already has a visit from history
  const history = await fetch(`/api/patients/${patientId}/history`).then(r => r.json());
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
  document.getElementById('v_complaints').value = v.complaints || '';
  document.getElementById('v_diagnosis').value = v.diagnosis || '';
  document.getElementById('v_notes').value = v.doctor_notes || '';
  // Load prescriptions
  document.getElementById('rxList').innerHTML = '';
  rxCounter = 0;
  v.prescriptions.forEach(rx => addRxRow(rx));
}

function clearVisitForm() {
  ['v_bp','v_pulse','v_temp','v_weight','v_complaints','v_diagnosis','v_notes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('rxList').innerHTML = '';
  rxCounter = 0;
}

// ─── PRESCRIPTION ───
function addRxRow(data = {}) {
  rxCounter++;
  const idx = rxCounter;
  const el = document.createElement('div');
  el.className = 'rx-row';
  el.id = `rxrow-${idx}`;
  el.innerHTML = `
    <input type="text" class="form-control" placeholder="दवा का नाम" value="${data.medicine_name || ''}" id="rx_name_${idx}">
    <input type="text" class="form-control" placeholder="डोज" value="${data.dose || ''}" id="rx_dose_${idx}">
    <select class="form-control" id="rx_timing_${idx}">
      <option value="morning" ${data.timing==='morning'?'selected':''}>सुबह</option>
      <option value="afternoon" ${data.timing==='afternoon'?'selected':''}>दोपहर</option>
      <option value="night" ${data.timing==='night'?'selected':''}>रात</option>
      <option value="morning-night" ${data.timing==='morning-night'?'selected':''}>सुबह-रात</option>
      <option value="thrice" ${data.timing==='thrice'?'selected':''}>3 बार</option>
      <option value="sos" ${data.timing==='sos'?'selected':''}>जरूरत पर</option>
    </select>
    <input type="number" class="form-control" placeholder="दिन" value="${data.days || ''}" id="rx_days_${idx}" min="1">
    <input type="text" class="form-control" placeholder="खाने से पहले/बाद" value="${data.instructions || ''}" id="rx_inst_${idx}">
    <button class="btn btn-icon btn-danger btn-sm" onclick="removeRxRow(${idx})" title="हटाएं">✕</button>
  `;
  document.getElementById('rxList').appendChild(el);
}

function removeRxRow(idx) {
  const el = document.getElementById(`rxrow-${idx}`);
  if (el) el.remove();
}

function getRxData() {
  const rxRows = document.querySelectorAll('#rxList .rx-row');
  return Array.from(rxRows).map(row => {
    const idx = row.id.split('-')[1];
    return {
      medicine_name: document.getElementById(`rx_name_${idx}`)?.value || '',
      dose: document.getElementById(`rx_dose_${idx}`)?.value || '',
      timing: document.getElementById(`rx_timing_${idx}`)?.value || '',
      days: parseInt(document.getElementById(`rx_days_${idx}`)?.value) || null,
      instructions: document.getElementById(`rx_inst_${idx}`)?.value || ''
    };
  }).filter(r => r.medicine_name);
}

function getVisitData() {
  return {
    appointment_id: currentApptId,
    bp: document.getElementById('v_bp').value,
    pulse: document.getElementById('v_pulse').value,
    temperature: document.getElementById('v_temp').value,
    weight: document.getElementById('v_weight').value,
    complaints: document.getElementById('v_complaints').value,
    diagnosis: document.getElementById('v_diagnosis').value,
    doctor_notes: document.getElementById('v_notes').value,
    prescriptions: getRxData()
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
    toast('✅ विजिट सेव हो गई');
  } else {
    toast('त्रुटि', 'error');
  }
}

async function saveAndPrint() {
  await saveVisit();
  if (currentVisitId) {
    window.open(`/print/prescription/${currentVisitId}`, '_blank');
  }
}

async function finalizeVisit() {
  if (!currentVisitId) {
    await saveVisit();
    if (!currentVisitId) { toast('पहले सेव करें', 'error'); return; }
  }
  if (!confirm('क्या आप इस विजिट को पूर्ण करना चाहते हैं? पूर्ण होने के बाद यह लॉक हो जाएगी।')) return;
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
    document.getElementById('historyModalBody').innerHTML = '<div class="empty-state"><p>कोई पुरानी विजिट नहीं</p></div>';
    return;
  }
  document.getElementById('historyModalBody').innerHTML = history.map(v => `
    <div class="card mb-2">
      <div class="d-flex justify-between align-center mb-1">
        <strong>${v.date}</strong>
        <span class="badge badge-${v.is_finalized ? 'completed' : 'waiting'}">${v.is_finalized ? 'फाइनल' : 'ड्राफ्ट'}</span>
      </div>
      ${v.complaints ? `<div class="text-small"><strong>शिकायतें:</strong> ${v.complaints}</div>` : ''}
      ${v.bp ? `<div class="text-small">BP: ${v.bp} | Pulse: ${v.pulse || '-'} | Temp: ${v.temperature || '-'}</div>` : ''}
      ${v.diagnosis ? `<div class="text-small"><strong>निदान:</strong> ${v.diagnosis}</div>` : ''}
      ${v.doctor_notes ? `<div class="text-small text-muted">${v.doctor_notes}</div>` : ''}
      ${v.prescriptions.length ? `
        <div style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px;">
          <strong style="font-size:0.8rem;">💊 दवाइयाँ:</strong>
          ${v.prescriptions.map(rx => `
            <div class="text-small">• ${rx.medicine_name} ${rx.dose} — ${rx.timing} — ${rx.days || '-'} दिन ${rx.instructions ? '(' + rx.instructions + ')' : ''}</div>
          `).join('')}
        </div>` : ''}
      <div class="d-flex gap-1 mt-1">
        <button class="btn btn-sm btn-outline" onclick="window.open('/print/prescription/${v.visit_id}','_blank')">🖨️ प्रिंट</button>
        ${!v.is_finalized ? `<button class="btn btn-sm btn-primary" onclick="copyPrescription(${v.visit_id})">📋 कॉपी करें</button>` : ''}
      </div>
    </div>`).join('');
}

async function copyPrescription(fromVisitId) {
  if (!currentApptId) { toast('पहले कोई मरीज चुनें (कतार से)', 'error'); return; }
  if (!confirm('इस पर्ची को वर्तमान विजिट में कॉपी करें? डॉक्टर को पुनः समीक्षा करनी होगी।')) return;
  const v = await fetch(`/api/visits/${fromVisitId}`).then(r => r.json());
  // Copy diagnosis and prescriptions, but mark as draft
  document.getElementById('v_diagnosis').value = v.diagnosis || '';
  document.getElementById('v_complaints').value = v.complaints || '';
  document.getElementById('rxList').innerHTML = '';
  rxCounter = 0;
  v.prescriptions.forEach(rx => addRxRow(rx));
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
      <button class="btn btn-sm btn-outline mt-1" onclick="window.open('/print/prescription/${v.visit_id}','_blank')">🖨️ प्रिंट</button>
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

  if (!confirm(`${selected.length} मरीजों को WhatsApp मैसेज भेजना चाहते हैं?`)) return;

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
}

async function saveSettings() {
  const data = {
    clinic_name: document.getElementById('set_clinic_name').value,
    doctor_name: document.getElementById('set_doctor_name').value,
    clinic_address: document.getElementById('set_address').value,
    clinic_phone: document.getElementById('set_phone').value,
    consultation_fee: document.getElementById('set_fee').value,
    wa_token: document.getElementById('set_wa_token').value,
    wa_phone_id: document.getElementById('set_wa_phone_id').value
  };
  await fetch('/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
  toast('✅ सेटिंग्स सेव हो गईं!');
}

async function createBackup() {
  const resp = await fetch('/api/backup', { method: 'POST' });
  const result = await resp.json();
  if (result.success) toast(`✅ बैकअप बना: ${result.backup_file.split('\\').pop()}`);
  else toast('बैकअप त्रुटि', 'error');
}
