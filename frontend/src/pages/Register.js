import React, { useState } from 'react';
import { Shield, Eye, EyeOff, UserPlus, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function Register() {
  const [form, setForm] = useState({ username: '', email: '', password: '', confirmPassword: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const { register } = useAuth();
  const navigate = useNavigate();

  const passwordStrength = (pass) => {
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[a-z]/.test(pass)) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/\d/.test(pass)) score++;
    if (/[^a-zA-Z0-9]/.test(pass)) score++;
    return score;
  };

  const strength = passwordStrength(form.password);
  const strengthColor = strength <= 2 ? 'bg-red-500' : strength <= 3 ? 'bg-amber-500' : 'bg-emerald-500';
  const strengthLabel = ['', 'Weak', 'Weak', 'Fair', 'Good', 'Strong'][strength];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    const newErrors = {};
    if (form.username.length < 3) newErrors.username = 'At least 3 characters';
    if (strength < 3) newErrors.password = 'Password must be stronger (uppercase, lowercase, and number required)';
    if (form.password !== form.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    if (Object.keys(newErrors).length) { setErrors(newErrors); return; }

    setLoading(true);
    try {
      await register(form.username, form.email, form.password, form.confirmPassword);
      toast.success('Account created! Welcome to DebtWise.');
      navigate('/');
    } catch (err) {
      const apiError = err.response?.data;
      if (apiError?.details?.length) {
        const fieldErrors = {};
        apiError.details.forEach(d => { fieldErrors[d.field] = d.message; });
        const knownFields = ['username', 'email', 'password', 'confirmPassword'];
        const hasUnmapped = apiError.details.some(d => !knownFields.includes(d.field));
        if (hasUnmapped) fieldErrors.general = apiError.details[0].message;
        setErrors(fieldErrors);
      } else {
        setErrors({ general: apiError?.error || 'Registration failed' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-primary-600 rounded-2xl mb-4 shadow-card-md">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-surface-900">DebtWise</h1>
          <p className="text-surface-500 mt-1 text-sm">Create your private account</p>
        </div>

        <div className="card shadow-card-lg">
          <div className="flex items-center gap-2 mb-2">
            <UserPlus className="w-4 h-4 text-primary-600" />
            <h2 className="font-semibold text-surface-800">First-Time Setup</h2>
          </div>
          <p className="text-xs text-surface-400 mb-5">This creates the single admin account for your local instance.</p>

          {errors.general && <div className="alert-critical mb-4"><span className="text-sm">{errors.general}</span></div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Username</label>
              <input type="text" className="input" placeholder="johndoe" value={form.username}
                onChange={e => setForm(p => ({ ...p, username: e.target.value }))} required />
              {errors.username && <p className="text-red-500 text-xs mt-1">{errors.username}</p>}
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" placeholder="you@example.com" value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} className="input pr-10"
                  placeholder="Min 8 chars, upper+lower+number"
                  value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
                  onClick={() => setShowPass(v => !v)}>
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {form.password && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= strength ? strengthColor : 'bg-surface-200'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-surface-400">{strengthLabel}</p>
                </div>
              )}
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
            </div>
            <div>
              <label className="label">Confirm Password</label>
              <input type="password" className="input" placeholder="Repeat password"
                value={form.confirmPassword} onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))} required />
              {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}
              {form.confirmPassword && form.confirmPassword === form.password && (
                <div className="flex items-center gap-1 mt-1 text-emerald-600 text-xs">
                  <CheckCircle className="w-3 h-3" /> Passwords match
                </div>
              )}
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Creating account...
              </span> : 'Create Account & Start'}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-surface-400 mt-6">🔒 All data stays on your device</p>
      </div>
    </div>
  );
}
