#!/usr/bin/env bash
# Operaciones Docker para Kanban DGTAR.
#
# La app y la API corren en el mismo servicio Next.js:
#   App: http://localhost:${APP_PORT}
#   API: http://localhost:${APP_PORT}/api
set -euo pipefail

cd "$(dirname "$0")"

ACTION="${1:-}"
SERVICE="${2:-}"
EXTRA_ARGS=("${@:2}")

usage() {
  local code="${1:-1}"
  cat <<'EOF'
Uso: ./deploy.sh {dev|up|prod|down|update|update-dev|rebuild|rebuild-dev|logs|dev-logs|migrate|restart|ps|shell|db-shell|create-user} [servicio|args]

  dev            Levanta en modo desarrollo (puerto 3000, hot reload)
  up, prod       Levanta en modo producción (APP_PORT de .env, 8001 por defecto)
  down           Detiene todos los servicios
  update         Reconstruye e inicia producción con el código actual
  update-dev     Reconstruye e inicia desarrollo con el código actual
  rebuild        Reconstruye imágenes de producción sin caché
  rebuild-dev    Reconstruye imágenes de desarrollo sin caché
  logs           Muestra logs de producción
  dev-logs       Muestra logs de desarrollo
  migrate        Aplica db/schema.sql en PostgreSQL
  restart        Reinicia un servicio de producción
  ps             Lista contenedores
  shell          Abre shell en un servicio de producción (app por defecto)
  db-shell       Abre psql en PostgreSQL
  create-user    Crea/actualiza usuario desde scripts/create-user.mjs

Ejemplos:
  ./deploy.sh dev
  ./deploy.sh update app
  ./deploy.sh logs app
  ./deploy.sh restart app
  ./deploy.sh shell app
  ./deploy.sh create-user admin admin@admin.com "ClaveSegura123"
EOF
  exit "$code"
}

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Error: Docker no está instalado o no está en el PATH." >&2
    exit 1
  fi

  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
  else
    echo "Error: no se encontró 'docker compose' ni 'docker-compose'." >&2
    exit 1
  fi
}

ensure_env() {
  if [ ! -f .env ]; then
    echo "Creando .env desde .env.example"
    cp .env.example .env
  fi
}

env_file_value() {
  local key="$1"
  local default="$2"
  local value=""

  if [ -f .env ]; then
    value="$(grep -E "^${key}=" .env | tail -n 1 | cut -d= -f2- || true)"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
  fi

  printf '%s\n' "${value:-$default}"
}

PROD_FILES=(-f docker-compose.yml)
DEV_FILES=(-f docker-compose.yml -f docker-compose.dev.yml)

dc_prod() {
  "${COMPOSE[@]}" "${PROD_FILES[@]}" "$@"
}

dc_dev() {
  "${COMPOSE[@]}" "${DEV_FILES[@]}" "$@"
}

print_access() {
  local mode="$1"
  local port="$2"
  local db_port
  db_port="$(env_file_value POSTGRES_PORT 5432)"

  echo ""
  echo "Listo."
  echo "  Modo:     $mode"
  echo "  App:      http://localhost:${port}"
  echo "  API:      http://localhost:${port}/api"
  echo "  Database: localhost:${db_port}"
}

require_service() {
  if [ -z "$SERVICE" ]; then
    echo "Error: especifica el servicio. Ejemplo: ./deploy.sh restart app" >&2
    exit 1
  fi
}

case "$ACTION" in
  "" )
    usage 1
    ;;
  -h|--help|help)
    usage 0
    ;;
esac

ensure_docker

case "$ACTION" in
  dev)
    ensure_env
    export APP_PORT="${APP_PORT:-3000}"
    echo "Levantando servicios en modo desarrollo..."
    dc_dev up -d --build --wait
    print_access "desarrollo" "$APP_PORT"
    echo "  Logs:     ./deploy.sh dev-logs"
    ;;

  up|prod)
    ensure_env
    export APP_PORT="${APP_PORT:-$(env_file_value APP_PORT 8001)}"
    echo "Levantando servicios en modo producción..."
    dc_prod up -d --wait
    print_access "producción" "$APP_PORT"
    echo "  Logs:     ./deploy.sh logs"
    ;;

  down|--down)
    ensure_env
    echo "Deteniendo servicios..."
    dc_dev down
    dc_prod down
    echo "Servicios detenidos. Los volúmenes de datos se conservan."
    ;;

  update)
    ensure_env
    export APP_PORT="${APP_PORT:-$(env_file_value APP_PORT 8001)}"
    if [ -n "$SERVICE" ]; then
      echo "Actualizando $SERVICE en producción..."
      dc_prod up -d --build --wait "$SERVICE"
    else
      echo "Actualizando todos los servicios en producción..."
      dc_prod up -d --build --wait
    fi
    print_access "producción" "$APP_PORT"
    ;;

  update-dev)
    ensure_env
    export APP_PORT="${APP_PORT:-3000}"
    if [ -n "$SERVICE" ]; then
      echo "Actualizando $SERVICE en desarrollo..."
      dc_dev up -d --build --wait "$SERVICE"
    else
      echo "Actualizando todos los servicios en desarrollo..."
      dc_dev up -d --build --wait
    fi
    print_access "desarrollo" "$APP_PORT"
    ;;

  rebuild)
    ensure_env
    if [ -n "$SERVICE" ]; then
      echo "Reconstruyendo imagen de producción: $SERVICE..."
      dc_prod build --no-cache "$SERVICE"
    else
      echo "Reconstruyendo imágenes de producción..."
      dc_prod build --no-cache
    fi
    echo "Imágenes reconstruidas."
    ;;

  rebuild-dev)
    ensure_env
    if [ -n "$SERVICE" ]; then
      echo "Reconstruyendo imagen de desarrollo: $SERVICE..."
      dc_dev build --no-cache "$SERVICE"
    else
      echo "Reconstruyendo imágenes de desarrollo..."
      dc_dev build --no-cache
    fi
    echo "Imágenes reconstruidas."
    ;;

  logs)
    ensure_env
    if [ -n "$SERVICE" ]; then
      dc_prod logs -f "$SERVICE"
    else
      dc_prod logs -f
    fi
    ;;

  dev-logs)
    ensure_env
    if [ -n "$SERVICE" ]; then
      dc_dev logs -f "$SERVICE"
    else
      dc_dev logs -f
    fi
    ;;

  migrate)
    ensure_env
    echo "Aplicando db/schema.sql..."
    dc_prod up -d --wait db
    dc_prod exec db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /docker-entrypoint-initdb.d/01-schema.sql'
    echo "Migración completada."
    ;;

  restart)
    ensure_env
    require_service
    echo "Reiniciando $SERVICE..."
    dc_prod restart "$SERVICE"
    ;;

  ps|status)
    ensure_env
    dc_prod ps
    ;;

  shell)
    ensure_env
    dc_prod exec "${SERVICE:-app}" sh
    ;;

  db-shell)
    ensure_env
    dc_prod exec db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
    ;;

  create-user)
    ensure_env
    if [ "${#EXTRA_ARGS[@]}" -lt 3 ]; then
      echo "Uso:"
      echo "  ./deploy.sh create-user admin admin@admin.com \"ClaveSegura123\""
      echo "  ./deploy.sh create-user user usuario@dominio.com \"ClaveSegura123\" funcionario_id \"Nombre visible\""
      exit 1
    fi
    dc_prod up -d --wait db app
    dc_prod exec app npm run create -- "${EXTRA_ARGS[@]}"
    ;;

  *)
    echo "Error: acción no reconocida: $ACTION" >&2
    usage 1
    ;;
esac
