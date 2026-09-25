export function HackRadarLogo({
  className = "size-9",
  label = false
}: {
  className?: string;
  label?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        viewBox="0 0 64 64"
        role="img"
        aria-label="HackRadar logo"
        className="size-full shrink-0"
      >
        <circle cx="32" cy="32" r="27" fill="#fffdfa" stroke="#0f8b7e" strokeWidth="2.4" />
        <circle cx="32" cy="32" r="18" fill="none" stroke="#0f8b7e" strokeWidth="1.8" opacity=".78" />
        <circle cx="32" cy="32" r="9" fill="none" stroke="#0f8b7e" strokeWidth="1.8" opacity=".78" />
        <path d="M32 32 43.5 11.8A27 27 0 0 1 55.2 31H32Z" fill="#0f8b7e" opacity=".88" />
        <path d="M32 32 43.5 11.8" stroke="#0f8b7e" strokeWidth="2" strokeLinecap="round" />
        <path d="M32 3v7M32 54v7M3 32h7M54 32h7" stroke="#0f8b7e" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 32h-3M52 14l-2.3 2.3M50 49l-2.3-2.3" stroke="#0f8b7e" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="11" cy="32" r="4.4" fill="#0f8b7e" />
        <circle cx="52" cy="14" r="4.4" fill="#c05575" />
        <circle cx="50" cy="49" r="4.4" fill="#b5771a" />
        <text x="11" y="33.8" textAnchor="middle" fill="#fffdfa" fontFamily="Arial, sans-serif" fontSize="5.2" fontWeight="700" textLength="8.2" lengthAdjust="spacingAndGlyphs">&lt;/&gt;</text>
        <text x="52" y="15.8" textAnchor="middle" fill="#fffdfa" fontFamily="Arial, sans-serif" fontSize="5.2" fontWeight="700" textLength="8.2" lengthAdjust="spacingAndGlyphs">&lt;/&gt;</text>
        <text x="50" y="50.8" textAnchor="middle" fill="#fffdfa" fontFamily="Arial, sans-serif" fontSize="5.2" fontWeight="700" textLength="8.2" lengthAdjust="spacingAndGlyphs">&lt;/&gt;</text>
        <circle cx="32" cy="32" r="3.2" fill="#0f8b7e" />
      </svg>
      {label && <span className="text-sm font-bold tracking-tight text-ink">HackRadar</span>}
    </span>
  );
}
