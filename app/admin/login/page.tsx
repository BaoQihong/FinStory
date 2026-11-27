import type { Metadata } from 'next';
import { LoginForm } from '@/components/studio/LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md px-5 py-16 sm:py-24">
      <p className="kicker text-gold-700">Seshat studio</p>
      <h1 className="mt-2 font-display text-4xl font-semibold text-navy-900">Editor sign-in</h1>
      <p className="mt-3 text-ink-soft">Private editorial workspace. Drafts created here are never visible on the public site.</p>
      <LoginForm />
    </div>
  );
}
