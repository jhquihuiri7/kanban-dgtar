-- Esquema del Kanban DGTAR. Idempotente: seguro de re-ejecutar.
-- Las fechas se guardan como texto ISO (YYYY-MM-DD) para preservar el valor
-- exacto sin desfases de zona horaria.

CREATE TABLE IF NOT EXISTS funcionarios (
  id      text PRIMARY KEY,
  nombre  text NOT NULL,
  email   text NOT NULL DEFAULT '',
  cargo   text NOT NULL DEFAULT '',
  unidad  text NOT NULL,
  activo  boolean NOT NULL DEFAULT true,
  color   text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS competencias (
  id        text PRIMARY KEY,
  codigo    text NOT NULL,
  nombre    text NOT NULL,
  articulo  text NOT NULL DEFAULT '',
  unidad    text NOT NULL,
  activo    boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS actividades (
  id                  text PRIMARY KEY,
  titulo              text NOT NULL,
  descripcion         text NOT NULL DEFAULT '',
  funcionario_id      text REFERENCES funcionarios(id),
  competencia_id      text REFERENCES competencias(id),
  estado              text NOT NULL,
  fecha_creacion      text NOT NULL,
  plazo_dias          integer NOT NULL DEFAULT 0,
  fecha_vencimiento   text NOT NULL,
  fecha_cumplimiento  text,
  observaciones       text NOT NULL DEFAULT '',
  orden               integer NOT NULL DEFAULT 0
);
