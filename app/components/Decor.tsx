// Shared visual primitives: the Campus Macros logo mark and decorative
// backdrops. Purely presentational — every element here is aria-hidden and
// pointer-events-none so decoration never intercepts clicks or screen readers.

// Leaf-bolt mark in a deep-forest gradient tile.
export function LogoMark({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <span
      className={`${className} rounded-xl bg-gradient-to-br from-brand-600 to-emerald-800 flex items-center justify-center shadow-md shadow-brand-700/30 flex-shrink-0`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" className="w-[62%] h-[62%]">
        {/* Leaf */}
        <path
          d="M12 21c5.5-1.5 8.5-5.5 8.5-11.5V4.5c-6 0-10.5 2-12.5 6.5-1.2 2.7-.8 6 .9 8.2"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Stem vein */}
        <path
          d="M6.5 20.5C8.5 15 12 10.5 17.5 7.5"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity="0.8"
        />
      </svg>
    </span>
  );
}

// Soft floating green washes for light page backgrounds. Place inside a
// `relative overflow-hidden` container, content above with `relative z-10`.
export function GlowBackdrop({ variant = "default" }: { variant?: "default" | "subtle" }) {
  const opacity = variant === "subtle" ? "opacity-60" : "";
  return (
    <div className={`absolute inset-0 pointer-events-none ${opacity}`} aria-hidden="true">
      <div className="absolute -top-32 -right-24 w-[30rem] h-[30rem] rounded-full bg-brand-500/15 blur-3xl" />
      <div className="absolute top-1/3 -left-32 w-[26rem] h-[26rem] rounded-full bg-emerald-400/15 blur-3xl" />
      <div className="absolute -bottom-40 right-1/4 w-[28rem] h-[28rem] rounded-full bg-lime-400/15 blur-3xl" />
    </div>
  );
}

// Floating food accents for the marketing hero — bright chips that drift
// gently. Hidden on small screens so they never crowd the copy.
const HERO_FOODS: Array<{ emoji: string; className: string }> = [
  { emoji: "🥦", className: "top-24 left-[6%] animate-float" },
  { emoji: "🍳", className: "top-52 right-[6%] animate-float-slow" },
  { emoji: "🥑", className: "bottom-24 left-[10%] animate-float-slow" },
  { emoji: "🍓", className: "top-14 right-[24%] animate-float" },
  { emoji: "🍗", className: "bottom-40 right-[14%] animate-float" },
  { emoji: "🥕", className: "top-1/2 left-[16%] animate-float" },
];

export function FloatingFood() {
  return (
    <div className="absolute inset-0 pointer-events-none hidden lg:block" aria-hidden="true">
      {HERO_FOODS.map((f) => (
        <span
          key={f.emoji}
          className={`absolute ${f.className} w-16 h-16 rounded-2xl bg-white border border-brand-900/10 flex items-center justify-center text-3xl shadow-xl shadow-brand-900/10`}
        >
          {f.emoji}
        </span>
      ))}
    </div>
  );
}

// Subtle repeating leaf line — a quiet organic texture for deep-forest panels.
export function LeafPattern({ className = "opacity-[0.06]" }: { className?: string }) {
  return (
    <svg
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      aria-hidden="true"
    >
      <defs>
        <pattern id="leafpat" width="56" height="56" patternUnits="userSpaceOnUse">
          <path
            d="M28 44c10-3 15-10 15-21V16c-11 0-19 4-22 12-2 5-1 11 2 15"
            stroke="white"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#leafpat)" />
    </svg>
  );
}
