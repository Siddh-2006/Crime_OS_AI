'use client';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import apiClient from '@/lib/axios';
import { User, ShieldCheck } from 'lucide-react';

interface ProfileForm {
  pastExperience: string;
  expertise: string;
  photoUrl: string;
}

export default function PoliceProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [officerData, setOfficerData] = useState<any>(null);
  const { register, handleSubmit, setValue } = useForm<ProfileForm>();
  const { toasts, showToast, removeToast } = useToast();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await apiClient.get('/police/me');
        const data = res.data.data;
        setOfficerData(data);
        setValue('pastExperience', data.pastExperience || '');
        setValue('expertise', (data.expertise || []).join(', '));
        setValue('photoUrl', data.photoUrl || '');
        setLoading(false);
      } catch (err) {
        showToast('Failed to load profile', 'error');
        setLoading(false);
      }
    };
    fetchProfile();
  }, [setValue]);

  const onSubmit = async (data: ProfileForm) => {
    setSaving(true);
    try {
      const expertiseArr = data.expertise.split(',').map(s => s.trim()).filter(Boolean);
      await apiClient.patch('/police/profile', {
        pastExperience: data.pastExperience,
        expertise: expertiseArr,
        photoUrl: data.photoUrl
      });
      showToast('Profile updated successfully', 'success');
    } catch (err) {
      showToast('Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-white">Loading profile...</div>;

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-light text-white mb-2">My Profile</h1>
        <p className="text-gray-400">Update your operational expertise and past experience.</p>
      </div>

      <Card className="p-8 bg-[#0a0a0a] border-gray-800">
        <div className="flex items-start justify-between mb-8 pb-8 border-b border-gray-800">
          <div>
            <h2 className="text-2xl font-medium text-white">{officerData?.officerName}</h2>
            <div className="flex items-center gap-2 mt-2 text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full w-fit">
              <ShieldCheck size={16} />
              <span className="text-sm font-bold uppercase">{officerData?.role}</span>
            </div>
            <p className="text-gray-400 mt-2 font-mono text-sm">Badge: {officerData?.badgeNumber}</p>
          </div>
          <div className="w-24 h-24 rounded-full bg-gray-800 flex shrink-0 items-center justify-center overflow-hidden">
            {officerData?.photoUrl ? (
              <img src={officerData.photoUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <User size={40} className="text-gray-400" />
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <Input label="Email Address" value={officerData?.email} disabled placeholder="Email" />
            <Input label="Phone Number" value={officerData?.phone} disabled placeholder="Phone" />
          </div>

          <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm">
            Note: Email, phone, and role are managed by administrators. You can only update your operational details below.
          </div>

          <Input
            label="Profile Photo URL"
            {...register('photoUrl')}
            placeholder="https://example.com/photo.jpg"
          />

          <Input
            label="Past Experience"
            {...register('pastExperience')}
            placeholder="E.g., 5 years in Cyber Crime Cell, 3 years in Narcotics"
          />

          <Input
            label="Areas of Expertise (Comma separated)"
            {...register('expertise')}
            placeholder="Digital Forensics, Financial Fraud, Interrogation"
          />

          <div className="pt-4 flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Profile Changes'}
            </Button>
          </div>
        </form>
      </Card>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
