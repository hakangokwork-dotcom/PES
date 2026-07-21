import React from 'react';

/* Kök hata sınırı (B1): render istisnası beyaz ekran yerine kurtarma ekranı.
   Veriye DOKUNMAZ — localStorage olduğu gibi kalır; yeniden yükleme çoğu durumda yeter. */
export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('ProVSM hata sınırı:', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#FAF5EC', color: '#1A2B32', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
        <div style={{ maxWidth: 520, background: '#fff', border: '1px solid #E7E0D6', borderRadius: 12, padding: 28 }}>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Bir şeyler ters gitti</h1>
          <p style={{ fontSize: 14, color: '#52646C', margin: '0 0 16px' }}>
            Uygulama beklenmeyen bir hatayla karşılaştı. Verileriniz tarayıcınızda güvende —
            yeniden yüklemek çoğu zaman sorunu çözer.
          </p>
          <button onClick={() => location.reload()}
            style={{ background: '#2F9E68', color: '#fff', border: 0, borderRadius: 8, padding: '10px 18px', fontSize: 14, cursor: 'pointer' }}>
            Yeniden Yükle
          </button>
          <details style={{ marginTop: 16, fontSize: 12, color: '#8A98A0' }}>
            <summary>Teknik detay</summary>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.error?.stack || this.state.error)}</pre>
          </details>
        </div>
      </div>
    );
  }
}
