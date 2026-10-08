import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackToolVisit, TOOL_MAP } from "../lib/doaideViral";

export default function ToolTracker() {
  const { pathname } = useLocation();

  useEffect(() => {
    const name = TOOL_MAP[pathname];
    if (name) trackToolVisit(name, pathname);
  }, [pathname]);

  return null;
}
