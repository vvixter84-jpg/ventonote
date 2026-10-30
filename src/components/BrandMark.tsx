interface BrandMarkProps {
  size?: number;
  className?: string;
}

/** Логотип в интерфейсе: страница с загнутым углом и искра на фиолетовой плитке. */
export default function BrandMark({ size = 36, className }: BrandMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label="VentoNote"
    >
      <defs>
        <linearGradient id="vn-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b1d6e" />
          <stop offset="1" stopColor="#150c26" />
        </linearGradient>
        <linearGradient id="vn-page" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id="vn-fold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3ecff" />
          <stop offset="1" stopColor="#c4b5fd" />
        </linearGradient>
      </defs>

      <rect width="40" height="40" rx="10.5" fill="url(#vn-tile)" />
      <rect x="0.6" y="0.6" width="38.8" height="38.8" rx="10" fill="none" stroke="#c4b5fd" strokeOpacity="0.25" />

      <g transform="rotate(-7 20 20)">
        <rect x="14.6" y="11.6" width="13" height="18" rx="3" fill="#6d28d9" opacity="0.55" />
        <path d="M13.2 12.2a3 3 0 0 1 3-3h5.6l5.2 5.2v12.4a3 3 0 0 1-3 3h-10.8a3 3 0 0 1-3-3z" fill="url(#vn-page)" />
        <path d="M21.8 9.2l5.2 5.2h-4.2a1 1 0 0 1-1-1z" fill="url(#vn-fold)" />
        <rect x="15.6" y="16.4" width="8.2" height="1.9" rx="0.95" fill="#ede9fe" />
        <rect x="15.6" y="20.2" width="8.2" height="1.9" rx="0.95" fill="#ede9fe" />
        <rect x="15.6" y="24" width="5" height="1.9" rx="0.95" fill="#ede9fe" />
      </g>

      <path
        d="M28.6 22.6l1.25 3.05 3.05 1.25-3.05 1.25-1.25 3.05-1.25-3.05-3.05-1.25 3.05-1.25z"
        fill="#f7f4ff"
      />
    </svg>
  );
}
