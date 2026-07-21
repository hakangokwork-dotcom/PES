/* Promise-tabanlı imperatif diyalog servisi (singleton pub/sub).
   Herhangi bir modül confirmDialog/promptDialog/alertDialog çağırır; <DialogHost/> render eder. */
let queue = [];
let listener = null;
const emit = () => listener && listener(queue[0] || null);
const norm = (opts) => typeof opts === 'string' ? { message: opts } : (opts || {});
function enqueue(kind, opts) {
  return new Promise((resolve) => { queue.push({ kind, ...norm(opts), resolve }); emit(); });
}
export const confirmDialog = (opts) => enqueue('confirm', opts);
export const promptDialog  = (opts) => enqueue('prompt', opts);
export const alertDialog   = (opts) => enqueue('alert', opts);
export function _subscribe(fn) { listener = fn; emit(); return () => { if (listener === fn) listener = null; }; }
export function _resolveTop(value) { const top = queue.shift(); emit(); if (top) top.resolve(value); }
export function _reset() { queue = []; listener = null; }
