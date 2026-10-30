# -*- coding: utf-8 -*-
"""
Dr. Dhakad Clinic Management Software
=====================================
Main Flask application with all routes and logic.
"""

from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_file
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, date, timedelta
from functools import wraps
import json, os, shutil, requests

app = Flask(__name__)
app.secret_key = 'dhakad-clinic-secret-2024'
os.makedirs(app.instance_path, exist_ok=True)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///clinic.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# ─────────────────────────────────────────────
# DATABASE MODELS
# ─────────────────────────────────────────────

class BaseModel(db.Model):
    __abstract__ = True
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)

class User(BaseModel):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # 'doctor' or 'reception'
    name = db.Column(db.String(100))

    def set_password(self, pw): self.password_hash = generate_password_hash(pw)
    def check_password(self, pw): return check_password_hash(self.password_hash, pw)


class Patient(BaseModel):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    mobile = db.Column(db.String(15), nullable=False)
    age = db.Column(db.Integer)
    gender = db.Column(db.String(10))
    address = db.Column(db.String(250))
    blood_group = db.Column(db.String(5))
    state = db.Column(db.String(100), default='Madhya Pradesh')
    district = db.Column(db.String(100))
    block = db.Column(db.String(100))
    whatsapp_consent = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    appointments = db.relationship('Appointment', backref='patient', lazy=True)
    bills = db.relationship('Bill', backref='patient', lazy=True)


class Appointment(BaseModel):
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey('patient.id'), nullable=False)
    token_number = db.Column(db.Integer, nullable=False)
    appointment_date = db.Column(db.Date, default=date.today)
    status = db.Column(db.String(20), default='waiting')  # waiting, in_progress, completed, cancelled
    is_priority = db.Column(db.Boolean, default=False)    # Priority / Urgent insertion
    is_followup = db.Column(db.Boolean, default=False)    # 14-day free follow-up
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    visit = db.relationship('Visit', backref='appointment', uselist=False)


class Visit(BaseModel):
    id = db.Column(db.Integer, primary_key=True)
    appointment_id = db.Column(db.Integer, db.ForeignKey('appointment.id'), nullable=False)
    patient_id = db.Column(db.Integer, db.ForeignKey('patient.id'), nullable=False)
    complaints = db.Column(db.Text)
    bp = db.Column(db.String(20))
    pulse = db.Column(db.String(20))
    weight = db.Column(db.String(20))
    temperature = db.Column(db.String(20))
    spo2 = db.Column(db.String(20))
    diagnosis = db.Column(db.Text)
    doctor_notes = db.Column(db.Text)
    follow_up = db.Column(db.String(50))
    prescriptions = db.relationship('Prescription', backref='visit', lazy=True)
    visit_date = db.Column(db.DateTime, default=datetime.utcnow)
    is_finalized = db.Column(db.Boolean, default=False)


class Prescription(BaseModel):
    id = db.Column(db.Integer, primary_key=True)
    visit_id = db.Column(db.Integer, db.ForeignKey('visit.id'), nullable=False)
    medicine_name = db.Column(db.String(150))
    dose = db.Column(db.String(80))
    timing = db.Column(db.String(80))
    days = db.Column(db.String(50))
    instructions = db.Column(db.String(200))


class Medicine(BaseModel):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), unique=True, nullable=False)
    default_dose = db.Column(db.String(80), default='1-0-1 (सुबह-शाम)')
    default_timing = db.Column(db.String(80), default='खाने के बाद (After Food)')
    default_duration = db.Column(db.String(50), default='5 Days')
    default_instructions = db.Column(db.String(200), default='')
    usage_count = db.Column(db.Integer, default=1)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Bill(BaseModel):
    id = db.Column(db.Integer, primary_key=True)
    bill_number = db.Column(db.String(20), unique=True, nullable=False)
    patient_id = db.Column(db.Integer, db.ForeignKey('patient.id'), nullable=False)
    appointment_id = db.Column(db.Integer, db.ForeignKey('appointment.id'))
    consultation_fee = db.Column(db.Float, default=0)
    extra_charges = db.Column(db.Float, default=0)
    extra_charge_desc = db.Column(db.String(200))
    discount = db.Column(db.Float, default=0)
    total_amount = db.Column(db.Float, default=0)
    amount_paid = db.Column(db.Float, default=0)
    balance = db.Column(db.Float, default=0)
    payment_mode = db.Column(db.String(20))   # cash, upi, card
    collected_by = db.Column(db.String(100), default='देवेन्द्र (Devendra)') # Staff cashier
    refund = db.Column(db.Float, default=0)
    status = db.Column(db.String(20), default='paid')  # paid, partial, refunded
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class WhatsAppLog(BaseModel):
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey('patient.id'))
    mobile = db.Column(db.String(15))
    message = db.Column(db.Text)
    status = db.Column(db.String(20), default='pending')  # sent, failed, pending
    sent_at = db.Column(db.DateTime)
    batch_id = db.Column(db.String(50))


class Settings(BaseModel):
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(50), unique=True)
    value = db.Column(db.Text)


# ─────────────────────────────────────────────
# AUTH HELPERS
# ─────────────────────────────────────────────

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated

def role_required(role):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if 'user_id' not in session:
                return redirect(url_for('login'))
            if session.get('role') != role:
                return jsonify({'error': 'Unauthorized'}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator

def get_setting(key, default=''):
    try:
        s = Settings.query.filter_by(key=key).first()
        return s.value if s else default
    except Exception:
        return default

def set_setting(key, value):
    s = Settings.query.filter_by(key=key).first()
    if s:
        s.value = value
    else:
        db.session.add(Settings(key=key, value=value))
    db.session.commit()

def next_bill_number():
    today = date.today().strftime('%Y%m%d')
    last = Bill.query.filter(Bill.bill_number.like(f'B{today}%')).order_by(Bill.id.desc()).first()
    if last:
        seq = int(last.bill_number[-3:]) + 1
    else:
        seq = 1
    return f'B{today}{seq:03d}'

def next_token():
    today = date.today()
    last = Appointment.query.filter_by(appointment_date=today).order_by(Appointment.token_number.desc()).first()
    return (last.token_number + 1) if last else 1


# ─────────────────────────────────────────────
# ROUTES: AUTH
# ─────────────────────────────────────────────

@app.route('/favicon.ico')
def favicon():
    return '', 204

@app.route('/')
def index():
    if 'user_id' in session:
        if session['role'] == 'doctor':
            return redirect(url_for('doctor_dashboard'))
        return redirect(url_for('reception_dashboard'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        data = request.json or request.form
        user = User.query.filter_by(username=data.get('username')).first()
        if user and user.check_password(data.get('password')):
            session['user_id'] = user.id
            session['role'] = user.role
            session['name'] = user.name
            return jsonify({'success': True, 'role': user.role})
        return jsonify({'success': False, 'message': 'गलत उपयोगकर्ता नाम या पासवर्ड'})
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


# ─────────────────────────────────────────────
# ROUTES: RECEPTION
# ─────────────────────────────────────────────

@app.route('/reception')
@login_required
def reception_dashboard():
    return render_template('reception.html', user_name=session.get('name'), role=session.get('role'))

@app.route('/api/patients', methods=['GET'])
@login_required
def get_patients():
    q = request.args.get('q', '')
    if q:
        patients = Patient.query.filter(
            (Patient.name.ilike(f'%{q}%')) | (Patient.mobile.ilike(f'%{q}%'))
        ).limit(20).all()
    else:
        patients = Patient.query.order_by(Patient.id.desc()).limit(50).all()
    return jsonify([{
        'id': p.id, 'name': p.name, 'mobile': p.mobile,
        'age': p.age, 'gender': p.gender, 'blood_group': p.blood_group
    } for p in patients])

@app.route('/api/patients', methods=['POST'])
@login_required
def add_patient():
    data = request.json or {}
    name = (data.get('name') or '').strip()
    mobile = (data.get('mobile') or '').strip()
    if not name:
        return jsonify({'success': False, 'message': 'मरीज का नाम दर्ज करना अनिवार्य है'}), 400
    if len(mobile) != 10 or not mobile.isdigit():
        return jsonify({'success': False, 'message': 'मोबाइल नंबर केवल 10 अंकों का (संख्यात्मक) होना अनिवार्य है'}), 400

    # Exact match: same name and same mobile number
    exact_match = Patient.query.filter(
        Patient.mobile == mobile,
        db.func.lower(Patient.name) == name.lower()
    ).first()
    if exact_match:
        return jsonify({
            'success': False,
            'is_duplicate': True,
            'message': f'मरीज "{name}" (मोबाइल: {mobile}) पहले से दर्ज है!',
            'patient_id': exact_match.id
        })

    # Shared mobile check: family members sharing the same mobile number
    family = Patient.query.filter_by(mobile=mobile).all()
    if family and not data.get('force_new'):
        family_str = ", ".join([f"{p.name} ({p.age or '-'} वर्ष)" for p in family])
        return jsonify({
            'success': False,
            'is_family_prompt': True,
            'message': f'यह मोबाइल नंबर ({mobile}) पहले से परिवार के सदस्य के रूप में दर्ज है:\n• {family_str}\n\nक्या आप इसी नंबर पर नया पारिवारिक सदस्य "{name}" जोड़ना चाहते हैं?'
        })

    p = Patient(
        name=name, mobile=mobile,
        age=data.get('age'), gender=data.get('gender'),
        address=data.get('address', ''), blood_group=data.get('blood_group', ''),
        state=data.get('state', 'Madhya Pradesh'),
        district=data.get('district', ''),
        block=data.get('block', ''),
        whatsapp_consent=data.get('whatsapp_consent', True)
    )
    db.session.add(p)
    db.session.commit()
    return jsonify({'success': True, 'patient_id': p.id})

@app.route('/api/patients/<int:pid>/prescription-status', methods=['GET'])
@login_required
def patient_prescription_status(pid):
    p = Patient.query.get_or_404(pid)
    validity_days = int(get_setting('prescription_validity_days', '14'))
    last_visit = Visit.query.filter_by(patient_id=pid).order_by(Visit.visit_date.desc()).first()
    if not last_visit:
        last_appt = Appointment.query.filter_by(patient_id=pid).order_by(Appointment.appointment_date.desc()).first()
        last_date = last_appt.appointment_date if last_appt else None
    else:
        last_date = last_visit.visit_date.date()

    fee_setting = int(get_setting('consultation_fee', '300'))
    if not last_date:
        return jsonify({
            'has_previous': False,
            'is_valid': False,
            'days_ago': None,
            'is_free': False,
            'fee': fee_setting,
            'badge': 'नया मरीज (First Visit) — परामर्श शुल्क लागू'
        })

    days_ago = (date.today() - last_date).days
    is_valid = (days_ago <= validity_days)
    return jsonify({
        'has_previous': True,
        'is_valid': is_valid,
        'days_ago': days_ago,
        'is_free': is_valid,
        'last_date': last_date.strftime('%d-%m-%Y'),
        'fee': 0 if is_valid else fee_setting,
        'badge': f'🟢 मान्य पर्चा ({days_ago} दिन पूर्व) — फॉलो-अप फ्री (₹0)' if is_valid else f'🔴 पर्चा समाप्त ({days_ago} दिन पूर्व) — नया परामर्श शुल्क'
    })

@app.route('/api/patients/<int:pid>', methods=['GET'])
@login_required
def get_patient(pid):
    p = Patient.query.get_or_404(pid)
    visits = []
    for appt in p.appointments:
        if appt.visit:
            v = appt.visit
            visits.append({
                'date': appt.appointment_date.strftime('%d-%m-%Y'),
                'diagnosis': v.diagnosis,
                'visit_id': v.id,
                'is_finalized': v.is_finalized
            })
    return jsonify({
        'id': p.id, 'name': p.name, 'mobile': p.mobile,
        'age': p.age, 'gender': p.gender, 'address': p.address,
        'blood_group': p.blood_group, 'whatsapp_consent': p.whatsapp_consent,
        'state': p.state or 'Madhya Pradesh',
        'district': p.district or '',
        'block': p.block or '',
        'created_at': p.created_at.strftime('%d-%m-%Y'),
        'visits': visits
    })

@app.route('/api/patients/<int:pid>', methods=['PUT'])
@login_required
def update_patient(pid):
    p = Patient.query.get_or_404(pid)
    data = request.json or {}
    mobile = (data.get('mobile') or '').strip()
    if mobile and (len(mobile) != 10 or not mobile.isdigit()):
        return jsonify({'success': False, 'message': 'मोबाइल नंबर केवल 10 अंकों का होना अनिवार्य है'}), 400
    p.name = data.get('name', p.name)
    if mobile: p.mobile = mobile
    p.age = data.get('age', p.age)
    p.gender = data.get('gender', p.gender)
    p.address = data.get('address', p.address)
    p.blood_group = data.get('blood_group', p.blood_group)
    p.whatsapp_consent = data.get('whatsapp_consent', p.whatsapp_consent)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/appointments', methods=['POST'])
@login_required
def book_appointment():
    data = request.json or {}
    pid = data.get('patient_id')
    appt_date = date.fromisoformat(data.get('date', date.today().isoformat()))
    # Check if already booked today
    existing = Appointment.query.filter_by(patient_id=pid, appointment_date=appt_date).first()
    if existing:
        return jsonify({'success': False, 'message': 'मरीज का आज के लिए अपॉइंटमेंट पहले से है', 'token': existing.token_number})
    token = next_token()
    appt = Appointment(
        patient_id=pid,
        token_number=token,
        appointment_date=appt_date,
        is_priority=bool(data.get('is_priority', False)),
        is_followup=bool(data.get('is_followup', False)),
        notes=data.get('notes', '')
    )
    db.session.add(appt)
    db.session.commit()
    return jsonify({'success': True, 'token': token, 'appointment_id': appt.id})

@app.route('/api/appointments/<int:aid>/toggle-priority', methods=['POST'])
@login_required
def toggle_appointment_priority(aid):
    a = Appointment.query.get_or_404(aid)
    a.is_priority = not bool(a.is_priority)
    db.session.commit()
    return jsonify({'success': True, 'is_priority': a.is_priority, 'token': a.token_number})

@app.route('/api/queue', methods=['GET'])
@login_required
def get_queue():
    today = date.today()
    appts = Appointment.query.filter_by(appointment_date=today).order_by(
        Appointment.is_priority.desc(),
        Appointment.token_number.asc()
    ).all()
    result = []
    for a in appts:
        result.append({
            'id': a.id,
            'token': a.token_number,
            'patient_id': a.patient.id,
            'name': a.patient.name,
            'mobile': a.patient.mobile,
            'age': a.patient.age,
            'gender': a.patient.gender,
            'status': a.status,
            'is_priority': bool(a.is_priority),
            'is_followup': bool(a.is_followup),
            'notes': a.notes
        })
    return jsonify(result)

@app.route('/api/appointments/<int:aid>/cancel', methods=['POST'])
@login_required
def cancel_appointment(aid):
    a = Appointment.query.get_or_404(aid)
    a.status = 'cancelled'
    db.session.commit()
    return jsonify({'success': True})


# ─────────────────────────────────────────────
# ROUTES: LIVE TV WAITING ROOM DISPLAY & CALLING
# ─────────────────────────────────────────────

tv_call_state = {'token': None, 'name': '', 'timestamp': 0}

@app.route('/api/appointments/<int:aid>/call', methods=['POST'])
@login_required
def call_appointment(aid):
    global tv_call_state
    a = Appointment.query.get_or_404(aid)
    if a.status == 'cancelled':
        return jsonify({'success': False, 'message': 'रद्द किया गया अपॉइंटमेंट कॉल नहीं किया जा सकता (Appointment is Cancelled)'}), 200
    today = date.today()
    # Previous in_progress appts are marked completed so queue moves forward properly
    Appointment.query.filter(
        Appointment.appointment_date == today, 
        Appointment.status == 'in_progress', 
        Appointment.id != aid
    ).update({'status': 'completed'})
    a.status = 'in_progress'
    db.session.commit()
    import time
    tv_call_state = {
        'token': a.token_number,
        'name': a.patient.name,
        'timestamp': int(time.time() * 1000)
    }
    return jsonify({
        'success': True,
        'token': a.token_number,
        'name': a.patient.name,
        'appointment_id': a.id,
        'patient_id': a.patient_id
    })

@app.route('/api/appointments/call-next', methods=['POST'])
@login_required
def call_next_appointment():
    global tv_call_state
    today = date.today()
    # Priority patients called first, then regular queue
    next_appt = Appointment.query.filter_by(appointment_date=today, status='waiting').order_by(
        Appointment.is_priority.desc(),
        Appointment.token_number.asc()
    ).first()
    if not next_appt:
        return jsonify({'success': False, 'message': 'कतार में कोई प्रतीक्षारत मरीज नहीं है (No waiting patients in queue)'}), 404
    # Mark previous in_progress appts as completed so queue advances forward seamlessly
    Appointment.query.filter(Appointment.appointment_date == today, Appointment.status == 'in_progress').update({'status': 'completed'})
    next_appt.status = 'in_progress'
    db.session.commit()
    import time
    tv_call_state = {
        'token': next_appt.token_number,
        'name': next_appt.patient.name,
        'timestamp': int(time.time() * 1000)
    }
    return jsonify({
        'success': True,
        'token': next_appt.token_number,
        'name': next_appt.patient.name,
        'appointment_id': next_appt.id,
        'patient_id': next_appt.patient_id
    })

def get_tv_settings_dict():
    try:
        return {
            'clinic_name': get_setting('clinic_name', 'Dr. Dhakad Clinic'),
            'doctor_name': get_setting('doctor_name', 'Dr. Dhakad'),
            'clinic_phone': get_setting('clinic_phone', ''),
            'clinic_address': get_setting('clinic_address', ''),
            'doctor_qual': get_setting('doctor_qual', 'MBBS, MD (Senior Physician)'),
            'doctor_role': get_setting('doctor_role', 'जनरल फिजिशियन एवं फैमिली डॉक्टर'),
            'doctor_photo': get_setting('doctor_photo', ''),
            'doctor_bullet1': get_setting('doctor_bullet1', 'सामान्य एवं जटिल रोगों का संपूर्ण उपचार'),
            'doctor_bullet2': get_setting('doctor_bullet2', 'नियमित स्वास्थ्य परीक्षण एवं परामर्श'),
            'doctor_bullet3': get_setting('doctor_bullet3', 'उचित दवा, खान-पान एवं परहेज मार्गदर्शन'),
            'doctor_bullet4': get_setting('doctor_bullet4', '15+ वर्षों का समर्पित व विश्वसनीय अनुभव'),
            'tv_timings': get_setting('tv_timings', 'सुबह: 10:00 - 1:30 | शाम: 5:00 - 8:00 (रवि: अवकाश)'),
            'tv_notice': get_setting('tv_notice', 'कृपया अपनी पुरानी पर्ची व जांच रिपोर्ट साथ रखें • नया नंबर लगवाने हेतु रिसेप्शन पर संपर्क करें • क्लिनिक का समय: सुबह 10:00 से 1:30 एवं शाम 5:00 से 8:00 तक • Dr. Dhakad Clinic — आपकी सेहत हमारा संकल्प!'),
            'tv_services': get_setting('tv_services', 'परामर्श (Consultation), ECG जाँच, बीपी / शुगर जाँच, रक्त जाँच (Lab), नेबुलाइजर, दवा परामर्श, फॉलो-अप देखभाल'),
            'prescription_validity_days': get_setting('prescription_validity_days', '14'),
            'billing_staff_list': get_setting('billing_staff_list', 'देवेन्द्र (Devendra), रानी (Rani), मोनिका (Monika)')
        }
    except Exception:
        return {
            'clinic_name': 'Dr. Dhakad Clinic',
            'doctor_name': 'Dr. Dhakad',
            'clinic_phone': '',
            'clinic_address': '',
            'doctor_qual': 'MBBS, MD (Senior Physician)',
            'doctor_role': 'जनरल फिजिशियन एवं फैमिली डॉक्टर',
            'doctor_photo': '',
            'doctor_bullet1': 'सामान्य एवं जटिल रोगों का संपूर्ण उपचार',
            'doctor_bullet2': 'नियमित स्वास्थ्य परीक्षण एवं परामर्श',
            'doctor_bullet3': 'उचित दवा, खान-पान एवं परहेज मार्गदर्शन',
            'doctor_bullet4': '15+ वर्षों का समर्पित व विश्वसनीय अनुभव',
            'tv_timings': 'सुबह: 10:00 - 1:30 | शाम: 5:00 - 8:00 (रवि: अवकाश)',
            'tv_notice': 'कृपया अपनी पुरानी पर्ची व जांच रिपोर्ट साथ रखें • नया नंबर लगवाने हेतु रिसेप्शन पर संपर्क करें • क्लिनिक का समय: सुबह 10:00 से 1:30 एवं शाम 5:00 से 8:00 तक • Dr. Dhakad Clinic — आपकी सेहत हमारा संकल्प!',
            'tv_services': 'परामर्श (Consultation), ECG जाँच, बीपी / शुगर जाँच, रक्त जाँच (Lab), नेबुलाइजर, दवा परामर्श, फॉलो-अप देखभाल',
            'prescription_validity_days': '14',
            'billing_staff_list': 'देवेन्द्र (Devendra), रानी (Rani), मोनिका (Monika)'
        }

@app.route('/tv')
def tv_display():
    return render_template('tv_prototype.html', **get_tv_settings_dict())

@app.route('/tv-prototype')
def tv_prototype_display():
    return render_template('tv_prototype.html', **get_tv_settings_dict())

@app.route('/api/tv/queue', methods=['GET'])
def get_tv_queue():
    global tv_call_state
    try:
        today = date.today()
        appts = Appointment.query.filter(
            Appointment.appointment_date == today,
            Appointment.status != 'cancelled'
        ).order_by(Appointment.token_number).all()
        result = []
        active_appt = None
        for a in appts:
            if a.status == 'in_progress':
                active_appt = a
            try:
                pname = a.patient.name if a.patient else 'मरीज'
            except Exception:
                pname = 'मरीज'
            result.append({
                'token': a.token_number,
                'name': pname,
                'status': a.status
            })
        
        if not isinstance(tv_call_state, dict):
            tv_call_state = {'token': None, 'name': '', 'timestamp': 0}

        elapsed_seconds = 0
        if active_appt:
            import time
            now_ms = int(time.time() * 1000)
            if not tv_call_state.get('token') or tv_call_state.get('token') != active_appt.token_number:
                tv_call_state['token'] = active_appt.token_number
                tv_call_state['name'] = active_appt.patient.name if active_appt.patient else 'मरीज'
                # Only real doctor call actions generate a fresh announcement timestamp
                if not tv_call_state.get('timestamp'):
                    tv_call_state['timestamp'] = 0
            start_ts = tv_call_state.get('timestamp') or now_ms
            elapsed_seconds = max(0, int((now_ms - start_ts) / 1000)) if tv_call_state.get('timestamp') else 0

        active_start_time = tv_call_state.get('timestamp') if active_appt else None
        return jsonify({
            'queue': result,
            'call_event': tv_call_state,
            'active_start_time': active_start_time,
            'elapsed_seconds': elapsed_seconds,
            'tv_settings': get_tv_settings_dict()
        })
    except Exception as ex:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({
            'queue': [],
            'call_event': tv_call_state if isinstance(tv_call_state, dict) else None,
            'active_start_time': None,
            'tv_settings': get_tv_settings_dict(),
            'error': str(ex)
        })



@app.route('/api/tts')
def text_to_speech():
    from flask import Response
    text = request.args.get('text', '').strip()
    if not text:
        return '', 400
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        url = f"https://translate.google.com/translate_tts?ie=UTF-8&tl=hi&client=tw-ob&q={requests.utils.quote(text)}"
        resp = requests.get(url, headers=headers, timeout=6)
        if resp.status_code == 200 and resp.content:
            return Response(resp.content, mimetype='audio/mpeg')
    except Exception as e:
        print(f"[WARN] TTS proxy error: {e}")
    return '', 404
# ─────────────────────────────────────────────

@app.route('/doctor')
@login_required
def doctor_dashboard():
    return render_template('doctor.html', user_name=session.get('name'), role=session.get('role'))

@app.route('/api/visits', methods=['POST'])
@login_required
def create_or_update_visit():
    data = request.json
    appt_id = data.get('appointment_id')
    appt = Appointment.query.get_or_404(appt_id)
    appt.status = 'in_progress'

    v = appt.visit
    if not v:
        v = Visit(appointment_id=appt_id, patient_id=appt.patient_id)
        db.session.add(v)

    v.complaints = data.get('complaints', v.complaints)
    v.bp = data.get('bp', v.bp)
    v.pulse = data.get('pulse', v.pulse)
    v.weight = data.get('weight', v.weight)
    v.temperature = data.get('temperature', v.temperature)
    v.spo2 = data.get('spo2', v.spo2)
    v.diagnosis = data.get('diagnosis', v.diagnosis)
    v.doctor_notes = data.get('doctor_notes', v.doctor_notes)
    v.follow_up = data.get('follow_up', v.follow_up)

    # Save prescriptions
    if 'prescriptions' in data:
        # Remove old prescriptions (only if not finalized)
        if not v.is_finalized:
            Prescription.query.filter_by(visit_id=v.id).delete()
        for rx in data['prescriptions']:
            med_name = (rx.get('medicine_name') or '').strip()
            if not med_name:
                continue
            dose = rx.get('dose', '')
            timing = rx.get('timing', '')
            days = str(rx.get('days', ''))
            instructions = rx.get('instructions', '')

            p = Prescription(
                visit_id=v.id,
                medicine_name=med_name,
                dose=dose,
                timing=timing,
                days=days,
                instructions=instructions
            )
            db.session.add(p)

            # Auto-save medicine in database so it is remembered next time
            existing_med = Medicine.query.filter(Medicine.name.ilike(med_name)).first()
            if existing_med:
                existing_med.usage_count = (existing_med.usage_count or 1) + 1
                if dose: existing_med.default_dose = dose
                if timing: existing_med.default_timing = timing
                if days: existing_med.default_duration = days
                if instructions: existing_med.default_instructions = instructions
            else:
                db.session.add(Medicine(
                    name=med_name,
                    default_dose=dose or '1-0-1 (सुबह-शाम)',
                    default_timing=timing or 'खाने के बाद (After Food)',
                    default_duration=days or '5 Days',
                    default_instructions=instructions or '',
                    usage_count=1
                ))

    db.session.commit()
    return jsonify({'success': True, 'visit_id': v.id})

@app.route('/api/visits/<int:vid>', methods=['GET'])
@login_required
def get_visit(vid):
    v = Visit.query.get_or_404(vid)
    p = Patient.query.get(v.patient_id)
    rxs = [{'id': r.id, 'medicine_name': r.medicine_name, 'dose': r.dose,
             'timing': r.timing, 'days': r.days, 'instructions': r.instructions}
            for r in v.prescriptions]
    return jsonify({
        'id': v.id, 'patient_id': v.patient_id, 'patient_name': p.name,
        'patient_age': p.age, 'patient_gender': p.gender, 'patient_mobile': p.mobile,
        'complaints': v.complaints, 'bp': v.bp, 'pulse': v.pulse,
        'weight': v.weight, 'temperature': v.temperature, 'spo2': v.spo2,
        'diagnosis': v.diagnosis, 'doctor_notes': v.doctor_notes,
        'follow_up': v.follow_up,
        'prescriptions': rxs, 'is_finalized': v.is_finalized,
        'visit_date': v.visit_date.strftime('%d-%m-%Y %H:%M')
    })

@app.route('/api/visits/<int:vid>/finalize', methods=['POST'])
@login_required
def finalize_visit(vid):
    v = Visit.query.get_or_404(vid)
    appt = Appointment.query.get(v.appointment_id)
    v.is_finalized = True
    appt.status = 'completed'
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/patients/<int:pid>/history', methods=['GET'])
@login_required
def patient_history(pid):
    appts = Appointment.query.filter_by(patient_id=pid).order_by(Appointment.id.desc()).all()
    result = []
    for a in appts:
        v = a.visit
        if v:
            rxs = [{'medicine_name': r.medicine_name, 'dose': r.dose,
                    'timing': r.timing, 'days': r.days, 'instructions': r.instructions}
                   for r in v.prescriptions]
            result.append({
                'appointment_id': a.id, 'visit_id': v.id,
                'date': a.appointment_date.strftime('%d-%m-%Y'),
                'status': a.status, 'diagnosis': v.diagnosis,
                'complaints': v.complaints, 'doctor_notes': v.doctor_notes,
                'bp': v.bp, 'pulse': v.pulse, 'weight': v.weight,
                'temperature': v.temperature, 'spo2': v.spo2,
                'follow_up': v.follow_up,
                'prescriptions': rxs,
                'is_finalized': v.is_finalized
            })
    return jsonify(result)

@app.route('/api/medicines', methods=['GET', 'POST'])
@login_required
def handle_medicines():
    if request.method == 'POST':
        data = request.json or {}
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({'success': False, 'message': 'Medicine name required'}), 400
        existing = Medicine.query.filter(Medicine.name.ilike(name)).first()
        if existing:
            existing.usage_count = (existing.usage_count or 1) + 1
            if data.get('dose'): existing.default_dose = data.get('dose')
            if data.get('timing'): existing.default_timing = data.get('timing')
            if data.get('days'): existing.default_duration = str(data.get('days'))
            if data.get('instructions'): existing.default_instructions = data.get('instructions')
            med = existing
        else:
            med = Medicine(
                name=name,
                default_dose=data.get('dose', '1-0-1 (सुबह-शाम)'),
                default_timing=data.get('timing', 'खाने के बाद (After Food)'),
                default_duration=str(data.get('days', '5 Days')),
                default_instructions=data.get('instructions', ''),
                usage_count=1
            )
            db.session.add(med)
        db.session.commit()
        return jsonify({'success': True, 'medicine': {
            'id': med.id, 'name': med.name, 'dose': med.default_dose,
            'timing': med.default_timing, 'days': med.default_duration,
            'instructions': med.default_instructions
        }})

    # GET: return frequent medicines
    q = request.args.get('q', '').strip()
    query = Medicine.query
    if q:
        query = query.filter(Medicine.name.ilike(f'%{q}%'))
    medicines = query.order_by(Medicine.usage_count.desc(), Medicine.name.asc()).limit(150).all()
    return jsonify([{
        'id': m.id,
        'name': m.name,
        'dose': m.default_dose,
        'timing': m.default_timing,
        'days': m.default_duration,
        'instructions': m.default_instructions,
        'usage_count': m.usage_count
    } for m in medicines])


# ─────────────────────────────────────────────
# ROUTES: BILLING
# ─────────────────────────────────────────────

@app.route('/billing')
@login_required
def billing_page():
    return render_template('billing.html', user_name=session.get('name'), role=session.get('role'))

@app.route('/api/bills', methods=['POST'])
@login_required
def create_bill():
    data = request.json
    patient_id = data['patient_id']

    consultation_fee = float(data.get('consultation_fee', 0))
    extra = float(data.get('extra_charges', 0))
    discount = float(data.get('discount', 0))

    # Anti-Duplicate Check: Prevent accidental duplicate consultation fee today
    today = date.today()
    existing = Bill.query.filter(
        Bill.patient_id == patient_id,
        db.func.date(Bill.created_at) == today,
        Bill.status.notin_(['cancelled', 'refunded'])
    ).first()

    if existing and not data.get('force_duplicate'):
        if consultation_fee > 0:
            return jsonify({
                'success': False,
                'is_duplicate': True,
                'existing_bill_number': existing.bill_number,
                'existing_amount': existing.amount_paid,
                'message': f'इस मरीज का आज पहले से बिल #{existing.bill_number} (₹{existing.amount_paid}) बना हुआ है। परामर्श शुल्क दोबारा नहीं लिया जा सकता। क्या आप परामर्श शुल्क ₹0 करके केवल अतिरिक्त प्रक्रिया (ECG, ड्रेसिंग आदि) का बिल बनाना चाहते हैं?'
            }), 409

    total = consultation_fee + extra - discount
    paid = float(data.get('amount_paid', 0))
    balance = total - paid

    bill = Bill(
        bill_number=next_bill_number(),
        patient_id=data['patient_id'],
        appointment_id=data.get('appointment_id'),
        consultation_fee=consultation_fee,
        extra_charges=extra,
        extra_charge_desc=data.get('extra_charge_desc', ''),
        discount=discount,
        total_amount=total,
        amount_paid=paid,
        balance=balance,
        payment_mode=data.get('payment_mode', 'cash'),
        collected_by=data.get('collected_by', 'देवेन्द्र (Devendra)'),
        status='partial' if balance > 0 else 'paid'
    )
    db.session.add(bill)
    db.session.commit()
    return jsonify({'success': True, 'bill_id': bill.id, 'bill_number': bill.bill_number})

@app.route('/api/bills/<int:bid>', methods=['GET'])
@login_required
def get_bill(bid):
    b = Bill.query.get_or_404(bid)
    p = Patient.query.get(b.patient_id)
    return jsonify({
        'id': b.id, 'bill_number': b.bill_number,
        'patient_name': p.name, 'patient_mobile': p.mobile, 'patient_age': p.age,
        'consultation_fee': b.consultation_fee, 'extra_charges': b.extra_charges,
        'extra_charge_desc': b.extra_charge_desc, 'discount': b.discount,
        'total_amount': b.total_amount, 'amount_paid': b.amount_paid,
        'balance': b.balance, 'payment_mode': b.payment_mode,
        'collected_by': b.collected_by or 'देवेन्द्र (Devendra)',
        'refund': b.refund, 'status': b.status,
        'created_at': b.created_at.strftime('%d-%m-%Y %H:%M')
    })

@app.route('/api/bills/<int:bid>/refund', methods=['POST'])
@login_required
def refund_bill(bid):
    b = Bill.query.get_or_404(bid)
    data = request.json
    refund_amt = float(data.get('refund_amount', 0))
    b.refund = refund_amt
    b.status = 'refunded'
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/bills/<int:bid>/cancel', methods=['POST'])
@login_required
def cancel_bill(bid):
    b = Bill.query.get_or_404(bid)
    data = request.json or {}
    pin = str(data.get('doctor_pin', '')).strip()
    reason = str(data.get('reason', '')).strip()

    # Anti-Fraud: Doctor PIN verification required for receptionist
    saved_pin = str(get_setting('doctor_pin', '1234'))
    if session.get('role') != 'doctor':
        if not pin or pin != saved_pin:
            return jsonify({'success': False, 'message': 'अमान्य डॉक्टर पिन (Invalid Doctor PIN)! बिल रद्द करने के लिए डॉक्टर की अनुमति आवश्यक है।'}), 403

    if not reason:
        return jsonify({'success': False, 'message': 'कृपया बिल रद्द करने का वैध कारण लिखें।'}), 400

    b.status = 'cancelled'
    user_name = session.get('name', 'Staff')
    b.extra_charge_desc = f"[रद्द: {reason} | द्वारा: {user_name}] " + (b.extra_charge_desc or '')
    db.session.commit()
    return jsonify({'success': True, 'message': f'बिल #{b.bill_number} सफलतापूर्वक रद्द किया गया।'})

@app.route('/api/bills/patient/<int:pid>', methods=['GET'])
@login_required
def patient_bills(pid):
    bills = Bill.query.filter_by(patient_id=pid).order_by(Bill.id.desc()).all()
    return jsonify([{
        'id': b.id, 'bill_number': b.bill_number,
        'total_amount': b.total_amount, 'amount_paid': b.amount_paid,
        'balance': b.balance, 'status': b.status,
        'payment_mode': b.payment_mode,
        'created_at': b.created_at.strftime('%d-%m-%Y %H:%M')
    } for b in bills])


# ─────────────────────────────────────────────
# ROUTES: REPORTS
# ─────────────────────────────────────────────

@app.route('/api/reports/today', methods=['GET'])
@login_required
def today_report():
    today = date.today()
    bills = Bill.query.filter(db.func.date(Bill.created_at) == today).all()
    valid_bills = [b for b in bills if b.status not in ('cancelled', 'refunded')]
    cancelled_bills = [b for b in bills if b.status == 'cancelled']
    refunded_bills = [b for b in bills if b.status == 'refunded']

    total_earned = sum(b.amount_paid for b in valid_bills)
    total_patients = Appointment.query.filter_by(appointment_date=today).count()
    completed = Appointment.query.filter_by(appointment_date=today, status='completed').count()
    cash = sum(b.amount_paid for b in valid_bills if b.payment_mode == 'cash')
    upi = sum(b.amount_paid for b in valid_bills if b.payment_mode == 'upi')
    card = sum(b.amount_paid for b in valid_bills if b.payment_mode == 'card')
    return jsonify({
        'total_earned': total_earned,
        'total_patients': total_patients,
        'completed': completed,
        'cash': cash, 'upi': upi, 'card': card,
        'bills_count': len(valid_bills),
        'cancelled_count': len(cancelled_bills),
        'cancelled_amount': sum(b.total_amount for b in cancelled_bills),
        'cancelled_list': [{
            'id': b.id,
            'bill_number': b.bill_number,
            'patient_name': b.patient.name if b.patient else 'अज्ञात मरीज',
            'amount': b.total_amount,
            'desc': b.extra_charge_desc or 'कोई विवरण नहीं',
            'time': b.created_at.strftime('%I:%M %p')
        } for b in cancelled_bills]
    })

@app.route('/api/reports/range', methods=['GET'])
@login_required
def range_report():
    from_date = request.args.get('from', date.today().isoformat())
    to_date = request.args.get('to', date.today().isoformat())
    bills = Bill.query.filter(
        db.func.date(Bill.created_at) >= from_date,
        db.func.date(Bill.created_at) <= to_date
    ).all()
    return jsonify({
        'total_earned': sum(b.amount_paid for b in bills),
        'bills_count': len(bills),
        'cash': sum(b.amount_paid for b in bills if b.payment_mode == 'cash'),
        'upi': sum(b.amount_paid for b in bills if b.payment_mode == 'upi'),
        'card': sum(b.amount_paid for b in bills if b.payment_mode == 'card'),
    })


# ─────────────────────────────────────────────
# ROUTES: WHATSAPP
# ─────────────────────────────────────────────

@app.route('/api/whatsapp/preview', methods=['POST'])
@login_required
def whatsapp_preview():
    data = request.json
    lang = data.get('language', 'hindi')
    from_date = data.get('from_date', '')
    to_date = data.get('to_date', '')
    reopen_date = data.get('reopen_date', '')
    custom_msg = data.get('custom_message', '')

    if custom_msg:
        message = custom_msg
    elif lang == 'hindi':
        message = (f"नमस्कार,\nडॉक्टर साहब का क्लीनिक {from_date} से {to_date} तक बंद रहेगा।\n"
                   f"क्लीनिक {reopen_date} को पुनः खुलेगा।\nअसुविधा के लिए खेद है।\n\n- Dr. Dhakad Clinic")
    else:
        message = (f"Hello,\nDr. Dhakad's Clinic will remain closed from {from_date} to {to_date}.\n"
                   f"The clinic will reopen on {reopen_date}.\nWe apologize for the inconvenience.\n\n- Dr. Dhakad Clinic")
    return jsonify({'message': message})

@app.route('/api/whatsapp/eligible-patients', methods=['GET'])
@login_required
def eligible_patients():
    patients = Patient.query.filter_by(whatsapp_consent=True).all()
    return jsonify([{
        'id': p.id, 'name': p.name, 'mobile': p.mobile
    } for p in patients])

@app.route('/api/whatsapp/send', methods=['POST'])
@login_required
def send_whatsapp():
    data = request.json
    message = data.get('message', '')
    patient_ids = data.get('patient_ids', [])
    batch_id = datetime.now().strftime('%Y%m%d%H%M%S')

    wa_token = get_setting('wa_token')
    wa_phone_id = get_setting('wa_phone_id')
    use_api = bool(wa_token and wa_phone_id)

    logs = []
    for pid in patient_ids:
        p = Patient.query.get(pid)
        if not p:
            continue
        # Duplicate check: same patient, same batch message in last 24h
        recent = WhatsAppLog.query.filter_by(
            patient_id=pid, message=message, status='sent'
        ).filter(WhatsAppLog.sent_at >= datetime.utcnow() - timedelta(hours=24)).first()
        if recent:
            logs.append({'patient_id': pid, 'name': p.name, 'status': 'skipped', 'reason': 'Already sent today'})
            continue

        log = WhatsAppLog(patient_id=pid, mobile=p.mobile, message=message, batch_id=batch_id)
        db.session.add(log)
        db.session.flush()

        if use_api:
            try:
                resp = requests.post(
                    f'https://graph.facebook.com/v18.0/{wa_phone_id}/messages',
                    headers={'Authorization': f'Bearer {wa_token}', 'Content-Type': 'application/json'},
                    json={
                        'messaging_product': 'whatsapp',
                        'to': f'91{p.mobile}',
                        'type': 'text',
                        'text': {'body': message}
                    }, timeout=10
                )
                if resp.status_code == 200:
                    log.status = 'sent'
                    log.sent_at = datetime.utcnow()
                    logs.append({'patient_id': pid, 'name': p.name, 'status': 'sent'})
                else:
                    log.status = 'failed'
                    logs.append({'patient_id': pid, 'name': p.name, 'status': 'failed', 'reason': resp.text})
            except Exception as e:
                log.status = 'failed'
                logs.append({'patient_id': pid, 'name': p.name, 'status': 'failed', 'reason': str(e)})
        else:
            # Fallback: WhatsApp web link
            log.status = 'pending'
            wa_url = f"https://wa.me/91{p.mobile}?text={requests.utils.quote(message)}"
            logs.append({'patient_id': pid, 'name': p.name, 'status': 'pending', 'wa_url': wa_url, 'mobile': p.mobile})

    db.session.commit()
    return jsonify({'success': True, 'batch_id': batch_id, 'logs': logs, 'api_used': use_api})

@app.route('/api/whatsapp/logs', methods=['GET'])
@login_required
def whatsapp_logs():
    logs = WhatsAppLog.query.order_by(WhatsAppLog.id.desc()).limit(100).all()
    return jsonify([{
        'id': l.id, 'patient_id': l.patient_id, 'mobile': l.mobile,
        'status': l.status, 'batch_id': l.batch_id,
        'sent_at': l.sent_at.strftime('%d-%m-%Y %H:%M') if l.sent_at else '-'
    } for l in logs])


# ─────────────────────────────────────────────
# ROUTES: SETTINGS & BACKUP
# ─────────────────────────────────────────────

@app.route('/api/settings', methods=['GET', 'POST'])
@login_required
def settings():
    if request.method == 'POST':
        data = request.json or {}
        for k, v in data.items():
            set_setting(k, v)
        return jsonify({'success': True})
    
    all_settings = get_tv_settings_dict()
    all_settings['consultation_fee'] = get_setting('consultation_fee', '300')
    all_settings['wa_token'] = get_setting('wa_token', '')
    all_settings['wa_phone_id'] = get_setting('wa_phone_id', '')
    return jsonify(all_settings)

@app.route('/api/upload/doctor-photo', methods=['POST'])
@login_required
def upload_doctor_photo():
    import time
    if 'photo' not in request.files:
        return jsonify({'success': False, 'message': 'कोई फोटो फाइल नहीं मिली'}), 400
    file = request.files['photo']
    if not file or file.filename == '':
        return jsonify({'success': False, 'message': 'फाइल का चयन करें'}), 400
    
    upload_dir = os.path.join(os.path.dirname(__file__), 'static', 'uploads')
    os.makedirs(upload_dir, exist_ok=True)
    
    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else 'jpg'
    filename = f'doctor_photo_{int(time.time())}.{ext}'
    filepath = os.path.join(upload_dir, filename)
    file.save(filepath)
    
    photo_url = f'/static/uploads/{filename}'
    set_setting('doctor_photo', photo_url)
    return jsonify({'success': True, 'photo_url': photo_url})

@app.route('/api/backup', methods=['POST'])
@login_required
def create_backup():
    backup_dir = os.path.join(os.path.dirname(__file__), 'backups')
    os.makedirs(backup_dir, exist_ok=True)
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    src = os.path.join(os.path.dirname(__file__), 'instance', 'clinic.db')
    dst = os.path.join(backup_dir, f'clinic_backup_{ts}.db')
    shutil.copy2(src, dst)
    return jsonify({'success': True, 'backup_file': dst})

@app.route('/api/backup/list', methods=['GET'])
@login_required
def list_backups():
    backup_dir = os.path.join(os.path.dirname(__file__), 'backups')
    os.makedirs(backup_dir, exist_ok=True)
    files = sorted(os.listdir(backup_dir), reverse=True)
    return jsonify({'backups': files[:10]})


# ─────────────────────────────────────────────
# PRINT ROUTES
# ─────────────────────────────────────────────

@app.route('/print/bill/<int:bid>')
@login_required
def print_bill(bid):
    b = Bill.query.get_or_404(bid)
    p = Patient.query.get(b.patient_id)
    clinic_name = get_setting('clinic_name', 'Dr. Dhakad Clinic')
    doctor_name = get_setting('doctor_name', 'Dr. Dhakad')
    clinic_address = get_setting('clinic_address', '')
    clinic_phone = get_setting('clinic_phone', '')
    return render_template('print_bill.html', bill=b, patient=p,
                           clinic_name=clinic_name, doctor_name=doctor_name,
                           clinic_address=clinic_address, clinic_phone=clinic_phone)

@app.route('/print/prescription/<int:vid>')
@login_required
def print_prescription(vid):
    v = Visit.query.get_or_404(vid)
    p = Patient.query.get(v.patient_id)
    rxs = v.prescriptions
    clinic_name = get_setting('clinic_name', 'Dr. Dhakad Clinic')
    doctor_name = get_setting('doctor_name', 'Dr. Dhakad')
    clinic_address = get_setting('clinic_address', '')
    clinic_phone = get_setting('clinic_phone', '')
    return render_template('print_prescription.html', visit=v, patient=p,
                           prescriptions=rxs, clinic_name=clinic_name,
                           doctor_name=doctor_name, clinic_address=clinic_address,
                           clinic_phone=clinic_phone)


# ─────────────────────────────────────────────
# INIT DB & DEFAULT USERS
# ─────────────────────────────────────────────

def init_db():
    db.create_all()

    # Migration: check and add new columns to visit table if they don't exist
    try:
        from sqlalchemy import text
        with db.engine.connect() as conn:
            cols = [row[1] for row in conn.execute(text("PRAGMA table_info(visit)")).fetchall()]
            if 'spo2' not in cols:
                conn.execute(text("ALTER TABLE visit ADD COLUMN spo2 VARCHAR(20)"))
            if 'follow_up' not in cols:
                conn.execute(text("ALTER TABLE visit ADD COLUMN follow_up VARCHAR(50)"))
            # Migration: patient table new columns
            pcols = [row[1] for row in conn.execute(text("PRAGMA table_info(patient)")).fetchall()]
            if 'state' not in pcols:
                conn.execute(text("ALTER TABLE patient ADD COLUMN state VARCHAR(100) DEFAULT 'Madhya Pradesh'"))
            if 'district' not in pcols:
                conn.execute(text("ALTER TABLE patient ADD COLUMN district VARCHAR(100)"))
            if 'block' not in pcols:
                conn.execute(text("ALTER TABLE patient ADD COLUMN block VARCHAR(100)"))
            # Migration: appointment table (priority & followup)
            acols = [row[1] for row in conn.execute(text("PRAGMA table_info(appointment)")).fetchall()]
            if 'is_priority' not in acols:
                conn.execute(text("ALTER TABLE appointment ADD COLUMN is_priority BOOLEAN DEFAULT 0"))
            if 'is_followup' not in acols:
                conn.execute(text("ALTER TABLE appointment ADD COLUMN is_followup BOOLEAN DEFAULT 0"))
            # Migration: bill table (collected_by)
            bcols = [row[1] for row in conn.execute(text("PRAGMA table_info(bill)")).fetchall()]
            if 'collected_by' not in bcols:
                conn.execute(text("ALTER TABLE bill ADD COLUMN collected_by VARCHAR(100) DEFAULT 'देवेन्द्र (Devendra)'"))
            conn.commit()
    except Exception as e:
        pass

    # Create default users if not exist
    if not User.query.filter_by(username='doctor').first():
        u = User(username='doctor', role='doctor', name='Dr. Dhakad')
        u.set_password('doctor123')
        db.session.add(u)
    if not User.query.filter_by(username='reception').first():
        u = User(username='reception', role='reception', name='Reception')
        u.set_password('reception123')
        db.session.add(u)
    # Default settings
    defaults = {
        'clinic_name': 'Dr. Dhakad Clinic',
        'doctor_name': 'Dr. Dhakad',
        'clinic_address': 'Clinic Address Here',
        'clinic_phone': '9999999999',
        'consultation_fee': '300',
    }
    for k, v in defaults.items():
        if not Settings.query.filter_by(key=k).first():
            db.session.add(Settings(key=k, value=v))

    # Starter popular medicines for auto-suggest
    starter_meds = [
        ('Tab. Paracetamol 650mg', '1-0-1 (सुबह-शाम)', 'खाने के बाद (After Food)', '5 Days', 'बुखार / दर्द होने पर (For fever)'),
        ('Tab. Pantoprazole 40mg', '1-0-0 (सुबह)', 'खाने से पहले (Before Food / Empty Stomach)', '7 Days', 'खाली पेट सुबह (Empty stomach)'),
        ('Tab. Azithromycin 500mg', '1-0-0 (सुबह)', 'खाने के बाद (After Food)', '3 Days', 'दिन में एक बार (Once daily)'),
        ('Tab. Telmisartan 40mg', '1-0-0 (सुबह)', 'नाश्ते के बाद (After Breakfast)', '30 Days', 'बीपी नियंत्रण हेतु (For BP)'),
        ('Tab. Cetirizine 10mg', '0-0-1 (रात)', 'सोते समय (At Bedtime)', '5 Days', 'एलर्जी / सर्दी हेतु (For allergy)'),
        ('Tab. Amoxicillin 500mg', '1-0-1 (सुबह-शाम)', 'खाने के बाद (After Food)', '5 Days', 'एंटीबायोटिक (Antibiotic)'),
        ('Syp. Multivitamin 200ml', '0-1-0 (दोपहर)', 'खाने के बाद (After Food)', '15 Days', 'ताकत हेतु (Nutritional supplement)'),
        ('Tab. Ibuprofen + Paracetamol', 'SOS (ज़रूरत पड़ने पर)', 'खाने के बाद (After Food)', '3 Days', 'दर्द होने पर (When pain)')
    ]
    for name, dose, timing, dur, inst in starter_meds:
        if not Medicine.query.filter(Medicine.name.ilike(name)).first():
            db.session.add(Medicine(
                name=name, default_dose=dose, default_timing=timing,
                default_duration=dur, default_instructions=inst, usage_count=5
            ))

    db.session.commit()
    print("[OK] Database initialized with default users and medicines.")
    print("   Doctor: username=doctor, password=doctor123")
    print("   Reception: username=reception, password=reception123")


# Auto-initialize database on startup (runs under both gunicorn and python app.py)
with app.app_context():
    try:
        init_db()
    except Exception as e:
        print(f"[WARN] init_db on startup: {e}")


if __name__ == '__main__':
    import sys
    import io
    # Fix Windows console encoding
    if sys.stdout.encoding != 'utf-8':
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    print("\n[START] Dr. Dhakad Clinic Software starting...")
    print("   Open browser: http://localhost:5000")
    print("   Other PCs: http://<this-pc-ip>:5000\n")
    app.run(host='0.0.0.0', port=5000, debug=False)
