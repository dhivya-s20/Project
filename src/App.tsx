import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { BookOpenCheck, GraduationCap } from "lucide-react";
import { supabase } from "./supabaseClient";
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import UploadPage from "./pages/UploadPage";
import "./Auth.css";

type AuthMode = "signin" | "signup";
type AppPage = AuthMode | "forgot-password" | "reset-password" | "upload";

function pageFromPath(pathname: string): AppPage {
  if (pathname === "/signup") return "signup";
  if (pathname === "/forgot-password") return "forgot-password";
  if (pathname === "/reset-password") return "reset-password";
  if (pathname === "/upload") return "upload";
  return "signin";
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [page, setPage] = useState<AppPage>(() => pageFromPath(window.location.pathname));
  const [authNotice, setAuthNotice] = useState("");
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const rejectedGoogleUser = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let handledGoogleSignup = false;
    const setAuthSession = (nextSession: Session | null) => {
      if (!mounted) return;
      if (nextSession && rejectedGoogleUser.current === nextSession.user.id) return;
      const googleSignupStarted = sessionStorage.getItem("edutrio_google_signup_started");
      if (nextSession && googleSignupStarted && !handledGoogleSignup) {
        handledGoogleSignup = true;
        sessionStorage.removeItem("edutrio_google_signup_started");
        const startedAt = Number(googleSignupStarted);
        const createdAt = Date.parse(nextSession.user.created_at);
        if (Number.isFinite(startedAt) && Number.isFinite(createdAt) && createdAt < startedAt - 10_000) {
          rejectedGoogleUser.current = nextSession.user.id;
          setPage("signup");
          setAuthNotice("A EduTrio account already exists for this Google address. Sign in with the existing account instead.");
          window.history.replaceState({}, "", "/signup");
          void supabase.auth.signOut().finally(() => {
            rejectedGoogleUser.current = null;
          });
          return;
        }
      }
      if (!nextSession) rejectedGoogleUser.current = null;
      setSession(nextSession);
    };

    void supabase.auth.getSession().then(({ data }) => {
      setAuthSession(data.session);
    }).catch((error: unknown) => {
      console.error("Unable to check the current session:", error);
    }).finally(() => {
      if (mounted) setCheckingSession(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setAuthSession(nextSession));
    const onPopState = () => setPage(pageFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const navigate = (next: AppPage) => {
    setPage(next);
    setAuthNotice("");
    sessionStorage.removeItem("edutrio_google_signup_started");
    const path = next === "forgot-password" ? "/forgot-password" : next === "reset-password" ? "/reset-password" : next === "upload" ? "/upload" : `/${next}`;
    window.history.pushState({}, "", path);
  };

  const changeMode = (next: AuthMode) => navigate(next);

  const confirmSignOut = async () => {
    setSignOutBusy(true);
    setSignOutError("");
    const { error } = await supabase.auth.signOut();
    if (error) setSignOutError(error.message);
    else setShowSignOutConfirm(false);
    setSignOutBusy(false);
  };

  if (checkingSession) return <main className="auth-loading"><BookOpenCheck size={28}/><span>Preparing your workspace…</span></main>;
  if (page === "reset-password") return <ResetPasswordPage onBack={() => navigate("signin")} onDone={() => navigate("upload")}/>;
  if (session) {
    return <div className="session-shell"><header className="session-bar"><a className="session-brand" href="/upload" aria-label="EduTrio home"><span className="brand-mark"><GraduationCap size={19}/></span>edutrio<span className="brand-dot">.</span></a><span className="session-user">{session.user.email}</span><button onClick={() => { setSignOutError(""); setShowSignOutConfirm(true); }}>Sign out</button></header><UploadPage/>{showSignOutConfirm && <div className="signout-backdrop"><section className="signout-dialog" role="alertdialog" aria-modal="true" aria-labelledby="signout-title" aria-describedby="signout-description"><div className="signout-icon"><GraduationCap size={21}/></div><h2 id="signout-title">Sign out of EduTrio?</h2><p id="signout-description">You’ll need to sign in again to access student document intake.</p>{signOutError && <p className="signout-error" role="alert">{signOutError}</p>}<div className="signout-actions"><button className="signout-cancel" disabled={signOutBusy} onClick={() => setShowSignOutConfirm(false)}>Cancel</button><button className="signout-confirm" disabled={signOutBusy} onClick={() => void confirmSignOut()}>{signOutBusy ? "Signing out…" : "Sign out"}</button></div></section></div>}</div>;
  }

  if (page === "forgot-password") return <ForgotPasswordPage onBack={() => navigate("signin")}/>;
  return page === "signup"
    ? <SignUpPage onModeChange={changeMode} onForgotPassword={() => navigate("forgot-password")} initialError={authNotice}/>
    : <SignInPage onModeChange={changeMode} onForgotPassword={() => navigate("forgot-password")} initialError={authNotice}/>;
}
