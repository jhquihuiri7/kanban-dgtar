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
