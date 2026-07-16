'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff } from 'lucide-react';
import apiClient from '@/lib/axios';
import { API_ROUTES, APP_ROUTES } from '@/lib/constants';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import type { AxiosError } from 'axios';
import type { ApiResponse } from '@/lib/types';

interface ResetPasswordFormValues {
  otp: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * Reset password page — accepts OTP and new password.
 * Email is read from query params.
 */
export default function ResetPasswordPage(): React.ReactElement {
  const { toasts, showToast, removeToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>();

  const newPassword = watch('newPassword');

  const onSubmit = async (values: ResetPasswordFormValues): Promise<void> => {
    try {
      await apiClient.post(API_ROUTES.AUTH.RESET_PASSWORD, {
        email,
        otp: values.otp,
        newPassword: values.newPassword,
      });
      showToast('Password reset successfully! Please login with your new password.', 'success');
      setTimeout(() => router.replace(APP_ROUTES.LOGIN), 1800);
    } catch (err) {
      const axiosErr = err as AxiosError<ApiResponse>;
      showToast(axiosErr.response?.data?.message ?? 'Password reset failed. Please try again.', 'error');
    }
  };

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-900">Reset Password</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Enter the OTP sent to{' '}
          <span className="font-semibold text-primary-700">{email}</span> and your new password.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <Input
            label="OTP"
            type="text"
            inputId="reset_otp"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            required
            error={errors.otp?.message}
            {...register('otp', {
              required: 'OTP is required',
              minLength: { value: 6, message: 'OTP must be 6 digits' },
              maxLength: { value: 6, message: 'OTP must be 6 digits' },
              pattern: { value: /^\d+$/, message: 'OTP must contain only digits' },
            })}
          />

          <Input
            label="New Password"
            type={showPassword ? 'text' : 'password'}
            inputId="reset_newPassword"
            required
            helpText="Min 8 chars with uppercase, lowercase, number, and special char"
            error={errors.newPassword?.message}
            rightElement={
              <button type="button" onClick={() => setShowPassword(v => !v)} className="text-neutral-400 hover:text-neutral-600">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
            {...register('newPassword', {
              required: 'New password is required',
              minLength: { value: 8, message: 'Minimum 8 characters' },
              pattern: {
                value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
                message: 'Must include uppercase, lowercase, number, and special character',
              },
            })}
          />

          <Input
            label="Confirm New Password"
            type="password"
            inputId="reset_confirmPassword"
            required
            error={errors.confirmPassword?.message}
            {...register('confirmPassword', {
              required: 'Please confirm your new password',
              validate: (val) => val === newPassword || 'Passwords do not match',
            })}
          />

          <Button type="submit" fullWidth isLoading={isSubmitting} id="reset_submit_btn">
            Reset Password
          </Button>
        </form>
      </Card>

      <p className="mt-6 text-center text-sm">
        <Link href={APP_ROUTES.LOGIN} className="text-neutral-500 hover:text-primary-700">
          ← Back to login
        </Link>
      </p>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}
