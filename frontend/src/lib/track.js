export function track(event, data) {
  if (typeof window !== "undefined" && typeof window.umami !== "undefined") {
    window.umami.track(event, data);
  }
}
