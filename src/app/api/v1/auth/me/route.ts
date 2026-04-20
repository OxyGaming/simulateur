import { currentUser, unauthorized } from '@/server/auth/guard';

export const runtime = 'nodejs';

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  return Response.json({
    id:          user.id,
    email:       user.email,
    displayName: user.displayName,
  });
}
