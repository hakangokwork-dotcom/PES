import { describe, it, expect } from 'vitest';
import { getDomain, DOMAINS } from './index.js';

const REQUIRED_LABEL_KEYS = [
  'item', 'itemPlural', 'station', 'mainGroup', 'resource', 'resourcePlural',
  'person', 'personPlural', 'facility', 'demandUnit',
];

describe('domain registry', () => {
  it('textile ve blank kayıtlı', () => {
    expect(Object.keys(DOMAINS).sort()).toEqual(['blank', 'textile']);
  });

  it('bilinmeyen id blank\'e düşer', () => {
    expect(getDomain('yok').id).toBe('blank');
    expect(getDomain(null).id).toBe('blank');
    expect(getDomain(undefined).id).toBe('blank');
  });

  it('textile pack doğru', () => {
    const d = getDomain('textile');
    expect(d.name).toBe('Tekstil / Konfeksiyon');
    expect(d.labels.item).toBe('Parça');
    expect(d.labels.resource).toBe('Makine');
    expect(d.opTypes).toContain('DİKİM');
    expect(d.opTypes).toContain('OVERLOK');
    expect(d.opTypes).toHaveLength(12);
    expect(d.defaults).toEqual({ netMinutes: 540, efficiency: 0.85, pfd: 0.15, demand: 480 });
  });

  it('blank pack jenerik ve opTypes boş', () => {
    const d = getDomain('blank');
    expect(d.labels.item).toBe('İş Birimi');
    expect(d.labels.resource).toBe('Kaynak');
    expect(d.labels.person).toBe('Personel');
    expect(d.opTypes).toEqual([]);
  });

  it('her pack tüm zorunlu label anahtarlarına ve adviceHints\'e sahip', () => {
    for (const d of Object.values(DOMAINS)) {
      for (const k of REQUIRED_LABEL_KEYS) {
        expect(d.labels[k], `${d.id}.labels.${k}`).toBeTruthy();
      }
      expect(d.adviceHints.assignResources, `${d.id}.adviceHints`).toBeTruthy();
      expect(d.adviceHints.bottleneckFix, `${d.id}.adviceHints`).toBeTruthy();
    }
  });
});
