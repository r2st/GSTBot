import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { getDailyCount, getDailyRating, getRatingCount, TOOL_MAP } from "../lib/doaideViral";

const bar = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "1.5rem",
  padding: "0.5rem 1rem",
  fontSize: "0.8rem",
  color: "var(--text-muted, #888)",
  flexWrap: "wrap",
};

const stars = {
  color: "#F0B429",
  letterSpacing: "1px",
};

export default function SocialProofBar() {
  const { pathname } = useLocation();
  const toolName = TOOL_MAP[pathname];

  const data = useMemo(() => {
    if (!toolName) return null;
    return {
      count: getDailyCount(toolName),
      rating: getDailyRating(toolName),
      ratingCount: getRatingCount(toolName),
    };
  }, [toolName]);

  if (!data) return null;

  const fullStars = Math.floor(Number(data.rating));
  const starStr = "★".repeat(fullStars) + (Number(data.rating) % 1 >= 0.5 ? "½" : "");

  return (
    <div style={bar}>
      <span>{data.count.toLocaleString()} people used this today</span>
      <span style={stars}>{starStr} {data.rating}/5 from {data.ratingCount.toLocaleString()} users</span>
    </div>
  );
}
