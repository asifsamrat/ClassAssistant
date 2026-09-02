import React, { useState } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  icon?: React.ReactNode;
  endIcon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  icon,
  endIcon,
  className = '',
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className="w-full space-y-1">
      {label && (
        <label
          htmlFor={props.id || props.name}
          className={`block text-xs font-semibold tracking-wide ${
            error ? 'text-red-600' : isFocused ? 'text-emerald-700' : 'text-gray-700'
          }`}
        >
          {label}
        </label>
      )}

      <div className="relative rounded-xl shadow-2xs">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none z-10">
            {icon}
          </div>
        )}

        <input
          id={props.id || props.name}
          readOnly
          {...props}
          onFocus={(e) => {
            e.target.removeAttribute('readonly');
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
          className={`block w-full text-sm rounded-xl py-2.5 transition-all duration-200 ${
            icon ? 'pl-11' : 'pl-3.5'
          } ${
            endIcon ? 'pr-11' : 'pr-3.5'
          } bg-white text-gray-900 placeholder-gray-400 border ${
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200'
              : 'border-gray-200 hover:border-gray-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100'
          } focus:outline-none ${className}`}
        />

        {endIcon && (
          <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center z-10">
            {endIcon}
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 font-medium mt-1">{error}</p>
      )}
    </div>
  );
};