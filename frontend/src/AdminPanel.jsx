import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl, authFetch } from "./api";
import "./Auth.css";
import FormBuilder from "./FormBuilder";

export default function AdminPanel() {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("forms"); // "forms" | "users" | "settings"
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({
    full_name: "",
    email: "",
    password: "",
    phone_number: "+14155552671",
    date_of_birth: "1995-01-01",
  });
  const [userCreatedMsg, setUserCreatedMsg] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAdmin = async () => {
      try {
        const response = await fetch(apiUrl("/auth/me"), {
          method: "GET",
          credentials: "include",
        });

        if (!response.ok) {
          navigate("/admin/login");
          return;
        }

        const data = await response.json();
        if (data.user.kind !== "organization_admin" && data.user.kind !== "super_admin") {
          navigate("/admin/login");
          return;
        }
        setAdmin(data.user);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAdmin();
  }, [navigate]);

  const handleLogout = async () => {
    try {
      const response = await authFetch("/auth/logout", {
        method: "POST",
      });
      if (response.ok) {
        localStorage.removeItem("userKind");
        navigate("/admin/login");
      } else {
        setError("Logout failed");
      }
    } catch {
      setError("Logout failed");
    }
  };

  if (loading) {
    return <div className="loading">Loading Admin Workspace...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  return (
    <div className="panel-container" style={{ maxWidth: "1200px" }}>
      <div className="panel-header">
        <div>
          <h1>Organization Admin Portal</h1>
          <span style={{ color: "#64748b", fontSize: "14px" }}>
            Workspace: <strong>{admin?.full_name}</strong> (ID: {admin?.admin_id})
          </span>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button className="btn-secondary" onClick={() => navigate("/voice")}>
            🎙️ Voice Filler
          </button>
          <button className="btn-secondary" onClick={() => navigate("/documents")}>
            📄 Documents
          </button>
          <button className="btn-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="auth-tabs" style={{ marginBottom: "24px" }}>
        <button
          className={`tab ${activeTab === "forms" ? "active" : ""}`}
          onClick={() => setActiveTab("forms")}
        >
          📋 Dynamic Form Builder (Google Forms / MS Forms)
        </button>
        <button
          className={`tab ${activeTab === "users" ? "active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          👥 User Directory & Onboarding
        </button>
        <button
          className={`tab ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          🏢 Organization Profile
        </button>
      </div>

      {/* Tab 1: Google Forms Style Dynamic Form Builder */}
      {activeTab === "forms" && (
        <div className="panel-section">
          <FormBuilder adminRole="organization_admin" />
        </div>
      )}

      {/* Tab 2: User Management */}
      {activeTab === "users" && (
        <div className="panel-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h3>Organization User Management</h3>
              <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
                Provision applicant accounts under your organization.
              </p>
            </div>
            <button
              className="btn-primary"
              onClick={() => setShowCreateUser(!showCreateUser)}
            >
              {showCreateUser ? "Cancel" : "+ Provision User"}
            </button>
          </div>

          {userCreatedMsg && <div className="info-card" style={{ marginBottom: "16px", color: "#15803d" }}>{userCreatedMsg}</div>}

          {showCreateUser && (
            <form
              className="create-user-form"
              style={{ background: "#f8fafc", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "20px" }}
              onSubmit={async (e) => {
                e.preventDefault();
                setUserCreatedMsg("");
                try {
                  const response = await authFetch("/auth/register", {
                    method: "POST",
                    body: JSON.stringify({
                      full_name: newUser.full_name,
                      email: newUser.email,
                      password: newUser.password,
                      date_of_birth: newUser.date_of_birth,
                      phone_number: newUser.phone_number,
                      organization_id: admin?.organization_id,
                      role: "user",
                    }),
                  });

                  if (!response.ok) {
                    const data = await response.json();
                    setError(data.detail || "Failed to create user");
                    return;
                  }

                  const data = await response.json();
                  setUserCreatedMsg(`User '${data.user.email}' provisioned successfully!`);
                  setNewUser({
                    full_name: "",
                    email: "",
                    password: "",
                    phone_number: "+14155552671",
                    date_of_birth: "1995-01-01",
                  });
                  setShowCreateUser(false);
                } catch (err) {
                  setError(err.message);
                }
              }}
            >
              <h4 style={{ margin: "0 0 16px 0" }}>Create New Applicant Account</h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
                <input
                  type="text"
                  placeholder="Full Name"
                  value={newUser.full_name}
                  onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                  required
                />
                <input
                  type="email"
                  placeholder="Email Address"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  required
                />
                <input
                  type="password"
                  placeholder="Temporary Password (min 12 chars)"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  required
                />
                <input
                  type="text"
                  placeholder="Phone Number (e.g. +14155552671)"
                  value={newUser.phone_number}
                  onChange={(e) => setNewUser({ ...newUser, phone_number: e.target.value })}
                  required
                />
                <input
                  type="date"
                  placeholder="Date of Birth"
                  value={newUser.date_of_birth}
                  onChange={(e) => setNewUser({ ...newUser, date_of_birth: e.target.value })}
                  required
                />
              </div>
              <button type="submit" className="btn-primary">
                Confirm & Create User
              </button>
            </form>
          )}
        </div>
      )}

      {/* Tab 3: Organization Details */}
      {activeTab === "settings" && (
        <div className="panel-section">
          <h3>Organization Overview</h3>
          <div className="info-card" style={{ marginTop: "16px" }}>
            <p><strong>Admin Full Name:</strong> {admin?.full_name}</p>
            <p><strong>Admin ID:</strong> {admin?.admin_id}</p>
            <p><strong>Organization Scope ID:</strong> {admin?.organization_id || "Global"}</p>
            <p><strong>Role Level:</strong> {admin?.kind}</p>
            <p><strong>Connected Email:</strong> {admin?.email}</p>
          </div>
        </div>
      )}
    </div>
  );
}
