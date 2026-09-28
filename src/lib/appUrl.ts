/**
 * Use the active app origin so authentication always returns to the exact
 * deployment URL the user opened (including preview deployments/custom domains).
 */
export function getAppUrl(path = "") {
  const url = new URL(window.location.origin);

  const isLocalHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (import.meta.env.PROD && isLocalHost) {
    throw new Error("Authentication callbacks require the deployed HTTPS site URL.");
  }
  if (url.protocol !== "https:" && !isLocalHost) {
    throw new Error("VITE_APP_URL must use HTTPS outside local development.");
  }

  return new URL(path.replace(/^\/+/, ""), `${url.origin}/`).toString();
}
