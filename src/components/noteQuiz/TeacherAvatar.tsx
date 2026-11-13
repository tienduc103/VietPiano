/**
 * Cô giáo hoạt hình của "Đố bé nốt gì?" (SVG vẽ tay, chạy offline): ba biểu cảm
 * — `idle` mỉm cười, `happy` cười tươi + má hồng + lấp lánh (bé trả lời đúng), `encourage` nghiêng đầu động viên (bé chọn sai).
 * `talking`: miệng mấp máy khi cô đang nói.
 */
export type TeacherMood = 'idle' | 'happy' | 'encourage';

export function TeacherAvatar({ mood, talking, className = '' }: { mood: TeacherMood; talking: boolean; className?: string }) {
  const tilt = mood === 'encourage' ? 'rotate(-6 60 70)' : undefined;
  return (
    <svg viewBox="0 0 120 140" className={className} role="img" aria-label="Cô giáo" data-testid="nq-teacher" data-mood={mood} data-talking={talking}>
      <g transform={tilt} className="transition-transform duration-300">
        {/* Tóc phía sau + búi tóc */}
        <circle cx="60" cy="22" r="13" fill="#5b3a29" />
        <path d="M22 62 C20 28 100 28 98 62 L100 96 C88 104 32 104 20 96 Z" fill="#6b4430" />
        {/* Áo dài */}
        <path d="M30 140 C32 112 46 104 60 104 C74 104 88 112 90 140 Z" fill="#ec4899" />
        <path d="M52 104 L60 118 L68 104 Z" fill="#fbcfe8" />
        {/* Cổ + mặt */}
        <rect x="53" y="90" width="14" height="16" rx="6" fill="#f6c9a4" />
        <ellipse cx="60" cy="64" rx="30" ry="32" fill="#fcd9b8" />
        {/* Mái tóc */}
        <path d="M30 56 C32 34 52 28 66 32 C80 34 90 44 90 58 C80 46 66 44 56 46 C46 48 38 52 30 56 Z" fill="#6b4430" />
        {/* Kính tròn */}
        <g fill="none" stroke="#7c3aed" strokeWidth="2">
          <circle cx="47" cy="64" r="9" />
          <circle cx="73" cy="64" r="9" />
          <path d="M56 64 H64" />
        </g>
        {/* Mắt */}
        {mood === 'happy' ? (
          <g fill="none" stroke="#3b2418" strokeWidth="2.5" strokeLinecap="round">
            <path d="M42 66 Q47 60 52 66" />
            <path d="M68 66 Q73 60 78 66" />
          </g>
        ) : (
          <g fill="#3b2418">
            <circle cx="47" cy="65" r="3.2">
              <animate attributeName="ry" values="3.2;3.2;0.4;3.2" keyTimes="0;0.92;0.96;1" dur="4s" repeatCount="indefinite" />
            </circle>
            <circle cx="73" cy="65" r="3.2" />
          </g>
        )}
        {/* Lông mày */}
        <g stroke="#5b3a29" strokeWidth="2" strokeLinecap="round" fill="none">
          {mood === 'encourage' ? (
            <>
              <path d="M40 51 Q47 47 53 51" />
              <path d="M67 51 Q73 47 80 51" />
            </>
          ) : (
            <>
              <path d="M40 52 Q47 49 53 52" />
              <path d="M67 52 Q73 49 80 52" />
            </>
          )}
        </g>
        {/* Má hồng */}
        <g fill="#f9a8d4" opacity={mood === 'happy' ? 0.9 : 0.5}>
          <ellipse cx="40" cy="78" rx="5" ry="3" />
          <ellipse cx="80" cy="78" rx="5" ry="3" />
        </g>
        {/* Miệng */}
        {talking ? (
          <ellipse cx="60" cy="82" rx="6" ry="4" fill="#be123c">
            <animate attributeName="ry" values="4;1.5;4" dur="0.35s" repeatCount="indefinite" />
          </ellipse>
        ) : mood === 'happy' ? (
          <path d="M48 79 Q60 94 72 79 Z" fill="#be123c" />
        ) : (
          <path d="M51 81 Q60 88 69 81" fill="none" stroke="#be123c" strokeWidth="2.5" strokeLinecap="round" />
        )}
      </g>
      {/* Nốt nhạc lấp lánh khi khen */}
      {mood === 'happy' && (
        <g fill="#f59e0b" className="animate-pulse">
          <text x="4" y="30" fontSize="20">♪</text>
          <text x="100" y="26" fontSize="18">★</text>
        </g>
      )}
    </svg>
  );
}
