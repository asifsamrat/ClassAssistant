import React, { useState, useEffect } from 'react';
import { LoginForm } from './LoginForm';
import gubLogo from '../../avatar/Logo.png';

interface AuthCardProps {
  initialRole?: 'student' | 'faculty' | 'admin';
}

export const AuthCard: React.FC<AuthCardProps> = ({ initialRole = 'faculty' }) => {
  const [role, setRole] = useState<'student' | 'faculty' | 'admin'>(initialRole);

  useEffect(() => {
    if (initialRole) setRole(initialRole);
  }, [initialRole]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden transition-all duration-300 ease-in-out border border-gray-100 border-t-4 border-t-emerald-700 p-6 sm:p-8">
        {/* University Logo */}
        <div className="flex justify-center mb-3">
          <img
            src={gubLogo}
            alt="Green University of Bangladesh Logo"
            className="h-20 w-auto max-w-xs object-contain transition-transform duration-300 hover:scale-105"
          />
        </div>

        {/* University Name */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-emerald-700 tracking-tight">
            Green University of Bangladesh
          </h2>
        </div>

        {/* Active Login Form */}
        <div className="transition-all duration-300 ease-in-out">
          <LoginForm role={role} />
        </div>

        {/* Formal Footer */}
        <div className="mt-6 pt-4 border-t border-gray-100 text-center">
          <p className="text-[11px] text-gray-400 font-medium">
            © {new Date().getFullYear()} Green University of Bangladesh. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};