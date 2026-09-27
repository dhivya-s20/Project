/**
 * The canonical public URL for auth callbacks. Set VITE_APP_URL on the
 * deployment host so OAuth and password recovery always return to the app.
 */
export function getAppUrl(path = "") {
  const configuredUrl = import.meta.env.VITE_APP_URL?.trim();
  const origin = configuredUrl || window.location.origin;
  const url = new URL(origin);

  const isLocalHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (import.meta.env.PROD && isLocalHost) {
    throw new Error("Set VITE_APP_URL to your deployed HTTPS site URL in the hosting environment.");
  }
  if (url.protocol !== "https:" && !isLocalHost) {
    throw new Error("VITE_APP_URL must use HTTPS outside local development.");
  }

  return new URL(path.replace(/^\/+/, ""), `${url.origin}/`).toString();
}
