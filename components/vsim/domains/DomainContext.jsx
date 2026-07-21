import { createContext, useContext } from 'react';
import { getDomain } from './index.js';

export const DomainContext = createContext(getDomain('blank'));

export const useDomain = () => useContext(DomainContext);
export const useLabels = () => useDomain().labels;

/* Türkçe-doğru küçük harf (İ→i) — etiketleri cümle içinde kullanmak için */
export const lower = (s) => String(s ?? '').toLocaleLowerCase('tr-TR');
