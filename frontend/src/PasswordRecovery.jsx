import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, KeyRound, Send } from "lucide-react";
import { apiUrl } from "./api";
import "./Auth.css";

const RECOVERY_ROLES = {
  user: { label: "email address", requestPath: "/auth/user/password-reset/request", confirmPath: "/auth/user/password-reset/confirm", loginPath: "/login" },
  admin: { label: "admin ID", requestPath: "/auth/admin/password-reset/request", confirmPath: "/auth/admin/password-reset/confirm", loginPath: "/admin/login" },
  super_admin: { label: "super-admin ID", requestPath: "/auth/super/password-reset/request", confirmPath: "/auth/super/password-reset/confirm", loginPath: "/super-admin/login" },
};

export function ForgotPassword() {
  const { role } = useParams();
  const settings = RECOVERY_ROLES[role];
  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(apiUrl(settings.requestPath), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Recovery is unavailable.");
      setMessage(data.message);
    } catch (err) {
      setError(err.message || "Unable to reach the recovery service.");
    } finally {
      setLoading(false);
    }
  };

  if (!settings) return <div className="auth-container"><div className="auth-card"><h1>Recovery page not found</h1></div></div>;
  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Forgot password?</h1>
        <p>Enter your {settings.label}. If the account can be recovered, instructions will be sent to its registered recovery address.</p>
        {error && <div className="error-message" role="alert">{error}</div>}
        {message && <p role="status">{message}</p>}
        <form onSubmit={submit} className="auth-form">
          <div className="form-group">
            <label htmlFor="identifier">{settings.label[0].toUpperCase() + settings.label.slice(1)}</label>
            <input id="identifier" type={role === "user" ? "email" : "text"} autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required disabled={loading} />
          </div>
          <button className="btn-primary" type="submit" disabled={loading}>{loading ? "Sending…" : <><Send size={16} aria-hidden="true" /> Send reset instructions</>}</button>
        </form>
        <p className="auth-link"><Link to={settings.loginPath}><ArrowLeft size={15} aria-hidden="true" /> Back to sign in</Link></p>
      </div>
    </div>
  );
}

export function ResetPassword() {
  const { role } = useParams();
  const [searchParams] = useSearchParams();
  const settings = RECOVERY_ROLES[role];
  const [token] = useState(() => searchParams.get("token") || "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) window.history.replaceState(null, "", window.location.pathname);
  }, [token]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(apiUrl(settings.confirmPath), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Reset link is invalid or expired.");
      setMessage(data.message);
    } catch (err) {
      setError(err.message || "Unable to reach the recovery service.");
    } finally {
      setLoading(false);
    }
  };

  if (!settings) return <div className="auth-container"><div className="auth-card"><h1>Reset page not found</h1></div></div>;
  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Choose a new password</h1>
        {error && <div className="error-message" role="alert">{error}</div>}
        {message && <p role="status">{message} <Link to={settings.loginPath}>Sign in</Link></p>}
        {!message && <form onSubmit={submit} className="auth-form">
          <div className="form-group">
            <label htmlFor="new-password">New password</label>
            <input id="new-password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required disabled={loading} />
          </div>
          <div className="form-group">
            <label htmlFor="confirm-password">Confirm new password</label>
            <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required disabled={loading} />
          </div>
          <button className="btn-primary" type="submit" disabled={loading}>{loading ? "Updating…" : <><KeyRound size={16} aria-hidden="true" /> Update password</>}</button>
        </form>}
      </div>
    </div>
  );
}
