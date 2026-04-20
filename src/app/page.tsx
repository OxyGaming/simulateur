import { redirect } from 'next/navigation';
import { currentUser } from '@/server/auth/guard';

export const runtime = 'nodejs';

export default async function Page() {
  const user = await currentUser();
  redirect(user ? '/layouts' : '/login');
}
