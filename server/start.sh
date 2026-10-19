#!/data/data/com.termux/files/usr/bin/sh
# محلي (نفس الواي فاي):  sh start.sh
# من أي مكان بالعالم:     sh start.sh public
cd "$(dirname "$0")"
[ -d node_modules ] || npm install --omit=dev
command -v termux-wake-lock >/dev/null && termux-wake-lock
if [ "$1" = "public" ]; then
  PLAIN=1 node server.js & sleep 2
  echo ">>> انتظر ظهور رابط https://....trycloudflare.com وأعطه لأصحابك"
  exec cloudflared tunnel --url http://localhost:3000
fi
[ -f key.pem ] || openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 3650 -subj /CN=hamsa
echo "عنوانك: https://$(ifconfig 2>/dev/null | grep -o 'inet 192[0-9.]*' | head -1 | cut -d' ' -f2):3000"
exec node server.js
