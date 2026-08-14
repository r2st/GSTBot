import { useAuth } from "../hooks/useAuth";

/**
 * Says why the buttons that belong on this screen are not on it.
 *
 * Hiding a control with nothing in its place is the failure mode this exists
 * to avoid: the Upload page without its dropzone is a page that looks broken,
 * and a viewer who does not know they are a viewer files a bug instead of
 * asking their accountant for the access they actually need. So the rule is —
 * where removing the controls leaves a screen that reads as broken or empty,
 * say so; where the page still does its job read-only (a list that simply has
 * no row actions), stay quiet rather than banner every screen in the app.
 *
 * `role="status"` rather than `alert`: nothing has gone wrong, and this is
 * present on first paint rather than in response to anything the user did.
 * An alert would interrupt a screen reader mid-navigation to announce a
 * permission the user has had all along.
 */
export default function ReadOnlyNotice({ children }) {
  const { canWrite, user } = useAuth();
  if (canWrite || !user) return null;
  return (
    <div className="banner banner-neutral" role="status">
      <span>
        {/* Names the role held and who can lift it, for the same reason the
            API's 403 does: the reader cannot change what the screen requires
            and can ask someone who holds more. */}
        Your role on {user.business?.legal_name ?? "this business"} is
        <strong> viewer</strong>, which is read-only.{" "}
        {children ?? "Ask an owner or an accountant to make changes."}
      </span>
    </div>
  );
}
