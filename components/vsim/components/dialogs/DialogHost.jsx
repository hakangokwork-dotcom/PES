import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { _subscribe, _resolveTop } from './dialogService.js';

/* Kök seviyede tek örnek render edilir (UretimSimulasyon.jsx).
   Aktif diyaloğu servisten alır ve uygulamanın temalı modal desenini uygular.
   confirm/prompt/alert türlerini destekler; z-[60] ile mevcut z-50 modalların üstünde durur. */
export default function DialogHost() {
  const [active, setActive] = useState(null);
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  // Servise abone ol (bir kez); dönen fonksiyon temizlik olarak aboneliği kaldırır.
  useEffect(() => _subscribe(setActive), []);

  // prompt girişini aktif diyalog değiştiğinde varsayılan değerle sıfırla.
  useEffect(() => { setValue(active?.defaultValue ?? ''); }, [active]);

  // prompt açıldığında input'a odaklan.
  useEffect(() => {
    if (active?.kind === 'prompt') {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [active]);

  // İptal semantiği: confirm→false, prompt→null, alert→(değer yok).
  const cancel = () => {
    if (!active) return;
    if (active.kind === 'confirm') _resolveTop(false);
    else if (active.kind === 'prompt') _resolveTop(null);
    else _resolveTop();
  };

  // ESC ile iptal (IME koruması: kompozisyon sırasında ESC modalı kapatmasın).
  // CAPTURE fazı + stopImmediatePropagation: bir modal ÜSTÜNDE açılan diyalog (ör. NodeModal'dan
  // silme onayı) ESC'lenince yalnız diyalog kapansın, alttaki modal da kapanmasın.
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => { if (e.isComposing) return; if (e.key === 'Escape') { e.stopImmediatePropagation(); cancel(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active]);

  if (!active) return null;

  const danger = !!active.danger;

  return (
    <div
      className="fixed inset-0 z-[60] bg-ink/40 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={cancel}
    >
      <div
        role="dialog" aria-modal="true"
        className="bg-surface rounded-[14px] shadow-card w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {active.kind === 'confirm' && (
          <>
            {active.title && (
              <h3 className="font-display text-lg font-semibold text-ink mb-2 flex items-center gap-2">
                {danger && <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0" />}
                {active.title}
              </h3>
            )}
            {active.message && (
              <p className="text-sm text-ink-soft whitespace-pre-line">{active.message}</p>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => _resolveTop(false)}
                className="px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-2 rounded"
              >{active.cancelText || 'Vazgeç'}</button>
              <button
                onClick={() => _resolveTop(true)}
                className={`px-4 py-1.5 text-sm text-white rounded ${danger ? 'bg-danger hover:bg-danger/90' : 'bg-accent hover:bg-accent-strong'}`}
              >{active.okText || 'Onayla'}</button>
            </div>
          </>
        )}

        {active.kind === 'prompt' && (
          <>
            {active.title && (
              <h3 className="font-display text-lg font-semibold text-ink mb-2">{active.title}</h3>
            )}
            {active.message && (
              <label className="block text-sm text-ink-soft whitespace-pre-line mb-2">{active.message}</label>
            )}
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.isComposing) return; if (e.key === 'Enter') { e.preventDefault(); _resolveTop(value); } }}
              className="w-full border border-line rounded px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => _resolveTop(null)}
                className="px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-2 rounded"
              >{active.cancelText || 'Vazgeç'}</button>
              <button
                onClick={() => _resolveTop(value)}
                className="px-4 py-1.5 text-sm text-white rounded bg-accent hover:bg-accent-strong"
              >{active.okText || 'Tamam'}</button>
            </div>
          </>
        )}

        {active.kind === 'alert' && (
          <>
            {active.title && (
              <h3 className="font-display text-lg font-semibold text-ink mb-2 flex items-center gap-2">
                {danger && <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0" />}
                {active.title}
              </h3>
            )}
            {active.message && (
              <div className="flex items-start gap-2">
                {danger && !active.title && <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />}
                <p className="text-sm text-ink-soft whitespace-pre-line">{active.message}</p>
              </div>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => _resolveTop()}
                className="px-4 py-1.5 text-sm text-white rounded bg-accent hover:bg-accent-strong"
              >{active.okText || 'Tamam'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
