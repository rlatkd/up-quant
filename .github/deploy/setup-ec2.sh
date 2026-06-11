#!/usr/bin/env bash
# UPquant EC2(Ubuntu) 초기 1회 설정.
#   사용: ./setup-ec2.sh <api도메인> <repo-url>
#   예:  ./setup-ec2.sh api.example.com https://github.com/you/up-quant.git
# 비밀(.env)은 GitHub Actions 배포(deploy-backend.yml)가 주입하므로 여기서 만들지 않는다.
set -euo pipefail

API_DOMAIN="${1:?api 도메인을 인자로 전달하세요 (예: api.example.com)}"
REPO_URL="${2:?repo URL을 인자로 전달하세요}"
APP_DIR=/home/ubuntu/up-quant

echo "== 1) 패키지 =="
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-venv python3-pip build-essential nginx git certbot python3-certbot-nginx

echo "== 2) 스왑 2GB (t3.small pip 빌드 OOM 대비) =="
if [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

echo "== 3) 코드 + venv =="
cd /home/ubuntu
[ -d "$APP_DIR" ] || git clone "$REPO_URL" up-quant
cd "$APP_DIR/backend"
python3 -m venv .venv
.venv/bin/pip install -U pip
.venv/bin/pip install -r requirements.txt

echo "== 4) systemd 서비스 (.env는 첫 배포가 만든 뒤 start) =="
sudo cp "$APP_DIR/.github/deploy/upquant.service" /etc/systemd/system/upquant.service
sudo systemctl daemon-reload
sudo systemctl enable upquant
# 배포 스텝이 비번 없이 재시작할 수 있게
echo 'ubuntu ALL=(ALL) NOPASSWD: /bin/systemctl restart upquant, /bin/systemctl start upquant' | sudo tee /etc/sudoers.d/upquant >/dev/null

echo "== 5) nginx =="
sudo cp "$APP_DIR/.github/deploy/nginx-upquant.conf" /etc/nginx/sites-available/upquant
sudo sed -i "s/__API_DOMAIN__/${API_DOMAIN}/g" /etc/nginx/sites-available/upquant
sudo ln -sf /etc/nginx/sites-available/upquant /etc/nginx/sites-enabled/upquant
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

cat <<DONE

== 완료. 다음 수동 단계 ==
1) Route53: ${API_DOMAIN} A레코드 → 이 EC2의 Elastic IP
2) TLS 발급:   sudo certbot --nginx -d ${API_DOMAIN}
3) GitHub Secrets/Variables 등록 후 backend/ 푸시 → 배포가 .env 생성 + 서비스 start
   (또는 즉시 띄우려면 backend/.env 수동 작성 후: sudo systemctl start upquant)
DONE
