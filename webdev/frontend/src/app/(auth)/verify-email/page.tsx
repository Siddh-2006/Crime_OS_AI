'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import apiClient from '@/lib/axios';
import { API_ROUTES, APP_ROUTES } from '@/lib/constants';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import type { AxiosError } from 'axios';
import type { ApiResponse } from '@/lib/types';

interface VerifyEmailFormValues {
  otp: string;
}

/**
 * Email OTP verification page.
 * Email is passed as a query param from register page.
 */
export default function VerifyEmailPage(): React.ReactElement {
  const { toasts, showToast, removeToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';
  const [isResending, setIsResending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<VerifyEmailFormValues>();

  const onSubmit = async (values: VerifyEmailFormValues): Promise<void> => {
    try {
      await apiClient.post(API_ROUTES.AUTH.VERIFY_EMAIL, { email, otp: values.otp });
      showToast('Email verified successfully! You can now log in.', 'success');
      setTimeout(() => router.replace(APP_ROUTES.LOGIN), 1500);
    } catch (err) {
      const axiosErr = err as AxiosError<ApiResponse>;
      showToast(axiosErr.response?.data?.message ?? 'Invalid or expired OTP.', 'error');
    }
  };

  const handleResendOtp = async (): Promise<void> => {
    setIsResending(true);
    try {
      await apiClient.post(API_ROUTES.AUTH.RESEND_OTP, { email });
      showToast('A new OTP has been sent to your email.', 'success');
    } catch (err) {
      const axiosErr = err as AxiosError<ApiResponse>;
      showToast(axiosErr.response?.data?.message ?? 'Failed to resend OTP.', 'error');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-900">Verify Your Email</h1>
        <p className="mt-2 text-sm text-neutral-500">
          We sent a 6-digit OTP to{' '}
          <span className="font-semibold text-primary-700">{email || 'your email address'}</span>.
          Please enter it below.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <Input
            label="One-Time Password (OTP)"
            type="text"
            inputId="otp_input"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            required
            helpText="Enter the 6-digit code sent to your email"
            error={errors.otp?.message}
            {...register('otp', {
              required: 'OTP is required',
              minLength: { value: 6, message: 'OTP must be 6 digits' },
              maxLength: { value: 6, message: 'OTP must be 6 digits' },
              pattern: { value: /^\d+$/, message: 'OTP must contain only digits' },
            })}
          />

          <Button type="submit" fullWidth isLoading={isSubmitting} id="verify_otp_btn">
            Verify Email
          </Button>
        </form>
      </Card>

      <div className="mt-6 text-center text-sm text-neutral-600">
        <span>Didn&apos;t receive the OTP? </span>
        <button
          onClick={handleResendOtp}
          disabled={isResending}
          className="font-medium text-primary-700 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isResending ? 'Sending...' : 'Resend OTP'}
        </button>
      </div>

      <p className="mt-3 text-center text-sm">
        <Link href={APP_ROUTES.LOGIN} className="text-neutral-500 hover:text-primary-700">
          ← Back to login
        </Link>
      </p>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}
