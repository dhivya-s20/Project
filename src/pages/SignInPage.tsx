import AuthPage from "./AuthPage";

export default function SignInPage({ onModeChange, onForgotPassword, initialError }: { onModeChange: (mode: "signin" | "signup") => void; onForgotPassword: () => void; initialError?: string }) {
  return <AuthPage mode="signin" onModeChange={onModeChange} onForgotPassword={onForgotPassword} initialError={initialError}/>;
}
