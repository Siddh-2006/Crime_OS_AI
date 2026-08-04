import { Gender } from '../../../shared/enums/gender.enum';
import { IdProofType } from '../../../shared/enums/idProof.enum';

export interface RegisterCitizenDto {
  firstName: string;
  middleName?: string;
  lastName: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  dateOfBirth: string;
  gender: Gender;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  idProofType: IdProofType;
  idProofNumber: string;
  securityQuestion: string;
  securityAnswer: string;
}

export interface CreateComplainantProfileDto {
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: Gender;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  idProofType: IdProofType;
  idProofNumber: string;
}

export interface VerifyEmailDto {
  email: string;
  otp: string;
}

export interface ResendOtpDto {
  email: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface ForgotPasswordDto {
  email: string;
}

export interface ResetPasswordDto {
  email: string;
  otp: string;
  newPassword: string;
}
