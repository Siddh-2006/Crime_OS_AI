'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, ShieldAlert, KeyRound, UserCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { APP_ROUTES } from '@/lib/constants';
import type { AxiosError } from 'axios';
import type { ApiResponse } from '@/lib/types';

interface LoginFormValues {
  email: string;
  password: string;
}

export default function LoginPage(): React.ReactElement {
  const { loginPolice } = useAuth();
  const { toasts, showToast, removeToast } = useToast();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginFormValues): Promise<void> => {
    try {
      await loginPolice(values.email, values.password);
      router.replace(APP_ROUTES.POLICE_DASHBOARD);
    } catch (err) {
      const axiosErr = err as AxiosError<ApiResponse>;
      const message =
        axiosErr.response?.data?.error &&
        typeof axiosErr.response.data.error === 'object' &&
        'message' in axiosErr.response.data.error
          ? String((axiosErr.response.data.error as { message: string }).message)
          : axiosErr.response?.data?.message ?? 'Login failed. Please try again.';
      showToast(message, 'error');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <div className="mb-8 text-center lg:text-left">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-transparent text-brand-primary mb-6 border border-neutral-700 shadow-sm">
          <ShieldAlert size={22} strokeWidth={2} />
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Secure Access</h1>
        <p className="text-sm text-slate-400">Authenticate to enter the Crime OS intelligence portal.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        <div>
          <label className="block text-[13px] font-semibold text-slate-200 mb-2" htmlFor="login_email">
            Officer Email
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
              <UserCircle size={16} />
            </div>
            <input
              id="login_email"
              type="email"
              autoComplete="email"
              className={[
                'w-full bg-[#0a0f1c] border border-neutral-800 rounded-lg py-2.5 pl-9 pr-4 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-brand-primary transition-colors',
                errors.email ? 'border-red-500 focus:border-red-500' : ''
              ].join(' ')}
              placeholder="e.g. badge.number@police.gujarat.gov.in"
              {...register('email', {
                required: 'Email is required',
                pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email address' },
              })}
            />
          </div>
          {errors.email && <p className="mt-1.5 text-xs text-red-400 font-medium">{errors.email.message}</p>}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-[13px] font-semibold text-slate-200" htmlFor="login_password">
              Secure Password
            </label>
            <Link
              href={APP_ROUTES.FORGOT_PASSWORD}
              className="text-[12px] font-semibold text-brand-primary hover:text-blue-300 transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
              <KeyRound size={16} />
            </div>
            <input
              id="login_password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className={[
                'w-full bg-[#0a0f1c] border border-neutral-800 rounded-lg py-2.5 pl-9 pr-10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-brand-primary transition-colors',
                errors.password ? 'border-red-500 focus:border-red-500' : ''
              ].join(' ')}
              placeholder="••••••••"
              {...register('password', { required: 'Password is required' })}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.password && <p className="mt-1.5 text-xs text-red-400 font-medium">{errors.password.message}</p>}
        </div>

        <div className="pt-4">
          <Button
            type="submit"
            fullWidth
            isLoading={isSubmitting}
            id="login_submit_btn"
            className="py-3 text-[14px] font-semibold rounded-md shadow-sm"
          >
            Authenticate & Enter
          </Button>
        </div>
      </form>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </motion.div>
  );
}
