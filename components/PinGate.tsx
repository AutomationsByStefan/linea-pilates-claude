'use client';

import { useState, useEffect } from 'react';

const CORRECT_PIN = process.env.NEXT_PUBLIC_APP_PIN || '1234';
const SESSION_KEY = 'lp_auth';

export default function PinGate({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<boolean | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    setAuth(sessionStorage.getItem(SESSION_KEY) === 'ok');
  }, []);

  function handleDigit(d: string) {
    if (pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    setError(false);

    if (next.length === CORRECT_PIN.length) {
      if (next === CORRECT_PIN) {
        sessionStorage.setItem(SESSION_KEY, 'ok');
        setAuth(true);
      } else {
        setShake(true);
        setError(true);
        setTimeout(() => { setPin(''); setShake(false); }, 600);
      }
    }
  }

  function handleDelete() {
    setPin(p => p.slice(0, -1));
    setError(false);
  }

  if (auth === null) return null;
  if (auth) return <>{children}</>;

  const digits = [['1','2','3'],['4','5','6'],['7','8','9'],['','0','⌫']];

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #2c1810 0%, #4a2c2a 60%, #6b3a3a 100%)',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, color: 'white', letterSpacing: '0.5px' }}>
          Linea <span style={{ color: '#d4a574' }}>Pilates Reformer</span>
        </h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>Trebinje</p>
      </div>

      <div style={{
        background: 'rgba(255,255,255,0.06)', borderRadius: 24, padding: '36px 32px',
        backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)',
        width: '100%', maxWidth: 320,
      }}>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', marginBottom: 24 }}>
          Unesite PIN kod
        </p>

        {/* PIN dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 32 }}>
          {Array.from({ length: CORRECT_PIN.length }).map((_, i) => (
            <div key={i} style={{
              width: 14, height: 14, borderRadius: '50%',
              background: i < pin.length ? (error ? '#ff5252' : '#d4a574') : 'rgba(255,255,255,0.2)',
              transition: 'background 0.15s',
              animation: shake && i < pin.length ? 'shake 0.4s' : 'none',
            }} />
          ))}
        </div>

        {error && (
          <p style={{ color: '#ff5252', fontSize: 12, textAlign: 'center', marginBottom: 16, marginTop: -20 }}>
            Pogrešan PIN
          </p>
        )}

        {/* Keypad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {digits.flat().map((d, i) => (
            d === '' ? <div key={i} /> :
            <button key={i}
              onClick={() => d === '⌫' ? handleDelete() : handleDigit(d)}
              style={{
                height: 60, borderRadius: 14, border: 'none', fontSize: d === '⌫' ? 22 : 22,
                fontWeight: 600, cursor: 'pointer', transition: 'all 0.1s',
                background: d === '⌫' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)',
                color: 'white',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(212,165,116,0.3)')}
              onMouseLeave={e => (e.currentTarget.style.background = d === '⌫' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)')}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&display=swap');
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          75% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
