import { useEffect, useRef, useState } from "react";

/**
 * Animates a number from 0 to `end` when the element scrolls into view.
 * Uses requestAnimationFrame for smooth animation with an ease-out curve.
 */
export default function AnimatedCounter({ end, duration = 1500, prefix = "", suffix = "" }) {
  const [display, setDisplay] = useState("0");
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const format = (n) => {
      if (n >= 1000) return `${Math.round(n / 1000).toLocaleString("en-IN")}k`;
      return n.toLocaleString("en-IN");
    };

    // Gracefully degrade when IntersectionObserver is unavailable (SSR, old browsers, tests)
    if (typeof IntersectionObserver === "undefined") {
      setDisplay(format(end));
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const t0 = performance.now();
          const step = (now) => {
            const progress = Math.min((now - t0) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(format(Math.round(eased * end)));
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [end, duration]);

  return (
    <span ref={ref} className="animated-counter">
      {prefix}{display}{suffix}
    </span>
  );
}
