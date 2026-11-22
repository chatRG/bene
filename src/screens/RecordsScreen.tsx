import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { AlertCircle, Camera, ChevronLeft, FileText, Image, Info, Upload, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { Sheet } from '../components/ui';
import { showToast } from '../components/toast';
import type { HealthRecord } from '../domain/types';

export function RecordsScreen() {
  const navigate = useNavigate();
  const state = useAppStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<HealthRecord | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    setError(null);
    if (files.length > 100) {
      setError('Too many files selected. You can upload up to 100 files at a time.');
      return;
    }
    for (const file of Array.from(files)) {
      if (file.size > 5 * 1024 * 1024) {
        setError('File too large. This file exceeds the 5 MB size limit. Please upload a smaller file.');
        continue;
      }
      const ok = /\.(pdf|png|jpe?g|webp|txt)$/i.test(file.name);
      if (!ok) {
        setError('Unsupported file format. This file type isn’t supported. Please upload a supported document format.');
        continue;
      }
      state.uploadRecord(file.name, Math.round(file.size / 1024), file.type.startsWith('image') ? 'image' : 'document');
    }
    setUploadOpen(false);
    showToast('Stored for reference — no analysis in this build');
  };

  return (
    <div className="screen screen--detail">
      <div className="detail-head">
        <button className="icon-btn icon-btn--soft" onClick={() => navigate(-1)} aria-label="Back"><ChevronLeft size={20} /></button>
        <div><div className="detail-head__title">Health records</div><div className="detail-head__sub">Documents, lab reports and biomarkers</div></div>
        <div className="detail-head__right">
          <button className="icon-btn icon-btn--soft" onClick={() => setUploadOpen(true)} aria-label="Upload"><Upload size={18} /></button>
        </div>
      </div>

      <div className="card mt-16" style={{ background: 'var(--accent-soft)', boxShadow: 'none' }}>
        <div className="row gap-10">
          <span className="bio-contributor__icon"><FileText size={18} /></span>
          <div className="grow">
            <div className="card-title">Why upload records?</div>
            <div className="card-sub">Files stay on this device. This build stores them for reference and does not read lab values.</div>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-title" style={{ marginBottom: 12 }}>Your records</div>
        <div className="card">
          {state.healthRecords.map((r) => (
            <button key={r.id} className="record-card" style={{ width: '100%', textAlign: 'left' }} onClick={() => setSelected(r)}>
              <div className="file-icon"><FileText size={18} /></div>
              <div className="grow">
                <div className="list-title">{r.name}</div>
                <div className="list-sub">{format(new Date(r.uploadedAt), 'MMM d, yyyy')} · {r.sizeKb} KB</div>
              </div>
              <span className="pill pill--sm pill--flat">Stored</span>
            </button>
          ))}
          {state.healthRecords.length === 0 ? <div className="empty" style={{ padding: 22 }}>No records yet.</div> : null}
        </div>
      </div>

      <div className="section">
        <div className="section-title" style={{ marginBottom: 12 }}>Add records</div>
        <div className="col gap-8">
          {[
            ['Photo', 'Take a picture of a lab report', <Camera size={18} />],
            ['Library', 'Choose an image from your library', <Image size={18} />],
            ['File', 'PDF, image or text · max 5 MB', <FileText size={18} />],
          ].map(([label, sub, icon]) => (
            <button key={String(label)} className="status-option" onClick={() => { if (label === 'File') inputRef.current?.click(); else setUploadOpen(true); }}>
              <span className="status-option__icon">{icon}</span>
              <span className="grow"><span className="list-title">{label}</span><span className="list-sub">{sub}</span></span>
              <span className="caption">Add</span>
            </button>
          ))}
        </div>
        <input ref={inputRef} type="file" hidden multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.txt" onChange={(e) => handleFiles(e.target.files)} />
      </div>

      {error ? (
        <div className="insight-unlock mt-12" style={{ background: 'rgba(255,90,95,.1)' }}>
          <AlertCircle size={17} style={{ color: 'var(--red)' }} />
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss"><X size={15} /></button>
        </div>
      ) : null}

      <div className="section">
        <div className="card card--flat" style={{ display: 'flex', gap: 10 }}>
          <Info size={16} className="chevron" />
          <span className="caption" style={{ flex: 1 }}>A biomarker missed during the scan can’t be added manually to an existing record. Upload a new report instead.</span>
        </div>
      </div>

      {selected ? (
        <Sheet title={selected.name} subtitle={`Uploaded ${format(new Date(selected.uploadedAt), 'MMM d, yyyy')}`} onClose={() => setSelected(null)}>
          <div className="row gap-10">
            <span className={`pill ${selected.status === 'ready' ? 'pill--green' : 'pill--orange'}`}>
              Stored for reference — no analysis in this build
            </span>
            <span className="caption">{selected.sizeKb} KB</span>
          </div>
          <p className="caption mt-12">This build stores the file for reference. It does not read or extract biomarker values.</p>
          <button className="btn btn--block mt-16" onClick={() => setSelected(null)}>Done</button>
        </Sheet>
      ) : null}

      {uploadOpen ? (
        <Sheet title="Add records" subtitle="PDF, image and text files · max 5 MB each" onClose={() => setUploadOpen(false)}>
          <button
            className="card"
            style={{ width: '100%', border: '1px dashed var(--hairline-strong)', boxShadow: 'none', padding: 30, textAlign: 'center' }}
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={26} style={{ marginBottom: 10 }} />
            <div className="card-title">Select files to upload</div>
            <div className="card-sub">Or drag and drop them here</div>
          </button>
          <div className="row gap-8 mt-16">
            <span className="pill pill--sm pill--flat">PDF</span>
            <span className="pill pill--sm pill--flat">JPG / PNG</span>
            <span className="pill pill--sm pill--flat">TXT</span>
            <span className="pill pill--sm pill--flat">≤ 5 MB</span>
            <span className="pill pill--sm pill--flat">≤ 100 files</span>
          </div>
          <p className="caption mt-16">After upload: “We’re analyzing your documents now. You’ll get a notification when results are ready.”</p>
        </Sheet>
      ) : null}
    </div>
  );
}
