import { Info } from 'lucide-react';
import { GLOSSARY } from '../help/glossary.js';

/* Küçük yeniden-kullanılabilir hover-popover bilgi bileşeni.
   props: { term } (glossary anahtarı) VEYA { text } (ham metin); { placement } 'top'|'bottom'.
   placement='bottom' → balon ikonun ALTINDA açılır (üstten kırpan overflow kaplarında, ör. tablo başlıkları).
   Bilinmeyen term ve metin yoksa → hiç render etme (null). */
export default function InfoTip({ term, text, placement = 'top' }) {
  const g = term ? GLOSSARY[term] : null;
  const body = text || g?.short;
  const label = g?.term;
  if (!body) return null;

  const pos = placement === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5';

  return (
    <span className="group relative inline-flex align-middle">
      <Info
        className="w-3.5 h-3.5 text-ink-faint hover:text-accent cursor-help align-middle"
        aria-label={label || 'bilgi'}
        title={label ? `${label}: ${body}` : body}
      />
      <span className={`hidden group-hover:block absolute z-40 left-1/2 -translate-x-1/2 w-56 bg-ink text-surface text-[11px] leading-snug rounded-lg px-2.5 py-1.5 shadow-card pointer-events-none ${pos}`}>
        {label && <span className="block font-semibold mb-0.5">{label}</span>}
        {body}
      </span>
    </span>
  );
}
