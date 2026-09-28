import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, GraduationCap, LockKeyhole, Mail, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { supabase } from "../supabaseClient";
import { getAppUrl } from "../lib/appUrl";
import { readableAuthError } from "../lib/authErrors";

export type AuthMode = "signin" | "signup";

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" width="17" height="17"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.9 6-15Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.1c-1.8 1.2-4.1 1.9-6.8 1.9-5.2 0-9.6-3.5-11.2-8.2H5.9V33A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.8 27.7a12 12 0 0 1 0-7.4v-5.2H5.9a20 20 0 0 0 0 17.8l6.9-5.2Z"/><path fill="#EA4335" d="M24 12.1c3 0 5.7 1 7.8 3.1l5.8-5.8A19.4 19.4 0 0 0 24 4 20 20 0 0 0 5.9 15.1l6.9 5.2c1.6-4.7 6-8.2 11.2-8.2Z"/></svg>;
}

const passwordPattern = "(?=.*[A-Za-z])(?=.*[0-9])(?=.*[^A-Za-z0-9\\s]).{6,}";

export default function AuthPage({ mode, onModeChange, onForgotPassword, initialError = "" }: { mode: AuthMode; onModeChange: (mode: AuthMode) => void; onForgotPassword: () => void; initialError?: string }) {
  const isSignup = mode === "signup";
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmationRequested, setConfirmationRequested] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(initialError);
  const [showCreateAccountAction, setShowCreateAccountAction] = useState(false);
  const googleSignInStarted = useRef(false);
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9\s]/.test(password);
  const hasMinimumLength = password.length >= 6;

  const changeMode = (next: AuthMode) => {
    setMessage(""); setError(""); setPassword(""); setShowCreateAccountAction(false);
    onModeChange(next);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    sessionStorage.removeItem("edutrio_google_signup_started");
    if (isSignup && !fullName.trim()) {
      setError("Enter your name to create an account.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (isSignup && !new RegExp(passwordPattern).test(password)) {
      setError("Use at least 6 characters, including a letter, a number, and a special character.");
      return;
    }
    if (!isSignup && !password) {
      setError("Enter your password to sign in.");
      return;
    }
    setBusy(true); setError(""); setMessage(""); setShowCreateAccountAction(false);
    try {
      if (isSignup) {
        const { data, error: authError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
        if (authError) throw authError;
        if (!data.user?.identities?.length) {
          setError("An account with this email already exists. Sign in with that account instead.");
        } else if (!data.session) {
          setConfirmationRequested(true);
          setMessage("Your account request was received. Check your inbox for the confirmation email before signing in.");
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
      }
    } catch (authError) {
      setError(readableAuthError(authError, "email"));
      const errorCode = typeof authError === "object" && authError !== null && "code" in authError
        ? String(authError.code)
        : "";
      const errorMessage = authError instanceof Error ? authError.message.toLowerCase() : "";
      setShowCreateAccountAction(!isSignup && (errorCode === "invalid_credentials" || errorMessage.includes("invalid login credentials")));
    } finally { setBusy(false); }
  };

  const continueWithGoogle = async () => {
    if (googleSignInStarted.current) return;
    googleSignInStarted.current = true;
    setBusy(true); setError(""); setMessage("");
    try {
      if (isSignup) sessionStorage.setItem("edutrio_google_signup_started", String(Date.now()));
      else sessionStorage.removeItem("edutrio_google_signup_started");
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getAppUrl(),
          queryParams: { prompt: "select_account" },
        },
      });
      if (authError) throw authError;
    } catch (authError) {
      googleSignInStarted.current = false;
      sessionStorage.removeItem("edutrio_google_signup_started");
      setError(readableAuthError(authError, "google"));
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell min-h-screen w-full grid lg:grid-cols-[1.04fr_.96fr]">
      <section className="auth-story relative hidden lg:flex flex-col justify-between overflow-hidden p-12 xl:p-16">
        <div className="story-orb story-orb-one"/><div className="story-orb story-orb-two"/>
        <a className="brand-lockup" href="/signin" onClick={(event) => { event.preventDefault(); changeMode("signin"); }}><span className="brand-mark"><GraduationCap size={23}/></span><span>edutrio<span className="brand-dot">.</span></span></a>
        <div className="story-content relative z-10"><div className="eyebrow"><Sparkles size={14}/> EDUCATION, IN SYNC</div><h1>More time for<br/>what <em>matters.</em></h1><p>One thoughtful workspace for your people, processes, and the progress you’re here to make.</p><div className="story-feature"><span><ShieldCheck size={18}/></span><div><strong>Made for education</strong><small>Everything your institution needs, in one place.</small></div></div></div>
        <div className="story-foot"><span>Trusted by teams building brighter futures</span><div className="avatar-stack"><i>AK</i><i>SR</i><i>JM</i><b>+</b></div><span>and 2,400+ educators</span></div>
      </section>
      <section className="auth-main flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="auth-card w-full max-w-[420px]">
          <a className="brand-lockup mobile-brand lg:hidden" href="/signin" onClick={(event) => { event.preventDefault(); changeMode("signin"); }}><span className="brand-mark"><GraduationCap size={22}/></span><span>edutrio<span className="brand-dot">.</span></span></a>
          <div className="auth-heading"><div className="auth-kicker">{isSignup ? "GET STARTED" : "WELCOME BACK"}</div><h2>{isSignup ? "Create your account" : "Sign in to your workspace"}</h2><p>{isSignup ? "Bring your whole institution together." : "Your school’s day, all in one place."}</p></div>
          <div className="auth-tabs" role="tablist" aria-label="Account access"><button className={!isSignup ? "active" : ""} role="tab" aria-selected={!isSignup} onClick={() => changeMode("signin")}>Sign in</button><button className={isSignup ? "active" : ""} role="tab" aria-selected={isSignup} onClick={() => changeMode("signup")}>Create account</button></div>
          <form className="auth-form" noValidate onSubmit={submit}>
            {isSignup && <label className="field-label">Full name<div className="input-wrap"><UserRound size={17}/><input autoComplete="name" required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Alex Morgan"/></div></label>}
            <label className="field-label">Work email<div className="input-wrap"><Mail size={17}/><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@school.edu"/></div></label>
            <label className="field-label">Password<div className="input-wrap"><LockKeyhole size={17}/><input type={showPassword ? "text" : "password"} autoComplete={isSignup ? "new-password" : "current-password"} required minLength={isSignup ? 6 : undefined} pattern={isSignup ? passwordPattern : undefined} title={isSignup ? "Use at least 6 characters, including a letter, a number, and a special character." : undefined} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isSignup ? "Create a strong password" : "Enter your password"}/><button className="password-toggle" type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label>
            {isSignup && <div className="password-guidance" aria-live="polite"><span className={hasMinimumLength ? "met" : ""}>6+ characters</span><span className={hasLetter && hasNumber ? "met" : ""}>A letter and a number</span><span className={hasSpecial ? "met" : ""}>A special character</span></div>}
            {!isSignup && <div className="forgot-row"><span>Having trouble signing in?</span><button type="button" onClick={onForgotPassword}>Forgot password?</button></div>}
            {error && <div className="auth-alert error" role="alert"><p>{error}</p>{showCreateAccountAction && <button className="auth-alert-action" type="button" onClick={() => changeMode("signup")}>Create an account <ArrowRight size={14}/></button>}</div>}{message && <p className="auth-alert success" role="status">{message}</p>}
            <button className="submit-button" type="submit" disabled={busy || confirmationRequested}>{busy ? (isSignup ? "Creating account…" : "Signing in…") : confirmationRequested ? "Confirmation email requested" : (isSignup ? "Create your account" : "Sign in securely")} {!busy && !confirmationRequested && <ArrowRight size={17}/>}</button>
          </form>
          <div className="auth-divider"><span>OR CONTINUE WITH</span></div>
          <button className="google-button" type="button" onClick={() => void continueWithGoogle()} disabled={busy}><GoogleMark/> Continue with Google</button>
          <div className="auth-legal">By continuing, you agree to our <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</div>
          <div className="auth-bottom"><span>{isSignup ? "Already part of EduTrio?" : "New to EduTrio?"}</span> <button onClick={() => changeMode(isSignup ? "signin" : "signup")}>{isSignup ? "Sign in" : "Create an account"}</button></div>
          <div className="secure-note"><span className="secure-dot"/> Your data is encrypted and always private</div>
        </div>
      </section>
    </main>
  );
}
