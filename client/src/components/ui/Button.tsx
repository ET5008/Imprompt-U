import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-[#452B2B] text-[#FDF6F0] hover:bg-[#6B4545]',
  secondary: 'bg-[#F3C8D7] text-[#452B2B] hover:bg-[#EDBBAB]',
  ghost: 'bg-transparent text-[#452B2B] hover:bg-[#F3C8D7]/40',
};

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-base',
  lg: 'px-7 py-3 text-lg',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={[
        'font-sketch border-sketch inline-flex items-center justify-center gap-2',
        'cursor-pointer select-none transition-all duration-150',
        'active:translate-y-[1px] active:shadow-none',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0',
        'btn-sketch',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(' ')}
    >
      {children}
    </button>
  );
}
