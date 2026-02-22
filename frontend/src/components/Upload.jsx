import { useState, useRef, useCallback } from 'react'

const BORDER_NORMAL  = '2px dashed #30363d'
const BORDER_HOVER   = '2px dashed #58a6ff'
const BORDER_LOADING = '2px dashed #21262d'

export default function Upload({ onUpload, loading }) {
  const [dragOver,  setDragOver]  = useState(false)
  const [fileName,  setFileName]  = useState(null)
  const inputRef = useRef(null)

  const handleFile = useCallback((file) => {
    if (!file) return
    setFileName(file.name)
    onUpload(file)
  }, [onUpload])

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) handleFile(file)
  }

  const onInputChange = (e) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const borderColor = loading ? BORDER_LOADING
    : dragOver ? BORDER_HOVER
    : BORDER_NORMAL

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!loading) setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={loading ? undefined : onDrop}
      onClick={() => !loading && inputRef.current?.click()}
      style={{
        flex: 1,
        minWidth: 280,
        border: borderColor,
        borderRadius: 8,
        background: dragOver ? 'rgba(88,166,255,0.05)' : '#161b22',
        padding: '28px 24px',
        cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'border-color 0.2s, background 0.2s',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        userSelect: 'none',
        opacity: loading ? 0.6 : 1,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        onChange={onInputChange}
        disabled={loading}
      />

      {/* Icon */}
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
        stroke={dragOver ? '#58a6ff' : '#8b949e'} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>

      {loading ? (
        <span style={{ color: '#8b949e', fontSize: '0.9rem' }}>Analysing…</span>
      ) : fileName ? (
        <span style={{ color: '#3fb950', fontSize: '0.9rem', fontWeight: 500 }}>
          ✓ {fileName}
        </span>
      ) : (
        <>
          <span style={{ color: '#e6edf3', fontWeight: 500 }}>
            Drop CSV here or click to browse
          </span>
          <span style={{ color: '#8b949e', fontSize: '0.82rem' }}>
            QuantConnect trade export (.csv)
          </span>
        </>
      )}
    </div>
  )
}
