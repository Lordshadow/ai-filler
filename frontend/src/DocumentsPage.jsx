import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './App.css'

import { authFetch } from './api'

export default function DocumentsPage() {
  const [documentText, setDocumentText] = useState('')
  const [organizedText, setOrganizedText] = useState('')
  const [documentFiles, setDocumentFiles] = useState([])
  const [isExtracting, setIsExtracting] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function extractDocument(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    setError('')
    setDocumentText('')
    setOrganizedText('')
    setDocumentFiles(files.map((file) => file.name))
    setIsExtracting(true)
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    try {
      const response = await authFetch('/extract-document', {
        method: 'POST',
        body: formData,
      })
      const result = await response.json()
      if (response.status === 401 || response.status === 403) {
        if (result.detail && typeof result.detail === 'string' && result.detail.toLowerCase().includes('csrf')) {
          throw new Error('Your session security token is missing or expired. Please refresh the page or sign in again.')
        }
        throw new Error(result.detail || 'Session expired or unauthorized. Please sign in again.')
      }
      if (!response.ok) throw new Error(result.detail || 'Document extraction failed.')
      setDocumentText(result.extracted_text)
      setOrganizedText(result.organized_text)
    } catch (requestError) {
      setError(requestError.message || 'Could not process the document.')
    } finally {
      setIsExtracting(false)
      event.target.value = ''
    }
  }

  return (
    <main className="app-shell">
      <nav className="page-nav">
        <button onClick={() => navigate('/user-panel')}>Available Forms</button>
        <button onClick={() => navigate('/voice')}>Voice</button>
        <button className="selected" disabled>Documents</button>
        <button onClick={() => navigate('/user-panel')} style={{ marginLeft: 'auto' }}>Profile</button>
      </nav>
      <section className="hero">
        <p className="eyebrow">AI DOCUMENT READER</p>
        <h1>Make documents<br /><span>easy to read.</span></h1>
        <p className="intro">Upload a PDF, Word document, text file, or image. We will extract and organize the contents for you.</p>
      </section>
      <section className="transcriber-card">
        <div className="card-header">
          <div>
            <p className="label">DOCUMENT EXTRACTION</p>
            <h2>{isExtracting ? 'Reading your file...' : 'Choose a document'}</h2>
          </div>
          <span className="ai-badge">GPT-OSS</span>
        </div>
        <label className="upload-area">
          <span className="upload-icon">↑</span>
          <strong>{isExtracting ? 'Reading your files...' : 'Upload documents'}</strong>
          <small>Choose one or more PDF, DOCX, TXT, PNG, JPG, or WEBP files</small>
          <input
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp"
            onChange={extractDocument}
            disabled={isExtracting}
          />
        </label>
        {documentFiles.length > 0 && (
          <ul className="file-list">{documentFiles.map((file) => <li key={file}>{file}</li>)}</ul>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      {organizedText && (
        <section className="application-card document-result">
          <div className="card-header">
            <div>
              <p className="label">ORGANIZED TEXT</p>
              <h2>Document ready</h2>
            </div>
          </div>
          <textarea
            value={organizedText}
            onChange={(event) => setOrganizedText(event.target.value)}
            aria-label="Organized document text"
          />
          <details>
            <summary>Show original extracted text</summary>
            <p className="raw-text">{documentText}</p>
          </details>
        </section>
      )}
      <footer>
        <button className="footer-link" onClick={() => navigate('/voice')} type="button">
          ← Voice transcriber
        </button>
      </footer>
    </main>
  )
}
