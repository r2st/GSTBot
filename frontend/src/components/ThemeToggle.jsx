import { useTheme } from "../hooks/useTheme";

const MODES = ["system", "light", "dark"];
const LABELS = { system: "Auto", light: "Light", dark: "Dark" };

const ICONS = {
  system: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 14h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  light: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.75 3.75l1.06 1.06M11.19 11.19l1.06 1.06M12.25 3.75l-1.06 1.06M4.81 11.19l-1.06 1.06" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  dark: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M13.36 10.06A5.5 5.5 0 015.94 2.64a6.5 6.5 0 107.42 7.42z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  ),
};

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  function cycle() {
    const i = MODES.indexOf(theme);
    setTheme(MODES[(i + 1) % MODES.length]);
  }

  return (
    <button
      type="button"
      className="btn btn-ghost theme-toggle"
      onClick={cycle}
      aria-label={`Theme: ${LABELS[theme]}. Click to change.`}
      title={`Theme: ${LABELS[theme]}`}
    >
      {ICONS[theme]}
    </button>
  );
}
