/**
 * A horizontally scrolling wrapper for a table that a keyboard can reach.
 *
 * The findings table is seven columns wide and overflows its panel on anything
 * narrower than a laptop. `overflow-x: auto` alone makes that scrollable with a
 * trackpad and unreachable without one: there is nothing focusable inside the
 * overflow, so tabbing through the page skips straight past the hidden columns
 * and no amount of arrow-keying will bring them into view. That is WCAG 2.1.1 —
 * the content exists and cannot be operated from a keyboard.
 *
 * `tabIndex={0}` gives the container a tab stop, at which point the arrow keys
 * scroll it. The tab stop needs a name and a role to be worth landing on, hence
 * role="region" and the required label; a focus stop that announces nothing is
 * its own small failure.
 *
 * The stop exists at every width, not just where the table actually overflows.
 * Measuring would mean a ResizeObserver per table to save desktop users one
 * press of Tab, and a region that appears and disappears from the tab order as
 * the window resizes is worse than one that is always there.
 */
export default function TableScroll({ label, children }) {
  return (
    <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}
