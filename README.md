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
  inicio–fin y un badge calculado respecto de la fecha de fin.
- **Estadísticas** — KPIs, distribución por estado (donut), rangos de actividad,
  ranking de cumplimiento por funcionario y competencias con más actividades
  (gráficos con Recharts).
- **Catálogos** — administración de funcionarios y competencias del Estatuto
  (activar/desactivar).

Al hacer clic en una card se abre un **panel de detalle** con historial, fechas
de inicio y fin, y acciones (avanzar / marcar cumplida / reabrir). El botón
**Nueva actividad** permite definir directamente ambas fechas. En una reunión,
inicio y fin son el mismo instante (fecha y hora).

### Colores según fecha de fin

- 🟢 Verde — cumplida
- 🟡 Amber — finaliza hoy o en 3 días o menos
- 🔴 Rojo — fecha de fin superada mientras sigue abierta
- ⚪ Slate — fecha de fin futura

### Vista (engranaje en el header)

- Densidad de cards: Estándar / Compacto
- Avatares con color vs. iniciales

## Arranque en local (Docker)

Requiere **Docker** con el plugin `compose`. Un solo comando levanta la base y la
app:

```bash
./deploy.sh dev        # desarrollo aislado con hot reload: http://localhost:3000
./deploy.sh prod       # producción: http://localhost:8001
./deploy.sh dev-down   # detiene solo desarrollo
./deploy.sh --down     # detiene desarrollo, producción y ngrok
```

`deploy.sh` crea `.env` a partir de
`.env.example` la primera vez (puedes editar usuario/clave/puertos ahí).

Qué hace por dentro:

1. `docker compose up -d --build --wait` — levanta `db` (postgres:16) y `app`
   (Next.js). En modo `dev` usa un proyecto Compose separado
   (`kanban-dgtar-dev`) con `kanban-dev-app`, monta el código local y corre
   `npm run dev`, pero se conecta a la misma PostgreSQL de producción por
   `localhost:5433`; en modo `prod` construye la imagen y corre `npm start`.
   La app espera a que Postgres esté *healthy*.
2. El esquema (`db/schema.sql`) se asegura automáticamente desde la API cuando
   la app lee o guarda datos (`CREATE TABLE IF NOT EXISTS`).

En producción, la app queda publicada localmente en `http://localhost:8001`.
En desarrollo, la app queda en `http://localhost:3000` con hot reload y comparte
la misma base de datos de producción; cualquier cambio de datos desde dev se ve
también en producción.

### ngrok dockerizado para OAuth

El backend y el frontend viven en el mismo servicio Next.js `app`. Dentro de
Docker escucha en `app:3000`; en producción se publica al host como
`http://localhost:8001` mediante `APP_PORT`. No hay Nginx, Traefik ni gateway
intermedio, y el frontend consume la API con rutas relativas `/api/...`, así
que no hace falta CORS para el flujo ngrok.

Para exponer solo la app/API por HTTPS público:

```bash
# En .env, agrega tu token de ngrok. No va en git.
NGROK_AUTHTOKEN=tu-token

./deploy.sh ngrok
./deploy.sh ngrok-url
```

Comando Compose equivalente:

```bash
docker compose -f docker-compose.yml -f docker-compose.ngrok.yml up -d --build --wait
./scripts/ngrok-url.sh
```

`docker-compose.ngrok.yml` agrega el servicio `ngrok` con la imagen oficial
`ngrok/ngrok:alpine` y apunta el túnel al puerto publicado del host Docker:
`http://host.docker.internal:8001` por defecto. En tu red privada corresponde a
la misma app que ves en `http://192.168.93.125:8001/`, pero sin hardcodear esa IP
LAN dentro del contenedor. No tuneliza PostgreSQL ni otros servicios. La API
local de inspección queda disponible solo desde el host en
`http://localhost:4040/api/tunnels` y el dashboard en `http://localhost:4040`.

Si cambias `APP_PORT`, puedes fijar el destino explícito:

```bash
NGROK_TARGET=http://host.docker.internal:8001
```

Si tienes un dominio reservado de ngrok, puedes fijarlo en `.env`:

```bash
NGROK_URL=https://tu-dominio.ngrok.app
NGROK_APP_PUBLIC_URL=https://tu-dominio.ngrok.app
NGROK_GOOGLE_REDIRECT_URI=https://tu-dominio.ngrok.app/api/google/callback
```

Con URL dinámica, deja `NGROK_APP_PUBLIC_URL` y `NGROK_GOOGLE_REDIRECT_URI`
vacíos y entra a la app desde la URL que imprime `./deploy.sh ngrok-url`. El
overlay limpia las URLs locales de `APP_PUBLIC_URL`/`GOOGLE_REDIRECT_URI` para
que el callback se construya con los headers públicos que envía ngrok.

### Arquitectura de datos

- **PostgreSQL** es la fuente de verdad. Las entidades de negocio viven en
  `gestiones`, `funcionarios`, `competencias`, `entregables`, `actividades` y
  `usuarios` (ver `db/schema.sql`).
- `lib/db.ts` — capa server-only (`pg`) con lecturas de snapshot y escrituras
  transaccionales protegidas por una revisión monotónica.
- `app/api/data/route.ts` — `GET` lee todo junto con `revision`; el `PUT` legado
  solo acepta esa misma revisión. Un documento obsoleto recibe `409` antes de
  modificar tablas, evitando que borre cambios concurrentes.
- `POST /api/activities` crea una sola actividad con una clave idempotente,
  usuario creador y huella del contenido. `GET /api/activities/verify` confirma
  la fila directamente en PostgreSQL y nunca usa caché.
- `activity_creation_requests` conserva un ledger de idempotencia separado de
  la actividad. Aunque una actividad se elimine después, una solicitud antigua
  no puede reutilizarse para crear un duplicado.
- El resto de ediciones todavía se agrupa con debounce (~0.8 s), pero sus
  escrituras se serializan en cliente y quedan protegidas contra *lost updates*
  mediante la revisión del servidor. Ante un `409`, el cliente hace un rebase de
  tres vías y solo se detiene si dos pestañas editaron la misma entidad.

### Guardado confiable de actividades

El formulario conserva borradores locales por usuario y usa una clave distinta
en cada apertura para no mezclar pestañas. El borrador más reciente se puede
recuperar aunque la pestaña anterior se haya cerrado y no se limpia ni se cierra
mientras la operación está en `saving` o `verifying`. Una creación se
considera exitosa únicamente cuando el backend vuelve a leer la fila por
`clientRequestId`, comprueba los campos principales y el cliente refresca la
lista desde `/api/data`. Si la respuesta del `POST` se pierde, el botón de
reintento consulta primero la misma clave y recupera la fila ya creada en vez de
insertar un duplicado.

```bash
npm test       # validación, borradores, red, timeout, reintento e idempotencia
npm run build  # typecheck y build de producción
```

La prueba PostgreSQL se omite si no se proporciona una base desechable. Para
ejecutarla junto con el resto de la suite:

```bash
ACTIVITY_INTEGRATION_DATABASE_URL=postgres://usuario:clave@host:5432/base_de_prueba npm test
```

Usa exclusivamente una base cuyo nombre contenga `test`: el caso de integración
rechaza otros nombres, crea y elimina fixtures, e inspecciona la migración del
esquema.

### Autenticación y usuarios

La app requiere login con email y contraseña. Hay dos roles:

- **admin** — ve todo, administra catálogos, usuarios, actividades, estados y fechas.
- **user** — queda vinculado a un funcionario; ve las actividades donde es
  responsable o participante. Puede crear y administrar actividades propias;
  además, como participante puede editar su contenido, fechas y estado. El
  responsable (o un admin) puede cambiar los participantes o eliminar la actividad;
  solo un admin puede reasignarla.

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

### Google Calendar

Cada usuario puede vincular su propia cuenta de Google desde el encabezado de la
app. La integración usa OAuth 2.0 y sincroniza las actividades visibles para ese
usuario hacia su calendario principal (`primary`):

- usuarios normales: actividades donde son responsables o participantes;
- admins: todas las actividades visibles para el administrador.

Las asignaciones se crean como eventos de día completo desde la fecha de inicio
hasta la fecha de fin, ambas inclusive. Las reuniones usan el instante común de
inicio y fin como comienzo del evento y una duración por defecto definida en
`GOOGLE_DEFAULT_EVENT_DURATION_MINUTES`.

Variables necesarias:

```bash
APP_PUBLIC_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=un-secreto-largo
GOOGLE_DEFAULT_EVENT_DURATION_MINUTES=60
```

En Google Cloud crea credenciales OAuth 2.0 de tipo **Web application** y agrega
`GOOGLE_REDIRECT_URI` como Authorized redirect URI. La app solicita el scope
`https://www.googleapis.com/auth/calendar.events` para crear, actualizar y borrar
los eventos que sincroniza en el calendario principal del usuario.

Para usar Google OAuth con ngrok, copia en Google Cloud Console la URI exacta:

```text
https://TU-DOMINIO-NGROK/api/google/callback
```

El endpoint real del proyecto es `GET /api/google/callback`. Si usas URL
dinámica gratuita de ngrok, esa URI cambia cada vez que ngrok asigne otro
dominio y debes actualizarla en Google Cloud Console antes de vincular la
cuenta. Luego abre la app desde `https://TU-DOMINIO-NGROK`, inicia sesión y usa
el botón de conexión de Google desde esa misma URL pública.

## Desarrollo sin Docker

```bash
npm install
# Necesitas un PostgreSQL accesible y DATABASE_URL en .env.local
# (p. ej. apuntando al Postgres dockerizado: postgres://kanban:kanban@localhost:5432/kanban)
npm run dev      # http://localhost:3000
npm run build    # build de producción
```
