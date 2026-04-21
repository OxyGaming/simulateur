import { CreateUserSchema } from '@/lib/schemas/api';
import { currentUser, badRequest, unauthorized } from '@/server/auth/guard';
import { createUser, findUserByEmail, listUsers } from '@/server/repositories/users';

export const runtime = 'nodejs';

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  return Response.json(listUsers());
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();

  let body: unknown;
  try { body = await req.json(); } catch { return badRequest('json_invalid'); }

  const parsed = CreateUserSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.flatten());

  const email = parsed.data.email.toLowerCase();
  if (findUserByEmail(email)) {
    return Response.json({ error: 'email_taken' }, { status: 409 });
  }

  const created = await createUser({
    email,
    password:    parsed.data.password,
    displayName: parsed.data.displayName ?? null,
  });

  return Response.json(created, { status: 201 });
}
