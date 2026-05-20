#!/usr/bin/env bash
# Levanta el Kanban DGTAR en local: PostgreSQL + app Next.js en Docker, y
# siembra los datos de demo la primera vez.
#
#   ./deploy.sh            arranca todo y siembra si la base está vacía
#   ./deploy.sh --force    re-siembra (reescribe los datos de demo)
#   ./deploy.sh --down     detiene y elimina los contenedores
set -euo pipefail
cd "$(dirname "$0")"

# ── Detección de Docker / Compose ──────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "✗ Docker no está instalado o no está en el PATH." >&2
  exit 1
fi
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "✗ No se encontró 'docker compose' ni 'docker-compose'." >&2
  exit 1
fi

# ── Apagado ────────────────────────────────────────────────────────────
if [ "${1:-}" = "--down" ]; then
  echo "→ Deteniendo contenedores…"
  $DC down
  echo "✓ Detenido. (El volumen 'pgdata' se conserva; usa '$DC down -v' para borrar los datos.)"
  exit 0
fi

# ── .env para docker-compose ───────────────────────────────────────────
if [ ! -f .env ]; then
  echo "→ Creando .env desde .env.example"
  cp .env.example .env
fi

# ── Build + arranque (espera a que Postgres esté healthy) ──────────────
echo "→ Construyendo imágenes y levantando contenedores…"
$DC up -d --build --wait

# ── Seed ───────────────────────────────────────────────────────────────
echo "→ Sembrando datos…"
$DC exec -T app npm run seed -- "$@"

APP_PORT="$(grep -E '^APP_PORT=' .env | cut -d= -f2)"
APP_PORT="${APP_PORT:-3000}"

echo ""
echo "✓ Listo."
echo "  App:       http://localhost:${APP_PORT}"
echo "  Logs:      $DC logs -f app"
echo "  Detener:   ./deploy.sh --down"
