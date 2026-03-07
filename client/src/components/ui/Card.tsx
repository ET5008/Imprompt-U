import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'lg';
}

export function Card({ size = 'sm', className = '', children, ...props }: CardProps) {
  return (
    <div
      {...props}
      className={[
        size === 'lg' ? 'sketch-card-lg' : 'sketch-card',
        'paper-texture relative overflow-hidden',
        className,
      ].join(' ')}
    >
      <div className="relative z-10">{children}</div>
    </div>
  );
}
