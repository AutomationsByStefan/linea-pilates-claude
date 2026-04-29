'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Member } from '@/lib/types';

const MAX_REFORMERS = 3;

function getTodayStr() { return new Date().toISOString().split('T')[0]; }
function getCurrentHour() { return new Date().getHours(); }

function getWorkingSlots(dateStr: string): string[] {
  const d = new Date(dateStr);
  const day = d.getDay();
  if (day === 0) return [];
  if (day === 6) return ['8h', '9h', '10h', '11h'];
  return ['8h', '9h', '10h', '11h', '17h', '18h', '19h', '20h'];
}

function parseHour(t: string) { return parseInt(t.replace('h', '')); }

function isSessionPast(date: string, time: string) {
  const today = getTodayStr();
  if (date < today) return true;
  if (date === today && parseHour(time) < getCurrentHour()) return true;
  return false;
}

function fmtDate(d: string) {
  if (!d) return '';
  const [y, m, dd] = d.split('-');
  return `${dd}.${m}.${y}`;
}

const DAYS_SR = ['Ned', 'Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec'];
function fmtDateShort(d: string) {
  const dt = new Date(d);
  return `${dt.getDate()}. ${MONTHS[dt.getMonth()]}`;
}

const PACKAGES = [
  { name: 'Set 4', sessions: 4, price: 60 },
  { name: 'Set 6', sessions: 6, price: 90 },
  { name: 'Set 6+2', sessions: 8, price: 90 },
  { name: 'Set 8', sessions: 8, price: 125 },
  { name: 'Set 8+2', sessions: 10, price: 125 },
  { name: 'Set 10+2', sessions: 12, price: 145 },
  { name: 'Set 12', sessions: 12, price: 175 },
  { name: 'Set 12+2', sessions: 14, price: 175 },
  { name: 'Set 12 ind.', sessions: 12, price: 360 },
  { name: 'Pojedinačni', sessions: 1, price: 15 },
];

function Badge({ type, text }: { type: string; text: string }) {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    trial: { bg: '#fff3e0', color: '#e65100', border: '#ffe0b2' },
    active: { bg: '#e8f5e9', color: '#2e7d32', border: '#c8e6c9' },
    expired: { bg: '#ffebee', color: '#c62828', border: '#ffcdd2' },
  };
  const s = styles[type] || styles.active;
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );
}

function Card({ children, style, onClick }: { children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ background: 'white', borderRadius: 16, border: '1px solid #e0dcd5', padding: 16, marginBottom: 10, cursor: onClick ? 'pointer' : 'default', transition: 'box-shadow .15s', ...style }}
      onMouseEnter={e => onClick && ((e.currentTarget as HTMLElement).style.boxShadow = '0 6px 20px rgba(0,0,0,.08)')}
      onMouseLeave={e => onClick && ((e.currentTarget as HTMLElement).style.boxShadow = 'none')}
    >
      {children}
    </div>
  );
}

export default function App() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('dashboard');
  const [selId, setSelId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [calDate, setCalDate] = useState(getTodayStr());
  const [calSlot, setCalSlot] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newM, setNewM] = useState({ name: '', phone: '' });
  const [showPayment, setShowPayment] = useState<string | null>(null);
  const [payPkg, setPayPkg] = useState('');
  const [weekOff, setWeekOff] = useState(0);
  const [bookingSlot, setBookingSlot] = useState<{ date: string; time: string } | null>(null);
  const [bookSearch, setBookSearch] = useState('');
  const [trialModal, setTrialModal] = useState<{ date: string; time: string } | null>(null);
  const [trialName, setTrialName] = useState('');

  useEffect(() => {
    fetch('/api/members')
      .then(r => r.json())
      .then(data => { setMembers(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const member = selId ? members.find(m => m.id === selId) : null;

  const getUsedCount = useCallback((m: Member) => {
    return m.sessions.filter(s => !s.trial && isSessionPast(s.date, s.time)).length;
  }, []);

  const getScheduledCount = useCallback((m: Member) => {
    return m.sessions.filter(s => !s.trial).length;
  }, []);

  const getRemaining = useCallback((m: Member) => {
    return m.totalSessions - getUsedCount(m);
  }, [getUsedCount]);

  const getScheduledRemaining = useCallback((m: Member) => {
    return m.totalSessions - getScheduledCount(m);
  }, [getScheduledCount]);

  const slotMap = useMemo(() => {
    const map: Record<string, { memberId: string; name: string; trial: boolean }[]> = {};
    members.forEach(m => {
      m.sessions.forEach(s => {
        const key = `${s.date}_${s.time}`;
        if (!map[key]) map[key] = [];
        map[key].push({ memberId: m.id, name: m.name, trial: s.trial });
      });
    });
    return map;
  }, [members]);

  const totalRevenue = members.reduce((s, m) => s + m.paid, 0);
  const activeCount = members.filter(m => m.status === 'active').length;
  const trialCount = members.filter(m => m.status === 'trial').length;
  const needPayment = members.filter(m => m.status === 'active' && getRemaining(m) <= 0);

  async function addPayment(memberId: string) {
    const pkg = PACKAGES.find(p => p.name === payPkg);
    if (!pkg) return;
    const res = await fetch(`/api/members/${memberId}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: pkg.name, amount: pkg.price, sessions: pkg.sessions }),
    });
    const updated = await res.json();
    setMembers(prev => prev.map(m => m.id === memberId ? updated : m));
    setPayPkg('');
    setShowPayment(null);
  }

  async function addMember() {
    if (!newM.name) return;
    const res = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newM.name, phone: newM.phone }),
    });
    const created = await res.json();
    setMembers(prev => [...prev, created]);
    setNewM({ name: '', phone: '' });
    setShowAdd(false);
  }

  async function bookSlot(memberId: string, date: string, time: string, trial = false) {
    const m = members.find(x => x.id === memberId);
    if (!m) return;
    const exists = m.sessions.find(s => s.date === date && s.time === time);

    if (exists) {
      // Optimistic remove
      setMembers(prev => prev.map(x => x.id !== memberId ? x : {
        ...x, sessions: x.sessions.filter(s => s.id !== exists.id),
      }));
      await fetch(`/api/members/${memberId}/sessions/${exists.id}`, { method: 'DELETE' });
    } else {
      const tempId = 'temp-' + Date.now();
      // Optimistic add
      setMembers(prev => prev.map(x => x.id !== memberId ? x : {
        ...x, sessions: [...x.sessions, { id: tempId, date, time, trial }],
      }));
      const res = await fetch(`/api/members/${memberId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, time, trial }),
      });
      const session = await res.json();
      setMembers(prev => prev.map(x => x.id !== memberId ? x : {
        ...x, sessions: x.sessions.map(s => s.id === tempId ? session : s),
      }));
    }
  }

  async function bookTrial() {
    if (!trialModal || !trialName.trim()) return;
    const { date, time } = trialModal;

    const existing = members.find(m => m.name.toLowerCase() === trialName.toLowerCase());
    if (existing) {
      await bookSlot(existing.id, date, time, true);
    } else {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trialName.trim(), phone: '', trialDate: date, trialTime: time }),
      });
      const created = await res.json();
      setMembers(prev => [...prev, created]);
    }
    setTrialModal(null);
    setTrialName('');
    setBookingSlot(null);
    setBookSearch('');
  }

  const filteredMembers = members.filter(m => {
    if (!m.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'active') return m.status === 'active';
    if (filter === 'trial') return m.status === 'trial';
    if (filter === 'expired') return m.status === 'active' && getRemaining(m) <= 0;
    return true;
  });

  function getWeek(off: number) {
    const d = new Date();
    const day = d.getDay();
    const mon = new Date(d);
    mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1) + off * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(mon);
      x.setDate(mon.getDate() + i);
      return x.toISOString().split('T')[0];
    });
  }

  const weekDates = getWeek(weekOff);
  const calSlots = getWorkingSlots(calDate);
  const TODAY = getTodayStr();

  const nav = [
    { id: 'dashboard', label: 'Pregled', icon: '⬡' },
    { id: 'members', label: 'Članice', icon: '♀' },
    { id: 'calendar', label: 'Kalendar', icon: '▦' },
    { id: 'schedule', label: 'Sedmica', icon: '☰' },
    { id: 'finance', label: 'Finansije', icon: '◈' },
  ];

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f2ed' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: '#4a2c2a', marginBottom: 8 }}>Linea Pilates Reformer</div>
          <div style={{ fontSize: 13, color: '#999' }}>Učitavanje...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* HEADER */}
        <div className="lp-header-band">
          <div className="lp-header-inner">
            <div>
              <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700, letterSpacing: '0.5px' }}>
                Linea <span style={{ color: '#d4a574' }}>Pilates Reformer</span>
              </h1>
              <p style={{ fontSize: 11, opacity: 0.5, marginTop: 1 }}>Trebinje • {MAX_REFORMERS} reformera</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, opacity: 0.6 }}>{fmtDate(TODAY)}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#d4a574' }}>{totalRevenue} KM</div>
            </div>
          </div>
        </div>

        {/* NAV */}
        <div className="lp-nav-band">
          <div className="lp-nav-inner">
          {nav.map(n => (
            <button key={n.id} onClick={() => { setView(n.id); setSelId(null); }}
              style={{ flex: 1, minWidth: 60, padding: '10px 4px', border: 'none', background: view === n.id ? '#f5f2ed' : 'white',
                cursor: 'pointer', borderBottom: view === n.id ? '3px solid #4a2c2a' : '3px solid transparent' }}>
              <div style={{ fontSize: 16 }}>{n.icon}</div>
              <div style={{ fontSize: 10, fontWeight: view === n.id ? 700 : 400, color: view === n.id ? '#4a2c2a' : '#999' }}>{n.label}</div>
            </button>
          ))}
          </div>
        </div>

        <div className="lp-content">

          {/* ===== DASHBOARD ===== */}
          {view === 'dashboard' && <>
            <div className="lp-stats">
              {[
                { l: 'Aktivne', v: activeCount, bg: '#e8f5e9', c: '#2e7d32' },
                { l: 'Probni', v: trialCount, bg: '#fff3e0', c: '#e65100' },
                { l: 'Treninga', v: members.reduce((a, m) => a + getUsedCount(m), 0), bg: '#e3f2fd', c: '#1565c0' },
                { l: 'Zarada', v: `${totalRevenue} KM`, bg: '#fce4ec', c: '#c62828' },
              ].map((c, i) => (
                <div key={i} style={{ background: c.bg, borderRadius: 14, padding: '14px 14px' }}>
                  <div style={{ fontSize: 11, color: c.c, opacity: 0.8, fontWeight: 500 }}>{c.l}</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: c.c }}>{c.v}</div>
                </div>
              ))}
            </div>

            {needPayment.length > 0 && <>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: '#c62828' }}>⚠ Treba nova uplata ({needPayment.length})</h3>
              {needPayment.map(m => (
                <Card key={m.id} onClick={() => { setSelId(m.id); setView('members'); }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: '#ffcdd2' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: '#c62828' }}>Iskorišćeno: {getUsedCount(m)}/{m.totalSessions} • Zakazano: {getScheduledCount(m)}</div>
                  </div>
                  <Badge type="expired" text={`${getRemaining(m)}`} />
                </Card>
              ))}
            </>}

            {trialCount > 0 && <>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, marginTop: 14 }}>Čekaju uplatu</h3>
              {members.filter(m => m.status === 'trial').map(m => (
                <Card key={m.id} onClick={() => { setSelId(m.id); setView('members'); }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{m.comment}</div>
                  </div>
                  <Badge type="trial" text="Probni" />
                </Card>
              ))}
            </>}
          </>}

          {/* ===== MEMBERS LIST ===== */}
          {view === 'members' && !selId && <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input placeholder="Pretraži..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ flex: 1, padding: '10px 14px', borderRadius: 12, border: '1px solid #ddd', fontSize: 14 }} />
              <button onClick={() => setShowAdd(true)}
                style={{ background: '#4a2c2a', color: 'white', border: 'none', borderRadius: 12, padding: '10px 16px', fontSize: 18, cursor: 'pointer' }}>+</button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {[{ id: 'all', l: 'Sve' }, { id: 'active', l: 'Aktivne' }, { id: 'trial', l: 'Probni' }, { id: 'expired', l: 'Bez paketa' }].map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)}
                  style={{ padding: '5px 12px', borderRadius: 20, border: 'none', fontSize: 11, cursor: 'pointer', fontWeight: 600,
                    background: filter === f.id ? '#4a2c2a' : '#e8e5e0', color: filter === f.id ? 'white' : '#666' }}>{f.l}</button>
              ))}
            </div>
            <div className="lp-members-grid">
            {filteredMembers.map(m => {
              const rem = getRemaining(m);
              return (
                <Card key={m.id} onClick={() => setSelId(m.id)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%',
                      background: m.status === 'active' ? 'linear-gradient(135deg,#4a2c2a,#6b3a3a)' : 'linear-gradient(135deg,#d4a574,#c49560)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 14 }}>
                      {m.name.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>
                        {m.package || 'Bez paketa'}
                        {m.status === 'active' && ` • ${getUsedCount(m)}/${m.totalSessions} iskorist. • ${rem} preost.`}
                      </div>
                    </div>
                  </div>
                  <Badge type={m.status === 'trial' ? 'trial' : rem <= 0 ? 'expired' : 'active'}
                    text={m.status === 'trial' ? 'Probni' : `${rem}`} />
                </Card>
              );
            })}
            </div>
          </>}

          {/* ===== MEMBER DETAIL ===== */}
          {view === 'members' && selId && member && <>
            <button onClick={() => setSelId(null)}
              style={{ background: 'none', border: 'none', fontSize: 13, color: '#4a2c2a', cursor: 'pointer', fontWeight: 600, marginBottom: 14 }}>
              ← Nazad
            </button>

            <div style={{ background: 'linear-gradient(135deg,#2c1810,#4a2c2a)', borderRadius: 18, padding: '20px 18px', color: 'white', marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 700 }}>{member.name}</h2>
                  {member.phone && <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>Tel: {member.phone}</div>}
                  {member.firstPaidDate && <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>Prva uplata: {fmtDate(member.firstPaidDate)}</div>}
                  {member.trialDate && <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>Probni: {fmtDate(member.trialDate)}</div>}
                </div>
                <Badge type={member.status === 'trial' ? 'trial' : getRemaining(member) <= 0 ? 'expired' : 'active'}
                  text={member.status === 'trial' ? 'Probni' : getRemaining(member) <= 0 ? 'Potrošen' : 'Aktivan'} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 16 }}>
                <div style={{ background: 'rgba(255,255,255,.12)', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{getUsedCount(member)}</div>
                  <div style={{ fontSize: 10, opacity: 0.6 }}>Iskorišćeno</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,.12)', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: getRemaining(member) <= 0 ? '#ff8a80' : '#d4a574' }}>{getRemaining(member)}</div>
                  <div style={{ fontSize: 10, opacity: 0.6 }}>Preostalo</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,.12)', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#d4a574' }}>{getScheduledCount(member) - getUsedCount(member)}</div>
                  <div style={{ fontSize: 10, opacity: 0.6 }}>Zakazano</div>
                </div>
              </div>
            </div>

            <div className="lp-detail-cols">
            {/* Payments */}
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700 }}>Uplate</h4>
                <button onClick={() => setShowPayment(showPayment === member.id ? null : member.id)}
                  style={{ background: '#4a2c2a', color: 'white', border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                  + Nova uplata
                </button>
              </div>
              {member.payments.length === 0 && <p style={{ fontSize: 12, color: '#999' }}>Nema uplata</p>}
              {member.payments.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0', fontSize: 12 }}>
                  <span>{fmtDate(p.date)} — {p.package}</span>
                  <span style={{ fontWeight: 700, color: '#2e7d32' }}>{p.amount} KM ({p.sessions} tr.)</span>
                </div>
              ))}
              <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13, textAlign: 'right' }}>Ukupno: {member.paid} KM</div>

              {showPayment === member.id && (
                <div style={{ marginTop: 12, padding: 12, background: '#faf8f5', borderRadius: 10 }}>
                  <select value={payPkg} onChange={e => setPayPkg(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, marginBottom: 8, background: 'white' }}>
                    <option value="">Izaberi paket</option>
                    {PACKAGES.map(p => <option key={p.name} value={p.name}>{p.name} — {p.price} KM ({p.sessions} treninga)</option>)}
                  </select>
                  <button onClick={() => addPayment(member.id)}
                    style={{ width: '100%', padding: 10, background: '#4a2c2a', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
                    Potvrdi uplatu
                  </button>
                </div>
              )}
            </Card>

            {/* Sessions */}
            <Card>
              <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Termini</h4>
              {member.sessions.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).map((s, i) => {
                const past = isSessionPast(s.date, s.time);
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '5px 0', borderBottom: '1px solid #f5f5f5', fontSize: 12, opacity: past ? 0.6 : 1 }}>
                    <span>
                      {fmtDate(s.date)} — {s.time}
                      {s.trial && <span style={{ background: '#ffcdd2', color: '#c62828', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, marginLeft: 6 }}>P</span>}
                      {past && !s.trial && <span style={{ color: '#2e7d32', marginLeft: 4, fontSize: 10 }}>✓</span>}
                      {!past && !s.trial && <span style={{ color: '#1565c0', marginLeft: 4, fontSize: 10 }}>zakazan</span>}
                    </span>
                    {!past && (
                      <button onClick={() => bookSlot(member.id, s.date, s.time)}
                        style={{ background: '#ffebee', color: '#c62828', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>✕</button>
                    )}
                  </div>
                );
              })}
            </Card>
            </div>
          </>}

          {/* ===== CALENDAR (daily view) ===== */}
          {view === 'calendar' && <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
              <input type="date" value={calDate} onChange={e => { setCalDate(e.target.value); setCalSlot(null); setBookingSlot(null); }}
                style={{ flex: 1, padding: '10px 14px', borderRadius: 12, border: '1px solid #ddd', fontSize: 14 }} />
            </div>

            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>
              {DAYS_SR[new Date(calDate).getDay()]}, {fmtDate(calDate)}
            </div>

            {calSlots.length === 0 ? (
              <Card><p style={{ fontSize: 13, color: '#999', textAlign: 'center' }}>Neradni dan</p></Card>
            ) : <div className="lp-cal-slots">{calSlots.map(time => {
              const key = `${calDate}_${time}`;
              const booked = slotMap[key] || [];
              const taken = booked.length;
              const free = MAX_REFORMERS - taken;
              const isOpen = calSlot === time;
              const isBooking = bookingSlot && bookingSlot.date === calDate && bookingSlot.time === time;

              const bookableMembers = members.filter(m => {
                if (booked.find(b => b.memberId === m.id)) return false;
                if (bookSearch && !m.name.toLowerCase().includes(bookSearch.toLowerCase())) return false;
                return true;
              });

              return (
                <Card key={time} onClick={() => { setCalSlot(isOpen ? null : time); if (isOpen) setBookingSlot(null); }}
                  style={{ borderColor: taken >= MAX_REFORMERS ? '#ffcdd2' : taken > 0 ? '#fff3e0' : '#c8e6c9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#4a2c2a', minWidth: 40 }}>{time}</div>
                      <div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {Array.from({ length: MAX_REFORMERS }).map((_, ri) => (
                            <div key={ri} style={{
                              width: 22, height: 22, borderRadius: 6,
                              background: ri < taken ? (booked[ri]?.trial ? '#ffcdd2' : '#4a2c2a') : '#e8e5e0',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 9, color: ri < taken ? 'white' : '#999', fontWeight: 700,
                            }}>{ri < taken ? (booked[ri]?.trial ? 'P' : '●') : ''}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: free === 0 ? '#c62828' : free <= 1 ? '#e65100' : '#2e7d32' }}>
                        {free === 0 ? 'PUNO' : `${free} slobodn${free === 1 ? 'o' : 'a'}`}
                      </div>
                      <div style={{ fontSize: 10, color: '#999' }}>{taken}/{MAX_REFORMERS} zauzeto</div>
                    </div>
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f0f0' }}>
                      {booked.map((b, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '5px 0', fontSize: 12, borderBottom: '1px solid #f8f8f8' }}>
                          <span style={{ fontWeight: 600 }}>
                            {b.name}
                            {b.trial && <span style={{ background: '#ffcdd2', color: '#c62828', padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, marginLeft: 6 }}>PROBNI</span>}
                          </span>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={(e) => { e.stopPropagation(); setSelId(b.memberId); setView('members'); }}
                              style={{ background: '#4a2c2a', color: 'white', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 10, cursor: 'pointer' }}>
                              Profil
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); bookSlot(b.memberId, calDate, time, b.trial); }}
                              style={{ background: '#ffebee', color: '#c62828', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}

                      {free > 0 && !isBooking && (
                        <button onClick={(e) => { e.stopPropagation(); setBookingSlot({ date: calDate, time }); setBookSearch(''); }}
                          style={{ width: '100%', marginTop: 8, padding: 10, background: '#e8f5e9', color: '#2e7d32',
                            border: '1px dashed #a5d6a7', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          + Zakaži članicu na {time}
                        </button>
                      )}

                      {isBooking && (
                        <div onClick={(e) => e.stopPropagation()}
                          style={{ marginTop: 8, padding: 12, background: '#faf8f5', borderRadius: 10, border: '1px solid #e0dcd5' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#4a2c2a' }}>Zakaži na {time}</span>
                            <button onClick={() => setBookingSlot(null)}
                              style={{ background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', color: '#999' }}>✕</button>
                          </div>
                          <input placeholder="Pretraži članice..." value={bookSearch} onChange={e => setBookSearch(e.target.value)}
                            autoFocus
                            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, marginBottom: 6 }} />
                          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                            {bookableMembers.length === 0 && (
                              <p style={{ fontSize: 11, color: '#999', padding: '6px 0' }}>Nema rezultata</p>
                            )}
                            {bookableMembers.slice(0, 15).map(m => {
                              const rem = getScheduledRemaining(m);
                              return (
                                <div key={m.id}
                                  onClick={() => { bookSlot(m.id, calDate, time, false); setBookingSlot(null); setBookSearch(''); }}
                                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '7px 6px', borderRadius: 8, cursor: 'pointer', fontSize: 12, transition: 'background .1s' }}
                                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f0ede8'}
                                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 26, height: 26, borderRadius: '50%',
                                      background: m.status === 'active' ? '#4a2c2a' : '#d4a574',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      color: 'white', fontWeight: 700, fontSize: 11 }}>
                                      {m.name.charAt(0)}
                                    </div>
                                    <div>
                                      <div style={{ fontWeight: 600 }}>{m.name}</div>
                                      <div style={{ fontSize: 10, color: '#888' }}>
                                        {m.status === 'active' ? `${m.package} • ${rem} preost.` : m.comment}
                                      </div>
                                    </div>
                                  </div>
                                  <span style={{ color: '#2e7d32', fontWeight: 700, fontSize: 16 }}>+</span>
                                </div>
                              );
                            })}
                          </div>

                          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #eee' }}>
                            <button onClick={(e) => { e.stopPropagation(); setTrialModal({ date: calDate, time }); setTrialName(''); }}
                              style={{ width: '100%', padding: 8, background: '#fff3e0', color: '#e65100',
                                border: '1px dashed #ffcc80', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                              + Zakaži probni trening (nova osoba)
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}</div>}
          </>}

          {/* ===== WEEKLY SCHEDULE ===== */}
          {view === 'schedule' && <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <button onClick={() => setWeekOff(weekOff - 1)} style={{ background: 'white', border: '1px solid #ddd', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 600 }}>‹</button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{fmtDateShort(weekDates[0])} — {fmtDateShort(weekDates[6])}</div>
                <button onClick={() => setWeekOff(0)} style={{ background: 'none', border: 'none', color: '#4a2c2a', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Danas</button>
              </div>
              <button onClick={() => setWeekOff(weekOff + 1)} style={{ background: 'white', border: '1px solid #ddd', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 600 }}>›</button>
            </div>

            <div className="lp-schedule-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '8px 4px', borderBottom: '2px solid #e0dcd5', fontSize: 11 }}></th>
                    {weekDates.map(d => {
                      const dt = new Date(d);
                      const isT = d === TODAY;
                      return (
                        <th key={d} style={{ padding: '8px 2px', borderBottom: '2px solid #e0dcd5', background: isT ? '#fff3e0' : 'transparent', textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: '#888' }}>{DAYS_SR[dt.getDay()]}</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: isT ? '#4a2c2a' : '#333' }}>{dt.getDate()}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {['8h', '9h', '10h', '11h', '17h', '18h', '19h', '20h'].map(time => (
                    <tr key={time}>
                      <td style={{ padding: '6px 6px', fontWeight: 700, color: '#555', fontSize: 11, borderBottom: '1px solid #f5f5f5', whiteSpace: 'nowrap' }}>{time}</td>
                      {weekDates.map(d => {
                        const slots = getWorkingSlots(d);
                        if (!slots.includes(time)) return <td key={d} style={{ background: '#f5f5f5', borderBottom: '1px solid #f0f0f0' }} />;
                        const key = `${d}_${time}`;
                        const booked = slotMap[key] || [];
                        const isT = d === TODAY;
                        return (
                          <td key={d} style={{ padding: 2, borderBottom: '1px solid #f5f5f5', textAlign: 'center', background: isT ? '#fff8f0' : 'transparent', verticalAlign: 'top' }}>
                            {booked.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {booked.map((b, i) => (
                                  <div key={i} onClick={() => { setSelId(b.memberId); setView('members'); }}
                                    style={{
                                      background: b.trial ? '#ffcdd2' : '#4a2c2a', color: b.trial ? '#c62828' : 'white',
                                      borderRadius: 4, padding: '2px 1px', fontSize: 8, fontWeight: 600, cursor: 'pointer',
                                      lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>{b.trial ? 'P' : b.name.split(' ')[0].slice(0, 5)}</div>
                                ))}
                                {booked.length < MAX_REFORMERS && <div style={{ color: '#ccc', fontSize: 8 }}>{MAX_REFORMERS - booked.length} sl.</div>}
                              </div>
                            ) : (
                              <div style={{ color: '#ddd', fontSize: 10 }}>{MAX_REFORMERS}</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>}

          {/* ===== FINANCE ===== */}
          {view === 'finance' && <>
            <div style={{ background: 'linear-gradient(135deg,#2c1810,#4a2c2a)', borderRadius: 18, padding: 22, color: 'white', marginBottom: 18, textAlign: 'center' }}>
              <div style={{ fontSize: 12, opacity: 0.6 }}>Ukupna zarada</div>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 38, fontWeight: 700, color: '#d4a574' }}>{totalRevenue} KM</div>
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>{activeCount} aktivnih • {members.reduce((a, m) => a + m.payments.length, 0)} uplata</div>
            </div>

            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Po paketima</h3>
            {(() => {
              const ps: Record<string, { count: number; rev: number }> = {};
              members.forEach(m => m.payments.forEach(p => {
                if (!ps[p.package]) ps[p.package] = { count: 0, rev: 0 };
                ps[p.package].count++;
                ps[p.package].rev += p.amount;
              }));
              return Object.entries(ps).sort((a, b) => b[1].rev - a[1].rev).map(([pkg, s]) => (
                <Card key={pkg} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{pkg}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{s.count} uplata</div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#4a2c2a' }}>{s.rev} KM</div>
                </Card>
              ));
            })()}

            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, marginTop: 14 }}>Sve uplate</h3>
            {members.flatMap(m => m.payments.map(p => ({ ...p, name: m.name }))).sort((a, b) => b.date.localeCompare(a.date)).map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0', fontSize: 12 }}>
                <span><strong>{p.name}</strong> — {p.package} ({fmtDate(p.date)})</span>
                <span style={{ fontWeight: 700, color: '#2e7d32' }}>{p.amount} KM</span>
              </div>
            ))}
          </>}
        </div>

        {/* ADD MEMBER MODAL */}
        {showAdd && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
            onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
            <div style={{ background: 'white', borderRadius: '20px 20px 0 0', padding: 22, width: '100%', maxWidth: 500 }}>
              <div style={{ width: 36, height: 4, background: '#ddd', borderRadius: 2, margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Nova članica</h3>
              <input placeholder="Ime i prezime *" value={newM.name} onChange={e => setNewM({ ...newM, name: e.target.value })}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #ddd', fontSize: 14, marginBottom: 10 }} />
              <input placeholder="Telefon" value={newM.phone} onChange={e => setNewM({ ...newM, phone: e.target.value })}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #ddd', fontSize: 14, marginBottom: 14 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowAdd(false)}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: '1px solid #ddd', background: 'white', fontSize: 14, cursor: 'pointer' }}>Otkaži</button>
                <button onClick={addMember}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: '#4a2c2a', color: 'white', fontSize: 14, cursor: 'pointer', fontWeight: 700 }}>Dodaj</button>
              </div>
            </div>
          </div>
        )}

        {/* TRIAL BOOKING MODAL */}
        {trialModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
            onClick={e => e.target === e.currentTarget && setTrialModal(null)}>
            <div style={{ background: 'white', borderRadius: '20px 20px 0 0', padding: 22, width: '100%', maxWidth: 500 }}>
              <div style={{ width: 36, height: 4, background: '#ddd', borderRadius: 2, margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Probni trening</h3>
              <p style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>{fmtDate(trialModal.date)} u {trialModal.time}</p>
              <input placeholder="Ime i prezime *" value={trialName} onChange={e => setTrialName(e.target.value)}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && bookTrial()}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #ddd', fontSize: 14, marginBottom: 14 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setTrialModal(null)}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: '1px solid #ddd', background: 'white', fontSize: 14, cursor: 'pointer' }}>Otkaži</button>
                <button onClick={bookTrial}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: '#e65100', color: 'white', fontSize: 14, cursor: 'pointer', fontWeight: 700 }}>Zakaži probni</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
