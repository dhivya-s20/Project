import PasswordRecoveryPage from "./PasswordRecoveryPage";

export default function ResetPasswordPage({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  return <PasswordRecoveryPage mode="reset" onBack={onBack} onDone={onDone}/>;
}
