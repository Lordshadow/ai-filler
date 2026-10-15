import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Inbox, LogOut, Settings, Users } from "lucide-react";
import { authFetch } from "./api";
import "./Auth.css";
import FormBuilder from "./FormBuilder";
import SubmissionsManager from "./SubmissionsManager";
import ProfileEditor from "./ProfileEditor";

export default function AdminPanel() {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("submissions"); // "submissions" | "forms" | "users" | "settings"
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
    let isMounted = true;
    const fetchAdmin = async () => {
      try {
        const response = await authFetch("/auth/me", {
          method: "GET",
        });

        if (!response.ok) {
          if (isMounted) navigate("/admin/login", { replace: true });
          return;
        }

        const data = await response.json();
        if (data.user.kind !== "organization_admin" && data.user.kind !== "super_admin") {
          if (isMounted) navigate("/admin/login", { replace: true });
          return;
        }
        if (isMounted) setAdmin(data.user);
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAdmin();
    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const handleLogout = async () => {
    try {
      const response = await authFetch("/auth/logout", {
        method: "POST",
      });
      if (response.ok) {
        window.sessionStorage.removeItem("fillerAiAccessToken");
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
          <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
            Workspace: <strong>{admin?.full_name}</strong> (ID: {admin?.admin_id})
          </span>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button className="btn-logout" onClick={handleLogout}>
            <LogOut size={16} aria-hidden="true" /> Log out
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="auth-tabs" style={{ marginBottom: "24px" }}>
        <button
          className={`tab ${activeTab === "submissions" ? "active" : ""}`}
          onClick={() => setActiveTab("submissions")}
        >
          <Inbox size={16} aria-hidden="true" /> Submissions
        </button>
        <button
          className={`tab ${activeTab === "forms" ? "active" : ""}`}
          onClick={() => setActiveTab("forms")}
        >
          <FileText size={16} aria-hidden="true" /> Forms
        </button>
        <button
          className={`tab ${activeTab === "users" ? "active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          <Users size={16} aria-hidden="true" /> Users
        </button>
        <button
          className={`tab ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          <Settings size={16} aria-hidden="true" /> Settings
        </button>
      </div>

      {/* Tab:Submissions */}
      {activeTab === "submissions" && (
        <div className="panel-section">
          <SubmissionsManager />
        </div>
      )}

      {/* Tab 1:Forms */}
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
              <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "14px" }}>
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

          {userCreatedMsg && <div className="info-card" style={{ marginBottom: "16px" }}>{userCreatedMsg}</div>}

          {showCreateUser && (
            <form
              className="create-user-form"
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
                  placeholder="Email Address (e.g. user@example.com)"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  pattern="^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
                  title="Please enter a valid email address containing '@' and a domain (e.g. user@example.com)"
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

      {/* Tab:Settings */}
      {activeTab === "settings" && (
        <div style={{ marginTop: "12px" }}>
          <ProfileEditor
            user={admin}
            onProfileUpdated={(updated) => setAdmin(updated)}
            role="organization_admin"
          />
        </div>
      )}
    </div>
  );
}
