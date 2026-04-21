import { redirect } from 'next/navigation';
import { currentUser } from '@/server/auth/guard';
import { listUsers } from '@/server/repositories/users';
import { UsersDashboard } from './UsersDashboard';

export const runtime = 'nodejs';

export default async function UsersPage() {
  const user = await currentUser();
  if (!user) redirect('/login');

  return (
    <UsersDashboard
      currentUserId={user.id}
      initialUsers={listUsers()}
    />
  );
}
