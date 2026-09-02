import React, { useEffect, useState } from 'react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Eye, EyeOff, Mail, KeyRound, User } from 'lucide-react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

interface LoginFormProps {
  role?: 'student' | 'faculty' | 'admin';
}

export const LoginForm: React.FC<LoginFormProps> = ({ role = 'faculty' }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    student_id: '',
    password: '',
  });
  const [errors, setErrors] = useState({
    email: '',
    student_id: '',
    password: '',
    general: ''
  });
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (errors[name as keyof typeof errors]) {
      setErrors(prev => ({
        ...prev,
        [name]: '',
        general: ''
      }));
    }
  };

  const validate = () => {
    let valid = true;
    const newErrors = { email: '', student_id: '', password: '', general: '' };

    if (role === 'student') {
      if (!formData.student_id.trim()) {
        newErrors.student_id = 'Student ID is required';
        valid = false;
      }
    } else {
      if (!formData.email.trim()) {
        newErrors.email = role === 'admin' ? 'Email or Username is required' : 'Email is required';
        valid = false;
      }
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
      valid = false;
    }

    setErrors(newErrors);
    return valid;
  };

  useEffect(() => {
    (async () => {
      try {
        const response = await axios.get(`${import.meta.env.VITE_API}/stay_signin`, {
          withCredentials: true,
        });
        if (response.data.msg === "success") {
          const userRole = response.data.role;
          if (userRole === 'admin') {
            navigate('/admin/dashboard');
          } else if (userRole === 'student') {
            navigate('/student/dashboard');
          } else {
            navigate('/attendance-system/dashboard');
          }
        }
      } catch (error) {
        // Not logged in
      }
    })();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setIsLoading(true);
    setErrors(prev => ({ ...prev, general: '' }));

    try {
      let endpoint = '/signin';
      let payload: any = { email: formData.email, password: formData.password };

      if (role === 'student') {
        endpoint = '/student/signin';
        payload = { student_id: formData.student_id, password: formData.password };
      } else if (role === 'admin') {
        endpoint = '/admin/signin';
        payload = { email: formData.email, password: formData.password };
      }

      const response = await axios.post(`${import.meta.env.VITE_API}${endpoint}`, payload, {
        withCredentials: true,
      });

      if (response.data.msg === 'success') {
        const userRole = response.data.role;
        if (userRole === 'admin') {
          navigate('/admin/dashboard');
        } else if (userRole === 'student') {
          navigate('/student/dashboard');
        } else {
          navigate('/attendance-system/dashboard');
        }
      } else {
        setErrors(prev => ({ ...prev, general: response.data.msg || 'Login failed' }));
      }
    } catch (error: any) {
      const msg = error.response?.data?.msg || 'Invalid credentials. Please try again.';
      setErrors(prev => ({ ...prev, general: msg }));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
      {errors.general && (
        <div className="p-3 text-sm text-red-700 bg-red-50 rounded-xl border border-red-200 shadow-2xs">
          {errors.general}
        </div>
      )}

      {role === 'student' ? (
        <Input
          label="Student ID"
          name="student_id"
          type="text"
          icon={<User className="w-5 h-5 text-emerald-600" />}
          value={formData.student_id}
          onChange={handleChange}
          error={errors.student_id}
          placeholder="e.g. 221902117"
          autoComplete="username"
          required
        />
      ) : (
        <Input
          label={role === 'admin' ? "Admin Email / Username" : "GUB Institutional Email"}
          name="email"
          type={role === 'admin' ? "text" : "email"}
          icon={<Mail className="w-5 h-5 text-emerald-600" />}
          value={formData.email}
          onChange={handleChange}
          error={errors.email}
          placeholder={role === 'admin' ? "admin@green.edu.bd" : "faculty@green.edu.bd"}
          autoComplete="username"
          required
        />
      )}

      <Input
        label="Password"
        name="password"
        type={showPassword ? 'text' : 'password'}
        icon={<KeyRound className="w-5 h-5 text-emerald-600" />}
        value={formData.password}
        onChange={handleChange}
        error={errors.password}
        placeholder="••••••••"
        autoComplete="current-password"
        required
        endIcon={
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="text-gray-400 hover:text-emerald-600 focus:outline-none transition-colors"
          >
            {showPassword ? (
              <EyeOff className="w-5 h-5" />
            ) : (
              <Eye className="w-5 h-5" />
            )}
          </button>
        }
      />

      <Button
        type="submit"
        isLoading={isLoading}
        fullWidth
        className="!bg-emerald-700 hover:!bg-emerald-800 active:!bg-emerald-900 focus:!ring-emerald-500 py-2.5 rounded-xl shadow-md font-semibold text-sm transition-all duration-200 text-white mt-2"
      >
        {role === 'admin' ? 'Sign in to Admin Console' : role === 'student' ? 'Sign in to Student Portal' : 'Sign in to Faculty Portal'}
      </Button>
    </form>
  );
};