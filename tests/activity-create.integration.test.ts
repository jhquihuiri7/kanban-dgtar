import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ActivityRequestError,
  createActivityIdempotent,
  findVerifiedActivity,
  normalizeActivityRequest,
} from "../lib/activity-create";
import {
  AuthorizationContextChangedError,
  ensureSchema,
  getPool,
  readAllWithRevision,
  writeAll,
} from "../lib/db";
import type { AuthUser } from "../lib/auth-token";

const integrationUrl = process.env.ACTIVITY_INTEGRATION_DATABASE_URL;

test(
  "PostgreSQL create is atomic, concurrent-safe, replayable and durable after resource deletion",
  { skip: integrationUrl ? false : "set ACTIVITY_INTEGRATION_DATABASE_URL to run PostgreSQL integration" },
  async () => {
    const databaseName = new URL(integrationUrl!).pathname.split("/").filter(Boolean).at(-1) ?? "";
    if (!/test/i.test(databaseName)) {
      throw new Error("Refusing integration mutations: database name must contain 'test'.");
    }
    process.env.DATABASE_URL = integrationUrl;
    await ensureSchema();
    const db = getPool();
    const suffix = randomUUID().replaceAll("-", "");
    const gestionId = `g_test_${suffix}`;
    const funcionarioId = `f_test_${suffix}`;
    const otherFuncionarioId = `f_other_${suffix}`;
    const competenciaId = `c_test_${suffix}`;
    const userId = `u_test_${suffix}`;
    const clientRequestId = `activity_request_${suffix}`;
    const legacyActivityId = `a_legacy_${suffix}`;
    const now = new Date().toISOString();
    const user: AuthUser = {
      id: userId,
      email: `${suffix}@example.invalid`,
      nombre: "Integration Test",
      role: "user",
      funcionarioId,
    };

    try {
      await db.query("INSERT INTO gestiones (id, nombre, color) VALUES ($1, $2, $3)", [gestionId, "Test", "#000"]);
      await db.query(
        "INSERT INTO funcionarios (id, nombre, email, cargo, gestion_id, color) VALUES ($1, $2, $3, $4, $5, $6)",
        [funcionarioId, "Test", user.email, "Test", gestionId, "#000"],
      );
      await db.query(
        "INSERT INTO funcionarios (id, nombre, email, cargo, gestion_id, color) VALUES ($1, $2, $3, $4, $5, $6)",
        [otherFuncionarioId, "Other", "other@example.invalid", "Test", gestionId, "#111"],
      );
      await db.query("INSERT INTO competencias (id, nombre, gestion_id) VALUES ($1, $2, $3)", [
        competenciaId,
        "Test",
        gestionId,
      ]);
      await db.query(
        `INSERT INTO usuarios (id, email, nombre, password_hash, rol, funcionario_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
        [userId, user.email, user.nombre, "test-only", "user", funcionarioId, now],
      );

      // Simulate a row that predates the new business CHECK, then rerun the
      // idempotent migration and verify conservative remediation.
      await db.query("ALTER TABLE activity_creation_requests ALTER COLUMN created_by_user_id SET NOT NULL");
      await db.query(
        "ALTER TABLE activity_creation_requests DROP CONSTRAINT activity_creation_requests_created_by_user_id_fkey",
      );
      await db.query(
        `ALTER TABLE activity_creation_requests
         ADD CONSTRAINT activity_creation_requests_created_by_user_id_fkey
         FOREIGN KEY (created_by_user_id) REFERENCES usuarios(id) ON DELETE CASCADE`,
      );
      await db.query("ALTER TABLE actividades DROP CONSTRAINT actividades_created_by_user_id_fkey");
      await db.query(
        `ALTER TABLE actividades
         ADD CONSTRAINT actividades_created_by_user_id_fkey
         FOREIGN KEY (created_by_user_id) REFERENCES usuarios(id) ON DELETE CASCADE`,
      );
      await db.query("ALTER TABLE actividades DROP CONSTRAINT actividades_business_fields_check_v2");
      await db.query(
        `INSERT INTO actividades
           (id, tipo, titulo, descripcion, funcionario_id, competencia_id, estado,
            fecha_creacion, plazo_dias, fecha_vencimiento, observaciones, orden)
         VALUES ($1, 'tipo-legado', '', '', $2, $3, 'estado-legado', '2026-01-01', 9000, '2026-01-02', '', 0)`,
        [legacyActivityId, funcionarioId, competenciaId],
      );
      await db.query(readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8"));
      const remediated = await db.query(
        "SELECT tipo, titulo, estado, plazo_dias FROM actividades WHERE id = $1",
        [legacyActivityId],
      );
      assert.deepEqual(remediated.rows[0], {
        tipo: "asignacion",
        titulo: "Actividad sin título",
        estado: "pendiente",
        plazo_dias: 3650,
      });
      const ledgerMigration = await db.query(
        `SELECT
           (SELECT NOT attnotnull
            FROM pg_attribute
            WHERE attrelid = 'activity_creation_requests'::regclass
              AND attname = 'created_by_user_id') AS is_nullable,
           (SELECT confdeltype = 'n'
            FROM pg_constraint
            WHERE conrelid = 'activity_creation_requests'::regclass
              AND conname = 'activity_creation_requests_created_by_user_id_fkey') AS uses_set_null,
           (SELECT confdeltype = 'n'
            FROM pg_constraint
            WHERE conrelid = 'actividades'::regclass
              AND conname = 'actividades_created_by_user_id_fkey') AS activity_uses_set_null`,
      );
      assert.deepEqual(ledgerMigration.rows[0], {
        is_nullable: true,
        uses_set_null: true,
        activity_uses_set_null: true,
      });

      const request = normalizeActivityRequest({
        tipo: "asignacion",
        titulo: "Creación concurrente",
        descripcion: "",
        funcionarioId,
        participantesIds: [],
        competenciaId,
        entregableId: null,
        estado: "pendiente",
        plazoDias: 7,
        fechaCreacion: "2020-01-01",
        fechaVencimiento: "2020-01-08",
        fechaCumplimiento: null,
        observaciones: "",
        accionesPendientes: "",
        resultadosAlcanzados: "",
      });

      const rollbackClientRequestId = `activity_rollback_${suffix}`;
      const rejectFunction = `reject_activity_ledger_${suffix}`;
      const rejectTrigger = `reject_activity_ledger_trigger_${suffix}`;
      await db.query(
        `CREATE FUNCTION ${rejectFunction}() RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN
           RAISE EXCEPTION 'forced ledger failure';
         END $$`,
      );
      await db.query(
        `CREATE TRIGGER ${rejectTrigger}
         BEFORE INSERT ON activity_creation_requests
         FOR EACH ROW EXECUTE FUNCTION ${rejectFunction}()`,
      );
      try {
        await assert.rejects(createActivityIdempotent({ clientRequestId: rollbackClientRequestId, request, user }));
        const rolledBack = await db.query(
          `SELECT
             (SELECT count(*)::int FROM actividades WHERE client_request_id = $1) AS activities,
             (SELECT count(*)::int FROM activity_creation_requests WHERE client_request_id = $1) AS requests`,
          [rollbackClientRequestId],
        );
        assert.deepEqual(rolledBack.rows[0], { activities: 0, requests: 0 });
      } finally {
        await db.query(`DROP TRIGGER ${rejectTrigger} ON activity_creation_requests`);
        await db.query(`DROP FUNCTION ${rejectFunction}()`);
      }

      const [first, second] = await Promise.all([
        createActivityIdempotent({ clientRequestId, request, user }),
        createActivityIdempotent({ clientRequestId, request, user }),
      ]);
      assert.equal(first.activity.id, second.activity.id);
      assert.equal([first.idempotentReplay, second.idempotentReplay].filter(Boolean).length, 1);
      assert.notEqual(first.activity.fechaCreacion, "2020-01-01", "creation date must come from the server");
      assert.equal(await findVerifiedActivity(clientRequestId, user).then((activity) => activity?.id), first.activity.id);

      const noLongerVisible: AuthUser = { ...user, funcionarioId: otherFuncionarioId };
      await db.query("UPDATE usuarios SET funcionario_id = $2 WHERE id = $1", [userId, otherFuncionarioId]);
      const authorizationSnapshot = await readAllWithRevision();
      await assert.rejects(
        writeAll(authorizationSnapshot.data, authorizationSnapshot.revision, {
          userId,
          role: user.role,
          funcionarioId,
        }),
        AuthorizationContextChangedError,
      );
      await assert.rejects(
        findVerifiedActivity(clientRequestId, noLongerVisible),
        (error) => error instanceof ActivityRequestError && error.code === "FORBIDDEN",
      );

      const revalidatedKey = `activity_revalidated_${suffix}`;
      await assert.rejects(
        createActivityIdempotent({
          clientRequestId: revalidatedKey,
          request,
          // Deliberately stale: a changed authorization context must abort,
          // never reinterpret and commit the request for another employee.
          user,
        }),
        (error) =>
          error instanceof ActivityRequestError &&
          error.code === "AUTHORIZATION_CONTEXT_CHANGED",
      );
      const revalidatedCount = await db.query(
        "SELECT count(*)::int AS count FROM actividades WHERE client_request_id = $1",
        [revalidatedKey],
      );
      assert.equal(revalidatedCount.rows[0].count, 0);
      await assert.rejects(
        createActivityIdempotent({
          clientRequestId: revalidatedKey,
          request,
          // The request still names the previous linked employee, even though
          // the fresh server-side identity is already the reassigned one.
          user: noLongerVisible,
        }),
        (error) =>
          error instanceof ActivityRequestError &&
          error.code === "AUTHORIZATION_CONTEXT_CHANGED",
      );
      await assert.rejects(
        createActivityIdempotent({ clientRequestId, request, user: noLongerVisible }),
        (error) => error instanceof ActivityRequestError && error.code === "FORBIDDEN",
      );

      const changedRequest = normalizeActivityRequest({
        ...request,
        titulo: "Contenido diferente",
        funcionarioId,
      });
      await assert.rejects(
        createActivityIdempotent({ clientRequestId, request: changedRequest, user: noLongerVisible }),
        (error) => error instanceof ActivityRequestError && error.code === "IDEMPOTENCY_CONFLICT",
      );

      await db.query("DELETE FROM actividades WHERE id = $1", [first.activity.id]);
      await assert.rejects(
        findVerifiedActivity(clientRequestId, user),
        (error) => error instanceof ActivityRequestError && error.code === "IDEMPOTENCY_RESOURCE_GONE",
      );
      await assert.rejects(
        createActivityIdempotent({ clientRequestId, request, user: noLongerVisible }),
        (error) => error instanceof ActivityRequestError && error.code === "IDEMPOTENCY_RESOURCE_GONE",
      );
      const count = await db.query("SELECT count(*)::int AS count FROM actividades WHERE client_request_id = $1", [
        clientRequestId,
      ]);
      assert.equal(count.rows[0].count, 0, "a deleted activity must not be recreated by an old retry");

      await db.query("DELETE FROM usuarios WHERE id = $1", [userId]);
      const durableLedger = await db.query(
        "SELECT created_by_user_id FROM activity_creation_requests WHERE client_request_id = $1",
        [clientRequestId],
      );
      assert.equal(durableLedger.rows[0]?.created_by_user_id, null, "deleting a user must not free an old key");
      await db.query(
        `INSERT INTO usuarios (id, email, nombre, password_hash, rol, funcionario_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
        [userId, `restored-${suffix}@example.invalid`, user.nombre, "test-only", "user", otherFuncionarioId, now],
      );
      await assert.rejects(
        createActivityIdempotent({ clientRequestId, request, user: noLongerVisible }),
        (error) => error instanceof ActivityRequestError && error.code === "IDEMPOTENCY_CONFLICT",
      );
    } finally {
      await db.query("DELETE FROM usuarios WHERE id = $1", [userId]).catch((error) => {
        console.error("integration cleanup usuarios failed", error);
      });
      await db.query("DELETE FROM funcionarios WHERE id = $1", [funcionarioId]).catch((error) => {
        console.error("integration cleanup funcionarios failed", error);
      });
      await db.query("DELETE FROM funcionarios WHERE id = $1", [otherFuncionarioId]).catch((error) => {
        console.error("integration cleanup other funcionario failed", error);
      });
      await db.query("DELETE FROM competencias WHERE id = $1", [competenciaId]).catch((error) => {
        console.error("integration cleanup competencias failed", error);
      });
      await db.query("DELETE FROM gestiones WHERE id = $1", [gestionId]).catch((error) => {
        console.error("integration cleanup gestiones failed", error);
      });
      await db.end();
    }
  },
);
