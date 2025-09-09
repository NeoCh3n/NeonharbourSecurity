#!/usr/bin/env bash
set -euo pipefail

echo "[+] Detecting docker compose command..."
if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi
echo "[+] Using: $DC"

echo "[+] Bringing up Postgres..."
$DC up -d postgres

echo "[+] Waiting for Postgres to be ready..."
end=$((SECONDS+180))
until $DC exec -T postgres pg_isready -U neonharbour -d neonharbour -h localhost >/dev/null 2>&1; do
  if [ $SECONDS -gt $end ]; then echo "[-] Timeout waiting for Postgres"; exit 1; fi
  sleep 2
  echo -n .
done
echo
echo "[+] Postgres is ready. Running initDatabase() with RLS enabled..."

POSTGRES_CID=$($DC ps -q postgres)

docker run --rm --network container:${POSTGRES_CID} \
  -e DATABASE_URL="postgresql://neonharbour:neonharbour123@localhost:5432/neonharbour" \
  -e ENABLE_RLS=true \
  -v "$PWD/backend:/app" -w /app node:20-bullseye bash -lc \
  "npm i --no-audit --no-fund --no-save pg bcryptjs >/dev/null 2>&1 && node -e \"require('./database').initDatabase().then(()=>console.log('init ok')).catch(e=>{console.error(e);process.exit(1)})\""

echo "[+] Dumping schema to out/schema.sql ..."
mkdir -p out
$DC exec -T postgres pg_dump -U neonharbour -d neonharbour -s > out/schema.sql

echo "[+] Schema written to out/schema.sql"
echo "[i] Preview (first 80 lines):"
sed -n '1,80p' out/schema.sql || true

