/* Kullanıcı şablonları — localStorage (vsim_user_templates anahtarı). */
const KEY = 'vsim_user_templates';

export function listUserTemplates() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function saveUserTemplate(tpl) {
  const all = listUserTemplates().filter(t => t.templateId !== tpl.templateId);
  all.push(tpl);
  try { localStorage.setItem(KEY, JSON.stringify(all)); return true; }
  catch { return false; }               // kota/erişim — kaydedilemedi
}

export function deleteUserTemplate(templateId) {
  try {
    localStorage.setItem(KEY, JSON.stringify(listUserTemplates().filter(t => t.templateId !== templateId)));
    return true;
  } catch { return false; }
}
