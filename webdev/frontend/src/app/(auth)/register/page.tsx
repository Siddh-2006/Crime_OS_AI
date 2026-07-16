'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff } from 'lucide-react';
import apiClient from '@/lib/axios';
import { API_ROUTES, APP_ROUTES } from '@/lib/constants';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import type { AxiosError } from 'axios';
import type { ApiResponse } from '@/lib/types';

const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
];

const ID_PROOF_OPTIONS = [
  { value: 'AADHAAR', label: 'Aadhaar Card' },
  { value: 'PAN', label: 'PAN Card' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'VOTER_ID', label: 'Voter ID Card' },
  { value: 'DRIVING_LICENSE', label: "Driving Licence" },
];

const SECURITY_QUESTIONS = [
  { value: "What was the name of your first pet?", label: "What was the name of your first pet?" },
  { value: "What is your mother's maiden name?", label: "What is your mother's maiden name?" },
  { value: "What was the name of your primary school?", label: "What was the name of your primary school?" },
  { value: "What is your oldest sibling's middle name?", label: "What is your oldest sibling's middle name?" },
  { value: "What city were you born in?", label: "What city were you born in?" },
];

interface RegisterFormValues {
  firstName: string;
  middleName: string;
  lastName: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  idProofType: string;
  idProofNumber: string;
  securityQuestion: string;
  securityAnswer: string;
}

type Step = 1 | 2 | 3;

/**
 * Multi-step citizen registration form.
 * Step 1: Personal Info | Step 2: Address | Step 3: Identity & Security
 */
export default function RegisterPage(): React.ReactElement {
  const { toasts, showToast, removeToast } = useToast();
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    mode: 'onTouched',
    defaultValues: { state: 'Gujarat' },
  });

  const password = watch('password');

  const step1Fields: Array<keyof RegisterFormValues> = [
    'firstName', 'lastName', 'username', 'email', 'phone', 'password', 'confirmPassword', 'dateOfBirth', 'gender',
  ];
  const step2Fields: Array<keyof RegisterFormValues> = [
    'address', 'city', 'district', 'state', 'pincode',
  ];

  const goToStep = async (nextStep: Step): Promise<void> => {
    const fieldsToValidate = nextStep === 2 ? step1Fields : step2Fields;
    const valid = await trigger(fieldsToValidate);
    if (valid) setStep(nextStep);
  };

  const onSubmit = async (values: RegisterFormValues): Promise<void> => {
    try {
      const { confirmPassword, ...payload } = values;
      void confirmPassword;
      await apiClient.post(API_ROUTES.AUTH.REGISTER, payload);
      showToast('Registration successful! Please check your email for the OTP.', 'success');
      setTimeout(() => {
        router.push(`${APP_ROUTES.VERIFY_EMAIL}?email=${encodeURIComponent(values.email)}`);
      }, 1500);
    } catch (err) {
      const axiosErr = err as AxiosError<ApiResponse>;
      const message = axiosErr.response?.data?.message ?? 'Registration failed. Please try again.';
      showToast(message, 'error');
    }
  };

  const stepLabels = ['Personal Details', 'Address', 'Identity & Security'];

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Citizen Registration</h1>
        <p className="mt-1 text-sm text-neutral-500">Create your Crime OS portal account</p>
      </div>

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-0">
        {stepLabels.map((label, idx) => {
          const n = (idx + 1) as Step;
          const isCompleted = step > n;
          const isCurrent = step === n;
          return (
            <React.Fragment key={n}>
              <div className="flex flex-col items-center">
                <div
                  className={[
                    'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                    isCompleted
                      ? 'bg-success-600 text-white'
                      : isCurrent
                      ? 'bg-primary-800 text-white'
                      : 'bg-neutral-200 text-neutral-500',
                  ].join(' ')}
                >
                  {isCompleted ? '✓' : n}
                </div>
                <span className={['mt-1 text-xs', isCurrent ? 'text-primary-800 font-medium' : 'text-neutral-400'].join(' ')}>
                  {label}
                </span>
              </div>
              {idx < stepLabels.length - 1 && (
                <div className={['mx-2 mb-5 h-px flex-1', step > n ? 'bg-success-500' : 'bg-neutral-200'].join(' ')} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          {/* Step 1: Personal Info */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="First Name" required inputId="reg_firstName"
                  error={errors.firstName?.message}
                  {...register('firstName', { required: 'First name is required', minLength: { value: 2, message: 'Minimum 2 characters' } })}
                />
                <Input
                  label="Last Name" required inputId="reg_lastName"
                  error={errors.lastName?.message}
                  {...register('lastName', { required: 'Last name is required' })}
                />
              </div>
              <Input
                label="Middle Name" inputId="reg_middleName"
                {...register('middleName')}
              />
              <Input
                label="Username" required inputId="reg_username"
                helpText="3–30 characters, letters and numbers only"
                error={errors.username?.message}
                {...register('username', {
                  required: 'Username is required',
                  minLength: { value: 3, message: 'Minimum 3 characters' },
                  maxLength: { value: 30, message: 'Maximum 30 characters' },
                  pattern: { value: /^[a-z0-9]+$/, message: 'Lowercase letters and numbers only' },
                })}
              />
              <Input
                label="Email Address" type="email" required inputId="reg_email" autoComplete="email"
                error={errors.email?.message}
                {...register('email', {
                  required: 'Email is required',
                  pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email' },
                })}
              />
              <Input
                label="Mobile Number" type="tel" required inputId="reg_phone"
                helpText="10-digit Indian mobile number"
                error={errors.phone?.message}
                {...register('phone', {
                  required: 'Phone number is required',
                  pattern: { value: /^[6-9]\d{9}$/, message: 'Enter a valid 10-digit number' },
                })}
              />
              <div className="relative">
                <Input
                  label="Password" type={showPassword ? 'text' : 'password'} required inputId="reg_password"
                  helpText="Min 8 chars with uppercase, lowercase, number, and special char"
                  error={errors.password?.message}
                  rightElement={
                    <button type="button" onClick={() => setShowPassword(v => !v)} className="text-neutral-400 hover:text-neutral-600">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  }
                  {...register('password', {
                    required: 'Password is required',
                    minLength: { value: 8, message: 'Minimum 8 characters' },
                    pattern: {
                      value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
                      message: 'Must include uppercase, lowercase, number, and special character',
                    },
                  })}
                />
              </div>
              <Input
                label="Confirm Password" type="password" required inputId="reg_confirmPassword"
                error={errors.confirmPassword?.message}
                {...register('confirmPassword', {
                  required: 'Please confirm your password',
                  validate: (val) => val === password || 'Passwords do not match',
                })}
              />
              <Input
                label="Date of Birth" type="date" required inputId="reg_dob"
                error={errors.dateOfBirth?.message}
                {...register('dateOfBirth', { required: 'Date of birth is required' })}
              />
              <Select
                label="Gender" required inputId="reg_gender"
                placeholder="Select gender"
                options={GENDER_OPTIONS}
                error={errors.gender?.message}
                {...register('gender', { required: 'Gender is required' })}
              />
              <Button type="button" fullWidth onClick={() => goToStep(2)}>
                Next: Address Details
              </Button>
            </div>
          )}

          {/* Step 2: Address */}
          {step === 2 && (
            <div className="space-y-4">
              <Input
                label="Full Address" required inputId="reg_address"
                error={errors.address?.message}
                {...register('address', { required: 'Address is required', minLength: { value: 10, message: 'Enter complete address' } })}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="City" required inputId="reg_city"
                  error={errors.city?.message}
                  {...register('city', { required: 'City is required' })}
                />
                <Input
                  label="District" required inputId="reg_district"
                  error={errors.district?.message}
                  {...register('district', { required: 'District is required' })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="State" required inputId="reg_state"
                  error={errors.state?.message}
                  {...register('state', { required: 'State is required' })}
                />
                <Input
                  label="Pincode" required inputId="reg_pincode"
                  error={errors.pincode?.message}
                  {...register('pincode', {
                    required: 'Pincode is required',
                    pattern: { value: /^\d{6}$/, message: 'Enter a valid 6-digit pincode' },
                  })}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="ghost" fullWidth onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button type="button" fullWidth onClick={() => goToStep(3)}>
                  Next: Identity
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Identity & Security */}
          {step === 3 && (
            <div className="space-y-4">
              <Select
                label="ID Proof Type" required inputId="reg_idProofType"
                placeholder="Select ID proof"
                options={ID_PROOF_OPTIONS}
                error={errors.idProofType?.message}
                {...register('idProofType', { required: 'ID proof type is required' })}
              />
              <Input
                label="ID Proof Number" required inputId="reg_idProofNumber"
                error={errors.idProofNumber?.message}
                {...register('idProofNumber', { required: 'ID proof number is required' })}
              />
              <Select
                label="Security Question" required inputId="reg_securityQuestion"
                placeholder="Choose a security question"
                options={SECURITY_QUESTIONS}
                error={errors.securityQuestion?.message}
                {...register('securityQuestion', { required: 'Security question is required' })}
              />
              <Input
                label="Security Answer" required inputId="reg_securityAnswer"
                helpText="Case-insensitive. Remember this for account recovery."
                error={errors.securityAnswer?.message}
                {...register('securityAnswer', { required: 'Security answer is required', minLength: { value: 2, message: 'Minimum 2 characters' } })}
              />
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="ghost" fullWidth onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button type="submit" fullWidth isLoading={isSubmitting} id="reg_submit_btn">
                  Create Account
                </Button>
              </div>
            </div>
          )}
        </form>
      </Card>

      <p className="mt-6 text-center text-sm text-neutral-600">
        Already have an account?{' '}
        <Link href={APP_ROUTES.LOGIN} className="font-medium text-primary-700 hover:underline">
          Sign in
        </Link>
      </p>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}
