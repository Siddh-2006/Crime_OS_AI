'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { APP_ROUTES, ROLE } from '@/lib/constants';
import type { AxiosError } from 'axios';
import type { ApiResponse } from '@/lib/types';

interface LoginFormValues {
  email: string;
  password: string;
  isPolice: boolean;
}

/**
 * Unified login page for both citizens and police officers.
 * Toggle between the two login modes.
 */
export default function LoginPage(): React.ReactElement {
  const { loginCitizen, loginPolice } = useAuth();
  const { toasts, showToast, removeToast } = useToast();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    defaultValues: { email: '', password: '', isPolice: false },
  });

  const isPoliceValue = watch('isPolice');
  const isPolice = String(isPoliceValue) === 'true';

  const onSubmit = async (values: LoginFormValues): Promise<void> => {
    try {
      const isPoliceSubmit = String(values.isPolice) === 'true';
      if (isPoliceSubmit) {
        await loginPolice(values.email, values.password);
        router.replace(APP_ROUTES.POLICE_DASHBOARD);
      } else {
        await loginCitizen(values.email, values.password);
        router.replace(APP_ROUTES.DASHBOARD);
      }
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
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-900">Welcome back</h1>
        <p className="mt-1 text-sm text-neutral-500">Sign in to access the Crime OS portal</p>
      </div>

      {/* Toggle: Citizen / Police */}
      <div className="mb-6 flex rounded-lg border border-neutral-200 bg-neutral-100 p-1">
        <label
          className={[
            'flex-1 cursor-pointer rounded-md py-2 text-center text-sm font-medium transition-colors select-none',
            !isPolice
              ? 'bg-white text-primary-900 shadow-card'
              : 'text-neutral-500 hover:text-neutral-700',
          ].join(' ')}
        >
          <input type="radio" {...register('isPolice')} value="false" className="sr-only" defaultChecked />
          Citizen
        </label>
        <label
          className={[
            'flex-1 cursor-pointer rounded-md py-2 text-center text-sm font-medium transition-colors select-none',
            isPolice
              ? 'bg-white text-primary-900 shadow-card'
              : 'text-neutral-500 hover:text-neutral-700',
          ].join(' ')}
        >
          <input type="radio" {...register('isPolice')} value="true" className="sr-only" />
          Police Officer
        </label>
      </div>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <Input
            label="Email Address"
            type="email"
            inputId="login_email"
            autoComplete="email"
            required
            error={errors.email?.message}
            {...register('email', {
              required: 'Email is required',
              pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email address' },
            })}
          />

          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            inputId="login_password"
            autoComplete="current-password"
            required
            error={errors.password?.message}
            rightElement={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
            {...register('password', { required: 'Password is required' })}
          />

          {!isPolice && (
            <div className="text-right">
              <Link
                href={APP_ROUTES.FORGOT_PASSWORD}
                className="text-sm font-medium text-primary-700 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          )}

          <Button
            type="submit"
            fullWidth
            isLoading={isSubmitting}
            id="login_submit_btn"
          >
            Sign In
          </Button>
        </form>
      </Card>

      {!isPolice && (
        <p className="mt-6 text-center text-sm text-neutral-600">
          Don&apos;t have an account?{' '}
          <Link href={APP_ROUTES.REGISTER} className="font-medium text-primary-700 hover:underline">
            Register as a Citizen
          </Link>
        </p>
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}
