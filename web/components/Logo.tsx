export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 64 64" className="h-9 w-9 shrink-0" aria-hidden>
        <rect x="3" y="3" width="58" height="58" rx="16" fill="#ffb3ad" stroke="#141414" strokeWidth="4" />
        <circle cx="30" cy="30" r="13" fill="none" stroke="#141414" strokeWidth="6" />
        <path d="m37 37 10 10" stroke="#141414" strokeWidth="6" strokeLinecap="round" />
      </svg>
      <span className="script text-2xl leading-none">QRush</span>
    </span>
  );
}
