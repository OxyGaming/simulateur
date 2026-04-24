import { redirect } from 'next/navigation';
import { currentUser } from '@/server/auth/guard';
import { LoginForm } from './LoginForm';

export const runtime = 'nodejs';

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect('/layouts');

  return (
    <main style={page}>
      <LoginForm />
    </main>
  );
}

const page: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '16px',
  background: '#0a0f1e', fontFamily: 'system-ui, -apple-system, sans-serif',
};
