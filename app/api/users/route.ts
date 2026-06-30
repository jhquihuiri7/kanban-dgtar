import { NextResponse } from "next/server";
import { createUser, deleteUser, listUsers, requireAdmin, updateUser } from "@/lib/auth-server";
import type { UserRole } from "@/lib/auth-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ users: await listUsers() });
  } catch (err) {
    return authError(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = (await req.json()) as UserInput;
    const validated = validateUserInput(body, true);
    const user = await createUser(validated);
    return NextResponse.json({ user });
  } catch (err) {
    return authError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const current = await requireAdmin();
    const body = (await req.json()) as UserInput & { id?: string };
    if (!body.id) return NextResponse.json({ error: "Falta el id del usuario." }, { status: 400 });
    const validated = validateUserInput(body, false);
    const user = await updateUser(body.id, {
      ...validated,
      role: body.id === current.id ? "admin" : validated.role,
    });
    return NextResponse.json({ user });
  } catch (err) {
    return authError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const current = await requireAdmin();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Falta el id del usuario." }, { status: 400 });
    if (id === current.id) {
      return NextResponse.json({ error: "No puedes eliminar tu propio usuario." }, { status: 400 });
    }
    await deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return authError(err);
  }
}

interface UserInput {
  email?: string;
  password?: string;
  role?: UserRole;
  nombre?: string;
  funcionarioId?: string | null;
}

function validateUserInput(input: UserInput, creating: boolean) {
  const email = input.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Email inválido.");
  if (input.role !== "admin" && input.role !== "user") throw new Error("Rol inválido.");
  if (creating && (!input.password || input.password.length < 8)) {
    throw new Error("La contraseña debe tener al menos 8 caracteres.");
  }
  if (input.password && input.password.length < 8) {
    throw new Error("La contraseña debe tener al menos 8 caracteres.");
  }
  return {
    email,
    password: input.password || "",
    role: input.role as UserRole,
    nombre: input.nombre || "",
    funcionarioId: input.funcionarioId || null,
  };
}

function authError(err: unknown) {
  const message = err instanceof Error ? err.message : "Error desconocido";
  const status = message === "No autenticado" ? 401 : message === "No autorizado" ? 403 : 400;
  return NextResponse.json({ error: message }, { status });
}
