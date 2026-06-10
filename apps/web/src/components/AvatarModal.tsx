import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../api/supabase';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_URL_BYTES = 5 * 1024 * 1024;  // 5 MB — checked via HEAD request
const OUTPUT_SIZE = 256;                 // resize to 256×256

interface Props { onClose: () => void; currentUrl?: string }

export function AvatarModal({ onClose, currentUrl }: Props) {
  const { session } = useAuthStore();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<'upload' | 'url'>('upload');
  const [urlInput, setUrlInput] = useState('');
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const saveProfile = useMutation({
    mutationFn: (avatarUrl: string) => apiClient.patch('/auth/me', { avatarUrl }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-profile'] }); onClose(); },
    onError: (e: any) => setError(e?.error ?? 'Failed to save'),
  });

  async function resizeAndUpload(file: File) {
    if (file.size > MAX_FILE_BYTES) { setError('File must be under 2 MB'); return; }
    if (!file.type.startsWith('image/')) { setError('Must be an image file'); return; }

    setError('');
    setUploading(true);
    try {
      // Resize to OUTPUT_SIZE × OUTPUT_SIZE via canvas
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d')!;
      const scale = Math.min(OUTPUT_SIZE / bitmap.width, OUTPUT_SIZE / bitmap.height);
      const w = bitmap.width * scale;
      const h = bitmap.height * scale;
      ctx.drawImage(bitmap, (OUTPUT_SIZE - w) / 2, (OUTPUT_SIZE - h) / 2, w, h);

      const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.85));
      const path = `${session!.user.id}.jpg`;

      const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, blob, {
        upsert: true, contentType: 'image/jpeg',
      });
      if (uploadErr) throw new Error(uploadErr.message);

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      setPreview(publicUrl + '?t=' + Date.now());
      await saveProfile.mutateAsync(publicUrl);
    } catch (e: any) {
      setError(e.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function saveUrl() {
    setError('');
    const url = urlInput.trim();
    if (!url.startsWith('https://')) { setError('URL must start with https://'); return; }

    setUploading(true);
    try {
      // HEAD request to check size
      const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) }).catch(() => null);
      if (head) {
        const len = parseInt(head.headers.get('content-length') ?? '0', 10);
        if (len > MAX_URL_BYTES) { setError('Image must be under 5 MB'); setUploading(false); return; }
        const ct = head.headers.get('content-type') ?? '';
        if (ct && !ct.startsWith('image/')) { setError('URL must point to an image'); setUploading(false); return; }
      }
      setPreview(url);
      await saveProfile.mutateAsync(url);
    } catch (e: any) {
      setError(e.message ?? 'Failed to save URL');
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
        <div style={s.previewWrap}>
          {preview
            ? <img src={preview} alt="avatar" style={s.previewImg} onError={() => setPreview(null)} />
            : <div style={s.previewPlaceholder}>?</div>
          }
        </div>

        {/* Tabs */}
        <div style={s.tabs}>
          <button style={{ ...s.tab, ...(tab === 'upload' ? s.tabActive : {}) }} onClick={() => setTab('upload')}>Upload File</button>
          <button style={{ ...s.tab, ...(tab === 'url' ? s.tabActive : {}) }} onClick={() => setTab('url')}>Image URL</button>
        </div>

        {tab === 'upload' && (
          <div style={s.body}>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) resizeAndUpload(f); }} />
            <button style={s.pickBtn} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Choose Image'}
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
              onKeyDown={(e) => e.key === 'Enter' && saveUrl()}
            />
            <div style={s.hint}>Must be https:// · max 5 MB · must be a direct image link</div>
            <button style={s.saveBtn} onClick={saveUrl} disabled={uploading || !urlInput.trim()}>
              {uploading ? 'Saving…' : 'Save URL'}
            </button>
          </div>
        )}

        {error && <div style={s.error}>{error}</div>}

        {currentUrl && (
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
  previewWrap: { display: 'flex', justifyContent: 'center' },
  previewImg: { width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '2px solid #333' },
  previewPlaceholder: { width: 80, height: 80, borderRadius: '50%', background: '#222', border: '2px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: 32 },
  tabs: { display: 'flex', gap: 4, background: '#111', borderRadius: 8, padding: 4 },
  tab: { flex: 1, background: 'none', border: 'none', color: '#666', fontSize: 13, fontWeight: 600, padding: '7px 0', borderRadius: 6, cursor: 'pointer' },
  tabActive: { background: '#222', color: '#fff' },
  body: { display: 'flex', flexDirection: 'column', gap: 10 },
  pickBtn: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  saveBtn: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  hint: { color: '#444', fontSize: 11, textAlign: 'center' },
  urlInput: { background: '#111', border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: 13, padding: '10px 12px', outline: 'none' },
  error: { color: '#ff5252', fontSize: 12, textAlign: 'center' },
  removeBtn: { background: 'none', border: '1px solid #333', borderRadius: 8, color: '#666', fontSize: 12, padding: '8px 0', cursor: 'pointer' },
};
