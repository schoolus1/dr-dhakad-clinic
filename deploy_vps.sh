#!/usr/bin/env bash
set -e

echo "=================================================="
echo "   🩺 Dr. Dhakad Clinic - VPS Deployment Setup   "
echo "=================================================="
echo ""

# 1. Target Directory (Completely isolated)
TARGET_DIR="/var/www/dr-dhakad-clinic"
echo "[1/6] सुरक्षित डायरेक्टरी बनाई जा रही है: $TARGET_DIR..."
mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"

# 2. Clone or Pull from GitHub
echo "[2/6] कोड डाउनलोड / अपडेट किया जा रहा है..."
if [ -d "$TARGET_DIR/.git" ]; then
    git pull origin main
else
    git clone https://github.com/schoolus1/dr-dhakad-clinic.git .
fi

# 3. System Packages (Python3, venv, pip)
echo "[3/6] Python3 और आवश्यक पैकेज चेक किए जा रहे हैं..."
apt-get update -y > /dev/null 2>&1 || true
apt-get install -y python3 python3-pip python3-venv > /dev/null 2>&1 || true

# 4. Isolated Python Virtual Environment
echo "[4/6] अलग Virtual Environment (venv) तैयार किया जा रहा है..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install --upgrade pip > /dev/null 2>&1 || true
pip install -r requirements.txt > /dev/null 2>&1
pip install gunicorn > /dev/null 2>&1

# 5. Check Port Availability (Default 5000, fallback to 5005)
PORT=5000
if ss -tuln 2>/dev/null | grep -q ":$PORT "; then
    echo "[चेतावनी] पोर्ट 5000 पहले से व्यस्त है। पोर्ट 5005 इस्तेमाल किया जा रहा है।"
    PORT=5005
fi

# 6. Configure systemd Service for 24/7 background running
echo "[5/6] 24/7 ऑटो-स्टार्ट सर्विस (systemd) बनाई जा रही है..."
cat <<EOF > /etc/systemd/system/dr-dhakad-clinic.service
[Unit]
Description=Dr. Dhakad Clinic Management Software
After=network.target

[Service]
User=root
WorkingDirectory=$TARGET_DIR
Environment="PATH=$TARGET_DIR/venv/bin"
ExecStart=$TARGET_DIR/venv/bin/gunicorn --workers 3 --bind 0.0.0.0:$PORT app:app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable dr-dhakad-clinic
systemctl restart dr-dhakad-clinic

# 7. Open Firewall if UFW active
if command -v ufw > /dev/null 2>&1 && ufw status | grep -q "Status: active"; then
    echo "[6/6] फायरवॉल में पोर्ट $PORT खोला जा रहा है..."
    ufw allow $PORT/tcp > /dev/null 2>&1 || true
fi

echo ""
echo "=================================================="
echo "   ✅ बधाई! डॉक्टर क्लीनिक सॉफ्टवेयर लाइव हो गया है!  "
echo "=================================================="
echo ""
echo "🌐 डॉक्टर को टेस्टिंग के लिए यह लिंक दें:"
echo "   http://72.60.223.224:$PORT"
echo ""
echo "📋 डिफ़ॉल्ट लॉगिन जानकारी:"
echo "   Doctor   : username=doctor   , password=doctor123"
echo "   Reception: username=reception, password=reception123"
echo ""
echo "📺 Live Waiting Room TV:"
echo "   http://72.60.223.224:$PORT/tv"
echo ""
echo "ℹ️  मौजूदा किसी भी पुराने प्रोजेक्ट को बिल्कुल नहीं छेड़ा गया।"
echo "=================================================="
