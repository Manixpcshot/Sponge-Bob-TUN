import React from 'react';

interface CountryFlagProps {
  code: string;
  size?: number;
  className?: string;
}

export const CountryFlag: React.FC<CountryFlagProps> = ({ code, size = 20, className = '' }) => {
  const c = (code || 'UN').toUpperCase();
  const w = size;
  const h = Math.round((size * 3) / 4);

  const renderFlagInner = () => {
    switch (c) {
      case 'DE':
        return (
          <>
            <rect width="24" height="6" y="0" fill="#111827" />
            <rect width="24" height="6" y="6" fill="#DC2626" />
            <rect width="24" height="6" y="12" fill="#FACC15" />
          </>
        );
      case 'TR':
        return (
          <>
            <rect width="24" height="18" fill="#E11D48" />
            <circle cx="9.8" cy="9" r="4.5" fill="#FFFFFF" />
            <circle cx="11" cy="9" r="3.6" fill="#E11D48" />
            <polygon points="14.5,9 16.2,9.6 15.6,11.3 16.8,10.1 18.2,11 17.5,9.4 18.7,8.2 17,8.4 16.2,6.8 15.9,8.5" fill="#FFFFFF" />
          </>
        );
      case 'NL':
        return (
          <>
            <rect width="24" height="6" y="0" fill="#DC2626" />
            <rect width="24" height="6" y="6" fill="#FFFFFF" />
            <rect width="24" height="6" y="12" fill="#1D4ED8" />
          </>
        );
      case 'FI':
        return (
          <>
            <rect width="24" height="18" fill="#FFFFFF" />
            <rect x="6.5" y="0" width="4" height="18" fill="#1D4ED8" />
            <rect x="0" y="7" width="24" height="4" fill="#1D4ED8" />
          </>
        );
      case 'SE':
        return (
          <>
            <rect width="24" height="18" fill="#0284C7" />
            <rect x="6.5" y="0" width="3.8" height="18" fill="#FACC15" />
            <rect x="0" y="7.1" width="24" height="3.8" fill="#FACC15" />
          </>
        );
      case 'FR':
        return (
          <>
            <rect width="8" height="18" x="0" fill="#1D4ED8" />
            <rect width="8" height="18" x="8" fill="#FFFFFF" />
            <rect width="8" height="18" x="16" fill="#DC2626" />
          </>
        );
      case 'IT':
        return (
          <>
            <rect width="8" height="18" x="0" fill="#16A34A" />
            <rect width="8" height="18" x="8" fill="#FFFFFF" />
            <rect width="8" height="18" x="16" fill="#DC2626" />
          </>
        );
      case 'BE':
        return (
          <>
            <rect width="8" height="18" x="0" fill="#111827" />
            <rect width="8" height="18" x="8" fill="#FACC15" />
            <rect width="8" height="18" x="16" fill="#DC2626" />
          </>
        );
      case 'IE':
        return (
          <>
            <rect width="8" height="18" x="0" fill="#16A34A" />
            <rect width="8" height="18" x="8" fill="#FFFFFF" />
            <rect width="8" height="18" x="16" fill="#F97316" />
          </>
        );
      case 'RO':
        return (
          <>
            <rect width="8" height="18" x="0" fill="#1E3A8A" />
            <rect width="8" height="18" x="8" fill="#FACC15" />
            <rect width="8" height="18" x="16" fill="#DC2626" />
          </>
        );
      case 'GB':
        return (
          <>
            <rect width="24" height="18" fill="#1E3A8A" />
            <path d="M0,0 L24,18 M24,0 L0,18" stroke="#FFFFFF" strokeWidth="3.2" />
            <path d="M0,0 L24,18 M24,0 L0,18" stroke="#DC2626" strokeWidth="1.6" />
            <rect x="9.5" y="0" width="5" height="18" fill="#FFFFFF" />
            <rect x="0" y="6.5" width="24" height="5" fill="#FFFFFF" />
            <rect x="10.5" y="0" width="3" height="18" fill="#DC2626" />
            <rect x="0" y="7.5" width="24" height="3" fill="#DC2626" />
          </>
        );
      case 'US':
        return (
          <>
            <rect width="24" height="18" fill="#FFFFFF" />
            {[0, 2.8, 5.6, 8.4, 11.2, 14, 16.4].map((y, idx) => (
              <rect key={idx} width="24" height="1.5" y={y} fill="#DC2626" />
            ))}
            <rect width="11" height="9.8" fill="#1E3A8A" />
            <circle cx="3" cy="2.5" r="0.8" fill="#FFFFFF" />
            <circle cx="6" cy="2.5" r="0.8" fill="#FFFFFF" />
            <circle cx="9" cy="2.5" r="0.8" fill="#FFFFFF" />
            <circle cx="4.5" cy="5" r="0.8" fill="#FFFFFF" />
            <circle cx="7.5" cy="5" r="0.8" fill="#FFFFFF" />
            <circle cx="3" cy="7.5" r="0.8" fill="#FFFFFF" />
            <circle cx="6" cy="7.5" r="0.8" fill="#FFFFFF" />
            <circle cx="9" cy="7.5" r="0.8" fill="#FFFFFF" />
          </>
        );
      case 'CA':
        return (
          <>
            <rect width="6" height="18" x="0" fill="#DC2626" />
            <rect width="12" height="18" x="6" fill="#FFFFFF" />
            <rect width="6" height="18" x="18" fill="#DC2626" />
            <path d="M12,4 L13.4,7 L16,6.5 L14.5,9 L16,10.5 L13.2,10.5 L12.7,13.5 L11.3,13.5 L10.8,10.5 L8,10.5 L9.5,9 L8,6.5 L10.6,7 Z" fill="#DC2626" />
          </>
        );
      case 'CH':
        return (
          <>
            <rect width="24" height="18" fill="#DC2626" />
            <rect x="10.2" y="3.5" width="3.6" height="11" fill="#FFFFFF" />
            <rect x="6.5" y="7.2" width="11" height="3.6" fill="#FFFFFF" />
          </>
        );
      case 'AT':
        return (
          <>
            <rect width="24" height="6" y="0" fill="#DC2626" />
            <rect width="24" height="6" y="6" fill="#FFFFFF" />
            <rect width="24" height="6" y="12" fill="#DC2626" />
          </>
        );
      case 'PL':
        return (
          <>
            <rect width="24" height="9" y="0" fill="#FFFFFF" />
            <rect width="24" height="9" y="9" fill="#DC2626" />
          </>
        );
      case 'RU':
        return (
          <>
            <rect width="24" height="6" y="0" fill="#FFFFFF" />
            <rect width="24" height="6" y="6" fill="#1D4ED8" />
            <rect width="24" height="6" y="12" fill="#DC2626" />
          </>
        );
      case 'UA':
        return (
          <>
            <rect width="24" height="9" y="0" fill="#0284C7" />
            <rect width="24" height="9" y="9" fill="#FACC15" />
          </>
        );
      case 'AE':
        return (
          <>
            <rect width="18" height="6" x="6" y="0" fill="#16A34A" />
            <rect width="18" height="6" x="6" y="6" fill="#FFFFFF" />
            <rect width="18" height="6" x="6" y="12" fill="#111827" />
            <rect width="6" height="18" x="0" fill="#DC2626" />
          </>
        );
      case 'SG':
        return (
          <>
            <rect width="24" height="9" y="0" fill="#DC2626" />
            <rect width="24" height="9" y="9" fill="#FFFFFF" />
            <circle cx="5.5" cy="4.5" r="2.7" fill="#FFFFFF" />
            <circle cx="6.5" cy="4.5" r="2.3" fill="#DC2626" />
          </>
        );
      case 'JP':
        return (
          <>
            <rect width="24" height="18" fill="#FFFFFF" />
            <circle cx="12" cy="9" r="4.8" fill="#DC2626" />
          </>
        );
      case 'KR':
        return (
          <>
            <rect width="24" height="18" fill="#FFFFFF" />
            <circle cx="12" cy="9" r="4.2" fill="#DC2626" />
            <path d="M7.8,9 A4.2,4.2 0 0,0 16.2,9 Z" fill="#1D4ED8" />
          </>
        );
      case 'NO':
        return (
          <>
            <rect width="24" height="18" fill="#DC2626" />
            <rect x="6" y="0" width="4.5" height="18" fill="#FFFFFF" />
            <rect x="0" y="6.8" width="24" height="4.5" fill="#FFFFFF" />
            <rect x="7" y="0" width="2.5" height="18" fill="#1E3A8A" />
            <rect x="0" y="7.8" width="24" height="2.5" fill="#1E3A8A" />
          </>
        );
      case 'DK':
        return (
          <>
            <rect width="24" height="18" fill="#DC2626" />
            <rect x="6.5" y="0" width="3" height="18" fill="#FFFFFF" />
            <rect x="0" y="7.5" width="24" height="3" fill="#FFFFFF" />
          </>
        );
      case 'ES':
        return (
          <>
            <rect width="24" height="4.5" y="0" fill="#DC2626" />
            <rect width="24" height="9" y="4.5" fill="#FACC15" />
            <rect width="24" height="4.5" y="13.5" fill="#DC2626" />
          </>
        );
      case 'HU':
        return (
          <>
            <rect width="24" height="6" y="0" fill="#DC2626" />
            <rect width="24" height="6" y="6" fill="#FFFFFF" />
            <rect width="24" height="6" y="12" fill="#16A34A" />
          </>
        );
      case 'BG':
        return (
          <>
            <rect width="24" height="6" y="0" fill="#FFFFFF" />
            <rect width="24" height="6" y="6" fill="#16A34A" />
            <rect width="24" height="6" y="12" fill="#DC2626" />
          </>
        );
      case 'LU':
        return (
          <>
            <rect width="24" height="6" y="0" fill="#DC2626" />
            <rect width="24" height="6" y="6" fill="#FFFFFF" />
            <rect width="24" height="6" y="12" fill="#38BDF8" />
          </>
        );
      case 'EE':
        return (
          <>
            <rect width="24" height="6" y="0" fill="#0284C7" />
            <rect width="24" height="6" y="6" fill="#111827" />
            <rect width="24" height="6" y="12" fill="#FFFFFF" />
          </>
        );
      case 'LV':
        return (
          <>
            <rect width="24" height="7" y="0" fill="#991B1B" />
            <rect width="24" height="4" y="7" fill="#FFFFFF" />
            <rect width="24" height="7" y="11" fill="#991B1B" />
          </>
        );
      case 'LT':
        return (
          <>
            <rect width="24" height="6" y="0" fill="#FACC15" />
            <rect width="24" height="6" y="6" fill="#16A34A" />
            <rect width="24" height="6" y="12" fill="#DC2626" />
          </>
        );
      case 'CZ':
        return (
          <>
            <rect width="24" height="9" y="0" fill="#FFFFFF" />
            <rect width="24" height="9" y="9" fill="#DC2626" />
            <polygon points="0,0 11,9 0,18" fill="#1D4ED8" />
          </>
        );
      case 'IN':
        return (
          <>
            <rect width="24" height="6" y="0" fill="#F97316" />
            <rect width="24" height="6" y="6" fill="#FFFFFF" />
            <rect width="24" height="6" y="12" fill="#16A34A" />
            <circle cx="12" cy="9" r="2" stroke="#1E3A8A" strokeWidth="0.7" fill="none" />
          </>
        );
      case 'AU':
        return (
          <>
            <rect width="24" height="18" fill="#1E3A8A" />
            <rect width="10" height="8" fill="#1E3A8A" />
            <path d="M0,0 L10,8 M10,0 L0,8" stroke="#FFFFFF" strokeWidth="1.5" />
            <rect x="4" y="0" width="2" height="8" fill="#DC2626" />
            <rect x="0" y="3" width="10" height="2" fill="#DC2626" />
            <circle cx="18" cy="5" r="1.1" fill="#FFFFFF" />
            <circle cx="16" cy="11" r="1.2" fill="#FFFFFF" />
            <circle cx="20" cy="10" r="1" fill="#FFFFFF" />
            <circle cx="18" cy="14" r="1.1" fill="#FFFFFF" />
          </>
        );
      case 'BR':
        return (
          <>
            <rect width="24" height="18" fill="#16A34A" />
            <polygon points="12,2.5 21,9 12,15.5 3,9" fill="#FACC15" />
            <circle cx="12" cy="9" r="3.4" fill="#1E3A8A" />
          </>
        );
      case 'IR':
        return (
          <>
            <rect width="24" height="6" y="0" fill="#16A34A" />
            <rect width="24" height="6" y="6" fill="#FFFFFF" />
            <rect width="24" height="6" y="12" fill="#DC2626" />
            <circle cx="12" cy="9" r="1.5" fill="#DC2626" />
          </>
        );
      case 'HK':
      case 'TW':
      case 'AM':
      case 'GE':
      case 'AZ':
      case 'OM':
      case 'QA':
      case 'BH':
      case 'MD':
        return (
          <>
            <rect width="24" height="18" fill="#3B1566" />
            <rect x="0.8" y="0.8" width="22.4" height="16.4" rx="2" fill="none" stroke="#FACC15" strokeWidth="1.2" />
            <text
              x="12"
              y="12.5"
              textAnchor="middle"
              fontSize="9"
              fontWeight="700"
              fill="#FDE047"
              fontFamily="Inter, sans-serif"
            >
              {c}
            </text>
          </>
        );
      default:
        return (
          <>
            <defs>
              <linearGradient id="unGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#7E22CE" />
                <stop offset="100%" stopColor="#FACC15" />
              </linearGradient>
            </defs>
            <rect width="24" height="18" fill="#1E1B3A" />
            <circle cx="12" cy="9" r="5.5" fill="none" stroke="url(#unGrad)" strokeWidth="1.5" />
            <ellipse cx="12" cy="9" rx="2.6" ry="5.5" fill="none" stroke="#A855F7" strokeWidth="1.1" />
            <line x1="6.5" y1="9" x2="17.5" y2="9" stroke="#FACC15" strokeWidth="1.1" />
          </>
        );
    }
  };

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 24 18"
      className={`shrink-0 rounded-[4px] shadow-sm ring-1 ring-white/20 ${className}`}
      aria-label={c}
    >
      <clipPath id={`flag-clip-${c}`}>
        <rect width="24" height="18" rx="2.5" />
      </clipPath>
      <g clipPath={`url(#flag-clip-${c})`}>{renderFlagInner()}</g>
    </svg>
  );
};
