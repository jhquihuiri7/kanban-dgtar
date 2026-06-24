# Kanban de Seguimiento · DGTAR

Tablero Kanban para el seguimiento de actividades de la Dirección de Planificación
y Gestión Ambiental (Plan Galápagos / Régimen Especial). App **Next.js (App Router)**
con TypeScript y Tailwind, recreación fiel del prototipo de diseño.

Plataforma con **login por email y contraseña** y roles `admin` / `user`. Los
datos (funcionarios, competencias, actividades y usuarios) se almacenan en
**PostgreSQL**, que es la fuente de verdad: la app los lee al cargar y guarda
automáticamente cada cambio permitido mediante una capa de API Routes. Todo
corre **dockerizado** (app + base de datos).

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

## Arranque en local (Docker)

Requiere **Docker** con el plugin `compose`. Un solo comando levanta la base y la
app:

```bash
./deploy.sh dev        # desarrollo con hot reload: http://localhost:3000
./deploy.sh prod       # producción: http://localhost:8001
./deploy.sh --down     # detiene y elimina los contenedores
```

`deploy.sh` crea `.env` a partir de
`.env.example` la primera vez (puedes editar usuario/clave/puertos ahí).

Qué hace por dentro:

1. `docker compose up -d --build --wait` — levanta `db` (postgres:16) y `app`
   (Next.js). En modo `dev` monta el código local y corre `npm run dev`; en
   modo `prod` construye la imagen y corre `npm start`. La app espera a que
   Postgres esté *healthy*.
2. El esquema (`db/schema.sql`) se asegura automáticamente desde la API cuando
   la app lee o guarda datos (`CREATE TABLE IF NOT EXISTS`).

En producción, la app queda publicada localmente en `http://localhost:8001`.

### Arquitectura de datos

- **PostgreSQL** es la fuente de verdad. Tres tablas: `funcionarios`,
  `competencias`, `actividades` y `usuarios` (ver `db/schema.sql`).
- `lib/db.ts` — capa server-only (`pg`) con `readAll` / `writeAll` (transacción).
- `app/api/data/route.ts` — `GET` lee todo, `PUT` reescribe todo.
- La app guarda el documento completo (debounce ~0.8 s) ante cualquier cambio.
  El último en escribir gana, así que no está pensada para edición simultánea de
  varias personas a la vez.

### Autenticación y usuarios

La app requiere login con email y contraseña. Hay dos roles:

- **admin** — ve todo, administra catálogos, usuarios, actividades, estados y fechas.
- **user** — queda vinculado a un funcionario; solo ve sus actividades. Puede crear
  actividades propias y editar campos de texto, pero no fechas, estado, funcionario
  responsable ni catálogos.

Para crear el primer usuario admin:

```bash
npm run create -- admin admin@dgtar.local "ClaveSegura123"
```

Para crear un usuario vinculado a un funcionario:

```bash
npm run create -- user persona@dgtar.local "ClaveSegura123" funcionario_id "Nombre visible"
```

El login incluye recuperación de contraseña. Sin servidor de correo configurado,
la app genera un enlace de recuperación desde la pantalla de login y también lo
registra en logs del servidor.

## Desarrollo sin Docker

```bash
npm install
# Necesitas un PostgreSQL accesible y DATABASE_URL en .env.local
# (p. ej. apuntando al Postgres dockerizado: postgres://kanban:kanban@localhost:5432/kanban)
npm run dev      # http://localhost:3000
npm run build    # build de producción
```
