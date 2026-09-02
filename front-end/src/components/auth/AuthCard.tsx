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
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden transition-all duration-300 ease-in-out border border-gray-100 border-t-4 border-t-emerald-700 p-8 sm:p-10">
        {/* University Logo */}
        <div className="flex justify-center mb-4">
          <img
            src={gubLogo}
            alt="Green University of Bangladesh Logo"
            className="h-24 w-auto max-w-xs object-contain transition-transform duration-300 hover:scale-105"
          />
        </div>
        
        {/* University Name & System Title */}
        <h2 className="text-xl font-bold text-center text-emerald-600 tracking-tight">
          Green University of Bangladesh
        </h2>
        <p className="text-xs font-semibold text-center text-emerald-700 tracking-wider uppercase mt-0.5 mb-4">
          Smart Attendance System
        </p>

        {/* Role Badge & Portal Instructions */}
        <div className="mb-6 text-center">
          <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs mb-2">
            {role === 'student'
              ? 'Student Portal'
              : role === 'admin'
              ? 'Administration Portal'
              : 'Faculty Portal'}
          </span>
          <p className="text-xs text-gray-500 max-w-xs mx-auto">
            {role === 'student'
              ? 'Enter your Student ID & Password issued by University Administration'
              : role === 'admin'
              ? 'Enter your official Administrative credentials to sign in'
              : 'Enter your official GUB Email & Password to sign in'}
          </p>
        </div>
        
        {/* Active Login Form */}
        <div className="transition-all duration-300 ease-in-out">
          <LoginForm role={role} />
        </div>

        {/* Formal Footer */}
        <div className="mt-8 pt-4 border-t border-gray-100 text-center">
          <p className="text-[11px] text-gray-400 font-medium">
            © {new Date().getFullYear()} Green University of Bangladesh. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};