'use client';

import { useActionState } from 'react';
import { signIn, type FormState } from '@/app/admin/actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, undefined);
  return (
    <form action={action} className="mt-8 space-y-5 rounded-2xl border border-cream-300 bg-cream-50 p-6">
      <label className="block">
        <span className="text-sm font-semibold text-ink">Email</span>
        <input name="email" type="email" autoComplete="username" required className="studio-input mt-1.5" />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-ink">Password</span>
        <input name="password" type="password" autoComplete="current-password" required className="studio-input mt-1.5" />
      </label>
      {state?.error ? (
        <p role="alert" className="text-sm text-[#9a3412]">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="studio-btn-primary w-full">
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
