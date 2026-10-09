import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiUrl, authFetch } from "./api";
import "./Auth.css";

const ROLE_CONFIGS = {
  user: {
    id: "user",
    title: "Applicant Portal",
    tabLabel: "👤 Applicant",
    label: "Email Address",
    type: "email",
    placeholder: "name@company.com",
    endpoint: "/auth/user/login",
    destination: "/voice",
    hasSignup: true,
  },
  admin: {
    id: "admin",
    title: "Organization Admin Portal",
    tabLabel: "🏢 Org Admin",
    label: "Admin Login ID",
    type: "text",
    placeholder: "ADM-XXXXXX",
    endpoint: "/auth/admin/login",
    destination: "/admin-panel",
    hasSignup: false,
  },
  super_admin: {
    id: "super_admin",
    title: "Super Admin Console",
    tabLabel: "🛡️ Super User",
    label: "Super Admin ID",
    type: "text",
    placeholder: "superadmin",
    endpoint: "/auth/super/login",
    destination: "/super-admin-panel",
    hasSignup: false,
  },
};

export default function Login({ role: initialRole = "user" }) {
  const [selectedRole, setSelectedRole] = useState(initialRole);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  // If path is /admin/login or /super-admin/login, sync selectedRole
  useEffect(() => {
    if (location.pathname.includes("/super-admin")) {
      setSelectedRole("super_admin");
    } else if (location.pathname.includes("/admin")) {
      setSelectedRole("admin");
    } else {
      setSelectedRole(initialRole || "user");
    }
  }, [location.pathname, initialRole]);

  // Check if session already active -> auto-route to dashboard
  useEffect(() => {
    const checkActiveSession = async () => {
      try {
        const response = await fetch(apiUrl("/auth/me"), {
          method: "GET",
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          const kind = data.user?.kind;
          if (kind === "super_admin") {
            navigate("/super-admin-panel");
          } else if (kind === "organization_admin") {
            navigate("/admin-panel");
          } else if (kind === "user") {
            navigate("/voice");
          }
        }
      } catch {
        // Not authenticated, stay on login page
      } finally {
        setCheckingSession(false);
      }
    };

    checkActiveSession();
  }, [navigate]);

  const activeConfig = ROLE_CONFIGS[selectedRole] || ROLE_CONFIGS.user;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch(apiUrl(activeConfig.endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier, password }),
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.detail || "Login failed. Check your credentials and try again.");
        return;
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
        <div className="auth-card" style={{ textAlign: "center", color: "#64748b" }}>
          <div className="loading">Verifying platform credentials...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        {/* Brand Header */}
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div style={{ fontSize: "36px", marginBottom: "6px" }}>⚡</div>
          <h1 style={{ margin: "0 0 6px 0", fontSize: "24px", color: "#1e293b" }}>AI Filler</h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
            Intelligent Multi-Modal Form & Workflow Engine
          </p>
        </div>

        <h2 style={{ fontSize: "18px", color: "#334155", marginBottom: "16px", textAlign: "center" }}>
          {activeConfig.title}
        </h2>

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
            />
          </div>

          <div className="form-group">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label htmlFor="password">Password</label>
              <a
                href={`/forgot-password/${activeConfig.id}`}
                style={{ fontSize: "12px", color: "#6366f1", textDecoration: "none" }}
              >
                Forgot password?
              </a>
            </div>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={loading}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: "8px" }}>
            {loading ? "Signing in…" : `Sign into ${activeConfig.title}`}
          </button>
        </form>

        {activeConfig.hasSignup && (
          <p className="auth-link">
            Don't have an applicant account? <a href="/signup">Sign up here</a>
          </p>
        )}

        {selectedRole === "admin" && (
          <p className="auth-link" style={{ fontSize: "12px", color: "#94a3b8" }}>
            Organization Admin IDs (e.g. <code>ADM-XXXXXX</code>) are generated by your Super Admin.
          </p>
        )}
      </div>
    </div>
  );
}
