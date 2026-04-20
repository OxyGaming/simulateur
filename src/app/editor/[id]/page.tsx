import { redirect, notFound } from 'next/navigation';
import { currentUser } from '@/server/auth/guard';
import { loadOwnedLayout, getLatestSnapshot } from '@/server/repositories/layouts';
import { migrateLayoutPayload } from '@/lib/schemas/layout';
import { EditorClient } from './EditorClient';

export const runtime = 'nodejs';

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect('/login');

  const { id } = await params;
  const layout = loadOwnedLayout(id, user.id);
  if (!layout) notFound();

  const snap = getLatestSnapshot(id);
  if (!snap) notFound();

  // Le snapshot stocké peut être dans une version antérieure : on migre à la lecture.
  const raw = JSON.parse(snap.payloadJson);
  const payload = migrateLayoutPayload(raw);

  return (
    <EditorClient
      layoutId={layout.id}
      initialLayoutName={layout.name}
      initialPayload={payload}
    />
  );
}
