/**
 * A progress bar that reports itself.
 *
 * The plan-usage meter was a pair of divs with a width percentage: the one
 * piece of information on the dashboard available only to people who can see
 * it. role="progressbar" plus the value attributes puts the same reading in the
 * accessibility tree.
 *
 * aria-valuenow is clamped to the range because the spec requires it to sit
 * between min and max, and usage genuinely can exceed the limit — the plan
 * check runs at upload time, so an account switched to a smaller plan is over
 * it immediately. aria-valuetext carries the honest numbers, and is also what
 * gets announced, so nothing is lost by clamping.
 */
export default function Meter({ value, max, label }) {
  const ceiling = Number(max) > 0 ? Number(max) : 0;
  const used = Number.isFinite(Number(value)) ? Number(value) : 0;
  const ratio = ceiling ? used / ceiling : 0;
  const over = ratio > 1;

  return (
    <div
      className="meter"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={ceiling}
      aria-valuenow={Math.min(Math.max(used, 0), ceiling)}
      aria-valuetext={`${used} of ${ceiling}`}
    >
      <div
        className={over ? "meter-fill is-over" : "meter-fill"}
        style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }}
      />
    </div>
  );
}
