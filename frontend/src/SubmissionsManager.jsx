import { useEffect, useState, useMemo } from "react";
import { authFetch } from "./api";
import "./Auth.css";

const STATUS_CONFIG = {
  SUBMITTED: { label: "Submitted", color: "#2563eb", bg: "#eff6ff", dot: "#3b82f6" },
  UNDER_REVIEW: { label: "Under Review", color: "#d97706", bg: "#fffbeb", dot: "#f59e0b" },
  APPROVED: { label: "Approved", color: "#16a34a", bg: "#f0fdf4", dot: "#22c55e" },
  REJECTED: { label: "Rejected", color: "#dc2626", bg: "#fef2f2", dot: "#ef4444" },
};

export default function SubmissionsManager() {
  const [submissions, setSubmissions] = useState([]);
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSub, setSelectedSub] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusSuccessMsg, setStatusSuccessMsg] = useState("");

  // Filters & Controls
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedFormId, setSelectedFormId] = useState("ALL");
  const [viewMode, setViewMode] = useState("grouped"); // "grouped" | "table"
  const [sortOrder, setSortOrder] = useState("desc"); // "desc" (newest) | "asc" (oldest)

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const [subsRes, formsRes] = await Promise.all([
        authFetch("/applications"),
        authFetch("/forms"),
      ]);

      if (subsRes.ok) {
        const subsData = await subsRes.json();
        setSubmissions(subsData.applications || []);
      } else {
        throw new Error("Failed to load submissions.");
      }

      if (formsRes.ok) {
        const formsData = await formsRes.json();
        setForms(formsData.forms || []);
      }
    } catch (err) {
      setError(err.message || "Failed to load submissions data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Update status handler
  const handleUpdateStatus = async (appId, newStatus) => {
    setUpdatingStatus(true);
    setStatusSuccessMsg("");
    try {
      const res = await authFetch(`/applications/${appId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to update status.");
      }

      const data = await res.json();
      const updatedApp = data.application;

      // Update local state
      setSubmissions((prev) =>
        prev.map((s) => (s.applicationId === appId ? { ...s, status: updatedApp.status } : s))
      );
      if (selectedSub && selectedSub.applicationId === appId) {
        setSelectedSub((prev) => ({ ...prev, status: updatedApp.status }));
      }
      setStatusSuccessMsg(`Status updated to ${newStatus}!`);
      setTimeout(() => setStatusSuccessMsg(""), 3000);
    } catch (err) {
      alert(`Error updating status: ${err.message}`);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Metrics computation
  const metrics = useMemo(() => {
    const total = submissions.length;
    const submitted = submissions.filter((s) => s.status === "SUBMITTED").length;
    const underReview = submissions.filter((s) => s.status === "UNDER_REVIEW").length;
    const approved = submissions.filter((s) => s.status === "APPROVED").length;
    const rejected = submissions.filter((s) => s.status === "REJECTED").length;
    return { total, submitted, underReview, approved, rejected };
  }, [submissions]);

  // Filtered & sorted submissions
  const filteredSubmissions = useMemo(() => {
    return submissions
      .filter((sub) => {
        // Status filter
        if (statusFilter !== "ALL" && sub.status !== statusFilter) return false;

        // Form filter
        if (selectedFormId !== "ALL" && sub.formId !== selectedFormId) return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const idMatch = sub.applicationId?.toLowerCase().includes(q);
          const formMatch = sub.formTitle?.toLowerCase().includes(q) || sub.formId?.toLowerCase().includes(q);
          const userMatch = sub.userEmail?.toLowerCase().includes(q) || sub.userName?.toLowerCase().includes(q);
          const dataMatch = JSON.stringify(sub.data || {}).toLowerCase().includes(q);
          if (!idMatch && !formMatch && !userMatch && !dataMatch) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const timeA = new Date(a.submittedAt || 0).getTime();
        const timeB = new Date(b.submittedAt || 0).getTime();
        return sortOrder === "desc" ? timeB - timeA : timeA - timeB;
      });
  }, [submissions, statusFilter, selectedFormId, searchQuery, sortOrder]);

  // Grouped by Form structure
  const groupedByForm = useMemo(() => {
    const groups = {};
    for (const sub of filteredSubmissions) {
      const key = sub.formId || "unknown";
      if (!groups[key]) {
        groups[key] = {
          formId: key,
          formTitle: sub.formTitle || key,
          items: [],
        };
      }
      groups[key].items.push(sub);
    }
    return Object.values(groups);
  }, [filteredSubmissions]);

  // CSV Export handler
  const handleExportCSV = () => {
    if (filteredSubmissions.length === 0) return;
    const headers = ["Application ID", "Form ID", "Form Title", "Applicant Name", "Applicant Email", "Status", "Submitted At", "Answers"];
    const rows = filteredSubmissions.map((s) => [
      s.applicationId,
      s.formId,
      `"${(s.formTitle || "").replace(/"/g, '""')}"`,
      `"${(s.userName || "").replace(/"/g, '""')}"`,
      s.userEmail || "",
      s.status,
      s.submittedAt,
      `"${JSON.stringify(s.data || {}).replace(/"/g, '""')}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `submissions_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper to find question label
  const getFieldLabel = (formId, fieldKey) => {
    const form = forms.find((f) => f.formId === formId);
    if (!form || !form.fields) return fieldKey;
    const field = form.fields.find((f) => (f.fieldKey || f.name) === fieldKey);
    return field ? field.label : fieldKey;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text);
    alert(`Copied "${text}" to clipboard!`);
  };

  return (
    <div className="submissions-manager">
      {/* ── 1. Header & Quick Actions ── */}
      <div className="sub-header-bar">
        <div>
          <h2 style={{ margin: "0 0 4px 0", fontSize: "22px", color: "#1e293b" }}>
            Form Submissions & Applications
          </h2>
          <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
            Monitor, inspect, and review submitted forms in real time.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button className="btn-secondary" onClick={fetchData} disabled={loading} style={{ fontSize: "13px" }}>
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
          <button
            className="btn-primary"
            onClick={handleExportCSV}
            disabled={filteredSubmissions.length === 0}
            style={{ fontSize: "13px", padding: "8px 16px" }}
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      {error && <div className="error-message" role="alert">{error}</div>}

      {/* ── 2. Metric KPI Cards ── */}
      <div className="sub-metrics-grid">
        <div className="sub-metric-card">
          <span className="sub-metric-label">Total Submissions</span>
          <span className="sub-metric-val">{metrics.total}</span>
        </div>
        <div className="sub-metric-card" style={{ borderLeft: "4px solid #3b82f6" }}>
          <span className="sub-metric-label">Submitted (New)</span>
          <span className="sub-metric-val" style={{ color: "#2563eb" }}>{metrics.submitted}</span>
        </div>
        <div className="sub-metric-card" style={{ borderLeft: "4px solid #f59e0b" }}>
          <span className="sub-metric-label">Under Review</span>
          <span className="sub-metric-val" style={{ color: "#d97706" }}>{metrics.underReview}</span>
        </div>
        <div className="sub-metric-card" style={{ borderLeft: "4px solid #22c55e" }}>
          <span className="sub-metric-label">Approved</span>
          <span className="sub-metric-val" style={{ color: "#16a34a" }}>{metrics.approved}</span>
        </div>
        <div className="sub-metric-card" style={{ borderLeft: "4px solid #ef4444" }}>
          <span className="sub-metric-label">Rejected</span>
          <span className="sub-metric-val" style={{ color: "#dc2626" }}>{metrics.rejected}</span>
        </div>
      </div>

      {/* ── 3. Filter Bar & View Toggles ── */}
      <div className="sub-filter-card">
        {/* Search */}
        <div style={{ flex: "1 1 240px" }}>
          <input
            type="text"
            className="sub-search-input"
            placeholder="🔍 Search by ID, form name, applicant email, or answer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filter by Form */}
        <div>
          <select
            className="sub-select"
            value={selectedFormId}
            onChange={(e) => setSelectedFormId(e.target.value)}
          >
            <option value="ALL">All Forms ({submissions.length})</option>
            {forms.map((f) => {
              const count = submissions.filter((s) => s.formId === f.formId).length;
              return (
                <option key={f.formId} value={f.formId}>
                  {f.title} ({count})
                </option>
              );
            })}
          </select>
        </div>

        {/* Filter by Status */}
        <div>
          <select
            className="sub-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>

        {/* Sort Order */}
        <div>
          <select
            className="sub-select"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          >
            <option value="desc">Newest First</option>
            <option value="asc">Oldest First</option>
          </select>
        </div>

        {/* View Mode Toggle: Grouped vs Table */}
        <div className="sub-view-toggles">
          <button
            type="button"
            className={`sub-view-btn ${viewMode === "grouped" ? "active" : ""}`}
            onClick={() => setViewMode("grouped")}
            title="Group by Form"
          >
            📑 Form Order
          </button>
          <button
            type="button"
            className={`sub-view-btn ${viewMode === "table" ? "active" : ""}`}
            onClick={() => setViewMode("table")}
            title="Standard Table Grid"
          >
            📊 Flat Table
          </button>
        </div>
      </div>

      {/* ── 4. Content Area ── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#64748b" }}>
          Loading filled form submissions...
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="no-forms-card">
          <div className="no-forms-icon">📥</div>
          <h3>No Form Submissions Found</h3>
          <p>
            {submissions.length === 0
              ? "There are currently no filled form responses. Once applicants complete published forms, their submissions will appear here in chronological order."
              : "No submissions match your active filter criteria. Try clearing your search query or status filter."}
          </p>
        </div>
      ) : viewMode === "grouped" ? (
        /* ── View A: Grouped by Form Order ── */
        <div className="sub-groups-container">
          {groupedByForm.map((group) => (
            <div key={group.formId} className="sub-group-card">
              <div className="sub-group-header">
                <div>
                  <h3 style={{ margin: "0 0 4px 0", fontSize: "18px", color: "#1e293b" }}>
                    📋 {group.formTitle}
                  </h3>
                  <span style={{ fontSize: "12px", color: "#64748b" }}>
                    Form ID: <code>{group.formId}</code>
                  </span>
                </div>
                <span className="badge-published" style={{ background: "#e0e7ff", color: "#3730a3" }}>
                  {group.items.length} {group.items.length === 1 ? "Submission" : "Submissions"}
                </span>
              </div>

              <div className="sub-table-wrapper">
                <table className="sub-table">
                  <thead>
                    <tr>
                      <th>Reference ID</th>
                      <th>Applicant</th>
                      <th>Submitted Date</th>
                      <th>Status</th>
                      <th>Key Answers Preview</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((sub) => {
                      const cfg = STATUS_CONFIG[sub.status] || STATUS_CONFIG.SUBMITTED;
                      const answerKeys = Object.keys(sub.data || {});
                      const previewStr = answerKeys
                        .slice(0, 2)
                        .map((k) => `${getFieldLabel(sub.formId, k)}: ${sub.data[k]}`)
                        .join(" | ");

                      return (
                        <tr
                          key={sub.applicationId}
                          className="sub-row-interactive"
                          onClick={() => setSelectedSub(sub)}
                        >
                          <td>
                            <code className="sub-id-pill" title="Click to inspect">
                              {sub.applicationId}
                            </code>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: "#1e293b", fontSize: "13px" }}>
                              {sub.userName || "Applicant"}
                            </div>
                            <div style={{ fontSize: "12px", color: "#64748b" }}>
                              {sub.userEmail || "No email"}
                            </div>
                          </td>
                          <td style={{ fontSize: "13px", color: "#475569", whiteSpace: "nowrap" }}>
                            {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : "N/A"}
                          </td>
                          <td>
                            <span
                              className="sub-status-pill"
                              style={{ background: cfg.bg, color: cfg.color }}
                            >
                              <span
                                className="sub-status-dot"
                                style={{ background: cfg.dot }}
                              />
                              {cfg.label}
                            </span>
                          </td>
                          <td style={{ fontSize: "13px", color: "#64748b", maxWidth: "260px" }}>
                            <div className="sub-preview-text">
                              {previewStr || "Empty response"}
                            </div>
                          </td>
                          <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: "inline-flex", gap: "6px" }}>
                              <select
                                className="sub-inline-status"
                                value={sub.status}
                                onChange={(e) => handleUpdateStatus(sub.applicationId, e.target.value)}
                              >
                                <option value="SUBMITTED">Submitted</option>
                                <option value="UNDER_REVIEW">Under Review</option>
                                <option value="APPROVED">Approved</option>
                                <option value="REJECTED">Rejected</option>
                              </select>
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ padding: "4px 10px", fontSize: "12px" }}
                                onClick={() => setSelectedSub(sub)}
                              >
                                Inspect
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── View B: Flat Tabular Grid View ── */
        <div className="sub-table-wrapper" style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <table className="sub-table">
            <thead>
              <tr>
                <th>Reference ID</th>
                <th>Target Form</th>
                <th>Applicant</th>
                <th>Submitted Date</th>
                <th>Status</th>
                <th>Key Answers</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSubmissions.map((sub) => {
                const cfg = STATUS_CONFIG[sub.status] || STATUS_CONFIG.SUBMITTED;
                const answerKeys = Object.keys(sub.data || {});
                const previewStr = answerKeys
                  .slice(0, 2)
                  .map((k) => `${getFieldLabel(sub.formId, k)}: ${sub.data[k]}`)
                  .join(" | ");

                return (
                  <tr
                    key={sub.applicationId}
                    className="sub-row-interactive"
                    onClick={() => setSelectedSub(sub)}
                  >
                    <td>
                      <code className="sub-id-pill">{sub.applicationId}</code>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: "#1e293b", fontSize: "13px" }}>
                        {sub.formTitle || sub.formId}
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>v{sub.formVersion}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: "#1e293b", fontSize: "13px" }}>
                        {sub.userName || "Applicant"}
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>
                        {sub.userEmail || "No email"}
                      </div>
                    </td>
                    <td style={{ fontSize: "13px", color: "#475569", whiteSpace: "nowrap" }}>
                      {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : "N/A"}
                    </td>
                    <td>
                      <span
                        className="sub-status-pill"
                        style={{ background: cfg.bg, color: cfg.color }}
                      >
                        <span className="sub-status-dot" style={{ background: cfg.dot }} />
                        {cfg.label}
                      </span>
                    </td>
                    <td style={{ fontSize: "13px", color: "#64748b", maxWidth: "260px" }}>
                      <div className="sub-preview-text">{previewStr || "Empty response"}</div>
                    </td>
                    <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "inline-flex", gap: "6px" }}>
                        <select
                          className="sub-inline-status"
                          value={sub.status}
                          onChange={(e) => handleUpdateStatus(sub.applicationId, e.target.value)}
                        >
                          <option value="SUBMITTED">Submitted</option>
                          <option value="UNDER_REVIEW">Under Review</option>
                          <option value="APPROVED">Approved</option>
                          <option value="REJECTED">Rejected</option>
                        </select>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: "4px 10px", fontSize: "12px" }}
                          onClick={() => setSelectedSub(sub)}
                        >
                          Inspect
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 5. Slide-Out Details Drawer (Airtable / Typeform style) ── */}
      {selectedSub && (
        <div className="sub-drawer-overlay" onClick={() => setSelectedSub(null)}>
          <div className="sub-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="sub-drawer-header">
              <div>
                <span style={{ fontSize: "12px", color: "#6366f1", fontWeight: 700, textTransform: "uppercase" }}>
                  Submission Inspector
                </span>
                <h3 style={{ margin: "4px 0 0 0", fontSize: "20px", color: "#1e293b" }}>
                  {selectedSub.formTitle || selectedSub.formId}
                </h3>
              </div>
              <button
                type="button"
                className="sub-close-btn"
                onClick={() => setSelectedSub(null)}
                title="Close drawer"
              >
                ✕
              </button>
            </div>

            <div className="sub-drawer-body">
              {statusSuccessMsg && (
                <div className="info-card" style={{ marginBottom: "16px", color: "#15803d", background: "#f0fdf4" }}>
                  {statusSuccessMsg}
                </div>
              )}

              {/* Status Action Card */}
              <div className="sub-drawer-section">
                <span className="sub-section-title">Review Lifecycle Status</span>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "8px" }}>
                  <select
                    className="sub-select"
                    style={{ flex: 1, padding: "8px 12px" }}
                    value={selectedSub.status}
                    disabled={updatingStatus}
                    onChange={(e) => handleUpdateStatus(selectedSub.applicationId, e.target.value)}
                  >
                    <option value="SUBMITTED">Submitted (New)</option>
                    <option value="UNDER_REVIEW">Under Review</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                  <span
                    className="sub-status-pill"
                    style={{
                      background: STATUS_CONFIG[selectedSub.status]?.bg || "#f1f5f9",
                      color: STATUS_CONFIG[selectedSub.status]?.color || "#334155",
                    }}
                  >
                    <span
                      className="sub-status-dot"
                      style={{ background: STATUS_CONFIG[selectedSub.status]?.dot || "#94a3b8" }}
                    />
                    {STATUS_CONFIG[selectedSub.status]?.label || selectedSub.status}
                  </span>
                </div>
              </div>

              {/* Submission Meta Card */}
              <div className="sub-drawer-section">
                <span className="sub-section-title">Submission Metadata</span>
                <div className="sub-meta-grid">
                  <div>
                    <strong style={{ color: "#475569", fontSize: "12px" }}>Reference ID</strong>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                      <code style={{ fontSize: "12px" }}>{selectedSub.applicationId}</code>
                      <button
                        type="button"
                        style={{ border: "none", background: "none", cursor: "pointer", fontSize: "12px" }}
                        onClick={() => copyToClipboard(selectedSub.applicationId)}
                        title="Copy ID"
                      >
                        📋
                      </button>
                    </div>
                  </div>
                  <div>
                    <strong style={{ color: "#475569", fontSize: "12px" }}>Form Version</strong>
                    <div style={{ marginTop: "2px", fontSize: "13px" }}>v{selectedSub.formVersion}</div>
                  </div>
                  <div>
                    <strong style={{ color: "#475569", fontSize: "12px" }}>Submitted By</strong>
                    <div style={{ marginTop: "2px", fontSize: "13px" }}>
                      {selectedSub.userName || "Applicant"} ({selectedSub.userEmail || "No email"})
                    </div>
                  </div>
                  <div>
                    <strong style={{ color: "#475569", fontSize: "12px" }}>Submission Timestamp</strong>
                    <div style={{ marginTop: "2px", fontSize: "13px" }}>
                      {selectedSub.submittedAt ? new Date(selectedSub.submittedAt).toLocaleString() : "N/A"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Answers Breakdown */}
              <div className="sub-drawer-section">
                <span className="sub-section-title">Submitted Responses</span>
                <div className="sub-answers-list">
                  {Object.keys(selectedSub.data || {}).length === 0 ? (
                    <p style={{ color: "#94a3b8", fontSize: "14px" }}>No answers submitted in this record.</p>
                  ) : (
                    Object.entries(selectedSub.data).map(([key, val], idx) => {
                      const label = getFieldLabel(selectedSub.formId, key);
                      const displayVal = typeof val === "boolean" ? (val ? "Yes" : "No") : Array.isArray(val) ? val.join(", ") : String(val);

                      return (
                        <div key={idx} className="sub-answer-item">
                          <div className="sub-answer-label">
                            {label}
                            {key !== label && (
                              <span style={{ fontSize: "11px", color: "#94a3b8", marginLeft: "6px" }}>
                                ({key})
                              </span>
                            )}
                          </div>
                          <div className="sub-answer-value">
                            {displayVal || <em style={{ color: "#94a3b8" }}>Empty</em>}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => copyToClipboard(JSON.stringify(selectedSub, null, 2))}
                >
                  📋 Copy JSON
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ flex: 1 }}
                  onClick={() => setSelectedSub(null)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
