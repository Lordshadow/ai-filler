import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch } from "./api";
import ProfileEditor from "./ProfileEditor";
import "./Auth.css";

export default function UserPanel() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("forms"); // "forms" | "profile"

  // Forms state
  const [forms, setForms] = useState([]);
  const [loadingForms, setLoadingForms] = useState(true);
  const [activeForm, setActiveForm] = useState(null);
  const [formData, setFormData] = useState({});
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(null);
  const [submissionError, setSubmissionError] = useState("");

  const navigate = useNavigate();

  const fetchUser = useCallback(async () => {
    try {
      const response = await authFetch("/auth/me");
      if (!response.ok) {
        navigate("/login");
        return;
      }
      const data = await response.json();
      setUser(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  const fetchForms = useCallback(async () => {
    try {
      const response = await authFetch("/forms");
      if (response.ok) {
        const data = await response.json();
        setForms(data.forms || []);
      }
    } catch (err) {
      console.error("Failed to fetch available forms:", err);
    } finally {
      setLoadingForms(false);
    }
  }, []);

  const handleRefreshForms = async () => {
    setLoadingForms(true);
    await fetchForms();
  };

  useEffect(() => {
    fetchUser();
    fetchForms();
  }, [fetchUser, fetchForms]);

  const handleLogout = async () => {
    try {
      const response = await authFetch("/auth/logout", {
        method: "POST",
      });

      if (response.ok) {
        localStorage.removeItem("userKind");
        navigate("/login");
      } else {
        setError("Logout failed");
      }
    } catch {
      setError("Logout failed");
    }
  };

  const handleStartForm = (form) => {
    setActiveForm(form);
    setSubmissionSuccess(null);
    setSubmissionError("");
    const initialData = {};
    (form.fields || []).forEach((field) => {
      const key = field.fieldKey || field.name;
      initialData[key] = field.type === "checkbox" ? false : "";
    });
    setFormData(initialData);
  };

  const handleCancelForm = () => {
    setActiveForm(null);
    setSubmissionSuccess(null);
    setSubmissionError("");
    setFormData({});
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    setSubmissionError("");
    setSubmissionSuccess(null);

    // Client-side validations
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    for (const field of activeForm.fields || []) {
      const key = field.fieldKey || field.name;
      const val = formData[key];

      if (field.required && (val === undefined || val === "" || val === null)) {
        setSubmissionError(`Question '${field.label}' is required.`);
        return;
      }

      if (field.type === "email" && val) {
        const strVal = String(val).trim();
        if (!strVal.includes("@") || !emailRegex.test(strVal)) {
          setSubmissionError(`Question '${field.label}' must be a valid email containing '@' and a domain (e.g. name@example.com).`);
          return;
        }
      }

      if (field.validation?.regex && val) {
        try {
          const reg = new RegExp(field.validation.regex);
          if (!reg.test(String(val))) {
            setSubmissionError(`Question '${field.label}' does not match required format.`);
            return;
          }
        } catch {
          // ignore malformed regex
        }
      }
    }

    setFormSubmitting(true);
    try {
      const idempotencyKey = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `sub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const response = await authFetch("/applications", {
        method: "POST",
        headers: {
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          form_id: activeForm.formId,
          form_version: activeForm.version,
          data: formData,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || "Submission failed. Please verify your entries.");
      }

      setSubmissionSuccess({
        applicationId: result.application?.applicationId || result.applicationId,
        submittedAt: result.application?.submittedAt || new Date().toISOString(),
      });
    } catch (err) {
      setSubmissionError(err.message || "Failed to submit application.");
    } finally {
      setFormSubmitting(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  return (
    <div className="panel-container">
      {/* Top Application Navigation */}
      <nav className="page-nav" style={{ marginBottom: "24px" }}>
        <button
          className={activeTab === "forms" ? "selected" : ""}
          onClick={() => {
            setActiveTab("forms");
            setActiveForm(null);
          }}
        >
          Available Forms
        </button>
        <button onClick={() => navigate("/voice")}>Voice Transcriber</button>
        <button onClick={() => navigate("/documents")}>Document Extraction</button>
        <button
          className={activeTab === "profile" ? "selected" : ""}
          onClick={() => {
            setActiveTab("profile");
            setActiveForm(null);
          }}
          style={{ marginLeft: "auto" }}
        >
          My Profile
        </button>
      </nav>

      {/* Header with Title and Logout */}
      <div className="panel-header">
        <div>
          <h1>User Portal</h1>
          <span style={{ color: "#64748b", fontSize: "14px" }}>
            Welcome, {user?.full_name || "Applicant"} ({user?.email})
          </span>
        </div>
        <button className="btn-logout" onClick={handleLogout}>
          Logout
        </button>
      </div>

      {/* Available Forms View */}
      {activeTab === "forms" && !activeForm && (
        <div className="panel-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h2 style={{ margin: "0 0 4px 0", fontSize: "20px", color: "#1e293b" }}>
                Available Forms
              </h2>
              <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
                Browse and fill out published forms.
              </p>
            </div>
            <button
              className="btn-secondary"
              onClick={handleRefreshForms}
              disabled={loadingForms}
              style={{ padding: "8px 16px", fontSize: "13px" }}
            >
              {loadingForms ? "Refreshing…" : "↻ Refresh Forms"}
            </button>
          </div>

          {forms.length === 0 ? (
            <div className="no-forms-card">
              <div className="no-forms-icon">📋</div>
              <h3>No form available in the UI</h3>
              <p>
                There are currently no published forms available for you to complete.
                When an administrator publishes a form, it will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="forms-grid">
              {forms.map((form) => (
                <div key={form.formId} className="user-form-card">
                  <div>
                    <div className="form-card-header">
                      <h4>{form.title}</h4>
                      <span className="badge-published">Published (v{form.version})</span>
                    </div>
                    <p className="form-card-desc">
                      {form.description || "No description provided."}
                    </p>
                  </div>
                  <div>
                    <div className="form-card-meta">
                      <span>📝 {form.fields?.length || 0} Questions</span>
                      <span>ID: <code>{form.formId}</code></span>
                    </div>
                    <button
                      className="btn-primary"
                      style={{ width: "100%" }}
                      onClick={() => handleStartForm(form)}
                    >
                      Fill Form →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Interactive Form Filler */}
      {activeTab === "forms" && activeForm && (
        <div className="panel-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div>
              <button
                className="btn-secondary"
                onClick={handleCancelForm}
                style={{ padding: "6px 14px", fontSize: "13px", marginBottom: "10px" }}
              >
                ← Back to Available Forms
              </button>
              <h2 style={{ margin: "0 0 6px 0", fontSize: "22px", color: "#1e293b" }}>
                {activeForm.title}
              </h2>
              <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
                {activeForm.description || "Complete all required fields and submit your application."}
              </p>
            </div>
            <span className="badge-published" style={{ alignSelf: "flex-start" }}>
              v{activeForm.version}
            </span>
          </div>

          {submissionSuccess ? (
            <div className="info-card" style={{ background: "#f0fdf4", borderColor: "#22c55e", padding: "24px" }}>
              <div style={{ fontSize: "36px", marginBottom: "8px" }}>✅</div>
              <h3 style={{ margin: "0 0 8px 0", color: "#15803d" }}>Application Submitted Successfully!</h3>
              <p style={{ margin: "0 0 16px 0", color: "#166534" }}>
                Your submission has been received and recorded under reference ID:
                <br />
                <strong><code>{submissionSuccess.applicationId}</code></strong>
              </p>
              <div style={{ display: "flex", gap: "12px" }}>
                <button className="btn-primary" onClick={handleCancelForm}>
                  Return to Forms List
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    handleStartForm(activeForm);
                  }}
                >
                  Submit Another Response
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitForm} className="user-form-filler">
              {submissionError && (
                <div className="error-message" role="alert" style={{ marginBottom: "20px" }}>
                  {submissionError}
                </div>
              )}

              {(activeForm.fields || []).map((field, idx) => {
                const key = field.fieldKey || field.name;
                const value = formData[key] ?? "";

                return (
                  <div key={idx} className="user-form-field">
                    <label htmlFor={`field-${idx}`}>
                      {field.label}
                      {field.required && <span className="req-star">*</span>}
                    </label>

                    {field.type === "dropdown" ? (
                      <select
                        id={`field-${idx}`}
                        value={value}
                        required={field.required}
                        onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                      >
                        <option value="">-- Select an option --</option>
                        {(field.validation?.options || []).map((opt, oIdx) => (
                          <option key={oIdx} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : field.type === "checkbox" ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <input
                          id={`field-${idx}`}
                          type="checkbox"
                          checked={Boolean(formData[key])}
                          onChange={(e) => setFormData({ ...formData, [key]: e.target.checked })}
                        />
                        <span style={{ fontSize: "14px", color: "#64748b" }}>{field.label}</span>
                      </div>
                    ) : field.type === "email" ? (
                      <input
                        id={`field-${idx}`}
                        type="email"
                        placeholder="name@example.com"
                        value={value}
                        required={field.required}
                        pattern="^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
                        title="Must be a valid email containing '@' and a domain"
                        onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                      />
                    ) : field.type === "number" ? (
                      <input
                        id={`field-${idx}`}
                        type="number"
                        placeholder="Enter number"
                        value={value}
                        required={field.required}
                        min={field.validation?.min}
                        max={field.validation?.max}
                        onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                      />
                    ) : field.type === "date" ? (
                      <input
                        id={`field-${idx}`}
                        type="date"
                        value={value}
                        required={field.required}
                        onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                      />
                    ) : (
                      <input
                        id={`field-${idx}`}
                        type="text"
                        placeholder={`Enter ${field.label.toLowerCase()}`}
                        value={value}
                        required={field.required}
                        pattern={field.validation?.regex}
                        onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                      />
                    )}
                  </div>
                );
              })}

              <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={formSubmitting}
                  style={{ padding: "12px 28px" }}
                >
                  {formSubmitting ? "Submitting Application…" : "Submit Application"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={formSubmitting}
                  onClick={handleCancelForm}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Profile Details Tab */}
      {activeTab === "profile" && (
        <>
          <div style={{ marginBottom: "24px" }}>
            <ProfileEditor
              user={user}
              onProfileUpdated={(updated) => setUser(updated)}
              role="user"
            />
          </div>

          <div className="panel-section">
            <h3>Document Management</h3>
            <p>Access your uploaded files, OCR text, and processing history.</p>
            <button className="btn-primary" onClick={() => navigate("/documents")}>
              Go to Documents
            </button>
          </div>

          <div className="panel-section">
            <h3>Voice Transcriber</h3>
            <p>Record speech with Whisper AI to generate formatted applications.</p>
            <button className="btn-primary" onClick={() => navigate("/voice")}>
              Go to Voice
            </button>
          </div>
        </>
      )}
    </div>
  );
}
