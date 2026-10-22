# 🏥 Dr. Dhakad Clinic Management Software

एक डॉक्टर के पर्सनल क्लीनिक के लिए कम बजट वाला, स्थानीय नेटवर्क पर चलने वाला सॉफ्टवेयर।

---

## ✅ काम करने वाले फीचर

| फीचर | स्थिति |
|------|--------|
| Reception Login & Doctor Login | ✅ काम करता है |
| नया मरीज दर्ज करना | ✅ काम करता है |
| मरीज खोजना (नाम/मोबाइल) | ✅ काम करता है |
| अपॉइंटमेंट बुकिंग + टोकन नंबर | ✅ काम करता है |
| मरीजों की कतार (Queue) | ✅ काम करता है |
| Doctor Dashboard — विजिट फॉर्म | ✅ काम करता है |
| BP, Pulse, Temp, Weight रिकॉर्ड | ✅ काम करता है |
| दवाइयाँ (Prescription) लिखना | ✅ काम करता है |
| विजिट सेव करना (Draft) | ✅ काम करता है |
| विजिट पूर्ण करना (Finalize) | ✅ काम करता है |
| पर्ची प्रिंट / PDF | ✅ काम करता है |
| POS Billing — Cash/UPI/Card | ✅ काम करता है |
| डिस्काउंट, बकाया, रिफंड | ✅ काम करता है |
| बिल प्रिंट (रसीद) | ✅ काम करता है |
| आज की कमाई रिपोर्ट | ✅ काम करता है |
| तारीख अनुसार रिपोर्ट | ✅ काम करता है |
| पुराना मरीज इतिहास | ✅ काम करता है |
| पुरानी पर्ची कॉपी (Review के साथ) | ✅ काम करता है |
| WhatsApp Holiday Message | ✅ काम करता है (wa.me fallback) |
| बैकअप बनाना | ✅ काम करता है |
| 2 Reception + 1 Doctor — एक डेटाबेस | ✅ LAN पर काम करता है |
| Mobile/Tablet Responsive UI | ✅ काम करता है |

---

## 🚀 इंस्टॉलेशन और शुरुआत

### जरूरी सॉफ्टवेयर
1. **Python 3.9+** — [python.org](https://www.python.org/downloads/) से डाउनलोड करें
   - इंस्टॉल करते समय **"Add Python to PATH"** जरूर टिक करें

### पहली बार चलाना
```
START_CLINIC.bat — डबल क्लिक करें
```

या Command Prompt में:
```bash
pip install -r requirements.txt
python app.py
```

### Browser में खोलें
```
http://localhost:5000
```

---

## 🖥️ दो रिसेप्शन कंप्यूटर सेटअप (LAN)

1. **Server PC** पर सॉफ्टवेयर चलाएं (जहाँ `app.py` है)
2. Server का IP पता करें:
   ```
   ipconfig     (Windows Command Prompt में)
   ```
   उदाहरण: `192.168.1.5`

3. **दूसरे PC** के browser में खोलें:
   ```
   http://192.168.1.5:5000
   ```

> **जरूरी**: सभी PC एक ही WiFi/LAN नेटवर्क पर होने चाहिए।  
> Windows Firewall में Python को Allow करें (पहली बार notification आएगी)।

---

## 🔐 डिफ़ॉल्ट Login

| भूमिका | Username | Password |
|--------|----------|----------|
| Doctor | `doctor` | `doctor123` |
| Reception | `reception` | `reception123` |

> **पासवर्ड बदलने के लिए**: Settings page पर जाएं (बाद में अपडेट होगा)

---

## 🖨️ प्रिंटिंग गाइड

- **पर्ची (Prescription)**: Doctor Panel → विजिट सेव करें → "सेव + प्रिंट" बटन
- **बिल (Receipt)**: Billing → बिल बनाएं → "प्रिंट करें"
- **सामान्य प्रिंटर** पर सीधे प्रिंट होता है
- **PDF बनाने के लिए**: प्रिंट डायलॉग में "Microsoft Print to PDF" चुनें

---

## 📲 WhatsApp सेटअप

### विकल्प 1: बिना API (मुफ्त, अभी काम करता है)
- Doctor Panel → WhatsApp → तारीख चुनें → मैसेज प्रीव्यू → भेजें
- हर मरीज के लिए **wa.me लिंक** खुलेगा
- एक-एक करके मैसेज भेजें

### विकल्प 2: WhatsApp Business API (Bulk भेजने के लिए)
1. [Meta for Developers](https://developers.facebook.com/docs/whatsapp) पर अकाउंट बनाएं
2. WhatsApp Business API Access लें (Free Tier: 1000 messages/month)
3. Access Token और Phone Number ID कॉपी करें
4. Doctor Panel → Settings → WA Token और Phone ID डालें
5. Save करें — अब Bulk भेज सकते हैं

**अनुमानित खर्च (WhatsApp API)**:
| उपयोग | खर्च |
|-------|------|
| 1000 मैसेज/माह | मुफ्त |
| उससे ज्यादा | ~₹0.60-1.00 प्रति मैसेज |

---

## 🗂️ बैकअप और Restore

### बैकअप बनाएं
- **Doctor Panel** → Settings → "बैकअप बनाएं" बटन
- बैकअप फाइल यहाँ बनती है: `backups/clinic_backup_YYYYMMDD_HHMMSS.db`

### रोजाना ऑटो-बैकअप (Windows Task Scheduler)
1. `backup_task.bat` (नीचे बनाएं) को Scheduled Task में जोड़ें
2. हर रात 11 बजे चले

### Restore करना
1. सॉफ्टवेयर बंद करें
2. `instance/clinic.db` फाइल को बदलें:
   ```
   copy backups\clinic_backup_YYYYMMDD_HHMMSS.db instance\clinic.db
   ```
3. सॉफ्टवेयर फिर शुरू करें

---

## 💰 कुल अनुमानित खर्च

| चीज़ | खर्च |
|------|------|
| सॉफ्टवेयर | **₹0 (मुफ्त)** |
| Python | मुफ्त |
| डेटाबेस (SQLite) | मुफ्त |
| Local Network | केवल Router का खर्च |
| WhatsApp API (बेसिक) | **₹0 — 1000 msg/माह मुफ्त** |
| WhatsApp API (ज्यादा) | ~₹500-2000/माह |
| **कुल (बिना WhatsApp API)** | **₹0/माह** |

---

## 📁 प्रोजेक्ट संरचना

```
dr-dhakad-clinic/
├── app.py                    # मुख्य Flask सर्वर
├── requirements.txt          # Python Dependencies
├── START_CLINIC.bat          # Windows स्टार्ट स्क्रिप्ट
├── static/
│   ├── css/style.css         # मुख्य स्टाइलशीट
│   └── js/
│       ├── reception.js      # Reception लॉजिक
│       └── doctor.js         # Doctor लॉजिक
├── templates/
│   ├── login.html            # Login पेज
│   ├── reception.html        # Reception डैशबोर्ड
│   ├── doctor.html           # Doctor डैशबोर्ड
│   ├── print_bill.html       # बिल प्रिंट
│   └── print_prescription.html # पर्ची प्रिंट
├── instance/
│   └── clinic.db             # SQLite डेटाबेस (ऑटो-बनता है)
└── backups/                  # बैकअप फोल्डर
```

---

## 🔧 समस्या और समाधान

| समस्या | समाधान |
|--------|--------|
| "python not found" | Python PATH में Add करें |
| दूसरे PC से नहीं खुलता | Firewall में Python Allow करें |
| Port 5000 busy है | `app.py` में `port=5001` करें |
| प्रिंट नहीं होता | Browser Print (Ctrl+P) से करें |
| डेटा खो गया | `backups/` फोल्डर से restore करें |

---

## 📞 सॉफ्टवेयर सौंपने की गाइड (डॉक्टर के लिए)

1. **PC पर सेटअप करें**: Python इंस्टॉल करें, `START_CLINIC.bat` डेस्कटॉप पर रखें
2. **Settings भरें**: Doctor Panel → Settings → क्लीनिक का नाम, पता, फोन, Fee
3. **LAN कनेक्ट करें**: दोनों Reception PC और Doctor PC एक Router से जोड़ें
4. **IP नोट करें**: `ipconfig` से Server का IP नोट करें
5. **Daily Backup**: हर शाम सॉफ्टवेयर बंद करने से पहले बैकअप बनाएं
6. **Test करें**: एक Test मरीज डालें, बिल बनाएं, प्रिंट करें

---

*Made with ❤️ for Dr. Dhakad Clinic | Low Budget, High Efficiency*
