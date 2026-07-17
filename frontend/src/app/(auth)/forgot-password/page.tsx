'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

interface ForgotPasswordFormValues {
  email: string;
}

/**
 * Forgot password page — collects email and sends OTP.
 * Navigates to reset-password page with email pre-filled.
 */
export default function ForgotPasswordPage(): React.ReactElement {
  const { toasts, showToast, removeToast } = useToast();
  const router = useRouter();
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>();

  const onSubmit = async (values: ForgotPasswordFormValues): Promise<void> => {
    try {
      await apiClient.post(API_ROUTES.AUTH.FORGOT_PASSWORD, { email: values.email });
      setSubmittedEmail(values.email);
      setSubmitted(true);
    } catch (err) {
      const axiosErr = err as AxiosError<ApiResponse>;
      showToast(axiosErr.response?.data?.message ?? 'An error occurred. Please try again.', 'error');
    }
  };

  const handleProceed = (): void => {
    router.push(`${APP_ROUTES.RESET_PASSWORD}?email=${encodeURIComponent(submittedEmail)}`);
  };

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-900">Forgot Password</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Enter your registered email address to receive a password reset OTP.
        </p>
      </div>

      {!submitted ? (
        <Card>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            <Input
              label="Email Address"
              type="email"
              inputId="forgot_email"
              autoComplete="email"
              required
              error={errors.email?.message}
              {...register('email', {
                required: 'Email is required',
                pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email address' },
              })}
            />
            <Button type="submit" fullWidth isLoading={isSubmitting} id="forgot_submit_btn">
              Send Reset OTP
            </Button>
          </form>
        </Card>
      ) : (
        <Card>
          <div className="text-center space-y-4 py-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-100">
              <svg className="h-7 w-7 text-success-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-neutral-900">OTP Sent</p>
              <p className="mt-1 text-sm text-neutral-500">
                If <span className="font-medium text-primary-700">{submittedEmail}</span> is registered,
                you will receive a reset OTP shortly.
              </p>
            </div>
            <Button fullWidth onClick={handleProceed} id="proceed_reset_btn">
              Enter OTP & Reset Password
            </Button>
          </div>
        </Card>
      )}

      <p className="mt-6 text-center text-sm">
        <Link href={APP_ROUTES.LOGIN} className="text-neutral-500 hover:text-primary-700">
          ← Back to login
        </Link>
      </p>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}
