import { describe, it, expect } from 'vitest';
import { GUIDES } from './guides.js';

describe('guides', () => {
  it('ana akışlar için kılavuz var (tab kimlikleriyle)', () => {
    const tabs = GUIDES.map(g => g.tab);
    for (const t of ['flow','vsm','surec','dashboard','sim']) expect(tabs).toContain(t);
    for (const g of GUIDES) {
      expect(g.title).toBeTruthy();
      expect(Array.isArray(g.steps) && g.steps.length).toBeTruthy();
    }
  });

  it('sekme rehberleri çalışma akışı sırasında (üst menüyle aynı)', () => {
    // Üst menü sırası: Çiz → Modelle → Kaynakla → Detaylandır → Hesapla → Çalıştır → Haritala → Raporla.
    // guides.js bu sırayı izlemeli; sekme çubuğu değişirse (UretimSimulasyon.jsx) burası da güncellenmeli.
    const tabGuides = GUIDES.filter(g => g.tab && ['surec','flow','resources','ops','dashboard','sim','vsm','rapor'].includes(g.id));
    expect(tabGuides.map(g => g.id)).toEqual(['surec','flow','resources','ops','dashboard','sim','vsm','rapor']);
  });

  it('çalışma sırası rehberi var ve 8 adımı sayar', () => {
    const wf = GUIDES.find(g => g.id === 'workflow');
    expect(wf, 'workflow rehberi yok').toBeTruthy();
    expect(wf.tab).toBe('');            // sekmeye bağlı değil → panoda "bu sekmeye git" çıkmaz
    expect(wf.steps).toHaveLength(8);   // 8 sekmenin her biri
  });
});
