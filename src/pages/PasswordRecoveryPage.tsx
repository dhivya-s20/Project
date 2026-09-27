import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, GraduationCap, KeyRound, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { supabase } from "../supabaseClient";
import { getAppUrl } from "../lib/appUrl";
import { readableAuthError } from "./AuthPage";

type RecoveryMode = "request" | "reset";
const passwordPattern = "(?=.*[A-Za-z])(?=.*[0-9])(?=.*[^A-Za-z0-9\\s]).{6,}";

export default function PasswordRecoveryPage({ mode, onBack, onDone }: { mode: RecoveryMode; onBack: () => void; onDone: () => void }) {
  const isReset = mode === "reset";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!isReset) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError("Enter a valid email address.");
        return;
      }
    } else {
      if (!new RegExp(passwordPattern).test(password)) {
        setError("Use at least 6 characters, including a letter, a number, and a special character.");
        return;
      }
      if (password !== confirmPassword) {
        setError("The passwords don’t match. Check both fields and try again.");
        return;
      }
    }

    setBusy(true);
    try {
      if (isReset) {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setComplete(true);
      } else {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: getAppUrl("/reset-password"),
        });
        if (resetError) throw resetError;
        setComplete(true);
      }
    } catch (requestError) {
      const readableError = readableAuthError(requestError, "email");
      setError(isReset && readableError.toLowerCase().includes("session")
        ? "This password reset link is invalid or has expired. Request a new link and open the latest email."
        : readableError);
    } finally {
      setBusy(false);
    }
  };

  const title = isReset ? "Choose a new password" : "Reset your password";
  const description = isReset
    ? "Create a new password for your EduTrio account."
    : "Enter your account email and we’ll send you a secure reset link.";

  return (
    <main className="recovery-shell">
      <section className="recovery-card">
        <a className="brand-lockup recovery-brand" href="/signin" onClick={(event) => { event.preventDefault(); onBack(); }}><span className="brand-mark"><GraduationCap size={22}/></span><span>edutrio<span className="brand-dot">.</span></span></a>
        <div className="recovery-icon">{isReset ? <KeyRound size={22}/> : <Mail size={22}/>}</div>
        <div className="auth-heading recovery-heading"><h2>{complete ? (isReset ? "Password updated" : "Check your inbox") : title}</h2><p>{complete ? (isReset ? "Your new password is ready to use." : "If an account exists for this email, a reset link is on its way.") : description}</p></div>

        {complete ? (
          <div className="recovery-complete"><div className="recovery-success-mark"><Check size={20}/></div><button className="submit-button" onClick={isReset ? onDone : onBack}>{isReset ? "Continue to your workspace" : "Back to sign in"}<ArrowRight size={17}/></button></div>
        ) : (
          <form className="auth-form recovery-form" noValidate onSubmit={submit}>
            {!isReset ? (
              <label className="field-label">Account email<div className="input-wrap"><Mail size={17}/><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@school.edu"/></div></label>
            ) : (
              <>
                <label className="field-label">New password<div className="input-wrap"><LockKeyhole size={17}/><input type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Create a strong password"/></div></label>
                <label className="field-label">Confirm new password<div className="input-wrap"><LockKeyhole size={17}/><input type="password" autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter it again"/></div></label>
                <p className="recovery-hint">At least 6 characters, including a letter, a number, and a special character.</p>
              </>
            )}
            {error && <p className="auth-alert error" role="alert">{error}</p>}
            <button className="submit-button" type="submit" disabled={busy}>{busy ? <><LoaderCircle className="recovery-spinner" size={16}/> {isReset ? "Updating password…" : "Sending reset link…"}</> : <>{isReset ? "Save new password" : "Send reset link"}<ArrowRight size={17}/></>}</button>
          </form>
        )}
        {!complete && <button className="recovery-back" onClick={onBack}><ArrowLeft size={15}/> Back to sign in</button>}
        <div className="secure-note"><span className="secure-dot"/> Your account stays protected</div>
      </section>
    </main>
  );
}
