import blank from './blank.js';
import textileBasic from './textile-basic.js';

export const BUILTIN_TEMPLATES = [blank, textileBasic];

/* Vizyon kartları — galeride soluk görünür, seçilemez (spec §7.1) */
export const COMING_SOON = [
  { templateId: 'retail',   name: 'Mağaza',   description: 'Mal kabul → Depo → Reyon → Kasa',                    icon: 'Store',       comingSoon: true },
];

export function findTemplate(id) {
  return BUILTIN_TEMPLATES.find(t => t.templateId === id) || null;
}
