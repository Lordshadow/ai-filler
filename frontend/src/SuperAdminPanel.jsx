import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch } from "./api";
import ProfileEditor from "./ProfileEditor";
import "./Auth.css";

export default function SuperAdminPanel() {
  const [activeTab, setActiveTab] = useState("organizations"); // "organizations" | "admins" | "profile"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [superUser, setSuperUser] = useState(null);

  // Organizations state
  const [organizations, setOrganizations] = useState([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null); // { id, name }
  const [editingOrgName, setEditingOrgName] = useState("");
  const [orgSearch, setOrgSearch] = useState("");

  // Admins state
  const [admins, setAdmins] = useState([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [adminSearch, setAdminSearch] = useState("");
  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [provisionForm, setProvisionForm] = useState({
    organization_mode: "existing", // "existing" | "new"
    organization_id: "",
    organization_name: "",
    full_name: "",
    email: "",
    password: "",
  });
  const [provisioning, setProvisioning] = useState(false);
  const [provisionedAdminId, setProvisionedAdminId] = useState("");

  // Admin action modals
  const [editingAdmin, setEditingAdmin] = useState(null); // admin object
  const [resettingAdmin, setResettingAdmin] = useState(null); // admin object
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [actionSuccessMsg, setActionSuccessMsg] = useState("");

  const navigate = useNavigate();

  // Auto-dismiss alert
  useEffect(() => {
    if (actionSuccessMsg) {
      const timer = setTimeout(() => setActionSuccessMsg(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [actionSuccessMsg]);

  // Load super user session
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

  // Fetch organizations
  const fetchOrganizations = useCallback(async () => {
    setLoadingOrgs(true);
    try {
      const res = await authFetch("/organizations");
      if (res.ok) {
        const data = await res.json();
        setOrganizations(data.organizations || []);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "Failed to load organizations.");
      }
    } catch (err) {
      console.error("Failed to load organizations:", err);
      setError("Network error while loading organizations.");
    } finally {
      setLoadingOrgs(false);
    }
  }, []);

  // Fetch admins
  const fetchAdmins = useCallback(async () => {
    setLoadingAdmins(true);
    try {
      const res = await authFetch("/auth/super/organization-admins");
      if (res.ok) {
        const data = await res.json();
        setAdmins(data.admins || []);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "Failed to load organization admins.");
      }
    } catch (err) {
      console.error("Failed to load organization admins:", err);
      setError("Network error while loading organization admins.");
    } finally {
      setLoadingAdmins(false);
    }
  }, []);

  // Load organizations and admins eagerly on mount and tab switches
  useEffect(() => {
    fetchOrganizations();
    fetchAdmins();
  }, [activeTab, fetchOrganizations, fetchAdmins]);

  // Handle Create Organization
  const handleCreateOrganization = async (e) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    setError("");
    try {
      const res = await authFetch("/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newOrgName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to create organization.");
      setActionSuccessMsg(`Organization "${data.organization.name}" created successfully!`);
      setNewOrgName("");
      fetchOrganizations();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingOrg(false);
    }
  };

  // Handle Update Organization Name
  const handleUpdateOrganization = async (orgId) => {
    if (!editingOrgName.trim()) return;
    setError("");
    try {
      const res = await authFetch(`/organizations/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingOrgName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to update organization name.");
      setActionSuccessMsg(`Organization updated to "${data.organization.name}".`);
      setEditingOrg(null);
      setEditingOrgName("");
      fetchOrganizations();
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle Provision Admin
  const handleProvisionAdmin = async (e) => {
    e.preventDefault();
    setError("");
    setProvisionedAdminId("");
    setProvisioning(true);

    let orgName = provisionForm.organization_name.trim();
    if (provisionForm.organization_mode === "existing") {
      const matched = organizations.find((o) => String(o.id) === String(provisionForm.organization_id));
      if (!matched) {
        setError("Please select a valid organization.");
        setProvisioning(false);
        return;
      }
      orgName = matched.name;
    }

    try {
      const res = await authFetch("/auth/super/organization-admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_name: orgName,
          full_name: provisionForm.full_name.trim(),
          email: provisionForm.email.trim(),
          password: provisionForm.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to provision administrator.");
      setProvisionedAdminId(data.admin_id);
      setActionSuccessMsg(`Administrator provisioned! Unique Login ID: ${data.admin_id}`);
      setProvisionForm({
        organization_mode: "existing",
        organization_id: "",
        organization_name: "",
        full_name: "",
        email: "",
        password: "",
      });
      fetchAdmins();
      fetchOrganizations();
    } catch (err) {
      setError(err.message);
    } finally {
      setProvisioning(false);
    }
  };

  // Handle Toggle Admin Status (Active / Suspended)
  const handleToggleAdminStatus = async (admin) => {
    setError("");
    try {
      const nextStatus = !admin.isActive;
      const res = await authFetch(`/auth/super/organization-admins/${admin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to toggle status.");
      setActionSuccessMsg(
        `Admin ${admin.fullName} has been ${nextStatus ? "activated" : "suspended"}.`
      );
      fetchAdmins();
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle Update Admin Details
  const handleSaveAdminDetails = async (e) => {
    e.preventDefault();
    if (!editingAdmin) return;
    setError("");
    try {
      const res = await authFetch(`/auth/super/organization-admins/${editingAdmin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: editingAdmin.fullName.trim(),
          email: editingAdmin.email.trim(),
          phone_number: (editingAdmin.phoneNumber || "").trim() || null,
          organization_id: editingAdmin.organizationId ? Number(editingAdmin.organizationId) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to update administrator details.");
      setActionSuccessMsg(`Administrator details for ${data.admin.fullName} updated!`);
      setEditingAdmin(null);
      fetchAdmins();
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle Reset Admin Password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resettingAdmin || !newAdminPassword) return;
    setError("");
    try {
      const res = await authFetch(
        `/auth/super/organization-admins/${resettingAdmin.id}/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ new_password: newAdminPassword }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to reset administrator password.");
      setActionSuccessMsg(
        `Password for ${resettingAdmin.fullName} (${resettingAdmin.adminId}) reset successfully.`
      );
      setResettingAdmin(null);
      setNewAdminPassword("");
    } catch (err) {
      setError(err.message);
    }
  };

  // Filtered organizations
  const filteredOrgs = useMemo(() => {
    if (!orgSearch.trim()) return organizations;
    const q = orgSearch.toLowerCase();
    return organizations.filter(
      (o) => o.name?.toLowerCase().includes(q) || String(o.id).includes(q)
    );
  }, [organizations, orgSearch]);

  // Filtered admins
  const filteredAdmins = useMemo(() => {
    if (!adminSearch.trim()) return admins;
    const q = adminSearch.toLowerCase();
    return admins.filter(
      (a) =>
        a.adminId?.toLowerCase().includes(q) ||
        a.fullName?.toLowerCase().includes(q) ||
        a.email?.toLowerCase().includes(q) ||
        a.organizationName?.toLowerCase().includes(q)
    );
  }, [admins, adminSearch]);

  const logout = async () => {
    const response = await authFetch("/auth/logout", { method: "POST" });
    if (response.ok) navigate("/super-admin/login");
    else setError("Logout failed.");
  };

  if (loading) return <div className="loading">Loading Super Admin Workspace...</div>;

  return (
    <main className="panel-container" style={{ maxWidth: "1240px" }}>
      {/* Header */}
      <header className="panel-header">
        <div>
          <h1>Global Governance Console</h1>
          <span style={{ color: "#64748b", fontSize: "14px" }}>
            Super-Admin Tenant &amp; Administrator Management
          </span>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <span className="profile-chip chip-status">Root Governance</span>
          <button className="btn-logout" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      {/* Global Toast / Alerts */}
      {actionSuccessMsg && (
        <div className="profile-toast toast-success" style={{ marginBottom: "20px" }}>
          <span>✅ {actionSuccessMsg}</span>
          <button className="toast-close" onClick={() => setActionSuccessMsg("")}>
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="profile-toast toast-error" style={{ marginBottom: "20px" }}>
          <span>⚠️ {error}</span>
          <button className="toast-close" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}

      {/* Primary Navigation Tabs */}
      <div className="auth-tabs" style={{ marginBottom: "24px" }}>
        <button
          className={`tab ${activeTab === "organizations" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("organizations");
            setError("");
          }}
        >
          🏢 Organizations Directory
        </button>
        <button
          className={`tab ${activeTab === "admins" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("admins");
            setError("");
          }}
        >
          👥 Organization Admins Directory
        </button>
        <button
          className={`tab ${activeTab === "profile" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("profile");
            setError("");
          }}
        >
          ⚙️ Super Admin Profile &amp; Security
        </button>
      </div>

      {/* ── TAB 1: ORGANIZATIONS DIRECTORY ────────────────────────────────── */}
      {activeTab === "organizations" && (
        <section className="panel-section">
          {/* KPI Cards */}
          <div className="sub-kpis-grid" style={{ marginBottom: "24px" }}>
            <div className="sub-kpi-card">
              <span className="sub-kpi-label">Total Organizations</span>
              <span className="sub-kpi-val" style={{ color: "#2563eb" }}>
                {organizations.length}
              </span>
            </div>
            <div className="sub-kpi-card">
              <span className="sub-kpi-label">Active Administrators</span>
              <span className="sub-kpi-val" style={{ color: "#16a34a" }}>
                {organizations.reduce((acc, o) => acc + (o.adminCount || 0), 0)}
              </span>
            </div>
            <div className="sub-kpi-card">
              <span className="sub-kpi-label">Total Published Forms</span>
              <span className="sub-kpi-val" style={{ color: "#8b5cf6" }}>
                {organizations.reduce((acc, o) => acc + (o.formCount || 0), 0)}
              </span>
            </div>
          </div>

          {/* Quick Create Organization Form */}
          <div className="info-card" style={{ marginBottom: "24px", background: "#f8fafc" }}>
            <h3 style={{ margin: "0 0 8px 0", fontSize: "16px", color: "#0f172a" }}>
              + Create New Organization
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#64748b" }}>
              Add a new tenant domain to host isolated forms, admins, and respondent workflows.
            </p>
            <form onSubmit={handleCreateOrganization} style={{ display: "flex", gap: "12px", maxWidth: "600px" }}>
              <input
                type="text"
                placeholder="Organization Name (e.g. Apex Healthcare, Global FinCorp)"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                required
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn-primary" disabled={creatingOrg || !newOrgName.trim()}>
                {creatingOrg ? "Creating…" : "Add Organization"}
              </button>
            </form>
          </div>

          {/* Search bar */}
          <div className="sub-filter-row" style={{ marginBottom: "16px" }}>
            <div className="sub-search-box" style={{ flex: 1 }}>
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search organizations by name or ID…"
                value={orgSearch}
                onChange={(e) => setOrgSearch(e.target.value)}
              />
              {orgSearch && (
                <button className="clear-search-btn" onClick={() => setOrgSearch("")}>
                  ×
                </button>
              )}
            </div>
            <button className="btn-secondary" onClick={fetchOrganizations} disabled={loadingOrgs}>
              🔄 Refresh
            </button>
          </div>

          {/* Organizations Table */}
          {loadingOrgs ? (
            <div className="loading">Loading organizations…</div>
          ) : filteredOrgs.length === 0 ? (
            <div className="sub-empty-state">
              <span className="empty-icon">🏢</span>
              <h3>No organizations found</h3>
              <p>Create an organization above to begin provisioning tenant environments.</p>
            </div>
          ) : (
            <div className="sub-table-wrapper">
              <table className="sub-table">
                <thead>
                  <tr>
                    <th>Organization ID</th>
                    <th>Legal Name</th>
                    <th>Admins</th>
                    <th>Forms</th>
                    <th>Submissions</th>
                    <th>Created At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrgs.map((org) => {
                    const isEditing = editingOrg?.id === org.id;
                    return (
                      <tr key={org.id}>
                        <td>
                          <span className="sub-cell-id">ORG-{org.id}</span>
                        </td>
                        <td>
                          {isEditing ? (
                            <div style={{ display: "flex", gap: "8px" }}>
                              <input
                                type="text"
                                value={editingOrgName}
                                onChange={(e) => setEditingOrgName(e.target.value)}
                                style={{ padding: "6px 10px", fontSize: "13px" }}
                                autoFocus
                              />
                              <button
                                className="btn-primary-small"
                                onClick={() => handleUpdateOrganization(org.id)}
                              >
                                Save
                              </button>
                              <button
                                className="btn-text-secondary"
                                onClick={() => setEditingOrg(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <strong style={{ color: "#0f172a" }}>{org.name}</strong>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="sub-pill pill-count"
                            style={{ cursor: "pointer", border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8" }}
                            title={`View administrators for ${org.name}`}
                            onClick={() => {
                              setAdminSearch(org.name);
                              setActiveTab("admins");
                            }}
                          >
                            👥 {org.adminCount || 0} Admins ↗
                          </button>
                        </td>
                        <td>
                          <span className="sub-pill pill-count">{org.formCount || 0} Forms</span>
                        </td>
                        <td>
                          <span className="sub-pill pill-count">{org.submissionCount || 0} Submissions</span>
                        </td>
                        <td>
                          <span className="sub-cell-date">
                            {org.createdAt ? new Date(org.createdAt).toLocaleDateString() : "N/A"}
                          </span>
                        </td>
                        <td>
                          {!isEditing && (
                            <button
                              className="btn-text-secondary"
                              style={{ fontWeight: "600" }}
                              onClick={() => {
                                setEditingOrg(org);
                                setEditingOrgName(org.name);
                              }}
                            >
                              ✏️ Rename
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── TAB 2: ORGANIZATION ADMINS DIRECTORY ─────────────────────────── */}
      {activeTab === "admins" && (
        <section className="panel-section">
          {/* Header Action Bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <h2 style={{ margin: "0 0 4px 0", fontSize: "18px" }}>Provisioned Organization Administrators</h2>
              <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                Oversee authorized administrators, assign organizations, and enforce security policies.
              </p>
            </div>
            <button
              className="btn-primary"
              onClick={() => {
                setShowProvisionModal(true);
                setProvisionedAdminId("");
              }}
            >
              + Provision New Administrator
            </button>
          </div>

          {/* Provision Modal / Card */}
          {showProvisionModal && (
            <div
              className="info-card"
              style={{
                marginBottom: "24px",
                border: "2px solid #3b82f6",
                background: "#f0fdf4",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px",
                }}
              >
                <h3 style={{ margin: 0, color: "#166534" }}>Provision Organization Administrator</h3>
                <button
                  className="toast-close"
                  onClick={() => setShowProvisionModal(false)}
                >
                  ×
                </button>
              </div>

              {provisionedAdminId && (
                <div
                  className="info-card"
                  style={{
                    marginBottom: "16px",
                    background: "#ffffff",
                    border: "1px solid #bbf7d0",
                    color: "#15803d",
                  }}
                >
                  🎉 Administrator provisioned successfully! Login ID: <strong>{provisionedAdminId}</strong>
                </div>
              )}

              <form onSubmit={handleProvisionAdmin}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                  {/* Organization Selector */}
                  <div className="form-group">
                    <label>Assigned Organization</label>
                    <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                      <label style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}>
                        <input
                          type="radio"
                          name="orgMode"
                          checked={provisionForm.organization_mode === "existing"}
                          onChange={() => setProvisionForm({ ...provisionForm, organization_mode: "existing" })}
                        />
                        Select Existing
                      </label>
                      <label style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}>
                        <input
                          type="radio"
                          name="orgMode"
                          checked={provisionForm.organization_mode === "new"}
                          onChange={() => setProvisionForm({ ...provisionForm, organization_mode: "new" })}
                        />
                        Create New Organization
                      </label>
                    </div>

                    {provisionForm.organization_mode === "existing" ? (
                      <select
                        value={provisionForm.organization_id}
                        onChange={(e) => setProvisionForm({ ...provisionForm, organization_id: e.target.value })}
                        required
                        style={{ width: "100%", padding: "10px", borderRadius: "5px", border: "1px solid #ccc" }}
                      >
                        <option value="">-- Choose an Organization --</option>
                        {organizations.map((org) => (
                          <option key={org.id} value={org.id}>
                            {org.name} (ORG-{org.id})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        placeholder="Enter New Organization Name"
                        value={provisionForm.organization_name}
                        onChange={(e) => setProvisionForm({ ...provisionForm, organization_name: e.target.value })}
                        required
                      />
                    )}
                  </div>

                  {/* Full Name */}
                  <div className="form-group">
                    <label>Administrator Full Name <span className="req-star">*</span></label>
                    <input
                      type="text"
                      placeholder="e.g. Dr. Apex Lead"
                      value={provisionForm.full_name}
                      onChange={(e) => setProvisionForm({ ...provisionForm, full_name: e.target.value })}
                      required
                    />
                  </div>

                  {/* Email */}
                  <div className="form-group">
                    <label>Email Address <span className="req-star">*</span></label>
                    <input
                      type="email"
                      placeholder="e.g. admin@organization.com"
                      value={provisionForm.email}
                      onChange={(e) => setProvisionForm({ ...provisionForm, email: e.target.value })}
                      pattern="^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
                      title="Please enter a valid email address containing '@' and a domain"
                      required
                    />
                  </div>

                  {/* Password */}
                  <div className="form-group">
                    <label>Temporary Password (min 8 chars) <span className="req-star">*</span></label>
                    <input
                      type="password"
                      placeholder="Minimum 8 characters"
                      value={provisionForm.password}
                      onChange={(e) => setProvisionForm({ ...provisionForm, password: e.target.value })}
                      minLength={8}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button type="submit" className="btn-primary" disabled={provisioning}>
                    {provisioning ? "Provisioning…" : "Confirm & Provision Administrator"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowProvisionModal(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Search bar */}
          <div className="sub-filter-row" style={{ marginBottom: "16px" }}>
            <div className="sub-search-box" style={{ flex: 1 }}>
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search admins by Admin ID, Name, Email, or Organization…"
                value={adminSearch}
                onChange={(e) => setAdminSearch(e.target.value)}
              />
              {adminSearch && (
                <button className="clear-search-btn" onClick={() => setAdminSearch("")}>
                  ×
                </button>
              )}
            </div>
            <button className="btn-secondary" onClick={fetchAdmins} disabled={loadingAdmins}>
              🔄 Refresh
            </button>
          </div>

          {/* Admins Table */}
          {loadingAdmins ? (
            <div className="loading">Loading administrators…</div>
          ) : filteredAdmins.length === 0 ? (
            <div className="sub-empty-state">
              <span className="empty-icon">👥</span>
              <h3>No administrators found</h3>
              <p>
                {adminSearch
                  ? `No administrators matching "${adminSearch}". Clear the search query to show all administrators.`
                  : 'Click "+ Provision New Administrator" above to create an administrator.'}
              </p>
              {adminSearch && (
                <button
                  className="btn-secondary"
                  style={{ marginTop: "10px" }}
                  onClick={() => setAdminSearch("")}
                >
                  Clear Search Filter
                </button>
              )}
            </div>
          ) : (
            <div className="sub-table-wrapper">
              <table className="sub-table">
                <thead>
                  <tr>
                    <th>Admin ID</th>
                    <th>Administrator</th>
                    <th>Email Address</th>
                    <th>Organization</th>
                    <th>Status</th>
                    <th>Created At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAdmins.map((admin) => (
                    <tr key={admin.id}>
                      <td>
                        <span className="sub-cell-id" style={{ color: "#b45309", background: "#fef3c7" }}>
                          {admin.adminId}
                        </span>
                      </td>
                      <td>
                        <strong>{admin.fullName}</strong>
                        {admin.phoneNumber && (
                          <span style={{ display: "block", fontSize: "11px", color: "#64748b" }}>
                            📞 {admin.phoneNumber}
                          </span>
                        )}
                      </td>
                      <td>{admin.email}</td>
                      <td>
                        <span className="profile-chip" style={{ background: "#f1f5f9", color: "#334155" }}>
                          🏢 {admin.organizationName}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`sub-pill ${
                            admin.isActive ? "pill-approved" : "pill-rejected"
                          }`}
                        >
                          {admin.isActive ? "Active" : "Suspended"}
                        </span>
                      </td>
                      <td>
                        <span className="sub-cell-date">
                          {admin.createdAt ? new Date(admin.createdAt).toLocaleDateString() : "N/A"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <button
                            className="btn-text-secondary"
                            onClick={() => setEditingAdmin({ ...admin })}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            className="btn-text-secondary"
                            style={{ color: admin.isActive ? "#dc2626" : "#16a34a" }}
                            onClick={() => handleToggleAdminStatus(admin)}
                          >
                            {admin.isActive ? "⛔ Suspend" : "✅ Activate"}
                          </button>
                          <button
                            className="btn-text-secondary"
                            onClick={() => {
                              setResettingAdmin(admin);
                              setNewAdminPassword("");
                            }}
                          >
                            🔑 Reset Password
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Edit Admin Modal */}
          {editingAdmin && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
              }}
            >
              <div
                style={{
                  background: "#ffffff",
                  borderRadius: "10px",
                  padding: "24px",
                  maxWidth: "500px",
                  width: "90%",
                  boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "16px",
                  }}
                >
                  <h3 style={{ margin: 0 }}>Edit Admin: {editingAdmin.adminId}</h3>
                  <button className="toast-close" onClick={() => setEditingAdmin(null)}>
                    ×
                  </button>
                </div>

                <form onSubmit={handleSaveAdminDetails}>
                  <div className="form-group" style={{ marginBottom: "12px" }}>
                    <label>Full Name</label>
                    <input
                      type="text"
                      value={editingAdmin.fullName}
                      onChange={(e) => setEditingAdmin({ ...editingAdmin, fullName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: "12px" }}>
                    <label>Email Address</label>
                    <input
                      type="email"
                      value={editingAdmin.email}
                      onChange={(e) => setEditingAdmin({ ...editingAdmin, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: "12px" }}>
                    <label>Phone Number (E.164)</label>
                    <input
                      type="tel"
                      value={editingAdmin.phoneNumber || ""}
                      onChange={(e) => setEditingAdmin({ ...editingAdmin, phoneNumber: e.target.value })}
                      placeholder="+14155552671"
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: "20px" }}>
                    <label>Re-assign Organization</label>
                    <select
                      value={editingAdmin.organizationId || ""}
                      onChange={(e) => setEditingAdmin({ ...editingAdmin, organizationId: e.target.value })}
                      style={{ width: "100%", padding: "10px", borderRadius: "5px", border: "1px solid #ccc" }}
                    >
                      {organizations.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name} (ORG-{org.id})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                    <button type="button" className="btn-secondary" onClick={() => setEditingAdmin(null)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn-primary">
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Reset Password Modal */}
          {resettingAdmin && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
              }}
            >
              <div
                style={{
                  background: "#ffffff",
                  borderRadius: "10px",
                  padding: "24px",
                  maxWidth: "450px",
                  width: "90%",
                  boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "16px",
                  }}
                >
                  <h3 style={{ margin: 0 }}>Reset Password</h3>
                  <button className="toast-close" onClick={() => setResettingAdmin(null)}>
                    ×
                  </button>
                </div>
                <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "16px" }}>
                  Set a new password for administrator <strong>{resettingAdmin.fullName}</strong> ({resettingAdmin.adminId}).
                </p>
                <form onSubmit={handleResetPassword}>
                  <div className="form-group" style={{ marginBottom: "20px" }}>
                    <label>New Temporary Password (min 8 chars)</label>
                    <input
                      type="password"
                      placeholder="Minimum 8 characters"
                      value={newAdminPassword}
                      onChange={(e) => setNewAdminPassword(e.target.value)}
                      minLength={8}
                      required
                      autoFocus
                    />
                  </div>
                  <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                    <button type="button" className="btn-secondary" onClick={() => setResettingAdmin(null)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn-primary" disabled={!newAdminPassword || newAdminPassword.length < 8}>
                      Set New Password
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── TAB 3: SUPER ADMIN PROFILE & SECURITY ────────────────────────── */}
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
