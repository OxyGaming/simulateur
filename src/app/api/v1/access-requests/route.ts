import { currentUser, unauthorized } from '@/server/auth/guard';
import { listAccessRequests } from '@/server/repositories/accessRequests';

export const runtime = 'nodejs';

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  return Response.json(listAccessRequests());
}
