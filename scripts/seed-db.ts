// Seeder: crea el esquema y vuelca el catálogo + actividades de demo en Postgres.
//
//   npm run seed            → no hace nada si ya hay datos (seguro en redeploys)
//   npm run seed -- --force → reescribe las tres tablas con los datos de demo
//
// La conexión sale de DATABASE_URL. En local (sin Docker) puedes ponerla en
// .env.local; dentro de Docker la inyecta docker-compose.

import { config } from "dotenv";
import { COMPETENCIAS, FUNCIONARIOS, buildActivities } from "../lib/data";
import { countFuncionarios, ensureSchema, getPool, writeAll } from "../lib/db";

// Next carga .env.local solo; un script suelto no.
config({ path: ".env.local" });

async function main() {
  const force = process.argv.includes("--force");

  console.log("→ Verificando esquema (funcionarios / competencias / actividades)…");
  await ensureSchema();

  if (!force && (await countFuncionarios()) > 0) {
    console.log("✓ La base ya tiene datos; nada que sembrar. Usa --force para reescribir.");
    await getPool().end();
    return;
  }

  const data = {
    funcionarios: FUNCIONARIOS,
    competencias: COMPETENCIAS,
    actividades: buildActivities(),
  };

  console.log(
    `→ Insertando ${data.funcionarios.length} funcionarios, ` +
      `${data.competencias.length} competencias, ${data.actividades.length} actividades…`,
  );
  await writeAll(data);

  console.log("✓ Base poblada. Abre la app y verás los datos desde PostgreSQL.");
  await getPool().end();
}

main().catch(async (err) => {
  console.error("✗ Error al poblar la base:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
