import { useState, useEffect } from "react";
import { authFetch } from "./api";
import "./FormBuilder.css";

const FIELD_TYPES = [
  { value: "text", label: "📝 Short Text", desc: "Names, addresses, codes" },
  { value: "number", label: "🔢 Number", desc: "Age, income, quantities" },
  { value: "date", label: "📅 Date Picker", desc: "Date of birth, deadlines" },
  { value: "dropdown", label: "▾ Dropdown Select", desc: "Single selection from list" },
  { value: "multiselect", label: "☑️ Checkboxes", desc: "Multiple selections from list" },
  { value: "file", label: "📎 File Upload", desc: "PDF, image, document files" },
];

function generateSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "field_" + Math.random().toString(36).substring(2, 7);
}

export default function FormBuilder({ adminRole = "organization_admin" }) {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [view, setView] = useState("list"); // "list" | "edit" | "preview"
  const [previewForm, setPreviewForm] = useState(null);

  // Active form being created or customized
  const [isEditingExisting, setIsEditingExisting] = useState(false);
  const [formState, setFormState] = useState({
    form_id: "",
    title: "",
    description: "",
    publish: true,
    fields: [],
  });

  const fetchForms = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authFetch("/forms");
      if (!response.ok) {
        throw new Error("Failed to load forms");
      }
      const data = await response.json();
      setForms(data.forms || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForms();
  }, []);

  const handleStartCreate = () => {
    const randomId = `frm_${Math.random().toString(36).substring(2, 8)}`;
    setFormState({
      form_id: randomId,
      title: "Untitled Dynamic Form",
      description: "Provide details requested in this form.",
      publish: true,
      fields: [
        {
          id: "q_1",
          fieldKey: "full_name",
          type: "text",
          label: "Full Legal Name",
          required: true,
          validation: {},
        },
        {
          id: "q_2",
          fieldKey: "contact_email",
          type: "text",
          label: "Contact Email Address",
          required: true,
          validation: { regex: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$" },
        },
      ],
    });
    setIsEditingExisting(false);
    setView("edit");
    setError("");
    setSuccess("");
  };

  const handleStartEdit = (form) => {
    setFormState({
      form_id: form.formId,
      title: form.title,
      description: form.description || "",
      publish: form.status === "published",
      fields: form.fields.map((f, idx) => ({
        ...f,
        id: `q_${idx}_${Math.random()}`,
      })),
    });
    setIsEditingExisting(true);
    setView("edit");
    setError("");
    setSuccess("");
  };

  const handleDeleteForm = async (formId) => {
    if (!window.confirm(`Are you sure you want to delete form '${formId}'?`)) return;
    try {
      const res = await authFetch(`/forms/${formId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to delete form");
      }
      setSuccess(`Form '${formId}' deleted successfully.`);
      fetchForms();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddField = () => {
    const newIdx = formState.fields.length + 1;
    const defaultLabel = `Question ${newIdx}`;
    setFormState({
      ...formState,
      fields: [
        ...formState.fields,
        {
          id: `q_${Date.now()}`,
          fieldKey: generateSlug(defaultLabel),
          type: "text",
          label: defaultLabel,
          required: false,
          validation: {},
        },
      ],
    });
  };

  const handleUpdateField = (index, updates) => {
    const updated = [...formState.fields];
    updated[index] = { ...updated[index], ...updates };
    setFormState({ ...formState, fields: updated });
  };

  const handleRemoveField = (index) => {
    if (formState.fields.length <= 1) {
      alert("A form must have at least one question.");
      return;
    }
    const updated = formState.fields.filter((_, i) => i !== index);
    setFormState({ ...formState, fields: updated });
  };

  const handleMoveField = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= formState.fields.length) return;
    const updated = [...formState.fields];
    const temp = updated[index];
    updated[index] = updated[newIndex];
    updated[newIndex] = temp;
    setFormState({ ...formState, fields: updated });
  };

  const handleSaveForm = async () => {
    setError("");
    setSuccess("");

    if (!formState.title.trim()) {
      setError("Please provide a form title.");
      return;
    }

    // Validate fields format
    for (const f of formState.fields) {
      if (!f.label.trim()) {
        setError("All questions must have a title/label.");
        return;
      }
      if (["dropdown", "multiselect"].includes(f.type)) {
        const opts = f.validation?.options || [];
        if (opts.length === 0 || opts.some((o) => !o.trim())) {
          setError(`Question '${f.label}' requires at least one non-empty option.`);
          return;
        }
      }
    }

    try {
      if (isEditingExisting) {
        // Customize existing form (PUT /forms/{id})
        const res = await authFetch(`/forms/${formState.form_id}`, {
          method: "PUT",
          body: JSON.stringify({
            title: formState.title,
            description: formState.description,
            publish: formState.publish,
            fields: formState.fields.map(({ id, ...rest }) => rest),
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.detail || "Failed to customize form.");
        }
        setSuccess(`Form '${formState.title}' customized & updated to new version!`);
      } else {
        // Create new form (POST /forms)
        const res = await authFetch("/forms", {
          method: "POST",
          body: JSON.stringify({
            form_id: formState.form_id,
            title: formState.title,
            description: formState.description,
            publish: formState.publish,
            fields: formState.fields.map(({ id, ...rest }) => rest),
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.detail || "Failed to create form.");
        }
        setSuccess(`Form '${formState.title}' created and published successfully!`);
      }
      setView("list");
      fetchForms();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="fb-container">
      {error && <div className="error-message">{error}</div>}
      {success && <div className="info-card" style={{ marginBottom: "16px", color: "#166534" }}>{success}</div>}

      {/* ── View 1: Forms Dashboard ─────────────────────────────────── */}
      {view === "list" && (
        <div>
          <div className="fb-header">
            <div>
              <h2>Form Templates & Workflows</h2>
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "14px" }}>
                Create, customize, and manage dynamic questionnaires (Google Forms / MS Forms style).
              </p>
            </div>
            <div className="fb-header-actions">
              <button className="fb-btn fb-btn-primary" onClick={handleStartCreate}>
                + Create New Form
              </button>
            </div>
          </div>

          {loading ? (
            <div className="loading">Loading form templates...</div>
          ) : (
            <div className="fb-grid">
              {/* Blank Form Starter Card */}
              <div className="fb-create-card" onClick={handleStartCreate}>
                <div className="fb-create-icon">➕</div>
                <div className="fb-create-title">Blank Form</div>
                <span style={{ fontSize: "12px", marginTop: "4px" }}>Start from scratch</span>
              </div>

              {/* Render Existing Forms */}
              {forms.map((form) => (
                <div key={form.formId} className="fb-form-card">
                  <div className="fb-card-top">
                    <h3 className="fb-card-title">{form.title}</h3>
                  </div>
                  <p className="fb-card-desc">{form.description || "No description provided."}</p>

                  <div className="fb-badge-group">
                    <span className={`fb-badge fb-badge-${form.status}`}>{form.status}</span>
                    <span className="fb-badge fb-badge-version">v{form.version}</span>
                    <span className="fb-badge" style={{ background: "#f1f5f9", color: "#475569" }}>
                      {form.fields?.length || 0} Questions
                    </span>
                  </div>

                  <div className="fb-card-actions">
                    <button className="fb-btn fb-btn-secondary fb-btn-sm" onClick={() => handleStartEdit(form)}>
                      ✏️ Customize
                    </button>
                    <button
                      className="fb-btn fb-btn-secondary fb-btn-sm"
                      onClick={() => setPreviewForm(form)}
                    >
                      👁️ Preview
                    </button>
                    <button
                      className="fb-btn fb-btn-danger fb-btn-sm"
                      onClick={() => handleDeleteForm(form.formId)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── View 2: Form Editor (Google Forms Style) ────────────────── */}
      {view === "edit" && (
        <div className="fb-editor">
          <div className="fb-header" style={{ marginBottom: "16px" }}>
            <button className="fb-btn fb-btn-secondary fb-btn-sm" onClick={() => setView("list")}>
              ← Back to Forms
            </button>
            <div className="fb-header-actions">
              <button
                className="fb-btn fb-btn-secondary"
                onClick={() => setPreviewForm(formState)}
              >
                👁️ Preview Form
              </button>
              <button className="fb-btn fb-btn-primary" onClick={handleSaveForm}>
                💾 Save & Publish Form
              </button>
            </div>
          </div>

          {/* Form Header Card */}
          <div className="fb-editor-header">
            <input
              type="text"
              className="fb-title-input"
              placeholder="Form Title (e.g. Employee Onboarding Questionnaire)"
              value={formState.title}
              onChange={(e) => setFormState({ ...formState, title: e.target.value })}
            />
            <textarea
              className="fb-desc-input"
              rows={2}
              placeholder="Form description and instructions for applicants..."
              value={formState.description}
              onChange={(e) => setFormState({ ...formState, description: e.target.value })}
            />
            <div className="fb-id-hint">
              <span>Form ID:</span>
              <input
                type="text"
                className="fb-id-input"
                disabled={isEditingExisting}
                value={formState.form_id}
                onChange={(e) => setFormState({ ...formState, form_id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
              />
              {!isEditingExisting && <small>(Unique system identifier)</small>}
            </div>
          </div>

          {/* Questions List */}
          <div className="fb-questions-list">
            {formState.fields.map((field, idx) => (
              <div key={field.id} className="fb-question-card">
                <div className="fb-q-top">
                  <input
                    type="text"
                    className="fb-q-title-input"
                    placeholder={`Question ${idx + 1}`}
                    value={field.label}
                    onChange={(e) => {
                      const newLabel = e.target.value;
                      handleUpdateField(idx, {
                        label: newLabel,
                        fieldKey: generateSlug(newLabel),
                      });
                    }}
                  />
                  <select
                    className="fb-type-select"
                    value={field.type}
                    onChange={(e) => {
                      const newType = e.target.value;
                      const updates = { type: newType };
                      if (["dropdown", "multiselect"].includes(newType) && (!field.validation?.options || field.validation.options.length === 0)) {
                        updates.validation = { ...field.validation, options: ["Option 1", "Option 2"] };
                      }
                      handleUpdateField(idx, updates);
                    }}
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Question Type Body */}
                <div className="fb-q-body">
                  {/* Dropdown & Multiselect Options */}
                  {["dropdown", "multiselect"].includes(field.type) && (
                    <div>
                      <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "600" }}>Answer Options:</span>
                      <div className="fb-options-list">
                        {(field.validation?.options || ["Option 1"]).map((opt, optIdx) => (
                          <div key={optIdx} className="fb-option-row">
                            <span className="fb-option-dot">{field.type === "dropdown" ? "○" : "☐"}</span>
                            <input
                              type="text"
                              className="fb-option-input"
                              value={opt}
                              onChange={(e) => {
                                const newOpts = [...(field.validation?.options || [])];
                                newOpts[optIdx] = e.target.value;
                                handleUpdateField(idx, {
                                  validation: { ...field.validation, options: newOpts },
                                });
                              }}
                            />
                            <button
                              type="button"
                              className="fb-option-remove"
                              onClick={() => {
                                const newOpts = (field.validation?.options || []).filter((_, i) => i !== optIdx);
                                handleUpdateField(idx, {
                                  validation: { ...field.validation, options: newOpts },
                                });
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="fb-add-option-btn"
                          onClick={() => {
                            const newOpts = [...(field.validation?.options || []), `Option ${(field.validation?.options?.length || 0) + 1}`];
                            handleUpdateField(idx, {
                              validation: { ...field.validation, options: newOpts },
                            });
                          }}
                        >
                          + Add Option
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Regex / Min / Max Constraints */}
                  <div className="fb-validation-box">
                    <div className="fb-val-group">
                      <span className="fb-val-label">Data Key</span>
                      <input
                        type="text"
                        className="fb-val-input"
                        value={field.fieldKey}
                        onChange={(e) => handleUpdateField(idx, { fieldKey: generateSlug(e.target.value) })}
                      />
                    </div>

                    {field.type === "text" && (
                      <div className="fb-val-group">
                        <span className="fb-val-label">Validation Regex (Optional)</span>
                        <input
                          type="text"
                          className="fb-val-input"
                          placeholder="e.g. ^[A-Z]{2}\d{6}$"
                          value={field.validation?.regex || ""}
                          onChange={(e) =>
                            handleUpdateField(idx, {
                              validation: { ...field.validation, regex: e.target.value || undefined },
                            })
                          }
                        />
                      </div>
                    )}

                    {field.type === "number" && (
                      <>
                        <div className="fb-val-group">
                          <span className="fb-val-label">Min Value</span>
                          <input
                            type="number"
                            className="fb-val-input"
                            value={field.validation?.min ?? ""}
                            onChange={(e) =>
                              handleUpdateField(idx, {
                                validation: { ...field.validation, min: e.target.value ? Number(e.target.value) : undefined },
                              })
                            }
                          />
                        </div>
                        <div className="fb-val-group">
                          <span className="fb-val-label">Max Value</span>
                          <input
                            type="number"
                            className="fb-val-input"
                            value={field.validation?.max ?? ""}
                            onChange={(e) =>
                              handleUpdateField(idx, {
                                validation: { ...field.validation, max: e.target.value ? Number(e.target.value) : undefined },
                              })
                            }
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Card Controls & Required Switch */}
                <div className="fb-q-bottom">
                  <div className="fb-reorder-group">
                    <button
                      type="button"
                      className="fb-btn fb-btn-secondary fb-btn-sm"
                      disabled={idx === 0}
                      onClick={() => handleMoveField(idx, -1)}
                      title="Move Question Up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="fb-btn fb-btn-secondary fb-btn-sm"
                      disabled={idx === formState.fields.length - 1}
                      onClick={() => handleMoveField(idx, 1)}
                      title="Move Question Down"
                    >
                      ▼
                    </button>
                  </div>

                  <div className="fb-q-controls">
                    <label className="fb-toggle-label">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => handleUpdateField(idx, { required: e.target.checked })}
                      />
                      <span>Required</span>
                    </label>

                    <button
                      type="button"
                      className="fb-btn fb-btn-danger fb-btn-sm"
                      onClick={() => handleRemoveField(idx)}
                      title="Delete Question"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add Question Banner */}
          <div className="fb-add-banner">
            <button type="button" className="fb-add-q-btn" onClick={handleAddField}>
              <span>➕</span> Add Question
            </button>
          </div>
        </div>
      )}

      {/* ── View 3: Live Preview Modal (Applicant View Test) ────────── */}
      {previewForm && (
        <div className="fb-modal-overlay" onClick={() => setPreviewForm(null)}>
          <div className="fb-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="fb-preview-header">
              <h2 style={{ margin: "0 0 8px 0" }}>{previewForm.title}</h2>
              <p style={{ margin: 0, color: "#64748b" }}>{previewForm.description}</p>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); alert("Form validation passed! Preview successful."); }}>
              {previewForm.fields.map((field, idx) => (
                <div key={idx} className="fb-preview-field">
                  <label className="fb-preview-label">
                    {field.label}
                    {field.required && <span className="fb-req-star">*</span>}
                  </label>

                  {field.type === "text" && (
                    <input
                      type="text"
                      className="fb-preview-input"
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                      required={field.required}
                      pattern={field.validation?.regex}
                    />
                  )}

                  {field.type === "number" && (
                    <input
                      type="number"
                      className="fb-preview-input"
                      placeholder="0"
                      min={field.validation?.min}
                      max={field.validation?.max}
                      required={field.required}
                    />
                  )}

                  {field.type === "date" && (
                    <input
                      type="date"
                      className="fb-preview-input"
                      required={field.required}
                    />
                  )}

                  {field.type === "dropdown" && (
                    <select className="fb-preview-input" required={field.required}>
                      <option value="">-- Select an option --</option>
                      {(field.validation?.options || []).map((opt, i) => (
                        <option key={i} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  )}

                  {field.type === "multiselect" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {(field.validation?.options || []).map((opt, i) => (
                        <label key={i} style={{ display: "flex", gap: "8px", fontSize: "14px", alignItems: "center" }}>
                          <input type="checkbox" name={field.fieldKey} value={opt} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  )}

                  {field.type === "file" && (
                    <input
                      type="file"
                      className="fb-preview-input"
                      required={field.required}
                    />
                  )}
                </div>
              ))}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
                <button type="button" className="fb-btn fb-btn-secondary" onClick={() => setPreviewForm(null)}>
                  Close Preview
                </button>
                <button type="submit" className="fb-btn fb-btn-primary">
                  Test Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
