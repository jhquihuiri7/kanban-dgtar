#!/usr/bin/env bash
# Levanta el Kanban DGTAR en local: PostgreSQL + app Next.js en Docker, y
# siembra los datos de demo la primera vez.
#
#   ./deploy.sh dev            arranca con hot reload
#   ./deploy.sh prod           arranca producción en APP_PORT (8001 por defecto)
#   ./deploy.sh --force        producción + re-siembra datos demo
#   ./deploy.sh --down         detiene y elimina los contenedores
set -euo pipefail
cd "$(dirname "$0")"

MODE="prod"
SEED_ARGS=()

for arg in "$@"; do
  case "$arg" in
    dev|--dev)
      MODE="dev"
      ;;
    prod|--prod)
      MODE="prod"
      ;;
    --force)
      SEED_ARGS+=("$arg")
      ;;
    --down)
      MODE="down"
      ;;
    *)
      echo "✗ Opción no reconocida: $arg" >&2
      echo "  Uso: ./deploy.sh [dev|prod] [--force] | ./deploy.sh --down" >&2
      exit 1
      ;;
  esac
done

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
if [ "$MODE" = "down" ]; then
  echo "→ Deteniendo contenedores…"
  $DC -f docker-compose.yml -f docker-compose.dev.yml down
  echo "✓ Detenido. (El volumen 'pgdata' se conserva; usa '$DC down -v' para borrar los datos.)"
  exit 0
fi

# ── .env para docker-compose ───────────────────────────────────────────
if [ ! -f .env ]; then
  echo "→ Creando .env desde .env.example"
  cp .env.example .env
fi

if [ "$MODE" = "prod" ]; then
  COMPOSE_FILES="-f docker-compose.yml"
  DEFAULT_APP_PORT="8001"
  export APP_PORT="${APP_PORT:-8001}"
  echo "→ Construyendo imagen de producción y levantando contenedores…"
else
  COMPOSE_FILES="-f docker-compose.yml -f docker-compose.dev.yml"
  DEFAULT_APP_PORT="3000"
  export APP_PORT="${APP_PORT:-3000}"
  echo "→ Levantando desarrollo con hot reload…"
fi
RUN_APP_PORT="${APP_PORT:-$DEFAULT_APP_PORT}"

# ── Build + arranque (espera a que Postgres esté healthy) ──────────────
$DC $COMPOSE_FILES up -d --build --wait

# ── Seed ───────────────────────────────────────────────────────────────
echo "→ Sembrando datos…"
$DC $COMPOSE_FILES exec -T app npm run seed -- "${SEED_ARGS[@]}"

echo ""
echo "✓ Listo."
echo "  Modo:      $MODE"
echo "  App:       http://localhost:${RUN_APP_PORT}"
echo "  Logs:      $DC $COMPOSE_FILES logs -f app"
echo "  Detener:   ./deploy.sh --down"
