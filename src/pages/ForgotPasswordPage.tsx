import PasswordRecoveryPage from "./PasswordRecoveryPage";

export default function ForgotPasswordPage({ onBack }: { onBack: () => void }) {
  return <PasswordRecoveryPage mode="request" onBack={onBack} onDone={onBack}/>;
}
