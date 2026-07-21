import React, { useRef } from 'react';
import { Shirt, Workflow, Store, Trash2, Download, Upload, Star } from 'lucide-react';
import { BUILTIN_TEMPLATES, COMING_SOON } from '../templates/index.js';

const ICONS = { Shirt, Workflow, Store };

function TemplateCard({ tpl, onSelect, onDelete, onExport }) {
  const Icon = ICONS[tpl.icon] || Workflow;
  const disabled = !!tpl.comingSoon;
  return (
    <div
      onClick={() => !disabled && onSelect(tpl)}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(tpl); } }}
      className={`relative rounded-[10px] p-5 transition group
        ${disabled ? 'opacity-60 cursor-not-allowed bg-surface-2 border border-line'
                   : 'cursor-pointer bg-surface border border-line shadow-card hover:border-accent/50 hover:shadow-[0_2px_4px_rgba(26,43,50,0.08),0_12px_32px_rgba(26,43,50,0.12)]'}`}>
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center
          ${disabled ? 'bg-surface text-ink-faint' : 'bg-accent-tint text-accent'}`}>
          <Icon className="w-5 h-5" />
        </div>
        <h3 className="font-display font-semibold text-ink">{tpl.name}</h3>
        {tpl.custom && <Star className="w-4 h-4 text-warn fill-warn" title="Kullanıcı şablonu" />}
        {disabled && (
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider bg-surface-2 border border-line text-ink-faint px-2 py-0.5 rounded-full">
            Yakında
          </span>
        )}
      </div>
      <p className="text-sm text-ink-soft min-h-[40px]">{tpl.description || '—'}</p>
      {tpl.custom && (
        <div className="absolute top-3 right-3 hidden group-hover:flex group-focus-within:flex gap-1">
          <button onClick={(e) => { e.stopPropagation(); onExport(tpl); }}
            className="p-1.5 rounded bg-surface-2 hover:bg-line/50 text-ink" title="JSON olarak indir">
            <Download className="w-3.5 h-3.5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(tpl); }}
            className="p-1.5 rounded bg-danger-tint hover:bg-danger-tint/70 text-danger" title="Şablonu sil">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function Gallery({ userTemplates, onSelect, onDeleteUser, onExportUser, onImportUser, onClose, hasWork }) {
  const fileRef = useRef(null);
  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      <header className="bg-header text-header-ink">
        <div className="max-w-[1100px] mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-header-ink flex-shrink-0" aria-hidden="true">
              <circle cx="18" cy="18" r="14.5" stroke="currentColor" strokeWidth="2.5" />
              <circle cx="18" cy="18" r="5" fill="#DE7C3B" />
            </svg>
            <div>
              <h1 className="text-lg font-display font-bold tracking-tight">
                <span className="text-header-ink">Pro</span><span className="text-brand-bright">VSM</span><span className="font-sans font-semibold text-header-ink/80"> — Değer Akışı Simülasyonu</span>
              </h1>
              <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-header-ink/60">
                Bir şablon seç veya boş kanvasla kendi akışını tasarla
              </p>
            </div>
          </div>
          {hasWork && (
            <button onClick={onClose} className="px-4 py-2 border border-header-ink/25 text-header-ink hover:bg-header-ink/10 rounded transition text-sm">
              ← Çalışmaya dön
            </button>
          )}
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 py-8 space-y-8">
        <section>
          <h2 className="text-[11px] font-semibold text-ink-soft uppercase tracking-[0.08em] mb-3">Hazır Şablonlar</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {BUILTIN_TEMPLATES.map(t => <TemplateCard key={t.templateId} tpl={t} onSelect={onSelect} />)}
            {COMING_SOON.map(t => <TemplateCard key={t.templateId} tpl={t} onSelect={onSelect} />)}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-semibold text-ink-soft uppercase tracking-[0.08em]">Benim Şablonlarım</h2>
            <button onClick={() => fileRef.current?.click()}
              className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-line text-ink rounded hover:bg-surface-2">
              <Upload className="w-3.5 h-3.5" /> JSON içe aktar
            </button>
            <input ref={fileRef} type="file" accept=".json" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportUser(f); e.target.value = ''; }} />
          </div>
          {userTemplates.length === 0 ? (
            <p className="text-sm text-ink-faint bg-surface border border-dashed border-line-strong rounded-[10px] p-6 text-center">
              Henüz kayıtlı şablonun yok. Çalışma alanında <b>Şablon olarak kaydet</b> ile buraya ekleyebilirsin.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {userTemplates.map(t => (
                <TemplateCard key={t.templateId} tpl={t} onSelect={onSelect} onDelete={onDeleteUser} onExport={onExportUser} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
