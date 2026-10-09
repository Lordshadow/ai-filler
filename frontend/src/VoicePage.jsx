import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './App.css'

import { API_BASE_URL as API_URL } from './api'

export default function VoicePage() {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [application, setApplication] = useState(null)
  const [error, setError] = useState('')
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const navigate = useNavigate()

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  async function startRecording() {
    setError('')
    setTranscript('')
    setApplication(null)

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone access is not supported by this browser.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        transcribe(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }))
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
    } catch {
      setError('Microphone permission was denied or unavailable.')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }

  async function transcribe(audioBlob) {
    setIsTranscribing(true)
    setError('')

    const formData = new FormData()
    formData.append('file', audioBlob, 'recording.webm')

    try {
      const response = await fetch(`${API_URL}/transcribe`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Transcription failed.')
      setTranscript(result.text)
      await formatApplication(result.text)
    } catch (requestError) {
      setError(requestError.message || 'Could not reach the transcription service.')
    } finally {
      setIsTranscribing(false)
    }
  }

  async function formatApplication(text) {
    try {
      const response = await fetch(`${API_URL}/format-application`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ transcript: text }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Application formatting failed.')
      setApplication(result.application)
    } catch (err) {
      console.error('Formatting error:', err)
    }
  }

  return (
    <main className="app-shell">
      <nav className="page-nav">
        <button className="selected" disabled>Voice</button>
        <button onClick={() => navigate('/documents')}>Documents</button>
        <button onClick={() => navigate('/user-panel')} style={{ marginLeft: 'auto' }}>Profile</button>
      </nav>
      <section className="hero">
        <p className="eyebrow">AI FILLER</p>
        <h1>Turn your voice<br /><span>into words.</span></h1>
        <p className="intro">Speak naturally. Whisper Large v3 will transcribe your recording in seconds.</p>
      </section>
      <section className="transcriber-card">
        <div className="card-header">
          <div>
            <p className="label">VOICE TRANSCRIBER</p>
            <h2>{isTranscribing ? 'Transcribing...' : isRecording ? 'Recording...' : 'Ready to record'}</h2>
          </div>
          <span className="ai-badge">WHISPER V3</span>
        </div>
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isTranscribing}
          className={`record-button ${isRecording ? 'recording' : ''}`}
          type="button"
        >
          {isRecording ? '⏹ Stop Recording' : '🎤 Start Recording'}
        </button>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      {transcript && (
        <section className="application-card">
          <div className="card-header">
            <div>
              <p className="label">TRANSCRIPTION</p>
              <h2>Your transcript</h2>
            </div>
          </div>
          <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} aria-label="Transcript text" />
        </section>
      )}
      {application && (
        <section className="application-card">
          <div className="card-header">
            <div>
              <p className="label">FORMATTED APPLICATION</p>
              <h2>Ready to submit</h2>
            </div>
            <span className="ai-badge">GPT-OSS</span>
          </div>
          <textarea value={application} onChange={(e) => setApplication(e.target.value)} aria-label="Formatted application" />
        </section>
      )}
    </main>
  )
}
