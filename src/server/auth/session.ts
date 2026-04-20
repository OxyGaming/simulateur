import 'server-only';
import { cookies } from 'next/headers';
import { getIronSession, type SessionOptions } from 'iron-session';

export type SessionData = {
  userId?:      string;
  email?:       string;
  displayName?: string | null;
};

function buildOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET ?? '';
  if (password.length < 32) {
    throw new Error('SESSION_SECRET manquant ou < 32 caractères — configure .env');
  }
  return {
    password,
    cookieName: 'prs_session',
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure:   process.env.NODE_ENV === 'production',
      maxAge:   60 * 60 * 24 * 30,              // 30 jours
      path:     '/',
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), buildOptions());
}
