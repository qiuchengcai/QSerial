import React from 'react';

interface QIconProps {
  size?: number;
  className?: string;
}

export const QIcon: React.FC<QIconProps> = ({ size = 14, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} aria-label="QSerial">
    <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1" />
    <path d="M9 9l4.5 4.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
  </svg>
);
