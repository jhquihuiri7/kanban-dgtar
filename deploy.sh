#!/usr/bin/env bash
# Operaciones Docker para Kanban DGTAR.
#
# La app y la API corren en el mismo servicio Next.js:
#   App: http://localhost:${APP_PORT}
#   API: http://localhost:${APP_PORT}/api
# En producción, la app queda publicada en:
#   http://localhost:${APP_PORT}
set -euo pipefail

cd "$(dirname "$0")"

ACTION="${1:-}"
SERVICE="${2:-}"
EXTRA_ARGS=("${@:2}")

usage() {
  local code="${1:-1}"
  cat <<'EOF'
Uso: ./deploy.sh {dev|up|prod|ngrok|down|dev-down|update|update-dev|rebuild|rebuild-dev|logs|dev-logs|ngrok-logs|ngrok-url|migrate|restart|ps|shell|db-shell|create-user} [servicio|args]

  dev            Levanta desarrollo aislado (puerto 3000, hot reload)
  up, prod       Levanta en modo producción (APP_PORT 8001 por defecto)
  ngrok          Levanta producción + túnel público HTTPS de ngrok
  down           Detiene todos los servicios
  dev-down       Detiene solo los servicios de desarrollo
  update         Reconstruye e inicia producción con el código actual
  update-dev     Reconstruye e inicia desarrollo con el código actual
  rebuild        Reconstruye imágenes de producción sin caché
  rebuild-dev    Reconstruye imágenes de desarrollo sin caché
  logs           Muestra logs de producción
  dev-logs       Muestra logs de desarrollo
  ngrok-logs     Muestra logs de ngrok
  ngrok-url      Imprime la URL HTTPS pública actual de ngrok
  migrate        Aplica db/schema.sql en PostgreSQL
  restart        Reinicia un servicio de producción
  ps             Lista contenedores
  shell          Abre shell en un servicio de producción (app por defecto)
  db-shell       Abre psql en PostgreSQL
  create-user    Crea/actualiza usuario desde scripts/create-user.mjs

Ejemplos:
  ./deploy.sh dev
  ./deploy.sh ngrok
  ./deploy.sh ngrok-url
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
DEV_PROJECT="${DEV_PROJECT:-kanban-dgtar-dev}"
DEV_FILES=(-f docker-compose.dev.yml)
NGROK_FILES=(-f docker-compose.yml -f docker-compose.ngrok.yml)

dc_prod() {
  COMPOSE_PROFILES="" "${COMPOSE[@]}" "${PROD_FILES[@]}" "$@"
}

dc_dev() {
  COMPOSE_PROFILES="" "${COMPOSE[@]}" -p "$DEV_PROJECT" "${DEV_FILES[@]}" "$@"
}

dc_ngrok() {
  COMPOSE_PROFILES="" "${COMPOSE[@]}" "${NGROK_FILES[@]}" "$@"
}

ngrok_active() {
  docker ps --format "{{.Names}}" 2>/dev/null | grep -qx "kanban-ngrok"
}

# Usa la config de ngrok si el túnel ya está activo, para no perder los
# overrides (APP_PUBLIC_URL vacío, AUTH_COOKIE_SECURE, etc.) al redeployar.
dc_auto() {
  if ngrok_active; then
    dc_ngrok "$@"
  else
    dc_prod "$@"
  fi
}

print_access() {
  local mode="$1"
  local port="$2"
  local db_port="${3:-}"
  if [ -z "$db_port" ]; then
    db_port="$(env_file_value POSTGRES_PORT 5432)"
  fi

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

require_ngrok_token() {
  local token="${NGROK_AUTHTOKEN:-}"

  if [ -z "$token" ]; then
    token="$(env_file_value NGROK_AUTHTOKEN "")"
  fi

  if [ -z "$token" ]; then
    echo "Error: falta NGROK_AUTHTOKEN. Agrégalo en .env antes de ejecutar ./deploy.sh ngrok." >&2
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
    dev_app_port="${DEV_APP_PORT:-$(env_file_value DEV_APP_PORT 3000)}"
    export DEV_APP_PORT="$dev_app_port"
    echo "Levantando servicios en modo desarrollo..."
    dc_dev up -d --build --wait --remove-orphans
    print_access "desarrollo" "$dev_app_port"
    echo "  Logs:     ./deploy.sh dev-logs"
    ;;

  up|prod)
    ensure_env
    export APP_PORT="${APP_PORT:-$(env_file_value APP_PORT 8001)}"
    echo "Levantando servicios en modo producción..."
    dc_auto up -d --wait
    if ngrok_active; then
      echo "(ngrok activo: se preservó la config del túnel)"
    fi
    print_access "producción" "$APP_PORT"
    echo "  Logs:     ./deploy.sh logs"
    ;;

  ngrok|prod-ngrok)
    ensure_env
    require_ngrok_token
    export APP_PORT="${APP_PORT:-$(env_file_value APP_PORT 8001)}"
    ngrok_port="${NGROK_WEB_PORT:-$(env_file_value NGROK_WEB_PORT 4040)}"
    ngrok_target="${NGROK_TARGET:-$(env_file_value NGROK_TARGET "http://host.docker.internal:${APP_PORT}")}"
    echo "Levantando servicios en producción con ngrok..."
    dc_ngrok up -d --build --wait
    print_access "producción + ngrok" "$APP_PORT"
    echo "  ngrok ->  ${ngrok_target}"
    echo "  ngrok API: http://localhost:${ngrok_port}/api/tunnels"
    echo "  URL HTTPS: ./deploy.sh ngrok-url"
    echo "  Logs:     ./deploy.sh ngrok-logs"
    ;;

  down|--down)
    ensure_env
    echo "Deteniendo servicios..."
    dc_ngrok down
    dc_dev down --remove-orphans
    dc_prod down
    echo "Servicios detenidos. Los volúmenes de datos se conservan."
    ;;

  dev-down)
    ensure_env
    echo "Deteniendo servicios de desarrollo..."
    dc_dev down --remove-orphans
    echo "Servicios de desarrollo detenidos. Producción/ngrok no se toca."
    ;;

  update)
    ensure_env
    export APP_PORT="${APP_PORT:-$(env_file_value APP_PORT 8001)}"
    if [ -n "$SERVICE" ]; then
      echo "Actualizando $SERVICE en producción..."
      dc_auto up -d --build --wait "$SERVICE"
    else
      echo "Actualizando todos los servicios en producción..."
      dc_auto up -d --build --wait
    fi
    if ngrok_active; then
      echo "(ngrok activo: se preservó la config del túnel)"
    fi
    print_access "producción" "$APP_PORT"
    ;;

  update-dev)
    ensure_env
    dev_app_port="${DEV_APP_PORT:-$(env_file_value DEV_APP_PORT 3000)}"
    export DEV_APP_PORT="$dev_app_port"
    if [ -n "$SERVICE" ]; then
      echo "Actualizando $SERVICE en desarrollo..."
      dc_dev up -d --build --wait --remove-orphans "$SERVICE"
    else
      echo "Actualizando todos los servicios en desarrollo..."
      dc_dev up -d --build --wait --remove-orphans
    fi
    print_access "desarrollo" "$dev_app_port"
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

  ngrok-logs)
    ensure_env
    if [ -n "$SERVICE" ]; then
      dc_ngrok logs -f "$SERVICE"
    else
      dc_ngrok logs -f ngrok
    fi
    ;;

  ngrok-url)
    ensure_env
    ./scripts/ngrok-url.sh
    ;;

  migrate)
    ensure_env
    echo "Aplicando db/schema.sql..."
    dc_prod up -d --wait db
    # El esquema entra por stdin para no depender del inode de un bind-mount
    # antiguo cuando db/schema.sql fue reemplazado en el host. Una sola
    # transacción y ON_ERROR_STOP garantizan rollback completo ante cualquier
    # error; el mismo advisory lock serializa este comando con ensureSchema().
    dc_prod exec -T db sh -lc \
      'psql -v ON_ERROR_STOP=1 --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT pg_advisory_xact_lock(hashtext(\$\$kanban-dgtar-schema-v1\$\$))" -f -' \
      < db/schema.sql
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
