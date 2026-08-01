#!/bin/bash
# KJB Gateway Bot — Oracle Cloud Free Tier Setup Script
# Run this on your Oracle VM after SSHing in
set -e

echo "=========================================="
echo "  KJB Gateway Bot — Oracle Cloud Setup"
echo "=========================================="

# 1. Install Node.js 20 LTS
echo "[1/6] Installing Node.js 20 LTS..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "  Node.js: $(node --version)"
echo "  npm:     $(npm --version)"

# 2. Install pm2 (process manager)
echo "[2/6] Installing pm2..."
if ! command -v pm2 &> /dev/null; then
  sudo npm install -g pm2
fi
echo "  pm2: $(pm2 --version)"

# 3. Create bot directory
echo "[3/6] Setting up bot directory..."
mkdir -p ~/kjb-gateway-bot
cd ~/kjb-gateway-bot

# 4. Clone or update from GitHub
if [ -d ".git" ]; then
  echo "  Updating existing bot..."
  git pull
else
  echo ""
  echo "  Enter your GitHub repo URL (or press Enter to skip and create files manually):"
  read -r REPO_URL
  if [ -n "$REPO_URL" ]; then
    git clone "$REPO_URL" .
  fi
fi

# 5. Install dependencies
if [ -f "package.json" ]; then
  echo "[4/6] Installing dependencies..."
  npm install
fi

# 6. Anti-idle cron job (prevents Oracle from reclaiming the VM)
echo "[5/6] Setting up anti-idle cron job..."
CRON_LINE="*/5 * * * * /usr/bin/dd if=/dev/zero of=/dev/null bs=1M count=50 2>/dev/null"
( crontab -l 2>/dev/null | grep -v "dev/zero" ; echo "$CRON_LINE" ) | crontab -
echo "  Cron job installed (runs 5 seconds of CPU every 5 minutes)"

# 7. Set up pm2 startup script (auto-restart on reboot)
echo "[6/6] Setting up pm2 startup..."
pm2 startup systemd -u $(whoami) --hp /home/$(whoami) 2>/dev/null || true

echo ""
echo "=========================================="
echo "  Setup complete!"
echo "=========================================="
echo ""
echo "To start the bot:"
echo "  cd ~/kjb-gateway-bot"
echo "  DISCORD_BOT_TOKEN=your_token_here pm2 start bot.js --name kjb-gateway"
echo "  pm2 save"
echo ""
echo "To check status:"
echo "  pm2 status"
echo "  pm2 logs kjb-gateway"
echo ""
echo "To stop:"
echo "  pm2 stop kjb-gateway"
echo ""
echo "⚠️  Don't forget to enable Message Content Intent"
echo "    in the Discord Developer Portal first!"
echo "=========================================="
