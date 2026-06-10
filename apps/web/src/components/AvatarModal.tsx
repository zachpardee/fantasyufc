import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../api/supabase';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_URL_BYTES = 5 * 1024 * 1024;
const OUTPUT_SIZE = 256;

interface Props { onClose: () => void; currentUrl?: string }

export function AvatarModal({ onClose, currentUrl }: Props) {
  const { session } = useAuthStore();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<'upload' | 'url'>('upload');
  const [urlInput, setUrlInput] = useState('');
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const hasPendingChange = pendingBlob !== null || pendingUrl !== null;

  const saveProfile = useMutation({
    mutationFn: (avatarUrl: string) => apiClient.patch('/auth/me', { avatarUrl }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-profile'] }); onClose(); },
    onError: (e: any) => setError(e?.error ?? 'Failed to save'),
  });

  async function prepareFile(file: File) {
    if (file.size > MAX_FILE_BYTES) { setError('File must be under 2 MB'); return; }
    if (!file.type.startsWith('image/')) { setError('Must be an image file'); return; }
    setError('');
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      const scale = Math.max(OUTPUT_SIZE / bitmap.width, OUTPUT_SIZE / bitmap.height);
      const w = bitmap.width * scale;
      const h = bitmap.height * scale;
      ctx.drawImage(bitmap, (OUTPUT_SIZE - w) / 2, (OUTPUT_SIZE - h) / 2, w, h);
      const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.85));
      setPendingBlob(blob);
      setPendingUrl(null);
      setPreview(canvas.toDataURL('image/jpeg', 0.85));
    } catch (e: any) {
      setError(e.message ?? 'Failed to process image');
    }
  }

  function previewUrl() {
    setError('');
    const url = urlInput.trim();
    if (!url.startsWith('https://')) { setError('URL must start with https://'); return; }
    setPendingUrl(url);
    setPendingBlob(null);
    setPreview(url);
  }

  async function saveChanges() {
    setError('');
    setUploading(true);
    try {
      if (pendingBlob) {
        const path = `${session!.user.id}.jpg`;
        const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, pendingBlob, {
          upsert: true, contentType: 'image/jpeg',
        });
        if (uploadErr) throw new Error(uploadErr.message);
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
        await saveProfile.mutateAsync(publicUrl);
      } else if (pendingUrl) {
        const head = await fetch(pendingUrl, { method: 'HEAD', signal: AbortSignal.timeout(8000) }).catch(() => null);
        if (head) {
          const len = parseInt(head.headers.get('content-length') ?? '0', 10);
          if (len > MAX_URL_BYTES) { setError('Image must be under 5 MB'); setUploading(false); return; }
          const ct = head.headers.get('content-type') ?? '';
          if (ct && !ct.startsWith('image/')) { setError('URL must point to an image'); setUploading(false); return; }
        }
        await saveProfile.mutateAsync(pendingUrl);
      }
    } catch (e: any) {
      setError(e.message ?? 'Save failed');
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar() {
    setUploading(true);
    try {
      await supabase.storage.from('avatars').remove([`${session!.user.id}.jpg`]).catch(() => {});
      await apiClient.patch('/auth/me', { avatarUrl: '' });
      qc.invalidateQueries({ queryKey: ['my-profile'] });
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Failed to remove avatar');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={s.backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>
        <div style={s.header}>
          <span style={s.title}>Change Avatar</span>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Preview */}
        <div style={s.previewSection}>
          <div style={s.previewWrap}>
            {preview
              ? <img src={preview} alt="avatar" style={s.previewImg} onError={() => setPreview(null)} />
              : <div style={s.previewPlaceholder}>?</div>
            }
          </div>
          <span style={s.previewLabel}>
            {hasPendingChange ? 'Preview — click Save to confirm' : currentUrl ? 'Current avatar' : 'No avatar set'}
          </span>
        </div>

        {/* Tabs */}
        <div style={s.tabs}>
          <button style={{ ...s.tab, ...(tab === 'upload' ? s.tabActive : {}) }} onClick={() => { setTab('upload'); setPendingBlob(null); setPendingUrl(null); setPreview(currentUrl ?? null); setError(''); }}>Upload File</button>
          <button style={{ ...s.tab, ...(tab === 'url' ? s.tabActive : {}) }} onClick={() => { setTab('url'); setPendingBlob(null); setPendingUrl(null); setPreview(currentUrl ?? null); setError(''); }}>Image URL</button>
        </div>

        {tab === 'upload' && (
          <div style={s.body}>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) prepareFile(f); }} />
            <button style={s.pickBtn} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              Choose Image
            </button>
            <div style={s.hint}>JPG, PNG, GIF, WebP · max 2 MB · resized to 256×256</div>
          </div>
        )}

        {tab === 'url' && (
          <div style={s.body}>
            <input
              style={s.urlInput}
              placeholder="https://example.com/avatar.jpg"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && previewUrl()}
            />
            <div style={s.hint}>Must be https:// · max 5 MB · must be a direct image link</div>
            <button style={s.previewBtn} onClick={previewUrl} disabled={!urlInput.trim()}>
              Preview
            </button>
          </div>
        )}

        {error && <div style={s.error}>{error}</div>}

        {hasPendingChange && (
          <button style={s.saveBtn} onClick={saveChanges} disabled={uploading}>
            {uploading ? 'Saving…' : 'Save Avatar'}
          </button>
        )}

        {currentUrl && !hasPendingChange && (
          <button style={s.removeBtn} onClick={removeAvatar} disabled={uploading}>Remove avatar</button>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 },
  modal: { background: '#161616', border: '1px solid #2a2a2a', borderRadius: 12, width: 340, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#fff', fontSize: 16, fontWeight: 700 },
  closeBtn: { background: 'none', border: 'none', color: '#666', fontSize: 18, cursor: 'pointer', padding: 0 },
  previewSection: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  previewWrap: { display: 'flex', justifyContent: 'center' },
  previewImg: { width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '3px solid #333' },
  previewPlaceholder: { width: 96, height: 96, borderRadius: '50%', background: '#222', border: '3px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: 36 },
  previewLabel: { color: '#555', fontSize: 11, textAlign: 'center' },
  tabs: { display: 'flex', gap: 4, background: '#111', borderRadius: 8, padding: 4 },
  tab: { flex: 1, background: 'none', border: 'none', color: '#666', fontSize: 13, fontWeight: 600, padding: '7px 0', borderRadius: 6, cursor: 'pointer' },
  tabActive: { background: '#222', color: '#fff' },
  body: { display: 'flex', flexDirection: 'column', gap: 10 },
  pickBtn: { background: '#333', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  previewBtn: { background: '#333', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  saveBtn: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  hint: { color: '#444', fontSize: 11, textAlign: 'center' },
  urlInput: { background: '#111', border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: 13, padding: '10px 12px', outline: 'none' },
  error: { color: '#ff5252', fontSize: 12, textAlign: 'center' },
  removeBtn: { background: 'none', border: '1px solid #333', borderRadius: 8, color: '#666', fontSize: 12, padding: '8px 0', cursor: 'pointer' },
};
