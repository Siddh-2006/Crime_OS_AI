'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, ShieldCheck, KeyRound, UserCircle, Lock, ArrowRight } from 'lucide-react';
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
          : axiosErr.response?.data?.message ?? 'Login failed. Please verify officer credentials.';
      showToast(message, 'error');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="w-full"
    >
      {/* Header */}
      <div className="mb-8 text-center lg:text-left">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-primary/15 text-brand-primary mb-5 border border-brand-primary/30 shadow-glow-sm">
          <ShieldCheck size={26} strokeWidth={2.2} />
        </div>
        <h1 className="text-3xl font-heading font-black text-text-primary tracking-tight mb-2">
          Officer Portal Access
        </h1>
        <p className="text-xs text-text-secondary font-semibold">
          Authenticate to enter the Crime OS intelligence & investigation terminal.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
        >
          <label className="block text-xs font-heading font-extrabold text-text-primary uppercase tracking-wider mb-2" htmlFor="login_email">
            Officer Email / Badge ID
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-secondary group-focus-within:text-brand-primary transition-colors">
              <UserCircle size={18} />
            </div>
            <input
              id="login_email"
              type="email"
              autoComplete="email"
              className={[
                'w-full bg-input-bg border border-input-border rounded-xl py-3 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-secondary/70 font-semibold focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-ring/40 transition-all duration-200 shadow-sm',
                errors.email ? 'border-semantic-critical focus:border-semantic-critical focus:ring-semantic-critical/20' : ''
              ].join(' ')}
              placeholder="badge.number@police.gujarat.gov.in"
              {...register('email', {
                required: 'Officer email is required',
                pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid official email address' },
              })}
            />
          </div>
          {errors.email && <p className="mt-1.5 text-xs text-semantic-critical font-bold">{errors.email.message}</p>}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-heading font-extrabold text-text-primary uppercase tracking-wider" htmlFor="login_password">
              Secure Security Key
            </label>
            <Link
              href={APP_ROUTES.FORGOT_PASSWORD}
              className="text-xs font-extrabold text-brand-primary hover:underline transition-all"
            >
              Reset Key?
            </Link>
          </div>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-secondary group-focus-within:text-brand-primary transition-colors">
              <KeyRound size={18} />
            </div>
            <input
              id="login_password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className={[
                'w-full bg-input-bg border border-input-border rounded-xl py-3 pl-10 pr-10 text-sm text-text-primary placeholder:text-text-secondary/70 font-semibold focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-ring/40 transition-all duration-200 shadow-sm',
                errors.password ? 'border-semantic-critical focus:border-semantic-critical focus:ring-semantic-critical/20' : ''
              ].join(' ')}
              placeholder="••••••••"
              {...register('password', { required: 'Password is required' })}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-text-secondary hover:text-text-primary transition-colors"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.password && <p className="mt-1.5 text-xs text-semantic-critical font-bold">{errors.password.message}</p>}
        </motion.div>

        <motion.div
          className="pt-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          <Button
            type="submit"
            fullWidth
            isLoading={isSubmitting}
            id="login_submit_btn"
            rightIcon={!isSubmitting && <ArrowRight size={16} />}
            className="py-3.5 text-sm font-heading font-black tracking-wider uppercase shadow-md"
          >
            Authenticate & Enter
          </Button>
        </motion.div>
      </form>

      {/* Security footer badge */}
      <div className="mt-8 pt-6 border-t border-border/80 flex items-center justify-between text-xs font-mono font-bold text-text-secondary">
        <span className="flex items-center gap-1.5">
          <Lock size={13} className="text-brand-accent" />
          256-bit TLS Encrypted
        </span>
        <span>Gujarat State Network</span>
      </div>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </motion.div>
  );
}
