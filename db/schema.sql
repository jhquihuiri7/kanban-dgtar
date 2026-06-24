-- Esquema del Kanban DGTAR. Idempotente: seguro de re-ejecutar.
-- Las fechas se guardan como texto ISO (YYYY-MM-DD) para preservar el valor
-- exacto sin desfases de zona horaria.

CREATE TABLE IF NOT EXISTS funcionarios (
  id      text PRIMARY KEY,
  nombre  text NOT NULL,
  email   text NOT NULL DEFAULT '',
  cargo   text NOT NULL DEFAULT '',
  unidad  text NOT NULL,
  color   text NOT NULL DEFAULT ''
);

ALTER TABLE funcionarios DROP COLUMN IF EXISTS activo;

CREATE TABLE IF NOT EXISTS competencias (
  id        text PRIMARY KEY,
  nombre    text NOT NULL,
  unidad    text NOT NULL
);

ALTER TABLE competencias DROP COLUMN IF EXISTS codigo;
ALTER TABLE competencias DROP COLUMN IF EXISTS articulo;
ALTER TABLE competencias DROP COLUMN IF EXISTS activo;

CREATE TABLE IF NOT EXISTS actividades (
  id                  text PRIMARY KEY,
  tipo                text NOT NULL DEFAULT 'asignacion',
  titulo              text NOT NULL,
  descripcion         text NOT NULL DEFAULT '',
  funcionario_id      text REFERENCES funcionarios(id) ON DELETE CASCADE,
  competencia_id      text REFERENCES competencias(id) ON DELETE CASCADE,
  estado              text NOT NULL,
  fecha_creacion      text NOT NULL,
  plazo_dias          integer NOT NULL DEFAULT 0,
  fecha_vencimiento   text NOT NULL,
  fecha_cumplimiento  text,
  observaciones       text NOT NULL DEFAULT '',
  acciones_pendientes text NOT NULL DEFAULT '',
  resultados_alcanzados text NOT NULL DEFAULT '',
  orden               integer NOT NULL DEFAULT 0
);

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

-- Reparación conservadora para usuarios que pudieron quedar desvinculados por
-- una sincronización anterior de catálogos: solo religa usuarios normales sin
-- funcionario cuando el correo coincide exactamente con un funcionario.
UPDATE usuarios u
SET funcionario_id = f.id
FROM funcionarios f
WHERE u.rol <> 'admin'
  AND u.funcionario_id IS NULL
  AND lower(u.email) = lower(f.email);

-- Upgrade de tablas existentes: 'asignacion' | 'reunion'. Para reuniones la
-- hora viaja dentro de fecha_vencimiento como "YYYY-MM-DDTHH:mm" (sin columna
-- nueva).
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

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'actividades'::regclass
      AND conname = 'actividades_competencia_id_fkey'
  ) THEN
    ALTER TABLE actividades
      ADD CONSTRAINT actividades_competencia_id_fkey
      FOREIGN KEY (competencia_id) REFERENCES competencias(id) ON DELETE CASCADE;
  END IF;
END $$;
