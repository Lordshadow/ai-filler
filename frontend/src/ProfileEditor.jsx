import { useState, useEffect } from "react";
import { Building2, CheckCircle2, RotateCcw, Save, Shield, UserRound } from "lucide-react";
import { authFetch } from "./api";
import "./Auth.css";

export default function ProfileEditor({ user, onProfileUpdated, role = "user" }) {
  const [activeTab, setActiveTab] = useState("personal"); // "personal" | "security" | "organization"

  // Personal details state
  const [personalForm, setPersonalForm] = useState({
    full_name: "",
    email: "",
    phone_number: "",
    date_of_birth: "",
  });

  // Organization / System details state
  const [orgForm, setOrgForm] = useState({
    organization_name: "",
    recovery_email: "",
  });

  // Security / Password state
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status and feedback states
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Sync state from prop
  useEffect(() => {
    if (user) {
      setPersonalForm({
        full_name: user.full_name || "",
        email: user.email || "",
        phone_number: user.phone_number || "",
        date_of_birth: user.date_of_birth || "",
      });
      setOrgForm({
        organization_name: user.organization_name || "",
        recovery_email: user.recovery_email || "",
      });
    }
  }, [user]);

  // Auto-dismiss success message
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  // Compute initials for avatar
  const getInitials = (name) => {
    if (!name) return "U";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Check dirty states
  const isPersonalDirty =
    user &&
    (personalForm.full_name !== (user.full_name || "") ||
      personalForm.email !== (user.email || "") ||
      personalForm.phone_number !== (user.phone_number || "") ||
      personalForm.date_of_birth !== (user.date_of_birth || ""));

  const isOrgDirty =
    user &&
    (orgForm.organization_name !== (user.organization_name || "") ||
      orgForm.recovery_email !== (user.recovery_email || ""));

  // Password strength checklist
  const pwd = passwordForm.new_password;
  const hasMinLength = pwd.length >= 8;
  const hasUpper = /[A-Z]/.test(pwd);
  const hasLower = /[a-z]/.test(pwd);
  const hasNumberOrSpecial = /[0-9!@#$%^&*(),.?":{}|<>]/.test(pwd);
  const passwordsMatch = pwd && pwd === passwordForm.confirm_password;
  const isPasswordValid = hasMinLength && hasUpper && hasLower && hasNumberOrSpecial && passwordsMatch;

  // Handle Personal Details Save
  const handleSavePersonal = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setSavingPersonal(true);

    try {
      const payload = {
        full_name: personalForm.full_name.trim(),
        email: personalForm.email.trim(),
        phone_number: personalForm.phone_number.trim(),
      };
      if (role === "user" && personalForm.date_of_birth) {
        payload.date_of_birth = personalForm.date_of_birth;
      }

      const res = await authFetch("/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to update profile.");
      }

      setSuccessMsg("Profile information updated successfully!");
      if (onProfileUpdated) onProfileUpdated(data.user);
    } catch (err) {
      setErrorMsg(err.message || "Failed to save changes.");
    } finally {
      setSavingPersonal(false);
    }
  };

  // Handle Discard Personal
  const handleDiscardPersonal = () => {
    if (user) {
      setPersonalForm({
        full_name: user.full_name || "",
        email: user.email || "",
        phone_number: user.phone_number || "",
        date_of_birth: user.date_of_birth || "",
      });
      setErrorMsg("");
    }
  };

  // Handle Organization / System Save
  const handleSaveOrg = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setSavingOrg(true);

    try {
      const payload = {};
      if (role === "organization_admin") {
        payload.organization_name = orgForm.organization_name.trim();
      } else if (role === "super_admin") {
        payload.recovery_email = orgForm.recovery_email.trim();
      }

      const res = await authFetch("/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to update organization settings.");
      }

      setSuccessMsg("Organization & System settings updated successfully!");
      if (onProfileUpdated) onProfileUpdated(data.user);
    } catch (err) {
      setErrorMsg(err.message || "Failed to update organization details.");
    } finally {
      setSavingOrg(false);
    }
  };

  // Handle Password Change
  const handleSavePassword = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!isPasswordValid) {
      setErrorMsg("Please satisfy all password complexity requirements before saving.");
      return;
    }

    setSavingPassword(true);
    try {
      const res = await authFetch("/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: passwordForm.current_password,
          new_password: passwordForm.new_password,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to change password.");
      }

      setSuccessMsg("Password changed successfully! Keep your new credentials safe.");
      setPasswordForm({
        current_password: "",
        new_password: "",
        confirm_password: "",
      });
    } catch (err) {
      setErrorMsg(err.message || "Failed to update password.");
    } finally {
      setSavingPassword(false);
    }
  };

  const roleLabel =
    role === "super_admin"
      ? "Super Administrator"
      : role === "organization_admin"
      ? "Organization Administrator"
      : "Applicant / User";

  return (
    <div className="profile-editor-container">
      {/* Hero Header Card */}
      <div className="profile-hero-card">
        <div className="profile-avatar-circle">{getInitials(user?.full_name)}</div>
        <div className="profile-hero-meta">
          <div className="profile-hero-title-row">
            <h2>{user?.full_name || "Account Profile"}</h2>
            <span className={`profile-badge-role badge-${role}`}>{roleLabel}</span>
          </div>
          <p className="profile-hero-email">{user?.email}</p>
          <div className="profile-hero-chips">
            {user?.admin_id && (
              <span className="profile-chip">
                ID: <strong>{user.admin_id}</strong>
              </span>
            )}
            {user?.organization_name && (
              <span className="profile-chip">
                Organization: <strong>{user.organization_name}</strong>
              </span>
            )}
            {user?.created_at && (
              <span className="profile-chip">
                Member since {new Date(user.created_at).toLocaleDateString()}
              </span>
            )}
            <span className="profile-chip chip-status"><CheckCircle2 size={14} aria-hidden="true" /> Active</span>
          </div>
        </div>
      </div>

      {/* Toast Alert Banners */}
      {successMsg && (
        <div className="profile-toast toast-success" role="alert">
          <span> {successMsg}</span>
          <button className="toast-close" onClick={() => setSuccessMsg("")}>
            ×
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="profile-toast toast-error" role="alert">
          <span> {errorMsg}</span>
          <button className="toast-close" onClick={() => setErrorMsg("")}>
            ×
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="profile-nav-tabs">
        <button
          type="button"
          className={`profile-nav-tab ${activeTab === "personal" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("personal");
            setErrorMsg("");
          }}
        >
          <UserRound size={16} aria-hidden="true" /> Personal information
        </button>
        <button
          type="button"
          className={`profile-nav-tab ${activeTab === "security" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("security");
            setErrorMsg("");
          }}
        >
          <Shield size={16} aria-hidden="true" /> Security & Password
        </button>
        <button
          type="button"
          className={`profile-nav-tab ${activeTab === "organization" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("organization");
            setErrorMsg("");
          }}
        >
          <Building2 size={16} aria-hidden="true" /> Organization & System
        </button>
      </div>

      {/* Tab 1: Personal Details */}
      {activeTab === "personal" && (
        <form className="profile-form-section" onSubmit={handleSavePersonal}>
          <div className="section-intro">
            <h3>Personal details</h3>
            <p>Manage your contact information.</p>
          </div>

          {isPersonalDirty && (
            <div className="profile-unsaved-banner">
              <span> You have unsaved changes to your profile information.</span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="btn-text-secondary"
                  onClick={handleDiscardPersonal}
                  disabled={savingPersonal}
                >
                  Discard
                </button>
                <button
                  type="submit"
                  className="btn-primary-small"
                  disabled={savingPersonal}
                >
                  {savingPersonal ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          )}

          <div className="profile-grid">
            <div className="form-group">
              <label htmlFor="pf-full-name">
                Full Legal Name <span className="req-star">*</span>
              </label>
              <input
                id="pf-full-name"
                type="text"
                value={personalForm.full_name}
                onChange={(e) => setPersonalForm({ ...personalForm, full_name: e.target.value })}
                placeholder="e.g. Dr. Jane Doe"
                required
              />
              <span className="field-hint">Shown on your applications.</span>
            </div>

            <div className="form-group">
              <label htmlFor="pf-email">
                Primary Email Address <span className="req-star">*</span>
              </label>
              <input
                id="pf-email"
                type="email"
                value={personalForm.email}
                onChange={(e) => setPersonalForm({ ...personalForm, email: e.target.value })}
                placeholder="e.g. user@example.com"
                pattern="^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
                title="Must be a valid email containing '@' and a domain"
                required
              />
              <span className="field-hint">Used for account access and updates.</span>
            </div>

            <div className="form-group">
              <label htmlFor="pf-phone">
                Contact Phone Number (E.164)
              </label>
              <input
                id="pf-phone"
                type="tel"
                value={personalForm.phone_number}
                onChange={(e) => setPersonalForm({ ...personalForm, phone_number: e.target.value })}
                placeholder="+14155552671"
                pattern="^\+[1-9]\d{1,14}$"
                title="International E.164 format starting with '+' (e.g. +14155552671)"
              />
              <span className="field-hint">Include your country code.</span>
            </div>

            {role === "user" && (
              <div className="form-group">
                <label htmlFor="pf-dob">
                  Date of Birth (Age &ge; 18)
                </label>
                <input
                  id="pf-dob"
                  type="date"
                  value={personalForm.date_of_birth}
                  onChange={(e) => setPersonalForm({ ...personalForm, date_of_birth: e.target.value })}
                />
                <span className="field-hint">Used for eligibility checks.</span>
              </div>
            )}
          </div>

          <div className="profile-action-bar">
            <button
              type="submit"
              className="btn-primary"
              disabled={savingPersonal || !isPersonalDirty}
            >
              <Save size={16} aria-hidden="true" /> {savingPersonal ? "Saving" : "Save changes"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleDiscardPersonal}
              disabled={savingPersonal || !isPersonalDirty}
            >
              <RotateCcw size={15} aria-hidden="true" /> Discard
            </button>
          </div>
        </form>
      )}

      {/* Tab 2: Security & Password */}
      {activeTab === "security" && (
        <form className="profile-form-section" onSubmit={handleSavePassword}>
          <div className="section-intro">
            <h3>Password & Authentication Security</h3>
            <p>Safeguard your account with a strong, distinct password.</p>
          </div>

          <div className="security-card">
            <div className="form-group">
              <label htmlFor="current-pwd">
                Current Password <span className="req-star">*</span>
              </label>
              <div className="password-input-wrapper">
                <input
                  id="current-pwd"
                  type={showCurrentPassword ? "text" : "password"}
                  value={passwordForm.current_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                  placeholder="Enter your current password"
                  required
                />
                <button
                  type="button"
                  className="pwd-toggle-btn"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  aria-label="Toggle password visibility"
                >
                  {showCurrentPassword ? " Hide" : " Show"}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="new-pwd">
                New Password <span className="req-star">*</span>
              </label>
              <div className="password-input-wrapper">
                <input
                  id="new-pwd"
                  type={showNewPassword ? "text" : "password"}
                  value={passwordForm.new_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                  placeholder="Create a strong new password"
                  required
                />
                <button
                  type="button"
                  className="pwd-toggle-btn"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  aria-label="Toggle password visibility"
                >
                  {showNewPassword ? " Hide" : " Show"}
                </button>
              </div>
            </div>

            {/* Password Strength Checklist */}
            <div className="pwd-strength-container">
              <span className="pwd-strength-title">Security Requirements:</span>
              <div className="pwd-checklist">
                <div className={`pwd-check-item ${hasMinLength ? "passed" : "failed"}`}>
                  <span>{hasMinLength ? "✓" : "○"}</span> At least 8 characters
                </div>
                <div className={`pwd-check-item ${hasUpper ? "passed" : "failed"}`}>
                  <span>{hasUpper ? "✓" : "○"}</span> One uppercase letter (A-Z)
                </div>
                <div className={`pwd-check-item ${hasLower ? "passed" : "failed"}`}>
                  <span>{hasLower ? "✓" : "○"}</span> One lowercase letter (a-z)
                </div>
                <div className={`pwd-check-item ${hasNumberOrSpecial ? "passed" : "failed"}`}>
                  <span>{hasNumberOrSpecial ? "✓" : "○"}</span> One number or special symbol
                </div>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: "16px" }}>
              <label htmlFor="confirm-pwd">
                Confirm New Password <span className="req-star">*</span>
              </label>
              <div className="password-input-wrapper">
                <input
                  id="confirm-pwd"
                  type={showConfirmPassword ? "text" : "password"}
                  value={passwordForm.confirm_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                  placeholder="Re-type new password"
                  required
                />
                <button
                  type="button"
                  className="pwd-toggle-btn"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label="Toggle password visibility"
                >
                  {showConfirmPassword ? " Hide" : " Show"}
                </button>
              </div>
              {passwordForm.confirm_password && (
                <span className={`field-hint ${passwordsMatch ? "text-success" : "text-danger"}`}>
                  {passwordsMatch ? "✓ Passwords match" : "✗ Passwords do not match"}
                </span>
              )}
            </div>
          </div>

          <div className="profile-action-bar">
            <button
              type="submit"
              className="btn-primary"
              disabled={
                savingPassword ||
                !passwordForm.current_password ||
                !isPasswordValid
              }
            >
              {savingPassword ? "Updating Password…" : "Update Password"}
            </button>
          </div>
        </form>
      )}

      {/* Tab 3: Organization & System */}
      {activeTab === "organization" && (
        <form className="profile-form-section" onSubmit={handleSaveOrg}>
          <div className="section-intro">
            <h3>Enterprise Organization & System Metadata</h3>
            <p>Manage organization affiliation and view administrative credentials.</p>
          </div>

          {role === "organization_admin" && (
            <>
              {isOrgDirty && (
                <div className="profile-unsaved-banner">
                  <span> Unsaved organization changes.</span>
                  <button type="submit" className="btn-primary-small" disabled={savingOrg}>
                    {savingOrg ? "Saving…" : "Save Organization"}
                  </button>
                </div>
              )}

              <div className="profile-grid">
                <div className="form-group">
                  <label htmlFor="org-name">
                    Organization Legal Name <span className="req-star">*</span>
                  </label>
                  <input
                    id="org-name"
                    type="text"
                    value={orgForm.organization_name}
                    onChange={(e) => setOrgForm({ ...orgForm, organization_name: e.target.value })}
                    placeholder="e.g. Apex Healthcare"
                    required
                  />
                  <span className="field-hint">The displayed tenant name across all applicant forms and dashboards.</span>
                </div>

                <div className="form-group">
                  <label htmlFor="org-scope-id">Organization Identifier (Scope)</label>
                  <input
                    id="org-scope-id"
                    type="text"
                    value={user?.organization_id ? `ORG-${user.organization_id}` : "Global"}
                    readOnly
                    className="input-readonly"
                  />
                  <span className="field-hint">Internal system ID (immutable).</span>
                </div>

                <div className="form-group">
                  <label htmlFor="admin-id-badge">Administrator Identifier</label>
                  <input
                    id="admin-id-badge"
                    type="text"
                    value={user?.admin_id || "N/A"}
                    readOnly
                    className="input-readonly"
                  />
                  <span className="field-hint">Your unique credential used to sign into the Admin Portal.</span>
                </div>
              </div>

              <div className="profile-action-bar">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={savingOrg || !isOrgDirty}
                >
                  {savingOrg ? "Updating Organization…" : "Save Organization Details"}
                </button>
              </div>
            </>
          )}

          {role === "super_admin" && (
            <>
              {isOrgDirty && (
                <div className="profile-unsaved-banner">
                  <span> Unsaved super-admin settings.</span>
                  <button type="submit" className="btn-primary-small" disabled={savingOrg}>
                    {savingOrg ? "Saving…" : "Save Settings"}
                  </button>
                </div>
              )}

              <div className="profile-grid">
                <div className="form-group">
                  <label htmlFor="super-admin-id">Super Admin Console ID</label>
                  <input
                    id="super-admin-id"
                    type="text"
                    value={user?.admin_id || "superadmin"}
                    readOnly
                    className="input-readonly"
                  />
                  <span className="field-hint">Bootstrap identity identifier (system root).</span>
                </div>

                <div className="form-group">
                  <label htmlFor="recovery-email">
                    Emergency Recovery Email
                  </label>
                  <input
                    id="recovery-email"
                    type="email"
                    value={orgForm.recovery_email}
                    onChange={(e) => setOrgForm({ ...orgForm, recovery_email: e.target.value })}
                    placeholder="e.g. security@yourdomain.com"
                    pattern="^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
                  />
                  <span className="field-hint">Target address for emergency root password reset dispatch.</span>
                </div>
              </div>

              <div className="profile-action-bar">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={savingOrg || !isOrgDirty}
                >
                  {savingOrg ? "Saving Settings…" : "Save Recovery Email"}
                </button>
              </div>
            </>
          )}

          {role === "user" && (
            <div className="profile-grid">
              <div className="form-group">
                <label>Assigned Organization</label>
                <input
                  type="text"
                  value={user?.organization_name || "Independent (Self-Registered)"}
                  readOnly
                  className="input-readonly"
                />
                <span className="field-hint">The institution governing your applicant profile and submissions.</span>
              </div>

              <div className="form-group">
                <label>Applicant Account ID</label>
                <input
                  type="text"
                  value={`USR-${user?.id || "N/A"}`}
                  readOnly
                  className="input-readonly"
                />
                <span className="field-hint">Your unique internal applicant sequence record.</span>
              </div>

              <div className="form-group">
                <label>Account Role Level</label>
                <input
                  type="text"
                  value="Applicant / Form Respondent"
                  readOnly
                  className="input-readonly"
                />
              </div>

              <div className="form-group">
                <label>Registration Timestamp</label>
                <input
                  type="text"
                  value={user?.created_at ? new Date(user.created_at).toLocaleString() : "N/A"}
                  readOnly
                  className="input-readonly"
                />
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
