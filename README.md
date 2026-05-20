# Kanban de Seguimiento · DGTAR

Tablero Kanban para el seguimiento de actividades de la Dirección de Planificación
y Gestión Ambiental (Plan Galápagos / Régimen Especial). App **Next.js (App Router)**
con TypeScript y Tailwind, recreación fiel del prototipo de diseño.

Plataforma **abierta, sin login**. Los datos (funcionarios, competencias y
actividades) se almacenan en **PostgreSQL**, que es la fuente de verdad: la app
los lee al cargar y guarda automáticamente cada cambio (crear/mover/editar)
mediante una capa de API Routes. Todo corre **dockerizado** (app + base).

## Vistas

- **Tablero** — Kanban con 4 columnas (Pendiente · En progreso · En revisión ·
  Cumplida), drag & drop entre columnas, búsqueda y filtros por funcionario y
  competencia. Cada card muestra código, competencia, responsable, fecha de
  vencimiento y badge de plazo.
- **Estadísticas** — KPIs, distribución por estado (donut), carga de plazos,
  ranking de cumplimiento por funcionario y competencias con más actividades
  (gráficos con Recharts).
- **Catálogos** — administración de funcionarios y competencias del Estatuto
  (activar/desactivar).

Al hacer clic en una card se abre un **panel de detalle** con historial, plazo y
acciones (avanzar / marcar cumplida / reabrir). El botón **Nueva actividad**
calcula la fecha de vencimiento a partir del plazo en días.

### Colores de plazo

- 🟢 Verde — cumplida en plazo
- 🟡 Amber — vence en 3 días o menos
- 🔴 Rojo — vencida o cumplida fuera de plazo
- ⚪ Slate — plazo normal

### Vista (engranaje en el header)

- Densidad de cards: Estándar / Compacto
- Avatares con color vs. iniciales
- Acento del módulo: PG (violeta) · PMA (verde) · RGDP (azul)

## Arranque en local (Docker)

Requiere **Docker** con el plugin `compose`. Un solo comando levanta la base, la
app y siembra los datos de demo:

```bash
./deploy.sh            # build + arranque + seed (si la base está vacía)
./deploy.sh --force    # re-siembra: reescribe los datos de demo
./deploy.sh --down     # detiene y elimina los contenedores
```

Luego abre **http://localhost:3000**. `deploy.sh` crea `.env` a partir de
`.env.example` la primera vez (puedes editar usuario/clave/puertos ahí).

Qué hace por dentro:

1. `docker compose up -d --build --wait` — levanta `db` (postgres:16) y `app`
   (Next.js). La app espera a que Postgres esté *healthy*.
2. El esquema (`db/schema.sql`) se crea en el primer arranque del volumen y
   también lo asegura el seed (`CREATE TABLE IF NOT EXISTS`).
3. `npm run seed` vuelca el catálogo + actividades de demo. Es **idempotente**:
   no hace nada si ya hay datos; usa `--force` para reescribir.

### Arquitectura de datos

- **PostgreSQL** es la fuente de verdad. Tres tablas: `funcionarios`,
  `competencias`, `actividades` (ver `db/schema.sql`).
- `lib/db.ts` — capa server-only (`pg`) con `readAll` / `writeAll` (transacción).
- `app/api/data/route.ts` — `GET` lee todo, `PUT` reescribe todo.
- La app guarda el documento completo (debounce ~0.8 s) ante cualquier cambio.
  El último en escribir gana, así que no está pensada para edición simultánea de
  varias personas a la vez.

## Desarrollo sin Docker

```bash
npm install
# Necesitas un PostgreSQL accesible y DATABASE_URL en .env.local
# (p. ej. apuntando al Postgres dockerizado: postgres://kanban:kanban@localhost:5432/kanban)
npm run seed     # crea el esquema y siembra (idempotente)
npm run dev      # http://localhost:3000
npm run build    # build de producción
```

> La fecha de corte de la demo está fijada al **19 may 2026** para que los
> escenarios (vencidas, cumplidas en/fuera de plazo) se mantengan coherentes.
> Ver `lib/data.ts`.
