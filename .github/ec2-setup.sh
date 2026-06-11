#!/usr/bin/env bash
# =============================================================================
# UPquant EC2(Ubuntu) 최초 1회 부트스트랩 — 참고용 명령 모음 (민감값은 <...>로 가림)
# CI/CD(deploy-backend.yml)는 이후 git pull·pip·restart만 하므로, 아래는 "한 번"만 한다.
# =============================================================================

# ── [사전] AWS 콘솔에서 먼저 ──────────────────────────────────────────────
#  • EC2: t3.small / Ubuntu / 30GiB gp3 / Elastic IP 연결
#  • 보안 그룹 인바운드: 22(SSH, 내 IP) · 80(HTTP) · 443(HTTPS)   ← 80/443 없으면 certbot 실패
#  • Route53: api.skku.site  A(별칭 아니오) → EC2의 Elastic IP
#  • (FE) Route53: www.skku.site A(별칭) → CloudFront

# ── 접속 ──────────────────────────────────────────────────────────────────
#  ssh -i "<키>.pem" ubuntu@<EIP>     # Windows면 .pem 권한: icacls <키>.pem /inheritance:r /grant:r "%USERNAME%:R"

# ── 1) 패키지 ──────────────────────────────────────────────────────────────
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-venv python3-pip build-essential nginx git certbot python3-certbot-nginx

# ── 2) 스왑 2GB (pip 빌드 OOM 대비) ────────────────────────────────────────
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# ── 3) 코드 + venv ─────────────────────────────────────────────────────────
cd /home/ubuntu
git clone <레포-URL> up-quant          # 비공개면 deploy key 등록 후 git@github.com:<ID>/up-quant.git
cd up-quant/backend
python3 -m venv .venv
.venv/bin/pip install -U pip
.venv/bin/pip install -r requirements.txt

# ── 4) systemd 서비스 (⚠️ 단일 프로세스 — 멀티워커 금지) ────────────────────
sudo tee /etc/systemd/system/upquant.service > /dev/null <<'EOF'
[Unit]
Description=UPquant FastAPI
After=network.target
[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/up-quant/backend
EnvironmentFile=/home/ubuntu/up-quant/backend/.env
ExecStart=/home/ubuntu/up-quant/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable upquant
echo 'ubuntu ALL=(ALL) NOPASSWD: /bin/systemctl restart upquant, /bin/systemctl start upquant' | sudo tee /etc/sudoers.d/upquant > /dev/null

# ── 5) nginx 리버스 프록시 (REST + WS 같은 호스트) ─────────────────────────
sudo tee /etc/nginx/sites-available/upquant > /dev/null <<'EOF'
server {
    listen 80;
    server_name api.skku.site;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/upquant /etc/nginx/sites-enabled/upquant
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# ── 6) TLS (api.skku.site A→EIP + SG 80/443 열린 뒤) ───────────────────────
sudo certbot --nginx -d api.skku.site

# ── 7) .env 작성 (CI가 이후 덮어쓰므로 GitHub Secret과 값 동일하게!) ────────
#  AUTH_SECRET 생성:  python3 -c "import secrets; print(secrets.token_hex(32))"
#  vi /home/ubuntu/up-quant/backend/.env  →  i  →  아래 입력  →  Esc  →  :wq
#    AUTH_SECRET=<생성한 64자리 — GitHub Secret과 동일값>
#    AUTH_USERNAME=test
#    AUTH_PASSWORD=test
#    COOKIE_SECURE=1
#    CORS_ORIGINS=https://www.skku.site
#    GEMINI_API_KEY=<GEMINI_API_KEY>
#    SKIP_PREFETCH=0

# ── 8) 기동 + 확인 ─────────────────────────────────────────────────────────
sudo systemctl start upquant
sudo systemctl status upquant            # active (running)
journalctl -u upquant -f                 # 프리페치(1~2분) 끝날 때까지 로그, 한산해지면 Ctrl+C
curl -s localhost:8000/health            # {"status":"ok","ready":true}
curl -s https://api.skku.site/health     # 도메인으로도 확인(nginx+TLS+DNS)

# =============================================================================
# 이후 배포: GitHub main에 backend/** 푸시 → deploy-backend.yml 가 git pull·pip·restart 자동.
# 서버 종료/재시작:  sudo systemctl restart upquant   /   stop   /   status
# 로그:             journalctl -u upquant -n 100 --no-pager
# =============================================================================
