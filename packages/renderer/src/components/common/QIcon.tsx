import React from 'react';

interface QIconProps {
  size?: number;
  className?: string;
}

export const QIcon: React.FC<QIconProps> = ({ size = 14, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} aria-label="QSerial">
    <path d="M2 7l3 2-3 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 11h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);
