import textile from './textile.js';
import blank from './blank.js';

export const DOMAINS = { textile, blank };

/* Bilinmeyen/eksik id her zaman blank'e düşer — motor asla domainsiz kalmaz. */
export function getDomain(id) {
  return DOMAINS[id] || blank;
}
