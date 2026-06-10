import { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../api/supabase';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_URL_BYTES = 5 * 1024 * 1024;
const OUTPUT_SIZE = 256;
const PREVIEW_SIZE = 200;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

interface Props { onClose: () => void; currentUrl?: string }

export function AvatarModal({ onClose, currentUrl }: Props) {
  const { session } = useAuthStore();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragState = useRef<{ startX: number; startY: number; startOffX: number; startOffY: number } | null>(null);

  const [tab, setTab] = useState<'upload' | 'url'>('upload');
  const [urlInput, setUrlInput] = useState('');
  const [displayPreview, setDisplayPreview] = useState<string | null>(currentUrl ?? null);

  // Crop state (used for both existing avatar and newly picked file)
  const [pendingBitmap, setPendingBitmap] = useState<ImageBitmap | null>(null);
  const [bitmapSrc, setBitmapSrc] = useState<string | null>(null);
  const [baseScaledW, setBaseScaledW] = useState(0);
  const [baseScaledH, setBaseScaledH] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [loadingExisting, setLoadingExisting] = useState(false);

  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const hasPendingFile = pendingBitmap !== null;
  const hasPendingUrl = pendingUrl !== null;
  const hasPendingChange = hasPendingFile || hasPendingUrl;

  // Load existing avatar into crop UI on open
  useEffect(() => {
    if (!currentUrl) return;
    setLoadingExisting(true);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      try {
        const bitmap = await createImageBitmap(img);
        const scale = Math.max(PREVIEW_SIZE / bitmap.width, PREVIEW_SIZE / bitmap.height);
        setBaseScaledW(bitmap.width * scale);
        setBaseScaledH(bitmap.height * scale);
        setZoom(1);
        setOffsetX(0);
        setOffsetY(0);
        setBitmapSrc(currentUrl);
        setPendingBitmap(bitmap);
      } catch { /* CORS blocked — fall back to static preview */ }
      setLoadingExisting(false);
    };
    img.onerror = () => setLoadingExisting(false);
    img.src = currentUrl + (currentUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
  }, []);// eslint-disable-line react-hooks/exhaustive-deps

  const scaledW = baseScaledW * zoom;
  const scaledH = baseScaledH * zoom;
  const maxOffsetX = Math.max(0, (scaledW - PREVIEW_SIZE) / 2);
  const maxOffsetY = Math.max(0, (scaledH - PREVIEW_SIZE) / 2);

  useEffect(() => {
    return () => { if (bitmapSrc) URL.revokeObjectURL(bitmapSrc); };
  }, [bitmapSrc]);

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
      const scale = Math.max(PREVIEW_SIZE / bitmap.width, PREVIEW_SIZE / bitmap.height);
      setBaseScaledW(bitmap.width * scale);
      setBaseScaledH(bitmap.height * scale);
      setZoom(1);
      setOffsetX(0);
      setOffsetY(0);
      if (bitmapSrc) URL.revokeObjectURL(bitmapSrc);
      setBitmapSrc(URL.createObjectURL(file));
      setPendingBitmap(bitmap);
      setPendingUrl(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to process image');
    }
  }

  function handleZoom(newZoom: number) {
    setZoom(newZoom);
    const newW = baseScaledW * newZoom;
    const newH = baseScaledH * newZoom;
    const newMaxX = Math.max(0, (newW - PREVIEW_SIZE) / 2);
    const newMaxY = Math.max(0, (newH - PREVIEW_SIZE) / 2);
    setOffsetX((x) => Math.max(-newMaxX, Math.min(newMaxX, x)));
    setOffsetY((y) => Math.max(-newMaxY, Math.min(newMaxY, y)));
  }

  function onDragStart(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const { clientX, clientY } = 'touches' in e ? e.touches[0] : e;
    dragState.current = { startX: clientX, startY: clientY, startOffX: offsetX, startOffY: offsetY };
  }

  function onDragMove(e: React.MouseEvent | React.TouchEvent) {
    if (!dragState.current) return;
    const { clientX, clientY } = 'touches' in e ? e.touches[0] : e;
    const dx = clientX - dragState.current.startX;
    const dy = clientY - dragState.current.startY;
    setOffsetX(Math.max(-maxOffsetX, Math.min(maxOffsetX, dragState.current.startOffX + dx)));
    setOffsetY(Math.max(-maxOffsetY, Math.min(maxOffsetY, dragState.current.startOffY + dy)));
  }

  function onDragEnd() { dragState.current = null; }

  function previewUrl() {
    setError('');
    const url = urlInput.trim();
    if (!url.startsWith('https://')) { setError('URL must start with https://'); return; }
    setPendingUrl(url);
    setPendingBitmap(null);
    setDisplayPreview(url);
  }

  async function saveChanges() {
    setError('');
    setUploading(true);
    try {
      if (pendingBitmap) {
        const canvas = document.createElement('canvas');
        canvas.width = OUTPUT_SIZE;
        canvas.height = OUTPUT_SIZE;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
        const canvasScale = OUTPUT_SIZE / PREVIEW_SIZE;
        const scale = Math.max(OUTPUT_SIZE / pendingBitmap.width, OUTPUT_SIZE / pendingBitmap.height) * zoom;
        const cW = pendingBitmap.width * scale;
        const cH = pendingBitmap.height * scale;
        ctx.drawImage(pendingBitmap,
          (OUTPUT_SIZE - cW) / 2 + offsetX * canvasScale,
          (OUTPUT_SIZE - cH) / 2 + offsetY * canvasScale,
          cW, cH,
        );
        const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.85));
        const path = `${session!.user.id}.jpg`;
        const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, blob, {
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

  function resetTab(t: 'upload' | 'url') {
    setTab(t);
    setPendingBitmap(null);
    setPendingUrl(null);
    setDisplayPreview(currentUrl ?? null);
    setError('');
  }

  return (
    <div style={s.backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>
        <div style={s.header}>
          <span style={s.title}>Change Avatar</span>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Crop / Preview */}
        <div style={s.previewSection}>
          {hasPendingFile && bitmapSrc ? (
            <>
              <div
                style={{ ...s.cropCircle, cursor: 'grab' }}
                onMouseDown={onDragStart}
                onMouseMove={onDragMove}
                onMouseUp={onDragEnd}
                onMouseLeave={onDragEnd}
                onTouchStart={onDragStart}
                onTouchMove={onDragMove}
                onTouchEnd={onDragEnd}
              >
                <img
                  src={bitmapSrc}
                  draggable={false}
                  style={{
                    position: 'absolute',
                    width: scaledW,
                    height: scaledH,
                    left: (PREVIEW_SIZE - scaledW) / 2 + offsetX,
                    top: (PREVIEW_SIZE - scaledH) / 2 + offsetY,
                    userSelect: 'none',
                    pointerEvents: 'none',
                  }}
                />
              </div>
              <div style={s.zoomRow}>
                <span style={s.zoomIcon}>🔍</span>
                <input
                  type="range"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => handleZoom(parseFloat(e.target.value))}
                  style={s.zoomSlider}
                />
                <span style={s.zoomIcon}>🔎</span>
              </div>
              <span style={s.previewLabel}>{loadingExisting ? 'Loading…' : 'Drag to reposition · slide to zoom'}</span>
            </>
          ) : (
            <>
              <div style={s.previewWrap}>
                {(hasPendingUrl ? pendingUrl : displayPreview)
                  ? <img src={(hasPendingUrl ? pendingUrl : displayPreview)!} alt="avatar" style={s.previewImg} onError={() => setDisplayPreview(null)} />
                  : <div style={s.previewPlaceholder}>?</div>
                }
              </div>
              <span style={s.previewLabel}>
                {hasPendingUrl ? 'Preview — click Save to confirm' : currentUrl ? 'Current avatar' : 'No avatar set'}
              </span>
            </>
          )}
        </div>

        {/* Tabs */}
        <div style={s.tabs}>
          <button style={{ ...s.tab, ...(tab === 'upload' ? s.tabActive : {}) }} onClick={() => resetTab('upload')}>Upload File</button>
          <button style={{ ...s.tab, ...(tab === 'url' ? s.tabActive : {}) }} onClick={() => resetTab('url')}>Image URL</button>
        </div>

        {tab === 'upload' && (
          <div style={s.body}>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) prepareFile(f); }} />
            <button style={s.pickBtn} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {hasPendingFile ? 'Choose Different Image' : 'Choose Image'}
            </button>
            <div style={s.hint}>JPG, PNG, GIF, WebP · max 2 MB</div>
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
            <div style={s.hint}>Must be https:// · max 5 MB · direct image link</div>
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
  previewSection: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  cropCircle: { width: PREVIEW_SIZE, height: PREVIEW_SIZE, borderRadius: '50%', overflow: 'hidden', position: 'relative', border: '3px solid #444', flexShrink: 0, background: '#fff' },
  previewWrap: { display: 'flex', justifyContent: 'center' },
  previewImg: { width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '3px solid #333' },
  previewPlaceholder: { width: 96, height: 96, borderRadius: '50%', background: '#222', border: '3px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: 36 },
  previewLabel: { color: '#555', fontSize: 11, textAlign: 'center' },
  zoomRow: { display: 'flex', alignItems: 'center', gap: 8, width: PREVIEW_SIZE },
  zoomIcon: { fontSize: 14 },
  zoomSlider: { flex: 1, accentColor: '#c8102e', cursor: 'pointer' },
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
