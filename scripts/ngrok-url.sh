#!/usr/bin/env bash
set -euo pipefail

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

port="${NGROK_WEB_PORT:-$(env_file_value NGROK_WEB_PORT 4040)}"
api_url="${NGROK_API_URL:-http://localhost:${port}/api/tunnels}"

fetch_tunnels() {
  if command -v curl >/dev/null 2>&1 && curl -fsS --max-time 3 "$api_url" 2>/dev/null; then
    return 0
  fi

  if command -v wget >/dev/null 2>&1 && wget -qO- -T 3 -t 1 "$api_url" 2>/dev/null; then
    return 0
  fi

  if command -v docker >/dev/null 2>&1; then
    if docker compose version >/dev/null 2>&1 &&
      docker compose -f docker-compose.yml -f docker-compose.ngrok.yml exec -T ngrok \
        wget -qO- -T 3 -t 1 http://127.0.0.1:4040/api/tunnels 2>/dev/null; then
      return 0
    fi

    if docker ps --format "{{.Names}}" 2>/dev/null | grep -qx "kanban-ngrok"; then
      docker exec kanban-ngrok wget -qO- -T 3 -t 1 http://127.0.0.1:4040/api/tunnels 2>/dev/null
      return $?
    fi
  fi

  if command -v docker-compose >/dev/null 2>&1 &&
    docker-compose -f docker-compose.yml -f docker-compose.ngrok.yml exec -T ngrok \
      wget -qO- -T 3 -t 1 http://127.0.0.1:4040/api/tunnels 2>/dev/null; then
    return $?
  fi

  return 1
}

if ! json="$(fetch_tunnels)"; then
  echo "Error: no pude leer ${api_url}. ¿Está corriendo el servicio ngrok?" >&2
  exit 1
fi

if command -v python3 >/dev/null 2>&1; then
  url="$(printf '%s' "$json" | python3 -c '
import json
import sys

data = json.load(sys.stdin)
tunnels = data.get("tunnels", []) if isinstance(data, dict) else []

for tunnel in tunnels:
    if tunnel.get("proto") == "https" and tunnel.get("public_url"):
        print(tunnel["public_url"])
        break
else:
    for tunnel in tunnels:
        if tunnel.get("public_url"):
            print(tunnel["public_url"])
            break
  ')"
else
  url="$(printf '%s' "$json" | sed -n 's/.*"public_url":"\([^"]*\)".*/\1/p' | head -n 1)"
fi

if [ -z "$url" ]; then
  echo "Error: ngrok está activo, pero todavía no reporta un túnel público." >&2
  exit 1
fi

printf '%s\n' "$url"
