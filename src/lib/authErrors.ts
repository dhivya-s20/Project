export function readableAuthError(error: unknown, provider: "email" | "google") {
  const raw = error instanceof Error ? error.message : "Something went wrong. Please try again.";
  const normalized = raw.toLowerCase();
  if (normalized.includes("user already registered") || normalized.includes("already exists")) {
    return "An account with this email already exists. Sign in with that account instead.";
  }
  if (normalized.includes("provider is not enabled") || normalized.includes("unsupported provider")) {
    return "Google sign-in isn’t enabled for this Supabase project yet. Enable Google under Authentication → Sign In / Providers, then try again.";
  }
  if (normalized.includes("email rate limit") || normalized.includes("over_email_send_rate_limit") || normalized.includes("too many requests")) {
    return "We couldn’t send an email just now. Please wait a while before trying again. If you already have an account, try signing in.";
  }
  if (normalized.includes("error sending confirmation email") || normalized.includes("error sending recovery email") || normalized.includes("error sending email")) {
    return "We couldn’t send the email. Check the Supabase Auth SMTP settings and sender address. If this was sign-up, check Authentication → Users before trying again.";
  }
  if (normalized.includes("email address not authorized")) {
    return "Supabase’s test email service only sends to project team members. Configure custom SMTP to send to other addresses.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Confirm your email address using the link we sent before signing in. Check your inbox and spam folder.";
  }
  if (provider === "email" && (normalized.includes("invalid login credentials") || normalized.includes("invalid_credentials"))) {
    return "We couldn’t sign you in. Check your email and password. If you haven’t created an account yet, create one first.";
  }
  if (error instanceof TypeError) return "Could not connect to Supabase. Check the project API URL and your connection.";
  if (provider === "google" && normalized.includes("redirect")) {
    return "This return address isn’t allowed yet. Add this app URL to Supabase Authentication → URL Configuration → Redirect URLs.";
  }
  return raw;
}
