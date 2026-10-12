import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch } from "./api";
import "./Auth.css";
import FormBuilder from "./FormBuilder";
import SubmissionsManager from "./SubmissionsManager";
import ProfileEditor from "./ProfileEditor";

export default function SuperAdminPanel() {
  const [form, setForm] = useState({ organization_name: "", full_name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [createdId, setCreatedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [superUser, setSuperUser] = useState(null);
  const [activeTab, setActiveTab] = useState("submissions"); // "submissions" | "admins" | "forms" | "profile"
  const navigate = useNavigate();

  useEffect(() => {
    authFetch("/auth/me")
      .then(async (response) => {
        if (!response.ok) throw new Error("Please log in as the super user.");
        const data = await response.json();
        if (data.user.kind !== "super_admin") throw new Error("Super-admin access required.");
        setSuperUser(data.user);
      })
      .catch((err) => {
        setError(err.message);
        navigate("/super-admin/login");
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const createAdmin = async (event) => {
    event.preventDefault();
    setError("");
    setCreatedId("");
    try {
      const response = await authFetch("/auth/super/organization-admins", {
        method: "POST",
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not create organization admin.");
      setCreatedId(data.admin_id);
      setForm({ organization_name: "", full_name: "", email: "", password: "" });
    } catch (err) {
      setError(err.message || "Could not create organization admin.");
    }
  };

  const logout = async () => {
    const response = await authFetch("/auth/logout", { method: "POST" });
    if (response.ok) navigate("/super-admin/login");
    else setError("Logout failed.");
  };

  if (loading) return <div className="loading">Loading Super Admin Workspace...</div>;

  return (
    <main className="panel-container" style={{ maxWidth: "1200px" }}>
      <header className="panel-header">
        <div>
          <h1>Super Admin Console</h1>
          <span style={{ color: "#64748b", fontSize: "14px" }}>System-wide governance and template management</span>
        </div>
        <button className="btn-logout" onClick={logout}>Logout</button>
      </header>

      {/* Tabs */}
      <div className="auth-tabs" style={{ marginBottom: "24px" }}>
        <button
          className={`tab ${activeTab === "submissions" ? "active" : ""}`}
          onClick={() => setActiveTab("submissions")}
        >
          📥 Filled Forms & Submissions
        </button>
        <button
          className={`tab ${activeTab === "admins" ? "active" : ""}`}
          onClick={() => setActiveTab("admins")}
        >
          🏢 Provision Organization Admins
        </button>
        <button
          className={`tab ${activeTab === "forms" ? "active" : ""}`}
          onClick={() => setActiveTab("forms")}
        >
          📋 Global Form Templates
        </button>
        <button
          className={`tab ${activeTab === "profile" ? "active" : ""}`}
          onClick={() => setActiveTab("profile")}
        >
          ⚙️ Super Admin Profile & Security
        </button>
      </div>

      {activeTab === "submissions" && (
        <section className="panel-section">
          <SubmissionsManager />
        </section>
      )}

      {activeTab === "admins" && (
        <section className="panel-section" style={{ maxWidth: "600px", margin: "0 auto" }}>
          <h2>Provision Organization Admin</h2>
          <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "20px" }}>
            Assign an admin to an organization. A unique login ID will be generated upon creation.
          </p>
          {error && <div className="error-message">{error}</div>}
          {createdId && (
            <div className="info-card" style={{ marginBottom: "20px", color: "#15803d" }}>
              Admin created successfully! Their login ID is: <strong>{createdId}</strong>
            </div>
          )}
          <form className="auth-form" onSubmit={createAdmin}>
            {[
              ["organization_name", "Organization Name", "text"],
              ["full_name", "Admin Full Name", "text"],
              ["email", "Admin Email", "email"],
              ["password", "Temporary Password", "password"],
            ].map(([key, label, type]) => (
              <div className="form-group" key={key}>
                <label htmlFor={key}>{label}</label>
                <input
                  id={key}
                  type={type}
                  value={form[key]}
                  onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                  minLength={key === "password" ? 8 : undefined}
                  required
                />
              </div>
            ))}
            <button className="btn-primary" type="submit">Create Admin Account</button>
          </form>
        </section>
      )}

      {activeTab === "forms" && (
        <section className="panel-section">
          <FormBuilder adminRole="super_admin" />
        </section>
      )}

      {activeTab === "profile" && (
        <section style={{ marginTop: "12px" }}>
          <ProfileEditor
            user={superUser}
            onProfileUpdated={(updated) => setSuperUser(updated)}
            role="super_admin"
          />
        </section>
      )}
    </main>
  );
}
