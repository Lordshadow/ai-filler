import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, FileText, Inbox, LogOut, Send, UserRound, FileUp, RefreshCw, Mic, RotateCcw } from "lucide-react";
import { authFetch } from "./api";
import ProfileEditor from "./ProfileEditor";
import VoiceFormAssistant from "./VoiceFormAssistant";
import "./Auth.css";

const USER_STATUS_CONFIG = {
  SUBMITTED: {
    label: "Submitted",
    desc: "Your form has been received and is queued for administrator review.",
    color: "#e4e4e7",
    bg: "rgba(255, 255, 255, 0.08)",
    border: "rgba(255, 255, 255, 0.22)",
    dot: "#ffffff",
    step: 1,
  },
  UNDER_REVIEW: {
    label: "Under Review",
    desc: "An administrator is currently reviewing your submitted form and answers.",
    color: "#f4f4f5",
    bg: "rgba(255, 255, 255, 0.08)",
    border: "rgba(255, 255, 255, 0.22)",
    dot: "#d4d4d8",
    step: 2,
  },
  APPROVED: {
    label: "Approved",
    desc: "Congratulations! Your submitted form has been reviewed and approved.",
    color: "#ffffff",
    bg: "rgba(255, 255, 255, 0.12)",
    border: "rgba(255, 255, 255, 0.35)",
    dot: "#ffffff",
    step: 3,
  },
  REJECTED: {
    label: "Rejected",
    desc: "Your submission was not approved. You may review your answers or submit a new response.",
    color: "#fca5a5",
    bg: "rgba(255, 255, 255, 0.06)",
    border: "rgba(248, 113, 113, 0.35)",
    dot: "#f87171",
    step: 3,
  },
};

export default function UserPanel() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("forms"); // "forms" | "submissions" | "profile"

  // Forms state
  const [forms, setForms] = useState([]);
  const [loadingForms, setLoadingForms] = useState(true);
  const [activeForm, setActiveForm] = useState(null);
  const [formData, setFormData] = useState({});
  const [fieldProvenance, setFieldProvenance] = useState({});
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(null);
  const [submissionError, setSubmissionError] = useState("");

  // User's Submitted Forms & Status Review state
  const [mySubmissions, setMySubmissions] = useState([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);
  const [selectedReviewSub, setSelectedReviewSub] = useState(null);
  const [subSearchQuery, setSubSearchQuery] = useState("");
  const [subStatusFilter, setSubStatusFilter] = useState("ALL");
  const [subFormFilter, setSubFormFilter] = useState("ALL");

  // Multi-Agent AI document fill state
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiStatusText, setAiStatusText] = useState("");
  const [aiResultMeta, setAiResultMeta] = useState(null);
  const [showVoiceAssistant, setShowVoiceAssistant] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState("auto");

  const docInputRef = useRef(null);

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

  const fetchMySubmissions = useCallback(async () => {
    setLoadingSubmissions(true);
    try {
      const response = await authFetch("/applications");
      if (response.ok) {
        const data = await response.json();
        const apps = data.applications || [];
        setMySubmissions(apps);
        setSelectedReviewSub((prev) =>
          prev ? apps.find((a) => a.applicationId === prev.applicationId) || prev : null
        );
      }
    } catch (err) {
      console.error("Failed to fetch user submissions:", err);
    } finally {
      setLoadingSubmissions(false);
    }
  }, []);

  const handleRefreshForms = async () => {
    setLoadingForms(true);
    await fetchForms();
  };

  useEffect(() => {
    fetchUser();
    fetchForms();
    fetchMySubmissions();
  }, [fetchUser, fetchForms, fetchMySubmissions]);

  const submissionMetrics = useMemo(() => {
    const total = mySubmissions.length;
    const submitted = mySubmissions.filter((s) => s.status === "SUBMITTED").length;
    const underReview = mySubmissions.filter((s) => s.status === "UNDER_REVIEW").length;
    const approved = mySubmissions.filter((s) => s.status === "APPROVED").length;
    const rejected = mySubmissions.filter((s) => s.status === "REJECTED").length;
    return { total, submitted, underReview, approved, rejected };
  }, [mySubmissions]);

  const filteredMySubmissions = useMemo(() => {
    return mySubmissions.filter((sub) => {
      if (subStatusFilter !== "ALL" && sub.status !== subStatusFilter) return false;
      if (subFormFilter !== "ALL" && sub.formId !== subFormFilter) return false;
      if (subSearchQuery.trim()) {
        const q = subSearchQuery.toLowerCase();
        const idMatch = sub.applicationId?.toLowerCase().includes(q);
        const titleMatch = (sub.formTitle || sub.formId || "").toLowerCase().includes(q);
        const dataMatch = JSON.stringify(sub.data || {}).toLowerCase().includes(q);
        if (!idMatch && !titleMatch && !dataMatch) return false;
      }
      return true;
    });
  }, [mySubmissions, subStatusFilter, subFormFilter, subSearchQuery]);

  const getFieldLabel = (formId, fieldKey) => {
    const form = forms.find((f) => f.formId === formId);
    if (!form || !form.fields) return fieldKey;
    const field = form.fields.find((f) => (f.fieldKey || f.name) === fieldKey);
    return field ? field.label : fieldKey;
  };

  const handleLogout = async () => {
    try {
      const response = await authFetch("/auth/logout", {
        method: "POST",
      });

      if (response.ok) {
        window.sessionStorage.removeItem("fillerAiAccessToken");
        localStorage.removeItem("userKind");
        navigate("/login");
      } else {
        setError("Logout failed");
      }
    } catch {
      setError("Logout failed");
    }
  };

  const isVoiceEnabled = (form) => {
    if (!form) return false;
    if (form.enableVoice !== undefined) return Boolean(form.enableVoice);
    if (form.enable_voice !== undefined) return Boolean(form.enable_voice);
    return true;
  };

  const isDocUploadEnabled = (form) => {
    if (!form) return false;
    if (form.enableDocUpload !== undefined) return Boolean(form.enableDocUpload);
    if (form.enable_doc_upload !== undefined) return Boolean(form.enable_doc_upload);
    return true;
  };

  const buildInitialFormData = (form) => {
    const initialData = {};
    (form.fields || []).forEach((field) => {
      const key = field.fieldKey || field.name;
      if (field.type === "checkbox") {
        initialData[key] = false;
      } else if (field.type === "multiselect") {
        initialData[key] = [];
      } else {
        initialData[key] = "";
      }
    });
    return initialData;
  };

  const handleStartForm = (form, autoAction = null) => {
    setActiveForm(form);
    setSubmissionSuccess(null);
    setSubmissionError("");
    setAiResultMeta(null);
    setAiStatusText("");
    setFieldProvenance({});
    setFormData(buildInitialFormData(form));
    if (autoAction === "document" && isDocUploadEnabled(form)) {
      setTimeout(() => {
        docInputRef.current?.click();
      }, 120);
    } else if (autoAction === "voice" && isVoiceEnabled(form)) {
      setShowVoiceAssistant(true);
    } else {
      setShowVoiceAssistant(false);
    }
  };

  const handleCancelForm = () => {
    setActiveForm(null);
    setSubmissionSuccess(null);
    setSubmissionError("");
    setAiResultMeta(null);
    setAiStatusText("");
    setFormData({});
    setFieldProvenance({});
  };

  const handleClearForm = () => {
    if (!activeForm) return;
    setFormData(buildInitialFormData(activeForm));
    setFieldProvenance({});
    setAiResultMeta(null);
    setSubmissionError("");
  };

  const applyMultiAgentFillResult = (result, currentForm) => {
    const targetForm = currentForm || activeForm;
    if (!targetForm || !result) return;

    const extractedFields = result.fields || {};
    const provenance = result.provenance || {};

    setFormData((prev) => {
      const updated = { ...prev };
      (targetForm.fields || []).forEach((f) => {
        const key = f.fieldKey || f.name;
        if (Object.prototype.hasOwnProperty.call(extractedFields, key)) {
          const val = extractedFields[key];
          if (val !== "" && val !== null && val !== undefined) {
            if (f.type === "multiselect") {
              updated[key] = Array.isArray(val) ? val : [String(val)];
            } else if (f.type === "checkbox") {
              updated[key] = Boolean(val);
            } else {
              updated[key] = String(val);
            }
          }
        }
      });
      return updated;
    });

    setFieldProvenance((prev) => ({ ...prev, ...provenance }));
    setAiResultMeta({
      documents: result.documents || [],
      populatedCount: Object.values(extractedFields).filter(
        (v) => v !== "" && v !== null && v !== undefined && (!Array.isArray(v) || v.length > 0)
      ).length,
    });
  };

  const handleDocumentUploadFill = async (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    e.target.value = "";
    if (selectedFiles.length === 0 || !activeForm || !isDocUploadEnabled(activeForm)) return;

    setAiProcessing(true);
    setSubmissionError("");
    setAiStatusText(
      `Reading ${selectedFiles.length} document(s)...`
    );

    try {
      const payload = new FormData();
      selectedFiles.forEach((file) => payload.append("files", file));
      payload.append("fields_json", JSON.stringify(activeForm.fields || []));
      payload.append("form_title", activeForm.title || "");
      payload.append("current_data_json", JSON.stringify(formData || {}));

      const response = await authFetch("/ai/fill-form/document", {
        method: "POST",
        body: payload,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Document AI form filling failed.");
      }

      applyMultiAgentFillResult(data, activeForm);
    } catch (err) {
      setSubmissionError(err.message || "Document extraction failed.");
    } finally {
      setAiProcessing(false);
      setAiStatusText("");
    }
  };

  const handleVoiceAnswer = async (text, field) => {
    setAiProcessing(true);
    setSubmissionError("");
    try {
      const key = field.fieldKey || field.name;
      const response = await authFetch("/ai/fill-form/text", {
        method: "POST",
        body: JSON.stringify({
          text,
          fields: activeForm.fields || [],
          form_title: activeForm.title || "",
          source_type: "AI_VOICE",
          target_field_key: key,
          current_data: formData,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "I couldn't understand that answer. Please try again.");
      const targetVal = result.fields?.[key];
      if (targetVal !== undefined && targetVal !== null && targetVal !== "") {
        setFormData((prev) => ({
          ...prev,
          [key]: field.type === "multiselect"
            ? (Array.isArray(targetVal) ? targetVal : [String(targetVal)])
            : field.type === "checkbox"
            ? Boolean(targetVal)
            : String(targetVal),
        }));
        if (result.provenance?.[key]) {
          setFieldProvenance((prev) => ({ ...prev, [key]: result.provenance[key] }));
        }
        return { populated: !Array.isArray(targetVal) || targetVal.length > 0 };
      }
      return { populated: false };
    } finally {
      setAiProcessing(false);
    }
  };

  const handleVoiceAudio = async (audioBlob, field, language) => {
    setAiProcessing(true);
    try {
      const key = field.fieldKey || field.name;
      const extension = audioBlob.type.includes("mp4") ? "m4a" : audioBlob.type.includes("ogg") ? "ogg" : "webm";

      const payload = new FormData();
      payload.append("file", audioBlob, `voice-answer.${extension}`);
      payload.append("language", language === "ta" ? "ta" : language.startsWith("en") ? "en" : "auto");
      payload.append("form_title", activeForm.title || "");
      payload.append("field_label", field.label || "");
      payload.append("options_json", JSON.stringify(field.validation?.options || []));
      payload.append("fields_json", JSON.stringify(activeForm.fields || []));
      payload.append("target_field_key", key || "");
      payload.append("current_data_json", JSON.stringify(formData || {}));

      const response = await authFetch("/ai/voice/transcribe", { method: "POST", body: payload });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Voice transcription failed.");

      const targetVal = result.fields?.[key];
      const hasVal = targetVal !== undefined && targetVal !== null && targetVal !== "";
      if (hasVal) {
        setFormData((prev) => ({
          ...prev,
          [key]: field.type === "multiselect"
            ? (Array.isArray(targetVal) ? targetVal : [String(targetVal)])
            : field.type === "checkbox"
            ? Boolean(targetVal)
            : String(targetVal),
        }));
        if (result.provenance?.[key]) {
          setFieldProvenance((prev) => ({ ...prev, [key]: result.provenance[key] }));
        }
      }
      return {
        text: result.transcript || result.text || "",
        command: result.command || null,
        populated: hasVal,
      };
    } finally {
      setAiProcessing(false);
    }
  };

  const handleAssistantSpeak = async (text, voice) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await authFetch("/ai/voice/speak", {
        method: "POST",
        body: JSON.stringify({ text, voice }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Natural voice playback is unavailable.");
      return response.blob();
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const clearVoiceField = (field) => {
    const key = field.fieldKey || field.name;
    const emptyValue = field.type === "multiselect" ? [] : field.type === "checkbox" ? false : "";
    setFormData((previous) => ({ ...previous, [key]: emptyValue }));
    setFieldProvenance((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  };

  const handleManualFieldChange = (key, newValue) => {
    setFormData((prev) => ({ ...prev, [key]: newValue }));
    setFieldProvenance((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        source: prev[key]?.source ? "USER_MODIFIED" : "USER_TYPED",
        modified_at: new Date().toISOString(),
      },
    }));
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

      const isEmpty =
        val === undefined ||
        val === "" ||
        val === null ||
        (Array.isArray(val) && val.length === 0);

      if (field.required && isEmpty) {
        setSubmissionError(`Question '${field.label}' is required.`);
        return;
      }

      if (field.type === "email" && val) {
        const strVal = String(val).trim();
        if (!strVal.includes("@") || !emailRegex.test(strVal)) {
          setSubmissionError(
            `Question '${field.label}' must be a valid email containing '@' and a domain (e.g. name@example.com).`
          );
          return;
        }
      }

      if (field.validation?.regex && val && typeof val === "string") {
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
      const idempotencyKey =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `sub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // Coerce number fields so server-side numeric validation receives clean numbers when filled
      const sanitizedData = { ...formData };
      for (const field of activeForm.fields || []) {
        const key = field.fieldKey || field.name;
        if (field.type === "number" && sanitizedData[key] !== "" && sanitizedData[key] !== null && sanitizedData[key] !== undefined) {
          const numVal = Number(sanitizedData[key]);
          if (!Number.isNaN(numVal)) {
            sanitizedData[key] = numVal;
          }
        }
      }

      const response = await authFetch("/applications", {
        method: "POST",
        headers: {
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          form_id: activeForm.formId,
          form_version: activeForm.version,
          data: sanitizedData,
          provenance: Object.keys(fieldProvenance).length > 0 ? fieldProvenance : undefined,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || "Submission failed. Please verify your entries.");
      }

      setSubmissionSuccess({
        applicationId: result.application?.applicationId || result.applicationId,
        submittedAt: result.application?.submittedAt || new Date().toISOString(),
        application: result.application || null,
      });
      await fetchMySubmissions();
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
      {/* Unified Enterprise Top Bar: Brand Header + Navigation */}
      <header className="portal-topbar">
        <div className="portal-topbar-main">
          <div className="portal-brand">

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <h1>Applicant portal</h1>
                <span className="portal-role-pill">Workspace</span>
              </div>
              <p className="portal-welcome-text">
                Signed in as <strong>{user?.full_name || "Applicant"}</strong>
              </p>
            </div>
          </div>
          <button className="btn-logout" onClick={handleLogout}>
            <LogOut size={16} aria-hidden="true" /> Sign out
          </button>
        </div>

        <nav className="page-nav" aria-label="Applicant portal Navigation">
          <button
            type="button"
            className={activeTab === "forms" ? "selected" : ""}
            onClick={() => {
              setActiveTab("forms");
              setActiveForm(null);
            }}
          >
            <FileText size={16} aria-hidden="true" /><span>Forms</span>
            <span className="nav-count-pill">{forms.length}</span>
          </button>
          <button
            type="button"
            className={activeTab === "submissions" ? "selected" : ""}
            onClick={() => {
              setActiveTab("submissions");
              setActiveForm(null);
              fetchMySubmissions();
            }}
          >
            <Inbox size={16} aria-hidden="true" /><span>Submissions</span>
            <span className="nav-count-pill">{mySubmissions.length}</span>
          </button>
          <button
            type="button"
            className={activeTab === "profile" ? "selected" : ""}
            onClick={() => {
              setActiveTab("profile");
              setActiveForm(null);
            }}
            style={{ marginLeft: "auto" }}
          >
            <UserRound size={16} aria-hidden="true" /> Profile
          </button>
        </nav>
      </header>

      {/* Available Forms View */}
      {activeTab === "forms" && !activeForm && (
        <div className="panel-section">
          <div className="section-header-row">
            <div>
              <h2 className="section-title">Available Forms</h2>
              <p className="section-subtitle">
                Choose a form to complete manually or fill from a document.
              </p>
            </div>
            <button
              className="btn-secondary"
              onClick={handleRefreshForms}
              disabled={loadingForms}
              style={{ padding: "8px 16px", fontSize: "13px" }}
            >
              <RefreshCw size={15} aria-hidden="true" className={loadingForms ? "is-spinning" : ""} /> {loadingForms ? "Refreshing" : "Refresh forms"}
            </button>
          </div>

          {forms.length === 0 ? (
            <div className="no-forms-card">

              <h3>No forms available</h3>
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
                      {form.description || "Complete all required fields and submit your application."}
                    </p>
                  </div>
                  <div>
                    <div className="form-card-meta">
                      <span> {form.fields?.length || 0} questions</span>
                      <span>ID: <code>{form.formId}</code></span>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <button
                        className="btn-primary"
                        style={{ flex: 1 }}
                        onClick={() => handleStartForm(form)}
                      >
                        Open form <ArrowRight size={16} aria-hidden="true" />
                      </button>
                      {isVoiceEnabled(form) && (
                        <button
                          type="button"
                          className="btn-secondary"
                          title="Fill Form by Talking Through Questions"
                          aria-label="Fill Form by Voice Conversation"
                          onClick={() => handleStartForm(form, "voice")}
                          style={{
                            padding: "10px 12px",
                            fontSize: "16px",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: "8px",
                          }}
                        ><Mic size={17} aria-hidden="true" /></button>
                      )}
                      {isDocUploadEnabled(form) && (
                        <button
                          type="button"
                          className="btn-secondary"
                          title="Fill Form by Uploading Document (PDF, DOCX, Image, TXT)"
                          aria-label="Fill Form by Uploading Document"
                          onClick={() => handleStartForm(form, "document")}
                          style={{
                            padding: "10px 12px",
                            fontSize: "16px",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: "8px",
                          }}
                        ><FileUp size={17} aria-hidden="true" /></button>
                      )}
                    </div>
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
          {/* Hidden document picker */}
          <input
            ref={docInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp"
            style={{ display: "none" }}
            onChange={handleDocumentUploadFill}
          />

          {/* Clean Form Workspace Header */}
          <div className="form-workspace-header">
            <div className="form-workspace-title-block">
              <button
                type="button"
                className="btn-back-link"
                onClick={handleCancelForm}
              >
                <ArrowLeft size={15} aria-hidden="true" /> Back to forms
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "6px" }}>
                <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 800, color: "#ffffff" }}>
                  {activeForm.title}
                </h2>
                <span className="badge-published">v{activeForm.version}</span>
                <span className="form-question-count-pill">
                  {(activeForm.fields || []).length} questions
                </span>
              </div>
              <p style={{ margin: "6px 0 0 0", color: "var(--text-secondary)", fontSize: "13.5px" }}>
                {activeForm.description || "Complete the required fields manually or fill them from a document."}
              </p>
            </div>

            {/* Unified Smart-Fill Action Toolbar */}
            {!submissionSuccess && (
              <div className="smart-fill-toolbar">
                {isDocUploadEnabled(activeForm) && (
                  <button
                    type="button"
                    onClick={() => docInputRef.current?.click()}
                    disabled={aiProcessing}
                    title="Fill the form from a document (PDF, DOCX, image, or TXT)"
                    aria-label="Fill from document"
                    className="smart-fill-btn doc-upload"
                  >
                    <FileUp size={16} aria-hidden="true" /><span>Use document</span>
                  </button>
                )}
                {isVoiceEnabled(activeForm) && (
                  <button
                    type="button"
                    onClick={() => setShowVoiceAssistant(true)}
                    disabled={aiProcessing}
                    title="Fill this form by talking through each question"
                    aria-label="Fill form by voice conversation"
                    className="smart-fill-btn voice-conversation"
                  >
                    <Mic size={16} aria-hidden="true" /><span>Talk through form</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleClearForm}
                  disabled={formSubmitting || aiProcessing}
                  title="Clear all fields and entered text from the form"
                  aria-label="Clear form"
                  className="smart-fill-btn clear-form"
                  style={{
                    borderColor: "rgba(239, 68, 68, 0.35)",
                    background: "rgba(239, 68, 68, 0.08)",
                    color: "#fca5a5",
                  }}
                >
                  <RotateCcw size={16} aria-hidden="true" /><span>Clear</span>
                </button>
              </div>
            )}
          </div>

          {showVoiceAssistant && !submissionSuccess && isVoiceEnabled(activeForm) && (
            <VoiceFormAssistant
              form={activeForm}
              values={formData}
              language={voiceLanguage}
              onLanguageChange={setVoiceLanguage}
              onAnswer={handleVoiceAnswer}
              onAudioAnswer={handleVoiceAudio}
              onSpeak={handleAssistantSpeak}
              onClearField={clearVoiceField}
              onClose={() => setShowVoiceAssistant(false)}
            />
          )}

          {/* Live AI Processing Banner */}
          {aiProcessing && (
            <div
              role="status"
              aria-live="polite"
              className="ai-processing-banner"
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", fontWeight: 600 }}>
                <span>{aiStatusText || "AI is checking your answers..."}</span>
              </div>
            </div>
          )}

          {/* Multi-Agent Verification Result Banner */}
          {aiResultMeta && !submissionSuccess && (
            <div className="ai-result-banner">
              <div><strong>AI fill complete:</strong> Populated{" "}<strong>{aiResultMeta.populatedCount}</strong> field(s).</div>
              {aiResultMeta.documents?.length > 0 && (
                <div style={{ marginTop: "6px", fontSize: "12.5px", color: "#15803d" }}>
                  <strong>Documents:</strong>{" "}
                  {aiResultMeta.documents.map((d) => d.filename).join(", ")}
                </div>
              )}
            </div>
          )}

          {submissionSuccess ? (
            <div className="info-card" style={{ background: "rgba(255, 255, 255, 0.08)", borderColor: "rgba(255, 255, 255, 0.28)", padding: "24px" }}>

              <h3 style={{ margin: "0 0 8px 0", color: "#ffffff" }}>Application Submitted Successfully!</h3>
              <p style={{ margin: "0 0 16px 0", color: "var(--text-secondary)" }}>
                Your submission has been received and recorded under reference ID:
                <br />
                <strong><code style={{ color: "#ffffff" }}>{submissionSuccess.applicationId}</code></strong>
              </p>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <button
                  className="btn-primary"
                  onClick={() => {
                    const submittedId = submissionSuccess.applicationId;
                    handleCancelForm();
                    setActiveTab("submissions");
                    fetchMySubmissions().then(() => {
                      const found = mySubmissions.find((s) => s.applicationId === submittedId);
                      if (found) setSelectedReviewSub(found);
                    });
                  }}
                >
                   View submission status →
                </button>
                <button className="btn-secondary" onClick={handleCancelForm}>
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

              <div className="user-form-fields-grid">
                {(activeForm.fields || []).map((field, idx) => {
                  const key = field.fieldKey || field.name;
                  const value = formData[key] ?? (field.type === "multiselect" ? [] : "");
                  const isFilled =
                    field.type === "multiselect"
                      ? Array.isArray(value) && value.length > 0
                      : field.type === "checkbox"
                      ? Boolean(value)
                      : value !== undefined && value !== null && String(value).trim() !== "";

                  const spotlightClass = isFilled ? "field-card-populated" : "";

                  return (
                    <div
                      key={idx}
                      className={`user-form-field ${spotlightClass}`}
                    >
                      <div className="field-card-top-row">
                        <div className="field-label-group">
                          <span className={`field-index-badge ${isFilled ? "done" : ""}`}>
                            {isFilled ? "✓" : idx + 1}
                          </span>
                          <label htmlFor={`field-${idx}`} style={{ marginBottom: 0 }}>
                            {field.label}
                            {field.required && <span className="req-star">*</span>}
                          </label>
                          <span className="field-type-chip">{field.type}</span>
                        </div>

                      </div>

                      {field.type === "dropdown" ? (
                        <select
                          id={`field-${idx}`}
                          value={value}
                          required={field.required}
                          onChange={(e) => handleManualFieldChange(key, e.target.value)}
                        >
                          <option value="">-- Select an option --</option>
                          {(field.validation?.options || []).map((opt, oIdx) => (
                            <option key={oIdx} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : field.type === "multiselect" ? (
                        <div className="field-multiselect-group">
                          {(field.validation?.options || []).map((opt, oIdx) => {
                            const selectedList = Array.isArray(value) ? value : [];
                            const checked = selectedList.includes(opt);
                            return (
                              <label
                                key={oIdx}
                                className={`multiselect-chip-label ${checked ? "checked" : ""}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = e.target.checked
                                      ? [...selectedList, opt]
                                      : selectedList.filter((item) => item !== opt);
                                    handleManualFieldChange(key, next);
                                  }}
                                />
                                <span>{opt}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : field.type === "checkbox" ? (
                        <label className="checkbox-row-label" htmlFor={`field-${idx}`}>
                          <input
                            id={`field-${idx}`}
                            type="checkbox"
                            checked={Boolean(formData[key])}
                            onChange={(e) => handleManualFieldChange(key, e.target.checked)}
                          />
                          <span>Yes, I confirm {field.label}</span>
                        </label>
                      ) : field.type === "email" ? (
                        <input
                          id={`field-${idx}`}
                          type="email"
                          placeholder="name@example.com"
                          value={value}
                          required={field.required}
                          pattern="^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
                          title="Must be a valid email containing '@' and a domain"
                          onChange={(e) => handleManualFieldChange(key, e.target.value)}
                        />
                      ) : field.type === "number" ? (
                        <input
                          id={`field-${idx}`}
                          type="number"
                          placeholder={
                            field.validation?.min !== undefined && field.validation?.max !== undefined
                              ? `Enter number (${field.validation.min} – ${field.validation.max})`
                              : "Enter number"
                          }
                          value={value}
                          required={field.required}
                          min={field.validation?.min}
                          max={field.validation?.max}
                          onChange={(e) => handleManualFieldChange(key, e.target.value)}
                        />
                      ) : field.type === "date" ? (
                        <input
                          id={`field-${idx}`}
                          type="date"
                          value={value}
                          required={field.required}
                          onChange={(e) => handleManualFieldChange(key, e.target.value)}
                        />
                      ) : field.type === "file" ? (
                        <input
                          id={`field-${idx}`}
                          type="file"
                          required={field.required && !value}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            handleManualFieldChange(key, f ? f.name : "");
                          }}
                        />
                      ) : (
                        <input
                          id={`field-${idx}`}
                          type="text"
                          placeholder={`Enter ${field.label.toLowerCase()}`}
                          value={value}
                          required={field.required}
                          pattern={field.validation?.regex}
                          onChange={(e) => handleManualFieldChange(key, e.target.value)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="form-submit-footer">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={formSubmitting || aiProcessing}
                  style={{ padding: "12px 28px", fontSize: "15px" }}
                >
                  {formSubmitting ? "Submitting application…" : <><Send size={16} aria-hidden="true" /> Submit application</>}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={formSubmitting || aiProcessing}
                  onClick={handleClearForm}
                  title="Clear all fields and entered text from the form"
                  style={{
                    padding: "12px 20px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    borderColor: "rgba(239, 68, 68, 0.35)",
                    color: "#fca5a5",
                  }}
                >
                  <RotateCcw size={15} aria-hidden="true" /> Clear
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={formSubmitting}
                  onClick={handleCancelForm}
                  style={{ padding: "12px 20px" }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── User Submitted Forms & Status Review Panel ── */}
      {activeTab === "submissions" && (
        <div className="panel-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
            <div>
              <h2 style={{ margin: "0 0 4px 0", fontSize: "20px", color: "#ffffff" }}>
                Submissions
              </h2>
              <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "14px" }}>
                Track real-time review status (<strong>Submitted → Under Review → Approved / Rejected</strong>) and inspect your submitted responses.
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={fetchMySubmissions}
              disabled={loadingSubmissions}
              style={{ padding: "8px 16px", fontSize: "13px" }}
            >
              <RefreshCw size={15} aria-hidden="true" className={loadingSubmissions ? "is-spinning" : ""} />
              {loadingSubmissions ? "Refreshing status" : "Refresh status"}
            </button>
          </div>

          {/* Interactive Status Summary KPI Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            {[
              { key: "ALL", label: "Total Submitted", count: submissionMetrics.total, color: "#ffffff", bg: "rgba(255, 255, 255, 0.08)", border: "rgba(255, 255, 255, 0.2)" },
              { key: "SUBMITTED", label: "Submitted", count: submissionMetrics.submitted, color: "#f4f4f5", bg: "rgba(255, 255, 255, 0.08)", border: "rgba(255, 255, 255, 0.2)" },
              { key: "UNDER_REVIEW", label: "Under Review", count: submissionMetrics.underReview, color: "#d4d4d8", bg: "rgba(255, 255, 255, 0.08)", border: "rgba(255, 255, 255, 0.2)" },
              { key: "APPROVED", label: "Approved", count: submissionMetrics.approved, color: "#ffffff", bg: "rgba(255, 255, 255, 0.12)", border: "rgba(255, 255, 255, 0.35)" },
              { key: "REJECTED", label: "Rejected", count: submissionMetrics.rejected, color: "#fca5a5", bg: "rgba(255, 255, 255, 0.06)", border: "rgba(248, 113, 113, 0.3)" },
            ].map((card) => {
              const isSelected = subStatusFilter === card.key;
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => setSubStatusFilter(card.key)}
                  style={{
                    textAlign: "left",
                    padding: "14px 16px",
                    borderRadius: "12px",
                    background: card.bg,
                    border: isSelected ? `2px solid ${card.color}` : `1px solid ${card.border}`,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                    {card.label}
                  </div>
                  <div style={{ fontSize: "24px", fontWeight: 800, color: card.color }}>
                    {card.count}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Search & Filter Toolbar */}
          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              marginBottom: "20px",
              padding: "12px",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.14)",
              borderRadius: "12px",
            }}
          >
            <input
              type="text"
              placeholder=" Search by Reference ID, Form Title, or Answer..."
              value={subSearchQuery}
              onChange={(e) => setSubSearchQuery(e.target.value)}
              style={{
                flex: "1 1 240px",
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1px solid rgba(255, 255, 255, 0.20)",
                background: "rgba(14, 16, 22, 0.72)",
                color: "#ffffff",
                fontSize: "13px",
              }}
            />
            <select
              aria-label="Filter by Status"
              value={subStatusFilter}
              onChange={(e) => setSubStatusFilter(e.target.value)}
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1px solid rgba(255, 255, 255, 0.20)",
                background: "rgba(14, 16, 22, 0.72)",
                color: "#ffffff",
                fontSize: "13px",
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
            <select
              aria-label="Filter by Form"
              value={subFormFilter}
              onChange={(e) => setSubFormFilter(e.target.value)}
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1px solid rgba(255, 255, 255, 0.20)",
                background: "rgba(14, 16, 22, 0.72)",
                color: "#ffffff",
                fontSize: "13px",
              }}
            >
              <option value="ALL">All Forms</option>
              {forms.map((f) => (
                <option key={f.formId} value={f.formId}>
                  {f.title}
                </option>
              ))}
            </select>
          </div>

          {/* Submissions List */}
          {loadingSubmissions ? (
            <div style={{ padding: "32px", textAlign: "center", color: "var(--text-secondary)" }}>
              Loading your submitted forms…
            </div>
          ) : filteredMySubmissions.length === 0 ? (
            <div className="no-forms-card">

              <h3>No submitted forms found</h3>
              <p>
                {mySubmissions.length === 0
                  ? "You haven't submitted any forms yet. Go to Available Forms to fill and submit your first form."
                  : "No submissions match your current search or status filter."}
              </p>
              {mySubmissions.length === 0 && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ marginTop: "12px" }}
                  onClick={() => setActiveTab("forms")}
                >
                  Browse Available Forms →
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {filteredMySubmissions.map((sub) => {
                const statusCfg = USER_STATUS_CONFIG[sub.status] || USER_STATUS_CONFIG.SUBMITTED;
                const answerEntries = Object.entries(sub.data || {});
                const isFinalApproved = sub.status === "APPROVED";
                const isFinalRejected = sub.status === "REJECTED";
                const step = statusCfg.step;

                return (
                  <div
                    key={sub.applicationId}
                    style={{
                      background: "var(--glass-hero-bg)",
                      border: "var(--glass-hero-border)",
                      borderLeft: "4px solid rgba(255, 255, 255, 0.65)",
                      borderRadius: "20px",
                      padding: "20px 22px",
                      boxShadow: "var(--glass-hero-shadow)",
                      backdropFilter: "var(--glass-hero-blur)",
                      WebkitBackdropFilter: "var(--glass-hero-blur)",
                    }}
                  >
                    {/* Card Top Row: Form Title + Status Pill */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "12px" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <h3 style={{ margin: 0, fontSize: "17px", color: "#ffffff" }}>
                            {sub.formTitle || sub.formId}
                          </h3>
                          <span className="badge-published">v{sub.formVersion}</span>
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px", display: "flex", gap: "14px", flexWrap: "wrap" }}>
                          <span>
                            Ref ID: <code style={{ color: "#ffffff", fontWeight: 600 }}>{sub.applicationId}</code>
                          </span>
                          <span>
                             Submitted: {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : "N/A"}
                          </span>
                          {sub.updatedAt && sub.updatedAt !== sub.submittedAt && (
                            <span>
                               Updated: {new Date(sub.updatedAt).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Semantic Status Badge */}
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "6px 14px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: 700,
                          background: statusCfg.bg,
                          color: statusCfg.color,
                          border: `1px solid ${statusCfg.border}`,
                        }}
                      >
                        <span
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            background: statusCfg.dot,
                          }}
                        />
                        {statusCfg.label}
                      </span>
                    </div>

                    {/* 3-Step Visual Application Status Tracker */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.14)",
                        borderRadius: "8px",
                        padding: "10px 14px",
                        marginBottom: "14px",
                        fontSize: "12px",
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ fontWeight: 700, color: step >= 1 ? "#ffffff" : "var(--text-muted)" }}>
                        Submitted
                      </span>
                      <span style={{ color: "rgba(255, 255, 255, 0.3)" }}>───</span>
                      <span style={{ fontWeight: 700, color: step >= 2 ? "#ffffff" : "var(--text-muted)" }}>
                        Under review
                      </span>
                      <span style={{ color: "rgba(255, 255, 255, 0.3)" }}>───</span>
                      <span
                        style={{
                          fontWeight: 700,
                          color: isFinalApproved ? "#ffffff" : isFinalRejected ? "#fca5a5" : "var(--text-muted)",
                        }}
                      >
                        {isFinalApproved
                          ? " Approved"
                          : isFinalRejected
                          ? " Rejected"
                          : "3. Final Decision Pending"}
                      </span>
                      <span style={{ marginLeft: "auto", color: "var(--text-secondary)", fontSize: "12px" }}>
                        {statusCfg.desc}
                      </span>
                    </div>

                    {/* Preview of Submitted Answers */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                        gap: "8px",
                        marginBottom: "14px",
                      }}
                    >
                      {answerEntries.slice(0, 4).map(([k, v]) => (
                        <div
                          key={k}
                          style={{
                            background: "rgba(255, 255, 255, 0.05)",
                            border: "1px solid rgba(255, 255, 255, 0.12)",
                            borderRadius: "8px",
                            padding: "8px 10px",
                            fontSize: "12px",
                          }}
                        >
                          <div style={{ color: "var(--text-secondary)", fontWeight: 600, marginBottom: "2px" }}>
                            {getFieldLabel(sub.formId, k)}
                          </div>
                          <div style={{ color: "#ffffff", fontWeight: 500, wordBreak: "break-word" }}>
                            {Array.isArray(v) ? v.join(", ") : String(v ?? "—")}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Action Bar */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                      <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        {answerEntries.length} field(s) recorded
                      </span>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ padding: "7px 14px", fontSize: "12px" }}
                          onClick={() => setSelectedReviewSub(sub)}
                        >
                           Review submission
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Detailed Form & Status Review Modal */}
          {selectedReviewSub && (() => {
            const sub = selectedReviewSub;
            const statusCfg = USER_STATUS_CONFIG[sub.status] || USER_STATUS_CONFIG.SUBMITTED;
            const provMap = sub.provenance || {};
            const targetForm = forms.find((f) => f.formId === sub.formId);

            return (
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Review Submitted Form"
                onClick={() => setSelectedReviewSub(null)}
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(8, 9, 12, 0.75)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 1000,
                  padding: "20px",
                }}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: "var(--glass-tier3-bg)",
                    border: "var(--glass-tier3-border)",
                    borderRadius: "26px",
                    maxWidth: "760px",
                    width: "100%",
                    maxHeight: "88vh",
                    overflowY: "auto",
                    padding: "28px",
                    boxShadow: "var(--glass-tier3-shadow)",
                    backdropFilter: "var(--glass-tier3-blur)",
                    WebkitBackdropFilter: "var(--glass-tier3-blur)",
                    color: "#ffffff",
                  }}
                >
                  {/* Modal Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "16px" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                        <h3 style={{ margin: 0, fontSize: "20px", color: "#ffffff" }}>
                          {sub.formTitle || sub.formId}
                        </h3>
                        <span className="badge-published">v{sub.formVersion}</span>
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                        Reference ID: <code style={{ color: "#ffffff" }}>{sub.applicationId}</code> • Submitted:{" "}
                        {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : "N/A"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedReviewSub(null)}
                      style={{
                        background: "rgba(255, 255, 255, 0.1)",
                        border: "1px solid rgba(255, 255, 255, 0.2)",
                        borderRadius: "8px",
                        padding: "6px 10px",
                        cursor: "pointer",
                        fontSize: "14px",
                        color: "#ffffff",
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Current Status Banner */}
                  <div
                    style={{
                      background: statusCfg.bg,
                      border: `1px solid ${statusCfg.border}`,
                      borderRadius: "12px",
                      padding: "14px 16px",
                      marginBottom: "20px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "6px" }}>
                      <strong style={{ color: statusCfg.color, fontSize: "14px" }}>
                        Current Application Status: {statusCfg.label}
                      </strong>
                      {sub.updatedAt && (
                        <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                          Last status check: {new Date(sub.updatedAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{statusCfg.desc}</div>
                  </div>

                  {/* Submitted questions & Answers Table */}
                  <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Submitted Form Responses
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
                    {Object.entries(sub.data || {}).map(([fieldKey, val]) => {
                      const label = getFieldLabel(sub.formId, fieldKey);
                      const provEntry = provMap[fieldKey] || provMap[`/${fieldKey}`];
                      const provSource = provEntry?.source || "";

                      return (
                        <div
                          key={fieldKey}
                          style={{
                            padding: "12px 14px",
                            borderRadius: "10px",
                            border: "1px solid rgba(255, 255, 255, 0.14)",
                            background: "rgba(255, 255, 255, 0.05)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)" }}>
                              {label}
                            </span>
                            {provSource && (
                              <span
                                style={{
                                  fontSize: "11px",
                                  padding: "2px 8px",
                                  borderRadius: "999px",
                                  fontWeight: 600,
                                  background: "rgba(255, 255, 255, 0.12)",
                                  color: "#ffffff",
                                  border: "1px solid rgba(255, 255, 255, 0.2)",
                                }}
                              >
                                {provSource.startsWith("AI_") ? " AI assisted" : " Manual / Manually edited"}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "14px", fontWeight: 600, color: "#ffffff", wordBreak: "break-word" }}>
                            {Array.isArray(val) ? val.join(", ") : String(val ?? "—")}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Modal Footer Actions */}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" }}>
                    {targetForm && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setSelectedReviewSub(null);
                          setActiveTab("forms");
                          handleStartForm(targetForm);
                        }}
                      >
                         Submit New Response for This Form
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setSelectedReviewSub(null)}
                    >
                      Close Review
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Profile Details Tab */}
      {activeTab === "profile" && (
        <div style={{ marginBottom: "24px" }}>
          <ProfileEditor
            user={user}
            onProfileUpdated={(updated) => setUser(updated)}
            role="user"
          />
        </div>
      )}
    </div>
  );
}
