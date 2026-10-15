import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { authFetch } from "./api";
import "./Auth.css";

const ROLE_CONFIGS = {
  user: {
    id: "user",
    title: "Applicant Portal",
    tabLabel: "Applicant",
    label: "Email Address",
    type: "email",
    placeholder: "name@company.com",
    endpoint: "/auth/user/login",
    destination: "/user-panel",
    hasSignup: true,
  },
  admin: {
    id: "admin",
    title: "Organization Admin Portal",
    tabLabel: "Organization admin",
    label: "Admin Login ID or Email",
    type: "text",
    placeholder: "e.g. ADM-B44FDBAF9FAF or admin@company.com",
    endpoint: "/auth/admin/login",
    destination: "/admin-panel",
    hasSignup: false,
  },
  super_admin: {
    id: "super_admin",
    title: "Global Governance Console",
    tabLabel: "Root administrator",
    label: "Root Admin ID or Email",
    type: "text",
    placeholder: "e.g. Shadow or shadow@super-admin.local",
    endpoint: "/auth/super/login",
    destination: "/super-admin-panel",
    hasSignup: false,
  },
};

export default function Login({ role: initialRole = "user" }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const selectedRole = location.pathname.includes("/super-admin")
    ? "super_admin"
    : location.pathname.includes("/admin")
      ? "admin"
      : initialRole || "user";

  // Check if session already active -> auto-route to dashboard
  useEffect(() => {
    let isMounted = true;
    const checkActiveSession = async () => {
      try {
        const response = await authFetch("/auth/me", {
          method: "GET",
        });
        if (response.ok && isMounted) {
          const data = await response.json();
          const kind = data.user?.kind;
          const isSuperAdminRoute = location.pathname.includes("/super-admin");
          const isAdminRoute = location.pathname.includes("/admin") && !isSuperAdminRoute;

          if (isSuperAdminRoute) {
            if (kind === "super_admin") {
              navigate("/super-admin-panel", { replace: true });
              return;
            }
          } else if (isAdminRoute) {
            if (kind === "organization_admin" || kind === "super_admin") {
              navigate("/admin-panel", { replace: true });
              return;
            }
          } else {
            if (kind === "super_admin") {
              navigate("/super-admin-panel", { replace: true });
              return;
            } else if (kind === "organization_admin") {
              navigate("/admin-panel", { replace: true });
              return;
            } else if (kind === "user") {
              navigate("/user-panel", { replace: true });
              return;
            }
          }
        }
      } catch {
        // Not authenticated, stay on login page
      } finally {
        if (isMounted) {
          setCheckingSession(false);
        }
      }
    };

    checkActiveSession();
    return () => {
      isMounted = false;
    };
  }, [navigate, location.pathname]);

  const activeConfig = ROLE_CONFIGS[selectedRole] || ROLE_CONFIGS.user;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await authFetch(activeConfig.endpoint, {
        method: "POST",
        body: JSON.stringify({ identifier, password }),
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.detail || "Login failed. Check your credentials and try again.");
        return;
      }
      const data = await response.json();
      if (data.access_token) {
        window.sessionStorage.setItem("fillerAiAccessToken", data.access_token);
      }
      localStorage.setItem("userKind", activeConfig.id);
      navigate(activeConfig.destination);
    } catch {
      setError("Unable to reach the sign-in service. Try again shortly.");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: "center", color: "var(--text-secondary)" }}>
          <div className="loading">Verifying platform credentials...</div>
        </div>
      </div>
    );
  }

  const isSuper = selectedRole === "super_admin";

  return (
    <div className={`auth-container ${isSuper ? "super-admin-theme" : ""}`}>
      <div className={`auth-card ${isSuper ? "super-admin-card" : ""}`}>
        {isSuper ? (
          <div className="super-admin-header">
            <div className="super-admin-badge-row">
              <span className="super-admin-kicker">
                <span className="beacon-pulse" />
                SYSTEM ADMINISTRATION
              </span>
            </div>
            <h1 className="super-admin-title">Global Governance Console</h1>
            <p className="super-admin-desc">
              Secure access for platform administrators
            </p>
          </div>
        ) : (
          <div style={{ textAlign: "center", marginBottom: "20px" }}>

            <h1 style={{ margin: "0 0 6px 0", fontSize: "26px", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#ffffff" }}>
              AI FILLER
            </h1>
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "14px", fontStyle: "italic" }}>
              Complete forms with AI and document assistance.
            </p>
            <h2 style={{ fontSize: "17px", color: "#ffffff", marginTop: "16px", marginBottom: 0, textAlign: "center", fontWeight: 700, letterSpacing: "0.02em" }}>
              {activeConfig.title}
            </h2>
          </div>
        )}

        {error && <div className="error-message" role="alert">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="identifier">{activeConfig.label}</label>
            <input
              id="identifier"
              type={activeConfig.type}
              autoComplete="username"
              placeholder={activeConfig.placeholder}
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              required
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="form-group">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label htmlFor="password">
                {isSuper ? "Administrator password" : "Password"}
              </label>
              <a
                href={`/forgot-password/${activeConfig.id}`}
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  textDecoration: "none",
                }}
              >
                Forgot password?
              </a>
            </div>
            <div className="password-input-wrapper">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className={isSuper ? "btn-super-primary" : "btn-primary"}
            disabled={loading}
            style={{ marginTop: "8px" }}
          >
            {loading
              ? isSuper
                ? "Signing in…"
                : "Signing in…"
              : <><LogIn size={16} aria-hidden="true" /> {isSuper ? "Sign in" : `Sign into ${activeConfig.title}`}</>}
          </button>
        </form>

        {isSuper && (
          <div className="super-admin-security-notice">

            <span>Access is restricted to authorized platform administrators.</span>
          </div>
        )}

        {isSuper ? (
          <p className="super-admin-backlink">
            <a href="/login">← Return to the sign-in page</a>
          </p>
        ) : (
          <>
            {activeConfig.hasSignup && (
              <p className="auth-link">
                Don't have an applicant account? <a href="/signup">Sign up here</a>
              </p>
            )}

            {selectedRole === "admin" && (
              <p className="auth-link" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Organization Admin IDs (e.g. <code>ADM-XXXXXX</code>) are generated by your Super Admin.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
