import { redirect } from 'next/navigation';
import { currentUser } from '@/server/auth/guard';
import { listLayoutsByOwner } from '@/server/repositories/layouts';
import { LayoutsDashboard } from './LayoutsDashboard';

export const runtime = 'nodejs';

export default async function LayoutsPage() {
  const user = await currentUser();
  if (!user) redirect('/login');

  const layouts = listLayoutsByOwner(user.id);

  return (
    <LayoutsDashboard
      user={{ id: user.id, email: user.email, displayName: user.displayName }}
      initialLayouts={layouts}
    />
  );
}
