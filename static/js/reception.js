/* reception.js - Reception Dashboard Logic */
'use strict';

let currentPatientId = null;
let currentApptPatientId = null;
let currentBillPatientId = null;
let currentBillId = null;
let searchTimeout = null;

// ─── INIT ───
window.addEventListener('DOMContentLoaded', () => {
  setTodayDates();
  loadDashboard();
  startClock();
  // Auto-refresh queue every 30 seconds
  setInterval(loadDashboard, 30000);
});

function setTodayDates() {
  const today = new Date().toISOString().split('T')[0];
  if (document.getElementById('apptDate')) document.getElementById('apptDate').value = today;
  if (document.getElementById('repFrom')) document.getElementById('repFrom').value = today;
  if (document.getElementById('repTo')) document.getElementById('repTo').value = today;
}

function startClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  setInterval(() => {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('hi-IN');
  }, 1000);
}

// ─── NAV ───
function showSection(name) {
  const sections = ['dashboard', 'patients', 'appointments', 'queue', 'billing', 'reports'];
  sections.forEach(s => {
    document.getElementById(`section-${s}`).style.display = s === name ? '' : 'none';
    const nav = document.getElementById(`nav-${s}`);
    if (nav) nav.classList.toggle('active', s === name);
  });
  const titles = { dashboard: 'डैशबोर्ड', patients: 'मरीज', appointments: 'अपॉइंटमेंट', queue: 'कतार', billing: 'बिलिंग', reports: 'रिपोर्ट' };
  document.getElementById('pageTitle').textContent = titles[name] || name;
  if (name === 'patients') loadPatients();
  if (name === 'appointments') loadQueue();
  if (name === 'queue') loadQueue();
  if (name === 'reports') loadTodayReport();
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
  setTimeout(() => d.remove(), 3500);
}

// ─── MODAL ───
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function showConfirmDialog({ title = 'पुष्टि करें', message = 'क्या आप जारी रखना चाहते हैं?', icon = '⚠️', okText = 'हाँ, करें', cancelText = 'रद्द करें (Cancel)', okClass = 'btn-danger' } = {}) {
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

// ─── DASHBOARD ───
async function loadDashboard() {
  try {
    const [report, queue] = await Promise.all([
      fetch('/api/reports/today').then(r => r.json()),
      fetch('/api/queue').then(r => r.json())
    ]);
    document.getElementById('stat-patients').textContent = report.total_patients;
    document.getElementById('stat-completed').textContent = report.completed;
    document.getElementById('stat-waiting').textContent = report.total_patients - report.completed;
    document.getElementById('stat-earning').textContent = '₹' + report.total_earned;
    // Dashboard queue preview (first 5)
    const el = document.getElementById('dashboardQueue');
    if (!queue.length) {
      el.innerHTML = '<div class="empty-state"><p>आज कोई मरीज नहीं</p></div>';
      return;
    }
    el.innerHTML = queue.slice(0, 5).map(a => `
      <div class="queue-item">
        <div class="token-badge">${a.token}</div>
        <div class="queue-info">
          <div class="queue-name">${a.name}</div>
          <div class="queue-meta">${a.mobile} · ${a.age || '-'} वर्ष · ${a.gender || '-'}</div>
        </div>
        <span class="badge badge-${a.status.replace('_','-')}">${statusLabel(a.status)}</span>
      </div>`).join('');
  } catch(e) { console.error(e); }
}

function statusLabel(s) {
  return { waiting: 'प्रतीक्षारत', in_progress: 'जारी', completed: 'पूर्ण', cancelled: 'रद्द' }[s] || s;
}

// ─── PATIENTS ───
async function loadPatients(q = '') {
  const resp = await fetch(`/api/patients?q=${encodeURIComponent(q)}`);
  const patients = await resp.json();
  const tbody = document.getElementById('patientTableBody');
  if (!patients.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:20px;">कोई मरीज नहीं मिला</td></tr>';
    return;
  }
  tbody.innerHTML = patients.map(p => `
    <tr>
      <td>${p.id}</td>
      <td><strong>${p.name}</strong></td>
      <td>${p.mobile}</td>
      <td>${p.age || '-'} / ${p.gender || '-'}</td>
      <td>${p.blood_group || '-'}</td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="viewPatient(${p.id})">👁️ देखें</button>
        <button class="btn btn-sm btn-primary" onclick="quickBook(${p.id}, '${p.name}', '${p.mobile}')">📋 बुक</button>
      </td>
    </tr>`).join('');
}

function searchPatients(q) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => loadPatients(q), 300);
}

async function viewPatient(pid) {
  currentPatientId = pid;
  openModal('patientDetailModal');
  document.getElementById('patientDetailBody').innerHTML = '<div class="loading"><div class="spinner"></div> लोड...</div>';
  const p = await fetch(`/api/patients/${pid}`).then(r => r.json());
  document.getElementById('bookFromDetailBtn').dataset.pid = pid;
  document.getElementById('bookFromDetailBtn').dataset.pname = p.name;
  document.getElementById('bookFromDetailBtn').dataset.pmobile = p.mobile;
  document.getElementById('patientDetailBody').innerHTML = `
    <div class="form-row">
      <div><strong>नाम:</strong> ${p.name}</div>
      <div><strong>मोबाइल:</strong> ${p.mobile}</div>
    </div>
    <div class="form-row mt-1">
      <div><strong>उम्र:</strong> ${p.age || '-'} वर्ष</div>
      <div><strong>लिंग:</strong> ${p.gender || '-'}</div>
    </div>
    <div class="form-row mt-1">
      <div><strong>ब्लड ग्रुप:</strong> ${p.blood_group || '-'}</div>
      <div><strong>पता:</strong> ${p.address || '-'}</div>
    </div>
    <div class="mt-1"><strong>पंजीकरण तिथि:</strong> ${p.created_at}</div>
    <hr class="divider">
    <div class="card-title mb-1">📋 पुरानी विजिट</div>
    ${p.visits.length ? p.visits.map(v => `
      <div class="queue-item" style="cursor:default;">
        <div class="queue-info">
          <div class="queue-name">${v.date} — ${v.diagnosis || 'जांच'}</div>
          <div class="queue-meta">${v.is_finalized ? '✅ फाइनलाइज्ड' : '📝 ड्राफ्ट'}</div>
        </div>
      </div>`).join('') : '<div class="empty-state"><p>कोई पुरानी विजिट नहीं</p></div>'}
  `;
}

function bookFromDetail() {
  const btn = document.getElementById('bookFromDetailBtn');
  closeModal('patientDetailModal');
  quickBook(parseInt(btn.dataset.pid), btn.dataset.pname, btn.dataset.pmobile);
}

function quickBook(pid, name, mobile) {
  showSection('appointments');
  currentApptPatientId = pid;
  document.getElementById('selectedPatientName').textContent = name;
  document.getElementById('selectedPatientMobile').textContent = mobile;
  document.getElementById('selectedPatientCard').style.display = '';
  document.getElementById('bookApptBtn').disabled = false;
}

function clearSelectedPatient() {
  currentApptPatientId = null;
  document.getElementById('selectedPatientCard').style.display = 'none';
  document.getElementById('bookApptBtn').disabled = true;
  document.getElementById('apptSearch').value = '';
}

// ─── PATIENT MODAL ───
function openNewPatientModal() {
  ['np_name','np_mobile','np_age','np_address','np_block'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('np_gender').value = '';
  document.getElementById('np_blood').value = '';
  document.getElementById('np_district').value = '';
  document.getElementById('np_state').value = 'Madhya Pradesh';
  document.getElementById('np_wa').checked = true;
  openModal('newPatientModal');
}

async function saveNewPatient() {
  const name = document.getElementById('np_name').value.trim();
  const mobile = document.getElementById('np_mobile').value.trim();
  if (!name || !mobile) { toast('नाम और मोबाइल जरूरी है', 'error'); return; }
  if (mobile.length !== 10) { toast('10 अंकों का मोबाइल नंबर दर्ज करें', 'error'); return; }
  const data = {
    name, mobile,
    age: document.getElementById('np_age').value || null,
    gender: document.getElementById('np_gender').value,
    blood_group: document.getElementById('np_blood').value,
    address: document.getElementById('np_address').value,
    state: document.getElementById('np_state').value || 'Madhya Pradesh',
    district: document.getElementById('np_district').value,
    block: document.getElementById('np_block').value,
    whatsapp_consent: document.getElementById('np_wa').checked
  };
  const resp = await fetch('/api/patients', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
  const result = await resp.json();
  if (result.success) {
    toast('✅ मरीज सफलतापूर्वक दर्ज किया गया!');
    closeModal('newPatientModal');
    loadPatients();
    // Offer to book
    quickBook(result.patient_id, name, mobile);
    showSection('appointments');
  } else {
    toast(result.message || 'त्रुटि हुई', 'error');
    if (result.patient_id) {
      // Already exists
      quickBook(result.patient_id, name, mobile);
      closeModal('newPatientModal');
      showSection('appointments');
    }
  }
}

// ─── APPOINTMENTS ───
async function searchApptPatient(q) {
  if (!q.trim()) { document.getElementById('apptSearchResults').style.display = 'none'; return; }
  const patients = await fetch(`/api/patients?q=${encodeURIComponent(q)}`).then(r => r.json());
  const el = document.getElementById('apptSearchResults');
  if (!patients.length) { el.innerHTML = '<div style="padding:10px;color:var(--text2);">कोई मरीज नहीं मिला</div>'; el.style.display = ''; return; }
  el.style.display = '';
  el.innerHTML = patients.map(p => `
    <div style="padding:10px;cursor:pointer;border-bottom:1px solid var(--border);" onmousedown="selectApptPatient(${p.id},'${p.name}','${p.mobile}')">
      <strong>${p.name}</strong> &nbsp;<span style="color:var(--text2);">${p.mobile}</span>
    </div>`).join('');
}

function selectApptPatient(pid, name, mobile) {
  currentApptPatientId = pid;
  document.getElementById('selectedPatientName').textContent = name;
  document.getElementById('selectedPatientMobile').textContent = mobile;
  document.getElementById('selectedPatientCard').style.display = '';
  document.getElementById('bookApptBtn').disabled = false;
  document.getElementById('apptSearch').value = '';
  document.getElementById('apptSearchResults').style.display = 'none';
}

async function bookAppointment() {
  if (!currentApptPatientId) { toast('पहले मरीज चुनें', 'error'); return; }
  const date = document.getElementById('apptDate').value;
  const notes = document.getElementById('apptNotes').value;
  const resp = await fetch('/api/appointments', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ patient_id: currentApptPatientId, date, notes })
  });
  const result = await resp.json();
  if (result.success) {
    toast(`✅ टोकन नंबर: ${result.token} — अपॉइंटमेंट बुक हो गया!`);
    clearSelectedPatient();
    document.getElementById('apptNotes').value = '';
    loadQueue();
  } else {
    toast(result.message || 'त्रुटि', 'error');
  }
}

// ─── QUEUE ───
async function loadQueue() {
  const resp = await fetch('/api/queue');
  const queue = await resp.json();
  const el = document.getElementById('queueList');
  const tbody = document.getElementById('apptTableBody');
  if (!queue.length) {
    const empty = '<div class="empty-state"><p>आज कोई मरीज नहीं</p></div>';
    if (el) el.innerHTML = empty;
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text2);padding:20px;">कोई अपॉइंटमेंट नहीं</td></tr>`;
    return;
  }
  if (el) {
    el.innerHTML = queue.map(a => `
      <div class="queue-item">
        <div class="token-badge">${a.token}</div>
        <div class="queue-info">
          <div class="queue-name">${a.name}</div>
          <div class="queue-meta">${a.mobile} &bull; ${a.age || '-'} वर्ष &bull; ${a.gender || '-'}</div>
          ${a.notes ? `<div class="queue-meta">📝 ${a.notes}</div>` : ''}
        </div>
        <span class="badge badge-${a.status.replace('_','-')}">${statusLabel(a.status)}</span>
        <div class="queue-actions">
          <button class="btn btn-sm btn-outline" onclick="cancelAppt(${a.id})" title="रद्द करें" ${a.status==='completed'||a.status==='cancelled'?'disabled':''}>❌</button>
          <button class="btn btn-sm btn-primary" onclick="quickBill(${a.patient_id}, '${a.name}', ${a.id})" title="बिल बनाएं">💳</button>
        </div>
      </div>`).join('');
  }
  if (tbody) {
    tbody.innerHTML = queue.map(a => `
      <tr>
        <td><div class="token-badge">${a.token}</div></td>
        <td><strong>${a.name}</strong></td>
        <td>${a.mobile}</td>
        <td><span class="badge badge-${a.status.replace('_','-')}">${statusLabel(a.status)}</span></td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="cancelAppt(${a.id})" ${a.status==='completed'||a.status==='cancelled'?'disabled':''}>रद्द</button>
          <button class="btn btn-sm btn-primary" onclick="quickBill(${a.patient_id}, '${a.name}', ${a.id})">💳 बिल</button>
        </td>
      </tr>`).join('');
  }
}

async function cancelAppt(id) {
  const ok = await showConfirmDialog({
    title: 'अपॉइंटमेंट रद्द करें?',
    message: 'क्या आप वाकई इस अपॉइंटमेंट को रद्द (Cancel) करना चाहते हैं?',
    icon: '❌',
    okText: 'हाँ, रद्द करें',
    cancelText: 'रद्द न करें (Back)',
    okClass: 'btn-danger'
  });
  if (!ok) return;
  await fetch(`/api/appointments/${id}/cancel`, { method: 'POST' });
  toast('अपॉइंटमेंट रद्द किया गया', 'info');
  loadQueue();
}

// ─── BILLING ───
function calcBill() {
  const cf = parseFloat(document.getElementById('billConsultFee').value) || 0;
  const ex = parseFloat(document.getElementById('billExtraCharge').value) || 0;
  const disc = parseFloat(document.getElementById('billDiscount').value) || 0;
  const paid = parseFloat(document.getElementById('billAmtPaid').value) || 0;
  const total = cf + ex - disc;
  const balance = total - paid;
  document.getElementById('billTotal').textContent = '₹' + total;
  document.getElementById('billBalance').textContent = '₹' + Math.max(0, balance);
}

async function searchBillPatient(q) {
  if (!q.trim()) { document.getElementById('billSearchResults').style.display = 'none'; return; }
  const patients = await fetch(`/api/patients?q=${encodeURIComponent(q)}`).then(r => r.json());
  const el = document.getElementById('billSearchResults');
  if (!patients.length) { el.innerHTML = '<div style="padding:10px;color:var(--text2);">कोई मरीज नहीं मिला</div>'; el.style.display=''; return; }
  el.style.display = '';
  el.innerHTML = patients.map(p => `
    <div style="padding:10px;cursor:pointer;border-bottom:1px solid var(--border);" onmousedown="selectBillPatient(${p.id},'${p.name}','${p.mobile}')">
      <strong>${p.name}</strong> &nbsp;<span style="color:var(--text2);">${p.mobile}</span>
    </div>`).join('');
}

function selectBillPatient(pid, name, mobile) {
  currentBillPatientId = pid;
  document.getElementById('billPatientName').textContent = name;
  document.getElementById('billPatientMobile').textContent = mobile;
  document.getElementById('billPatientInfo').style.display = '';
  document.getElementById('billPatientSearch').value = '';
  document.getElementById('billSearchResults').style.display = 'none';
  document.getElementById('createBillBtn').disabled = false;
  loadPatientBills(pid);
  // Load default consultation fee from settings
  fetch('/api/settings').then(r=>r.json()).then(s => {
    if (s.consultation_fee) document.getElementById('billConsultFee').value = s.consultation_fee;
    calcBill();
  });
}

function quickBill(pid, name, apptId) {
  showSection('billing');
  currentBillPatientId = pid;
  currentApptForBill = apptId;
  document.getElementById('billPatientName').textContent = name;
  document.getElementById('billPatientInfo').style.display = '';
  document.getElementById('createBillBtn').disabled = false;
  loadPatientBills(pid);
  fetch('/api/settings').then(r=>r.json()).then(s => {
    if (s.consultation_fee) document.getElementById('billConsultFee').value = s.consultation_fee;
    calcBill();
  });
}
let currentApptForBill = null;

async function loadPatientBills(pid) {
  const bills = await fetch(`/api/bills/patient/${pid}`).then(r => r.json());
  const el = document.getElementById('recentBillsList');
  if (!bills.length) { el.innerHTML = '<div class="empty-state"><p>कोई बिल नहीं</p></div>'; return; }
  el.innerHTML = bills.map(b => `
    <div class="queue-item" style="cursor:default;">
      <div class="queue-info">
        <div class="queue-name">${b.bill_number}</div>
        <div class="queue-meta">${b.created_at} &bull; ₹${b.total_amount} &bull; ${b.payment_mode.toUpperCase()}</div>
      </div>
      <span class="badge badge-${b.status}">${b.status === 'paid' ? 'पेड' : b.status === 'partial' ? 'बकाया' : b.status === 'cancelled' ? 'रद्द' : 'रिफंड'}</span>
      <div class="d-flex gap-1 align-center">
        <button class="btn btn-sm btn-outline" onclick="window.open('/print/bill/${b.id}','_blank')" title="प्रिंट">🖨️</button>
        ${b.status !== 'cancelled' ? `<button class="btn btn-sm btn-danger" onclick="cancelBillPrompt(${b.id}, '${b.bill_number}')" title="रद्द करें (डॉक्टर पिन जरूरी)">❌</button>` : ''}
      </div>
    </div>`).join('');
}

async function cancelBillPrompt(bid, billNum) {
  const reason = prompt(`बिल ${billNum} रद्द करने का कारण लिखें (Reason for cancellation):`);
  if (!reason) return;
  const pin = prompt(`डॉक्टर की सुरक्षा पिन दर्ज करें (Doctor Security PIN - Default 1234):`);
  if (!pin) return;

  try {
    const resp = await fetch(`/api/bills/${bid}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason, doctor_pin: pin })
    });
    const res = await resp.json();
    if (res.success) {
      toast(`✅ ${res.message}`);
      if (currentBillPatientId) loadPatientBills(currentBillPatientId);
      loadTodayReport();
    } else {
      toast(res.message || 'बिल रद्द नहीं हुआ', 'error');
    }
  } catch (e) {
    toast('सर्वर त्रुटि', 'error');
  }
}

async function createBill() {
  if (!currentBillPatientId) { toast('मरीज चुनें', 'error'); return; }
  const cf = parseFloat(document.getElementById('billConsultFee').value) || 0;
  const ex = parseFloat(document.getElementById('billExtraCharge').value) || 0;
  const disc = parseFloat(document.getElementById('billDiscount').value) || 0;
  const paid = parseFloat(document.getElementById('billAmtPaid').value) || 0;
  const data = {
    patient_id: currentBillPatientId,
    appointment_id: currentApptForBill,
    consultation_fee: cf,
    extra_charges: ex,
    extra_charge_desc: document.getElementById('billExtraDesc').value,
    discount: disc,
    amount_paid: paid,
    payment_mode: document.getElementById('billPayMode').value
  };
  const resp = await fetch('/api/bills', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
  const result = await resp.json();
  if (result.success) {
    currentBillId = result.bill_id;
    toast(`✅ बिल ${result.bill_number} बना!`);
    document.getElementById('billSuccessBody').innerHTML = `
      <div style="text-align:center;padding:20px;">
        <div style="font-size:2.5rem;margin-bottom:12px;">🧾</div>
        <div style="font-size:1.2rem;font-weight:700;color:var(--primary);">${result.bill_number}</div>
        <div style="font-size:0.9rem;color:var(--text2);margin-top:8px;">बिल सफलतापूर्वक बना लिया गया</div>
      </div>`;
    openModal('billSuccessModal');
    loadPatientBills(currentBillPatientId);
  } else if (result.is_duplicate) {
    const ok = await showConfirmDialog({
      title: 'बिल पहले से मौजूद है',
      message: `${result.message}\n\nक्या आप वाकई इस मरीज के लिए दूसरा नया बिल बनाना चाहते हैं?`,
      icon: '🧾',
      okText: 'हाँ, नया बिल बनाएं',
      cancelText: 'रद्द करें',
      okClass: 'btn-warning'
    });
    if (ok) {
      data.force_duplicate = true;
      const retryResp = await fetch('/api/bills', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
      const retryResult = await retryResp.json();
      if (retryResult.success) {
        currentBillId = retryResult.bill_id;
        toast(`✅ बिल ${retryResult.bill_number} बना!`);
        openModal('billSuccessModal');
        loadPatientBills(currentBillPatientId);
      } else {
        toast(retryResult.message || 'त्रुटि हुई', 'error');
      }
    }
  } else {
    toast(result.message || 'त्रुटि हुई', 'error');
  }
}

function printBill() {
  if (currentBillId) window.open(`/print/bill/${currentBillId}`, '_blank');
  closeModal('billSuccessModal');
}

// ─── REPORTS ───
async function loadTodayReport() {
  const data = await fetch('/api/reports/today').then(r => r.json());
  document.getElementById('rep-earned').textContent = '₹' + data.total_earned;
  document.getElementById('rep-bills').textContent = data.bills_count;
  document.getElementById('rep-cash').textContent = '₹' + data.cash;
  document.getElementById('rep-upi').textContent = '₹' + data.upi;
  const cancEl = document.getElementById('rep-cancelled');
  if (cancEl) {
    cancEl.textContent = `${data.cancelled_count || 0} (₹${data.cancelled_amount || 0})`;
  }
}

async function loadRangeReport() {
  const from = document.getElementById('repFrom').value;
  const to = document.getElementById('repTo').value;
  const data = await fetch(`/api/reports/range?from=${from}&to=${to}`).then(r => r.json());
  document.getElementById('rangeReportResult').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card blue"><div class="stat-value">₹${data.total_earned}</div><div class="stat-label">कुल कमाई</div></div>
      <div class="stat-card green"><div class="stat-value">${data.bills_count}</div><div class="stat-label">बिल</div></div>
      <div class="stat-card orange"><div class="stat-value">₹${data.cash}</div><div class="stat-label">Cash</div></div>
      <div class="stat-card red"><div class="stat-value">₹${data.upi}</div><div class="stat-label">UPI</div></div>
    </div>`;
}
