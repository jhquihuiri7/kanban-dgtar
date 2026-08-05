-- Esquema del Kanban DGTAR. Idempotente: seguro de re-ejecutar.
-- Las fechas se guardan como texto ISO (YYYY-MM-DD en asignaciones y
-- YYYY-MM-DDTHH:mm en reuniones) para preservar el valor exacto sin desfases
-- de zona horaria.

-- Gestiones: catálogo padre de competencias y entregables. Reemplaza el
-- enum fijo UNIDADES que antes vivía solo en código.
CREATE TABLE IF NOT EXISTS gestiones (
  id     text PRIMARY KEY,
  nombre text NOT NULL,
  color  text NOT NULL DEFAULT ''
);

-- Siembra de las gestiones que hoy existen como texto libre en
-- funcionarios.unidad / competencias.unidad, con ids fijos para que el
-- backfill de abajo pueda enlazarlas por nombre.
INSERT INTO gestiones (id, nombre, color) VALUES
  ('g1', 'DGTAR', '#0ea5e9'),
  ('g2', 'Gestión Territorial', '#22c55e'),
  ('g3', 'Gestión y Saneamiento Ambiental', '#8b5cf6'),
  ('g4', 'Gestión de Riesgos', '#14b8a6')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS funcionarios (
  id         text PRIMARY KEY,
  nombre     text NOT NULL,
  email      text NOT NULL DEFAULT '',
  cargo      text NOT NULL DEFAULT '',
  gestion_id text NOT NULL REFERENCES gestiones(id),
  color      text NOT NULL DEFAULT ''
);

ALTER TABLE funcionarios DROP COLUMN IF EXISTS activo;

CREATE TABLE IF NOT EXISTS competencias (
  id         text PRIMARY KEY,
  nombre     text NOT NULL,
  gestion_id text NOT NULL REFERENCES gestiones(id) ON DELETE CASCADE
);

ALTER TABLE competencias DROP COLUMN IF EXISTS codigo;
ALTER TABLE competencias DROP COLUMN IF EXISTS articulo;
ALTER TABLE competencias DROP COLUMN IF EXISTS activo;

-- Cada entregable pertenece a una sola competencia (y a la gestión de esta).
CREATE TABLE IF NOT EXISTS entregables (
  id             text PRIMARY KEY,
  nombre         text NOT NULL,
  competencia_id text NOT NULL REFERENCES competencias(id) ON DELETE CASCADE
);

-- Migración: entregables colgaban de la gestión y pasan a colgar de la
-- competencia. El bloque solo corre mientras exista la columna antigua, así que
-- una base ya migrada (o recién creada) lo salta.
DO $entregables$
DECLARE
  ultimo_id int;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entregables' AND column_name = 'gestion_id'
  ) THEN
    ALTER TABLE entregables
      ADD COLUMN IF NOT EXISTS competencia_id text REFERENCES competencias(id) ON DELETE CASCADE;

    -- 1. La competencia que más lo usa conserva la fila original.
    CREATE TEMP TABLE _ent_pares ON COMMIT DROP AS
      SELECT a.entregable_id AS ent, a.competencia_id AS comp, count(*) AS usos
      FROM actividades a
      WHERE a.entregable_id IS NOT NULL
      GROUP BY 1, 2;

    CREATE TEMP TABLE _ent_principal ON COMMIT DROP AS
      SELECT DISTINCT ON (ent) ent, comp
      FROM _ent_pares
      ORDER BY ent, usos DESC, comp;

    UPDATE entregables e
    SET competencia_id = p.comp
    FROM _ent_principal p
    WHERE e.id = p.ent;

    -- 2. Cada competencia adicional recibe su propia copia y sus actividades
    --    se repuntan a ella: así ningún entregable queda compartido y ninguna
    --    actividad pierde el vínculo.
    SELECT coalesce(max(nullif(regexp_replace(id, '\D', '', 'g'), '')::int), 0)
      INTO ultimo_id FROM entregables;

    CREATE TEMP TABLE _ent_replicas ON COMMIT DROP AS
      SELECT s.ent,
             s.comp,
             'e' || (ultimo_id + row_number() OVER (ORDER BY s.ent, s.comp))::text AS nuevo_id
      FROM _ent_pares s
      JOIN _ent_principal p ON p.ent = s.ent
      WHERE s.comp <> p.comp;

    -- gestion_id sigue siendo NOT NULL hasta el final del bloque: la réplica
    -- hereda la gestión del original.
    INSERT INTO entregables (id, nombre, gestion_id, competencia_id)
    SELECT r.nuevo_id, e.nombre, e.gestion_id, r.comp
    FROM _ent_replicas r
    JOIN entregables e ON e.id = r.ent;

    UPDATE actividades a
    SET entregable_id = r.nuevo_id
    FROM _ent_replicas r
    WHERE a.entregable_id = r.ent AND a.competencia_id = r.comp;

    -- 3. Los que ninguna actividad usa van a la primera competencia de su
    --    gestión; quedan visibles en Catálogos para reubicarlos a mano.
    UPDATE entregables e
    SET competencia_id = (
      SELECT c.id FROM competencias c WHERE c.gestion_id = e.gestion_id ORDER BY c.id LIMIT 1
    )
    WHERE e.competencia_id IS NULL;

    -- 4. Un entregable de una gestión sin competencias no tiene sitio posible.
    DELETE FROM entregables WHERE competencia_id IS NULL;

    ALTER TABLE entregables ALTER COLUMN competencia_id SET NOT NULL;
    ALTER TABLE entregables DROP COLUMN gestion_id;
  END IF;
END
$entregables$;

CREATE INDEX IF NOT EXISTS entregables_competencia_id_idx ON entregables(competencia_id);
DROP INDEX IF EXISTS entregables_gestion_id_idx;

-- Migración de bases existentes: funcionarios.unidad (texto) -> funcionarios.gestion_id (FK).
ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS gestion_id text REFERENCES gestiones(id);

-- El backfill solo tiene sentido mientras "unidad" siga existiendo; en
-- reejecuciones posteriores (ya migradas) esa columna ya no está, así que el
-- UPDATE que la referencia queda condicionado para no romper la reejecución
-- (PL/pgSQL no valida el UPDATE contra el catálogo si la rama no se ejecuta).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'funcionarios' AND column_name = 'unidad'
  ) THEN
    UPDATE funcionarios f
    SET gestion_id = g.id
    FROM gestiones g
    WHERE f.gestion_id IS NULL
      AND f.unidad = g.nombre;
  END IF;
END $$;

-- Red de seguridad: un funcionario cuyo valor de unidad no calzó con ninguna
-- gestión sembrada (dato legado inesperado) no queda en NULL —rompería el
-- NOT NULL de abajo— sino que se cuelga de la primera gestión existente.
UPDATE funcionarios f
SET gestion_id = (SELECT id FROM gestiones ORDER BY id LIMIT 1)
WHERE f.gestion_id IS NULL;

ALTER TABLE funcionarios ALTER COLUMN gestion_id SET NOT NULL;
ALTER TABLE funcionarios DROP COLUMN IF EXISTS unidad;
CREATE INDEX IF NOT EXISTS funcionarios_gestion_id_idx ON funcionarios(gestion_id);

-- Migración competencias.unidad (texto) -> competencias.gestion_id (FK).
ALTER TABLE competencias ADD COLUMN IF NOT EXISTS gestion_id text REFERENCES gestiones(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'competencias' AND column_name = 'unidad'
  ) THEN
    UPDATE competencias c
    SET gestion_id = g.id
    FROM gestiones g
    WHERE c.gestion_id IS NULL
      AND c.unidad = g.nombre;
  END IF;
END $$;

UPDATE competencias c
SET gestion_id = (SELECT id FROM gestiones ORDER BY id LIMIT 1)
WHERE c.gestion_id IS NULL;
ALTER TABLE competencias ALTER COLUMN gestion_id SET NOT NULL;
ALTER TABLE competencias DROP COLUMN IF EXISTS unidad;
CREATE INDEX IF NOT EXISTS competencias_gestion_id_idx ON competencias(gestion_id);

CREATE TABLE IF NOT EXISTS actividades (
  id                  text PRIMARY KEY,
  client_request_id   text,
  created_by_user_id  text,
  request_fingerprint text,
  tipo                text NOT NULL DEFAULT 'asignacion',
  titulo              text NOT NULL,
  descripcion         text NOT NULL DEFAULT '',
  funcionario_id      text REFERENCES funcionarios(id) ON DELETE CASCADE,
  -- RESTRICT: una actividad no puede quedarse sin competencia, así que la
  -- competencia no se borra mientras tenga actividades. Reasígnalas primero.
  competencia_id      text REFERENCES competencias(id) ON DELETE RESTRICT,
  entregable_id       text REFERENCES entregables(id) ON DELETE SET NULL,
  estado              text NOT NULL,
  fecha_creacion      text NOT NULL,
  fecha_inicio        text NOT NULL,
  fecha_fin           text NOT NULL,
  fecha_cumplimiento  text,
  observaciones       text NOT NULL DEFAULT '',
  acciones_pendientes text NOT NULL DEFAULT '',
  resultados_alcanzados text NOT NULL DEFAULT '',
  orden               integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Migración de plazo/vencimiento al intervalo explícito de la actividad.
-- Las columnas se agregan primero como nullable para permitir el backfill de
-- tablas existentes. El bloque dinámico no referencia fecha_vencimiento en
-- reejecuciones donde esa columna ya fue eliminada.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'actividades'::regclass
      AND conname = 'actividades_business_fields_check'
  ) THEN
    ALTER TABLE actividades DROP CONSTRAINT actividades_business_fields_check;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'actividades'::regclass
      AND conname = 'actividades_business_fields_check_v2'
  ) THEN
    ALTER TABLE actividades DROP CONSTRAINT actividades_business_fields_check_v2;
  END IF;
END $$;

ALTER TABLE actividades ADD COLUMN IF NOT EXISTS fecha_inicio text;
ALTER TABLE actividades ADD COLUMN IF NOT EXISTS fecha_fin text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'actividades'
      AND column_name = 'fecha_vencimiento'
  ) THEN
    EXECUTE $migration$
      UPDATE actividades
      SET fecha_inicio = COALESCE(
            fecha_inicio,
            CASE
              WHEN tipo = 'reunion' THEN fecha_vencimiento
              ELSE fecha_creacion
            END
          ),
          fecha_fin = COALESCE(fecha_fin, fecha_vencimiento)
    $migration$;
  END IF;
END $$;

-- Red de seguridad para una migración previa interrumpida que ya no conserve
-- las columnas antiguas: nunca reemplaza valores nuevos que sí existan.
UPDATE actividades
SET fecha_inicio = COALESCE(fecha_inicio, fecha_creacion);

UPDATE actividades
SET fecha_fin = COALESCE(fecha_fin, fecha_inicio);

ALTER TABLE actividades ALTER COLUMN fecha_inicio SET NOT NULL;
ALTER TABLE actividades ALTER COLUMN fecha_fin SET NOT NULL;
ALTER TABLE actividades DROP COLUMN IF EXISTS plazo_dias;
ALTER TABLE actividades DROP COLUMN IF EXISTS fecha_vencimiento;

-- Entregable opcional del formulario de actividad/reunión. Nullable: no
-- todas las gestiones tienen entregables cargados (p.ej. DGTAR). SET NULL en
-- vez de CASCADE: borrar un entregable del catálogo no debe borrar las
-- actividades que lo tenían asignado, solo desvincularlas.
ALTER TABLE actividades ADD COLUMN IF NOT EXISTS entregable_id text REFERENCES entregables(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS actividades_entregable_id_idx ON actividades(entregable_id);

CREATE TABLE IF NOT EXISTS actividad_participantes (
  actividad_id   text NOT NULL REFERENCES actividades(id) ON DELETE CASCADE,
  funcionario_id text NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  PRIMARY KEY (actividad_id, funcionario_id)
);

CREATE TABLE IF NOT EXISTS usuarios (
  id                  text PRIMARY KEY,
  email               text NOT NULL UNIQUE,
  nombre              text NOT NULL DEFAULT '',
  password_hash       text NOT NULL,
  rol                 text NOT NULL,
  funcionario_id      text REFERENCES funcionarios(id) ON DELETE SET NULL,
  reset_token_hash    text,
  reset_expires_at    text,
  created_at          text NOT NULL,
  updated_at          text NOT NULL
);

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nombre text NOT NULL DEFAULT '';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol text NOT NULL DEFAULT 'user';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS funcionario_id text REFERENCES funcionarios(id) ON DELETE SET NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_token_hash text;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_expires_at text;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS created_at text NOT NULL DEFAULT '';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS updated_at text NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'usuarios'::regclass
      AND conname = 'usuarios_rol_check'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('admin', 'user'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS usuarios_funcionario_id_idx ON usuarios(funcionario_id);
CREATE INDEX IF NOT EXISTS actividad_participantes_funcionario_id_idx ON actividad_participantes(funcionario_id);

-- Metadata transaccional de actividades. Las columnas son nullable para que
-- las filas legadas sigan siendo válidas; toda creación nueva por la API las
-- completa y client_request_id queda protegido por unicidad global.
ALTER TABLE actividades ADD COLUMN IF NOT EXISTS client_request_id text;
ALTER TABLE actividades ADD COLUMN IF NOT EXISTS created_by_user_id text;
ALTER TABLE actividades ADD COLUMN IF NOT EXISTS request_fingerprint text;
ALTER TABLE actividades ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE actividades ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Normaliza únicamente valores legados que pueden repararse sin inventar
-- relaciones de catálogo. Las FK opcionales quedan fuera del CHECK porque una
-- base antigua podría contener filas huérfanas que deben poder editarse/migrarse.
UPDATE actividades
SET tipo = 'asignacion'
WHERE tipo NOT IN ('asignacion', 'reunion');

UPDATE actividades
SET estado = 'pendiente'
WHERE estado NOT IN ('pendiente', 'en_progreso', 'en_revision', 'cumplida', 'archivada');

UPDATE actividades
SET titulo = 'Actividad sin título'
WHERE btrim(titulo) = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'actividades'::regclass
      AND conname = 'actividades_created_by_user_id_fkey'
      AND confdeltype <> 'n'
  ) THEN
    ALTER TABLE actividades DROP CONSTRAINT actividades_created_by_user_id_fkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'actividades'::regclass
      AND conname = 'actividades_created_by_user_id_fkey'
  ) THEN
    ALTER TABLE actividades
      ADD CONSTRAINT actividades_created_by_user_id_fkey
      FOREIGN KEY (created_by_user_id) REFERENCES usuarios(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'actividades'::regclass
      AND conname = 'actividades_idempotency_metadata_check'
  ) THEN
    ALTER TABLE actividades
      ADD CONSTRAINT actividades_idempotency_metadata_check
      CHECK (
        (client_request_id IS NULL AND request_fingerprint IS NULL)
        OR (client_request_id IS NOT NULL AND request_fingerprint IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'actividades'::regclass
      AND conname = 'actividades_business_fields_check_v3'
  ) THEN
    ALTER TABLE actividades
      ADD CONSTRAINT actividades_business_fields_check_v3
      CHECK (
        tipo IN ('asignacion', 'reunion')
        AND estado IN ('pendiente', 'en_progreso', 'en_revision', 'cumplida', 'archivada')
        AND btrim(titulo) <> ''
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS actividades_client_request_id_uidx
  ON actividades(client_request_id)
  WHERE client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS actividades_created_by_user_id_idx ON actividades(created_by_user_id);

-- Ledger durable de idempotencia. No tiene FK a actividades porque el PUT
-- legado todavía reescribe esa tabla; así una eliminación no permite reutilizar
-- accidentalmente la misma solicitud y crear un duplicado.
CREATE TABLE IF NOT EXISTS activity_creation_requests (
  client_request_id   text PRIMARY KEY,
  created_by_user_id  text REFERENCES usuarios(id) ON DELETE SET NULL,
  request_fingerprint text NOT NULL,
  funcionario_id      text NOT NULL,
  activity_id         text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE activity_creation_requests ALTER COLUMN created_by_user_id DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'activity_creation_requests'::regclass
      AND conname = 'activity_creation_requests_created_by_user_id_fkey'
      AND confdeltype <> 'n'
  ) THEN
    ALTER TABLE activity_creation_requests
      DROP CONSTRAINT activity_creation_requests_created_by_user_id_fkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'activity_creation_requests'::regclass
      AND conname = 'activity_creation_requests_created_by_user_id_fkey'
  ) THEN
    ALTER TABLE activity_creation_requests
      ADD CONSTRAINT activity_creation_requests_created_by_user_id_fkey
      FOREIGN KEY (created_by_user_id) REFERENCES usuarios(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS activity_creation_requests_activity_id_uidx
  ON activity_creation_requests(activity_id);
CREATE INDEX IF NOT EXISTS activity_creation_requests_user_id_idx
  ON activity_creation_requests(created_by_user_id);

-- Bases que alcanzaron a usar las columnas de metadata antes de incorporar el
-- ledger conservan sus operaciones ya confirmadas.
INSERT INTO activity_creation_requests
  (client_request_id, created_by_user_id, request_fingerprint, funcionario_id, activity_id, created_at)
SELECT
  client_request_id,
  created_by_user_id,
  request_fingerprint,
  funcionario_id,
  id,
  created_at
FROM actividades
WHERE client_request_id IS NOT NULL
  AND request_fingerprint IS NOT NULL
  AND funcionario_id IS NOT NULL
ON CONFLICT (client_request_id) DO NOTHING;

-- Revisión única del documento usado por /api/data. El endpoint bloquea esta
-- fila antes de reescribir y solo acepta la revisión que leyó el cliente.
CREATE TABLE IF NOT EXISTS data_revision (
  id         smallint PRIMARY KEY CHECK (id = 1),
  revision   bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO data_revision (id, revision)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS google_accounts (
  user_id                 text PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  google_email            text NOT NULL DEFAULT '',
  google_subject          text NOT NULL DEFAULT '',
  refresh_token_encrypted text NOT NULL DEFAULT '',
  scope                   text NOT NULL DEFAULT '',
  last_synced_at          text,
  last_error              text NOT NULL DEFAULT '',
  sync_reuniones          boolean NOT NULL DEFAULT true,
  sync_asignaciones       boolean NOT NULL DEFAULT true,
  created_at              text NOT NULL,
  updated_at              text NOT NULL
);

ALTER TABLE google_accounts ADD COLUMN IF NOT EXISTS google_email text NOT NULL DEFAULT '';
ALTER TABLE google_accounts ADD COLUMN IF NOT EXISTS google_subject text NOT NULL DEFAULT '';
ALTER TABLE google_accounts ADD COLUMN IF NOT EXISTS refresh_token_encrypted text NOT NULL DEFAULT '';
ALTER TABLE google_accounts ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT '';
ALTER TABLE google_accounts ADD COLUMN IF NOT EXISTS last_synced_at text;
ALTER TABLE google_accounts ADD COLUMN IF NOT EXISTS last_error text NOT NULL DEFAULT '';
ALTER TABLE google_accounts ADD COLUMN IF NOT EXISTS sync_reuniones boolean NOT NULL DEFAULT true;
ALTER TABLE google_accounts ADD COLUMN IF NOT EXISTS sync_asignaciones boolean NOT NULL DEFAULT true;
ALTER TABLE google_accounts ADD COLUMN IF NOT EXISTS created_at text NOT NULL DEFAULT '';
ALTER TABLE google_accounts ADD COLUMN IF NOT EXISTS updated_at text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS google_oauth_states (
  state      text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  return_to  text NOT NULL DEFAULT '/',
  expires_at text NOT NULL,
  created_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS google_oauth_states_user_id_idx ON google_oauth_states(user_id);
CREATE INDEX IF NOT EXISTS google_oauth_states_expires_at_idx ON google_oauth_states(expires_at);

-- No tiene FK a actividades porque writeAll reescribe esa tabla completa en
-- cada guardado. La relacion se mantiene por id logico de actividad.
CREATE TABLE IF NOT EXISTS actividad_google_events (
  user_id           text NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  actividad_id      text NOT NULL,
  google_event_id   text NOT NULL,
  calendar_id       text NOT NULL DEFAULT 'primary',
  last_payload_hash text NOT NULL DEFAULT '',
  last_synced_at    text,
  last_error        text NOT NULL DEFAULT '',
  created_at        text NOT NULL,
  updated_at        text NOT NULL,
  PRIMARY KEY (user_id, actividad_id)
);

ALTER TABLE actividad_google_events ADD COLUMN IF NOT EXISTS google_event_id text NOT NULL DEFAULT '';
ALTER TABLE actividad_google_events ADD COLUMN IF NOT EXISTS calendar_id text NOT NULL DEFAULT 'primary';
ALTER TABLE actividad_google_events ADD COLUMN IF NOT EXISTS last_payload_hash text NOT NULL DEFAULT '';
ALTER TABLE actividad_google_events ADD COLUMN IF NOT EXISTS last_synced_at text;
ALTER TABLE actividad_google_events ADD COLUMN IF NOT EXISTS last_error text NOT NULL DEFAULT '';
ALTER TABLE actividad_google_events ADD COLUMN IF NOT EXISTS created_at text NOT NULL DEFAULT '';
ALTER TABLE actividad_google_events ADD COLUMN IF NOT EXISTS updated_at text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS actividad_google_events_actividad_id_idx ON actividad_google_events(actividad_id);

-- Reparación conservadora para usuarios que pudieron quedar desvinculados por
-- una sincronización anterior de catálogos: religa usuarios sin funcionario
-- cuando el correo coincide exactamente con un funcionario.
UPDATE usuarios u
SET funcionario_id = f.id
FROM funcionarios f
WHERE u.funcionario_id IS NULL
  AND lower(u.email) = lower(f.email);

-- Upgrade de tablas existentes: 'asignacion' | 'reunion'. Para reuniones,
-- fecha_inicio y fecha_fin contienen el mismo "YYYY-MM-DDTHH:mm".
ALTER TABLE actividades ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'asignacion';

-- Campos opcionales de seguimiento (texto libre).
ALTER TABLE actividades ADD COLUMN IF NOT EXISTS acciones_pendientes text NOT NULL DEFAULT '';
ALTER TABLE actividades ADD COLUMN IF NOT EXISTS resultados_alcanzados text NOT NULL DEFAULT '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'actividades'::regclass
      AND conname = 'actividades_funcionario_id_fkey'
      AND confdeltype <> 'c'
  ) THEN
    ALTER TABLE actividades DROP CONSTRAINT actividades_funcionario_id_fkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'actividades'::regclass
      AND conname = 'actividades_funcionario_id_fkey'
  ) THEN
    ALTER TABLE actividades
      ADD CONSTRAINT actividades_funcionario_id_fkey
      FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'actividades'::regclass
      AND conname = 'actividades_competencia_id_fkey'
      AND confdeltype <> 'c'
  ) THEN
    ALTER TABLE actividades DROP CONSTRAINT actividades_competencia_id_fkey;
  END IF;

  -- Bases antiguas la tienen en CASCADE: borrar la competencia arrastraba sus
  -- actividades. Se recrea en RESTRICT para que la base rechace ese borrado.
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'actividades'::regclass
      AND conname = 'actividades_competencia_id_fkey'
      AND confdeltype = 'c'
  ) THEN
    ALTER TABLE actividades DROP CONSTRAINT actividades_competencia_id_fkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'actividades'::regclass
      AND conname = 'actividades_competencia_id_fkey'
  ) THEN
    ALTER TABLE actividades
      ADD CONSTRAINT actividades_competencia_id_fkey
      FOREIGN KEY (competencia_id) REFERENCES competencias(id) ON DELETE RESTRICT;
  END IF;
END $$;
