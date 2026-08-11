'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Cookies from 'js-cookie';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function DepartmentLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await axios.post('http://localhost:5001/api/v1/department-portal/login', {
        username,
        password
      });

      if (res.data.success) {
        Cookies.set('dept_token', res.data.data.token);
        Cookies.set('dept_entity_id', res.data.data.department_entity_id);
        router.push('/department-portal/dashboard');
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden animate-fade-in">
      <div className="bg-surface p-8 rounded-3xl shadow-elevated w-full max-w-md border border-border glass relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="h-16 w-16 bg-brand-primary/10 border border-brand-primary/20 rounded-2xl flex items-center justify-center mb-4 text-brand-primary shadow-glow-sm">
            <Shield className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-heading font-extrabold text-text-primary tracking-tight">Department Portal</h1>
          <p className="text-text-secondary mt-1.5 text-center text-sm font-medium">
            Secure access for authorized external departments and partner stations.
          </p>
        </div>

        {error && (
          <div className="bg-semantic-critical/10 border border-semantic-critical/30 text-semantic-critical p-3.5 rounded-xl mb-4 text-sm font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">Department ID</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-input-bg border border-input-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-brand-primary transition-all duration-200"
              placeholder="e.g. hdfc, isp, station7"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-input-bg border border-input-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-brand-primary transition-all duration-200"
              placeholder="Enter 'admin' to mock"
              required
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            isLoading={loading}
            fullWidth
            className="mt-2 font-bold py-3"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  );
}
