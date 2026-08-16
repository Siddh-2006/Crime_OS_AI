'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { APP_ROUTES } from '@/lib/constants';
import type { AxiosError } from 'axios';
import type { ApiResponse } from '@/lib/types';

interface AdminLoginFormValues {
  username: string;
  password: string;
}

export default function AdminLoginPage(): React.ReactElement {
  const { loginAdmin } = useAuth();
  const { toasts, showToast, removeToast } = useToast();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AdminLoginFormValues>({
    defaultValues: { username: '', password: '' },
  });

  const onSubmit = async (values: AdminLoginFormValues): Promise<void> => {
    try {
      await loginAdmin(values.username, values.password);
      router.replace(APP_ROUTES.ADMIN_DASHBOARD);
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-100 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-800 text-text-primary shadow-lg">
            <ShieldCheck size={28} />
          </div>
          <h2 className="mt-6 text-2xl font-bold tracking-tight text-neutral-900">
            Admin Portal — Crime OS
          </h2>
          <p className="mt-2 text-sm text-neutral-500">
            Gujarat Police Management System
          </p>
        </div>

        <Card padding="lg">
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            <Input
              label="Username"
              type="text"
              inputId="admin_username"
              autoComplete="username"
              required
              error={errors.username?.message}
              {...register('username', { required: 'Username is required' })}
            />

            <Input
              label="Password"
              type="password"
              inputId="admin_password"
              autoComplete="current-password"
              required
              error={errors.password?.message}
              {...register('password', { required: 'Password is required' })}
            />

            <Button
              type="submit"
              fullWidth
              isLoading={isSubmitting}
              id="admin_login_submit_btn"
            >
              Sign In
            </Button>
          </form>
        </Card>
      </div>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
