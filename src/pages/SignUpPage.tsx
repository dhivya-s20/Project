import AuthPage from "./AuthPage";

export default function SignUpPage({ onModeChange, onForgotPassword, initialError }: { onModeChange: (mode: "signin" | "signup") => void; onForgotPassword: () => void; initialError?: string }) {
  return <AuthPage mode="signup" onModeChange={onModeChange} onForgotPassword={onForgotPassword} initialError={initialError}/>;
}
