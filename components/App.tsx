'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Member } from '@/lib/types';

const MAX_REFORMERS = 3;

const T = {
  bg: "#161218", surface: "#1e1922", surfaceLight: "#28222e", surfaceLighter: "#332b3a",
  border: "#3a3242", borderLight: "#4a4055",
  bronze: "#c09570", bronzeLight: "#d4ac82", bronzeDark: "#9a7350", gold: "#e2c49a",
  text: "#f2ece5", textMuted: "#a09298", textDim: "#6e5f6e",
  green: "#7ed6a0", greenBg: "rgba(126,214,160,.1)", greenBorder: "rgba(126,214,160,.2)",
  red: "#ef8080", redBg: "rgba(239,128,128,.1)", redBorder: "rgba(239,128,128,.2)",
  orange: "#f0b06a", orangeBg: "rgba(240,176,106,.1)", orangeBorder: "rgba(240,176,106,.2)",
  blue: "#82b4f8", blueBg: "rgba(130,180,248,.1)",
};

function getTodayStr() { return new Date().toISOString().split('T')[0]; }
function getCurrentHour() { return new Date().getHours(); }
function getWorkingSlots(dateStr: string): string[] {
  const d = new Date(dateStr), day = d.getDay();
  if (day === 0) return [];
  if (day === 6) return ['8h','9h','10h','11h'];
  return ['8h','9h','10h','11h','17h','18h','19h','20h'];
}
function parseHour(t: string) { return parseInt(t.replace('h','')); }
function isSessionPast(date: string, time: string) {
  const today = getTodayStr();
  if (date < today) return true;
  if (date === today && parseHour(time) < getCurrentHour()) return true;
  return false;
}
function fmtDate(d: string) { if (!d) return ''; const [y,m,dd] = d.split('-'); return `${dd}.${m}.${y}`; }
const DAYS_SR = ['Ned','Pon','Uto','Sri','Čet','Pet','Sub'];
const MONTHS_FULL = ['Januar','Februar','Mart','April','Maj','Jun','Jul','Avgust','Septembar','Oktobar','Novembar','Decembar'];
const MONTHS = ['jan','feb','mar','apr','maj','jun','jul','avg','sep','okt','nov','dec'];
function fmtDateShort(d: string) { const dt = new Date(d); return `${dt.getDate()}. ${MONTHS[dt.getMonth()]}`; }

const PACKAGES = [
  { name: 'Set 4', sessions: 4, price: 60 },
  { name: 'Set 6', sessions: 6, price: 90 },
  { name: 'Set 6+2', sessions: 8, price: 90 },
  { name: 'Set 8', sessions: 8, price: 125 },
  { name: 'Set 8+2', sessions: 10, price: 125 },
  { name: 'Set 10+2', sessions: 12, price: 145 },
  { name: 'Set 12', sessions: 12, price: 175 },
  { name: 'Set 12+2', sessions: 14, price: 175 },
  { name: 'Set 8 ind.', sessions: 8, price: 280 },
  { name: 'Set 12 ind.', sessions: 12, price: 360 },
  { name: 'Pojedinačni', sessions: 1, price: 15 },
];

function isIndPkg(pkg: string) { return pkg.toLowerCase().includes('ind.'); }

// Individual training occupies all 3 reformers — compute "effective taken" for a slot
function slotTaken(booked: { individual: boolean }[]) {
  return booked.some(b => b.individual) ? MAX_REFORMERS : booked.length;
}

function Badge({ type, text }: { type: string; text: string }) {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    trial: { bg: T.orangeBg, color: T.orange, border: T.orangeBorder },
    active: { bg: T.greenBg, color: T.green, border: T.greenBorder },
    expired: { bg: T.redBg, color: T.red, border: T.redBorder },
  };
  const s = styles[type] || styles.active;
  return <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{text}</span>;
}

function Card({ children, style, onClick }: { children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{ background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, padding: 16, marginBottom: 10, cursor: onClick ? 'pointer' : 'default', transition: 'all .15s', ...style }}
      onMouseEnter={e => { if (onClick) { (e.currentTarget as HTMLElement).style.borderColor = T.bronze; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(184,146,106,.12)'; }}}
      onMouseLeave={e => { if (onClick) { (e.currentTarget as HTMLElement).style.borderColor = T.border; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}}>
      {children}
    </div>
  );
}

function StatBox({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div style={{ background: T.surfaceLight, borderRadius: 12, padding: '14px 12px', textAlign: 'center', border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 500, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent || T.bronzeLight }}>{value}</div>
    </div>
  );
}

const now = new Date();
const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${T.border}`, fontSize: 14, background: T.surfaceLight, color: T.text, outline: 'none' };
const btnPrimary: React.CSSProperties = { background: `linear-gradient(135deg, ${T.bronze}, ${T.bronzeDark})`, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 13 };
const btnSecondary: React.CSSProperties = { background: T.surfaceLight, color: T.text, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 18px', cursor: 'pointer', fontSize: 13 };

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
  const [trialType, setTrialType] = useState(true); // true = Probni, false = Redovni
  const [newMSession, setNewMSession] = useState({ add: false, date: getTodayStr(), time: '8h', trial: true });
  const [statMonth, setStatMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

  useEffect(() => {
    fetch('/api/members')
      .then(r => r.json())
      .then(data => { setMembers(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const member = selId ? members.find(m => m.id === selId) : null;
  const getUsedCount = useCallback((m: Member) => m.sessions.filter(s => !s.trial && isSessionPast(s.date, s.time)).length, []);
  const getScheduledCount = useCallback((m: Member) => m.sessions.filter(s => !s.trial).length, []);
  const getRemaining = useCallback((m: Member) => m.totalSessions - getUsedCount(m), [getUsedCount]);
  const getScheduledRemaining = useCallback((m: Member) => m.totalSessions - getScheduledCount(m), [getScheduledCount]);

  const slotMap = useMemo(() => {
    const map: Record<string, { memberId: string; name: string; trial: boolean; individual: boolean }[]> = {};
    members.forEach(m => m.sessions.forEach(s => {
      const key = `${s.date}_${s.time}`;
      if (!map[key]) map[key] = [];
      map[key].push({ memberId: m.id, name: m.name, trial: s.trial, individual: isIndPkg(m.package) });
    }));
    return map;
  }, [members]);

  const monthStats = useMemo(() => {
    const prefix = statMonth;
    const pay: Array<{ memberName: string; date: string; package: string; amount: number; sessions: number }> = [];
    let rev = 0, sess = 0, tri = 0;
    const actIds = new Set<string>(), triIds = new Set<string>();
    members.forEach(m => {
      m.payments.forEach(p => { if (p.date.startsWith(prefix)) { pay.push({ ...p, memberName: m.name }); rev += p.amount; } });
      m.sessions.forEach(s => { if (s.date.startsWith(prefix)) { if (s.trial) { tri++; triIds.add(m.id); } else { sess++; actIds.add(m.id); } } });
    });
    const pkgs: Record<string, { count: number; rev: number }> = {};
    pay.forEach(p => { if (!pkgs[p.package]) pkgs[p.package] = { count: 0, rev: 0 }; pkgs[p.package].count++; pkgs[p.package].rev += p.amount; });
    return { revenue: rev, sessionsCount: sess, trialCount: tri, paymentsCount: pay.length, payments: pay, activeMembers: actIds.size, trialMembers: triIds.size, pkgBreakdown: pkgs };
  }, [members, statMonth]);

  const totalRevenue = members.reduce((s, m) => s + m.paid, 0);
  const activeCount = members.filter(m => m.status === 'active').length;
  const trialCount = members.filter(m => m.status === 'trial').length;
  const needPayment = members.filter(m => m.status === 'active' && getRemaining(m) <= 0);

  function shiftMonth(dir: number) {
    const [y, mo] = statMonth.split('-').map(Number);
    const next = new Date(y, mo - 1 + dir, 1);
    setStatMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  }

  async function addPayment(memberId: string) {
    const pkg = PACKAGES.find(p => p.name === payPkg);
    if (!pkg) return;
    const res = await fetch(`/api/members/${memberId}/payments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: pkg.name, amount: pkg.price, sessions: pkg.sessions }),
    });
    const updated = await res.json();
    setMembers(prev => prev.map(m => m.id === memberId ? updated : m));
    setPayPkg(''); setShowPayment(null);
  }

  async function addMember() {
    if (!newM.name) return;
    const body: Record<string, unknown> = { name: newM.name, phone: newM.phone };
    if (newMSession.add) {
      body.trialDate = newMSession.date;
      body.trialTime = newMSession.time;
      body.trial = newMSession.trial;
    }
    const res = await fetch('/api/members', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const created = await res.json();
    setMembers(prev => [...prev, created]);
    setNewM({ name: '', phone: '' });
    setNewMSession({ add: false, date: getTodayStr(), time: '8h', trial: true });
    setShowAdd(false);
  }

  async function bookSlot(memberId: string, date: string, time: string, trial = false) {
    const m = members.find(x => x.id === memberId);
    if (!m) return;
    const exists = m.sessions.find(s => s.date === date && s.time === time);
    if (exists) {
      setMembers(prev => prev.map(x => x.id !== memberId ? x : { ...x, sessions: x.sessions.filter(s => s.id !== exists.id) }));
      await fetch(`/api/members/${memberId}/sessions/${exists.id}`, { method: 'DELETE' });
    } else {
      // Capacity validation for individual packages
      const currentSlot = slotMap[`${date}_${time}`] || [];
      const memberIsInd = isIndPkg(m.package);
      const slotHasInd = currentSlot.some(b => b.individual);
      if (memberIsInd && currentSlot.length > 0) {
        alert('Individualni trening zahtijeva slobodan termin. Termin je već zauzet.');
        return;
      }
      if (slotHasInd) {
        alert('U ovom terminu je zakazan individualni trening — termin je zauzet.');
        return;
      }
      const tempId = 'temp-' + Date.now();
      setMembers(prev => prev.map(x => x.id !== memberId ? x : { ...x, sessions: [...x.sessions, { id: tempId, date, time, trial }] }));
      const res = await fetch(`/api/members/${memberId}/sessions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, time, trial }),
      });
      const session = await res.json();
      setMembers(prev => prev.map(x => x.id !== memberId ? x : { ...x, sessions: x.sessions.map(s => s.id === tempId ? session : s) }));
    }
  }

  async function deletePayment(memberId: string, paymentId: string) {
    if (!confirm('Obrisati ovu uplatu? Ovo će smanjiti ukupan broj treninga.')) return;
    const res = await fetch(`/api/members/${memberId}/payments/${paymentId}`, { method: 'DELETE' });
    const updated = await res.json();
    setMembers(prev => prev.map(m => m.id === memberId ? updated : m));
  }

  async function bookTrial() {
    if (!trialModal || !trialName.trim()) return;
    const { date, time } = trialModal;
    const existing = members.find(m => m.name.toLowerCase() === trialName.toLowerCase());
    if (existing) {
      await bookSlot(existing.id, date, time, trialType);
    } else {
      const res = await fetch('/api/members', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trialName.trim(), phone: '', trialDate: date, trialTime: time, trial: trialType }),
      });
      const created = await res.json();
      setMembers(prev => [...prev, created]);
    }
    setTrialModal(null); setTrialName(''); setTrialType(true); setBookingSlot(null); setBookSearch('');
  }

  const filteredMembers = members.filter(m => {
    if (!m.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'active') return m.status === 'active';
    if (filter === 'trial') return m.status === 'trial';
    if (filter === 'expired') return m.status === 'active' && getRemaining(m) <= 0;
    return true;
  });

  function getWeek(off: number) {
    const d = new Date(), day = d.getDay(), mon = new Date(d);
    mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1) + off * 7);
    return Array.from({ length: 7 }, (_, i) => { const x = new Date(mon); x.setDate(mon.getDate() + i); return x.toISOString().split('T')[0]; });
  }

  const weekDates = getWeek(weekOff);
  const calSlots = getWorkingSlots(calDate);
  const TODAY = getTodayStr();

  const nav = [
    { id: 'dashboard', label: 'Pregled', icon: '⬡' },
    { id: 'members', label: 'Članice', icon: '♀' },
    { id: 'calendar', label: 'Kalendar', icon: '▦' },
    { id: 'schedule', label: 'Sedmica', icon: '☰' },
    { id: 'monthly', label: 'Mjesečno', icon: '◉' },
    { id: 'finance', label: 'Finansije', icon: '◈' },
  ];

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, color: T.bronzeLight, marginBottom: 8 }}>Linea Pilates Reformer</div>
        <div style={{ fontSize: 13, color: T.textDim }}>Učitavanje...</div>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Cormorant+Garamond:wght@500;600;700&display=swap');
        body{background:${T.bg}!important;color:${T.text}}
        input,select,textarea{color:${T.text}!important}
        select option{background:${T.surface};color:${T.text}}
        input[type="date"]::-webkit-calendar-picker-indicator{filter:invert(.7)}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-thumb{background:${T.borderLight};border-radius:3px}
        ::-webkit-scrollbar-track{background:transparent}
      `}</style>

      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: T.bg }}>

        {/* HEADER */}
        <div style={{ background: `linear-gradient(135deg, ${T.bg} 0%, #2a1f30 100%)`, padding: '18px 20px 14px', borderBottom: `1px solid ${T.border}` }}>
          <div className="lp-header-inner">
            <div>
              <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 700, letterSpacing: '1px' }}>
                <span style={{ color: T.text }}>Linea </span><span style={{ color: T.bronzeLight }}>Pilates Reformer</span>
              </h1>
              <p style={{ fontSize: 11, color: T.textDim, marginTop: 1 }}>Trebinje • {MAX_REFORMERS} reformera</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: T.textDim }}>{fmtDate(TODAY)}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: T.gold }}>{totalRevenue} KM</div>
            </div>
          </div>
        </div>

        {/* NAV */}
        <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, position: 'sticky', top: 0, zIndex: 100, overflowX: 'auto' }}>
          <div className="lp-nav-inner">
            {nav.map(n => (
              <button key={n.id} onClick={() => { setView(n.id); setSelId(null); }}
                style={{ flex: 1, minWidth: 50, padding: '10px 2px', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: view === n.id ? `2px solid ${T.bronze}` : '2px solid transparent' }}>
                <div style={{ fontSize: 14, color: view === n.id ? T.bronzeLight : 'rgba(255,255,255,0.6)' }}>{n.icon}</div>
                <div style={{ fontSize: 9, fontWeight: view === n.id ? 700 : 400, color: view === n.id ? T.bronzeLight : 'rgba(255,255,255,0.6)', marginTop: 1 }}>{n.label}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="lp-content">

          {/* ===== DASHBOARD ===== */}
          {view === 'dashboard' && <>
            <div className="lp-stats">
              <StatBox label="Aktivne članice" value={activeCount} accent={T.green} />
              <StatBox label="Probni treninzi" value={trialCount} accent={T.orange} />
              <StatBox label="Održano treninga" value={members.reduce((a, m) => a + getUsedCount(m), 0)} accent={T.blue} />
              <StatBox label="Ukupna zarada" value={`${totalRevenue} KM`} />
            </div>

            {needPayment.length > 0 && <>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: T.red }}>⚠ Treba nova uplata ({needPayment.length})</h3>
              {needPayment.map(m => (
                <Card key={m.id} onClick={() => { setSelId(m.id); setView('members'); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: T.redBorder }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: T.red }}>Iskorišćeno: {getUsedCount(m)}/{m.totalSessions}</div>
                  </div>
                  <Badge type="expired" text={`${getRemaining(m)}`} />
                </Card>
              ))}
            </>}

            {trialCount > 0 && <>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, marginTop: 14, color: T.bronzeLight }}>Čekaju uplatu</h3>
              {members.filter(m => m.status === 'trial').map(m => (
                <Card key={m.id} onClick={() => { setSelId(m.id); setView('members'); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: T.textMuted }}>{m.comment}</div>
                  </div>
                  <Badge type="trial" text="Probni" />
                </Card>
              ))}
            </>}
          </>}

          {/* ===== MEMBERS LIST ===== */}
          {view === 'members' && !selId && <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input placeholder="Pretraži..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
              <button onClick={() => setShowAdd(true)} style={{ ...btnPrimary, fontSize: 18, padding: '10px 16px' }}>+</button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {[{ id: 'all', l: 'Sve' }, { id: 'active', l: 'Aktivne' }, { id: 'trial', l: 'Probni' }, { id: 'expired', l: 'Bez paketa' }].map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)}
                  style={{ padding: '5px 12px', borderRadius: 20, border: 'none', fontSize: 11, cursor: 'pointer', fontWeight: 600, background: filter === f.id ? T.bronze : T.surfaceLight, color: filter === f.id ? '#fff' : T.textMuted }}>{f.l}</button>
              ))}
            </div>
            <div className="lp-members-grid">
              {filteredMembers.map(m => {
                const rem = getRemaining(m);
                return (
                  <Card key={m.id} onClick={() => setSelId(m.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: m.status === 'active' ? `linear-gradient(135deg,${T.bronze},${T.bronzeDark})` : `linear-gradient(135deg,${T.orange},${T.bronzeDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 14 }}>
                        {m.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: T.textMuted }}>{m.package || 'Bez paketa'}{m.status === 'active' && ` • ${getUsedCount(m)}/${m.totalSessions} • ${rem} preost.`}</div>
                      </div>
                    </div>
                    <Badge type={m.status === 'trial' ? 'trial' : rem <= 0 ? 'expired' : 'active'} text={m.status === 'trial' ? 'Probni' : `${rem}`} />
                  </Card>
                );
              })}
            </div>
          </>}

          {/* ===== MEMBER DETAIL ===== */}
          {view === 'members' && selId && member && <>
            <button onClick={() => setSelId(null)} style={{ background: 'none', border: 'none', fontSize: 13, color: T.bronzeLight, cursor: 'pointer', fontWeight: 600, marginBottom: 14 }}>← Nazad</button>

            <div style={{ background: `linear-gradient(135deg, ${T.bg}, ${T.surfaceLight})`, borderRadius: 18, padding: '20px 18px', border: `1px solid ${T.border}`, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 700, color: T.text }}>{member.name}</h2>
                  {member.phone && <div style={{ fontSize: 12, color: T.textDim, marginTop: 2 }}>Tel: {member.phone}</div>}
                  {member.firstPaidDate && <div style={{ fontSize: 12, color: T.textDim, marginTop: 2 }}>Prva uplata: {fmtDate(member.firstPaidDate)}</div>}
                  {member.trialDate && <div style={{ fontSize: 12, color: T.textDim, marginTop: 2 }}>Probni: {fmtDate(member.trialDate)}</div>}
                </div>
                <Badge type={member.status === 'trial' ? 'trial' : getRemaining(member) <= 0 ? 'expired' : 'active'}
                  text={member.status === 'trial' ? 'Probni' : getRemaining(member) <= 0 ? 'Potrošen' : 'Aktivan'} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 16 }}>
                <StatBox label="Iskorišćeno" value={getUsedCount(member)} accent={T.text} />
                <StatBox label="Preostalo" value={getRemaining(member)} accent={getRemaining(member) <= 0 ? T.red : T.gold} />
                <StatBox label="Zakazano" value={getScheduledCount(member) - getUsedCount(member)} accent={T.blue} />
              </div>
            </div>

            <div className="lp-detail-cols">
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: T.bronzeLight }}>Uplate</h4>
                  <button onClick={() => setShowPayment(showPayment === member.id ? null : member.id)} style={{ ...btnPrimary, padding: '5px 12px', fontSize: 11 }}>+ Nova uplata</button>
                </div>
                {member.payments.length === 0 && <p style={{ fontSize: 12, color: T.textDim }}>Nema uplata</p>}
                {member.payments.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                    <span style={{ color: T.textMuted }}>{fmtDate(p.date)} — {p.package}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, color: T.green }}>{p.amount} KM ({p.sessions} tr.)</span>
                      <button onClick={() => deletePayment(member.id, p.id)}
                        style={{ background: T.redBg, color: T.red, border: `1px solid ${T.redBorder}`, borderRadius: 6, padding: '2px 7px', fontSize: 10, cursor: 'pointer', fontWeight: 700 }}>✕</button>
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 6, fontWeight: 700, fontSize: 13, textAlign: 'right', color: T.gold }}>Ukupno: {member.paid} KM</div>
                {showPayment === member.id && (
                  <div style={{ marginTop: 12, padding: 12, background: T.surfaceLight, borderRadius: 10, border: `1px solid ${T.border}` }}>
                    <select value={payPkg} onChange={e => setPayPkg(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }}>
                      <option value="">Izaberi paket</option>
                      {PACKAGES.map(p => <option key={p.name} value={p.name}>{p.name} — {p.price} KM ({p.sessions} treninga)</option>)}
                    </select>
                    <button onClick={() => addPayment(member.id)} style={{ ...btnPrimary, width: '100%', padding: 10 }}>Potvrdi uplatu</button>
                  </div>
                )}
              </Card>

              <Card>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: T.bronzeLight, marginBottom: 8 }}>Termini</h4>
                {member.sessions.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).map((s, i) => {
                  const past = isSessionPast(s.date, s.time);
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${T.border}`, fontSize: 12, opacity: past ? 0.5 : 1 }}>
                      <span style={{ color: T.textMuted }}>
                        {fmtDate(s.date)} — {s.time}
                        {s.trial && <span style={{ background: T.redBg, color: T.red, padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, marginLeft: 6 }}>P</span>}
                        {past && !s.trial && <span style={{ color: T.green, marginLeft: 4, fontSize: 10 }}>✓</span>}
                        {!past && !s.trial && <span style={{ color: T.blue, marginLeft: 4, fontSize: 10 }}>zakazan</span>}
                      </span>
                      {!past && (
                        <button onClick={() => bookSlot(member.id, s.date, s.time)}
                          style={{ background: T.redBg, color: T.red, border: `1px solid ${T.redBorder}`, borderRadius: 6, padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>✕</button>
                      )}
                    </div>
                  );
                })}
              </Card>
            </div>
          </>}

          {/* ===== CALENDAR ===== */}
          {view === 'calendar' && <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input type="date" value={calDate} onChange={e => { setCalDate(e.target.value); setCalSlot(null); setBookingSlot(null); }} style={inputStyle} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: T.bronzeLight }}>{DAYS_SR[new Date(calDate).getDay()]}, {fmtDate(calDate)}</div>

            {calSlots.length === 0 ? (
              <Card><p style={{ fontSize: 13, color: T.textDim, textAlign: 'center' }}>Neradni dan</p></Card>
            ) : (() => {
              const morningSlots = calSlots.filter(t => parseHour(t) < 12);
              const afternoonSlots = calSlots.filter(t => parseHour(t) >= 12);
              const renderSlot = (time: string) => {
                const key = `${calDate}_${time}`;
                const booked = slotMap[key] || [];
                const hasInd = booked.some(b => b.individual);
                const taken = slotTaken(booked);
                const free = MAX_REFORMERS - taken;
                const isOpen = calSlot === time;
                const isBooking = bookingSlot && bookingSlot.date === calDate && bookingSlot.time === time;
                const bookableMembers = members.filter(m => {
                  if (booked.find(b => b.memberId === m.id)) return false;
                  if (hasInd) return false; // slot blocked by individual
                  if (isIndPkg(m.package) && booked.length > 0) return false; // individual needs empty slot
                  if (bookSearch && !m.name.toLowerCase().includes(bookSearch.toLowerCase())) return false;
                  return true;
                });
                const indColor = '#a78bfa';
                const indBg = 'rgba(167,139,250,.12)';
                const indBorder = 'rgba(167,139,250,.35)';
                return (
                  <Card key={time} onClick={() => { setCalSlot(isOpen ? null : time); if (isOpen) setBookingSlot(null); }}
                    style={{ borderColor: taken >= MAX_REFORMERS ? (hasInd ? indBorder : T.redBorder) : taken > 0 ? T.orangeBorder : T.greenBorder }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: T.bronzeLight, minWidth: 40 }}>{time}</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {Array.from({ length: MAX_REFORMERS }).map((_, ri) => {
                            const b = booked[ri];
                            const filledByInd = hasInd && ri < MAX_REFORMERS;
                            const isActualBooking = !hasInd && b;
                            const bg = filledByInd ? (ri === 0 ? indBg : 'rgba(167,139,250,.06)') : isActualBooking ? (b.trial ? T.redBg : T.bronze) : T.surfaceLighter;
                            const border = filledByInd ? indBorder : isActualBooking ? (b.trial ? T.redBorder : T.bronze) : T.border;
                            const color = filledByInd ? indColor : isActualBooking ? (b.trial ? T.red : '#fff') : T.textDim;
                            const label = filledByInd ? (ri === 0 ? 'IND' : '·') : isActualBooking ? (b.trial ? 'P' : '●') : '';
                            return (
                              <div key={ri} style={{ width: 22, height: 22, borderRadius: 6, background: bg, border: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: ri === 0 && filledByInd ? 7 : 9, color, fontWeight: 700 }}>
                                {label}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: free === 0 ? (hasInd ? indColor : T.red) : free <= 1 ? T.orange : T.green }}>
                          {free === 0 ? (hasInd ? 'IND' : 'PUNO') : `${free} sl.`}
                        </div>
                        <div style={{ fontSize: 10, color: T.textDim }}>{taken}/{MAX_REFORMERS}</div>
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                        {booked.map((b, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: 12, borderBottom: `1px solid ${T.border}` }}>
                            <span style={{ fontWeight: 600 }}>
                              {b.name}
                              {b.trial && <span style={{ background: T.redBg, color: T.red, padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, marginLeft: 6 }}>PROBNI</span>}
                              {b.individual && <span style={{ background: indBg, color: indColor, padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, marginLeft: 6, border: `1px solid ${indBorder}` }}>IND</span>}
                            </span>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={e => { e.stopPropagation(); setSelId(b.memberId); setView('members'); }} style={{ ...btnPrimary, padding: '3px 8px', fontSize: 10 }}>Profil</button>
                              <button onClick={e => { e.stopPropagation(); bookSlot(b.memberId, calDate, time, b.trial); }} style={{ background: T.redBg, color: T.red, border: `1px solid ${T.redBorder}`, borderRadius: 6, padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>✕</button>
                            </div>
                          </div>
                        ))}
                        {free > 0 && !isBooking && (
                          <button onClick={e => { e.stopPropagation(); setBookingSlot({ date: calDate, time }); setBookSearch(''); }}
                            style={{ width: '100%', marginTop: 8, padding: 10, background: T.greenBg, color: T.green, border: `1px dashed ${T.greenBorder}`, borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            + Zakaži na {time}
                          </button>
                        )}
                        {isBooking && (
                          <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, padding: 12, background: T.surfaceLight, borderRadius: 10, border: `1px solid ${T.border}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: T.bronzeLight }}>Zakaži na {time}</span>
                              <button onClick={() => setBookingSlot(null)} style={{ background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', color: T.textMuted }}>✕</button>
                            </div>
                            <input placeholder="Pretraži članice..." value={bookSearch} onChange={e => setBookSearch(e.target.value)} autoFocus style={{ ...inputStyle, marginBottom: 6 }} />
                            <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                              {bookableMembers.length === 0 && (
                                <p style={{ fontSize: 11, color: T.textDim, textAlign: 'center', padding: '8px 0' }}>
                                  {hasInd ? 'Termin zauzet individualnim treningom' : 'Nema dostupnih članica'}
                                </p>
                              )}
                              {bookableMembers.slice(0, 15).map(m => (
                                <div key={m.id} onClick={() => { bookSlot(m.id, calDate, time, false); setBookingSlot(null); setBookSearch(''); }}
                                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 6px', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}
                                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = T.surfaceLighter}
                                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: m.status === 'active' ? T.bronze : T.orange, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 11 }}>{m.name.charAt(0)}</div>
                                    <div>
                                      <div style={{ fontWeight: 600, color: T.text }}>{m.name}</div>
                                      <div style={{ fontSize: 10, color: T.textMuted }}>
                                        {m.status === 'active' ? `${m.package} • ${getScheduledRemaining(m)} preost.` : m.comment}
                                        {isIndPkg(m.package) && booked.length === 0 && <span style={{ color: indColor, marginLeft: 4 }}>ind.</span>}
                                      </div>
                                    </div>
                                  </div>
                                  <span style={{ color: T.green, fontWeight: 700, fontSize: 16 }}>+</span>
                                </div>
                              ))}
                            </div>
                            <button onClick={() => { setTrialModal({ date: calDate, time }); setTrialName(''); }}
                              style={{ width: '100%', marginTop: 8, padding: 8, background: T.orangeBg, color: T.orange, border: `1px dashed ${T.orangeBorder}`, borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                              + Probni trening (nova osoba)
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              };
              return afternoonSlots.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>{morningSlots.map(renderSlot)}</div>
                  <div>{afternoonSlots.map(renderSlot)}</div>
                </div>
              ) : (
                <div>{morningSlots.map(renderSlot)}</div>
              );
            })()}
          </>}

          {/* ===== WEEKLY SCHEDULE ===== */}
          {view === 'schedule' && <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <button onClick={() => setWeekOff(weekOff - 1)} style={btnSecondary}>‹</button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: T.bronzeLight }}>{fmtDateShort(weekDates[0])} — {fmtDateShort(weekDates[6])}</div>
                <button onClick={() => setWeekOff(0)} style={{ background: 'none', border: 'none', color: T.bronze, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Danas</button>
              </div>
              <button onClick={() => setWeekOff(weekOff + 1)} style={btnSecondary}>›</button>
            </div>
            <div className="lp-schedule-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '10px 4px', borderBottom: `2px solid ${T.border}`, fontSize: 11, color: T.textDim }}></th>
                    {weekDates.map(d => {
                      const dt = new Date(d), isT = d === TODAY;
                      return (
                        <th key={d} style={{ padding: '10px 2px', borderBottom: `2px solid ${T.border}`, background: isT ? T.surfaceLight : 'transparent', textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: T.textDim }}>{DAYS_SR[dt.getDay()]}</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: isT ? T.bronzeLight : T.text }}>{dt.getDate()}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {['8h','9h','10h','11h','17h','18h','19h','20h'].map(time => (
                    <tr key={time}>
                      <td style={{ padding: '6px 6px', fontWeight: 700, color: T.textMuted, fontSize: 11, borderBottom: `1px solid ${T.border}` }}>{time}</td>
                      {weekDates.map(d => {
                        const slots = getWorkingSlots(d);
                        if (!slots.includes(time)) return <td key={d} style={{ background: T.bg, borderBottom: `1px solid ${T.border}` }} />;
                        const k = `${d}_${time}`, booked = slotMap[k] || [], isT = d === TODAY;
                        const hasInd = booked.some(b => b.individual);
                        const effTaken = slotTaken(booked);
                        const indColor = '#a78bfa';
                        return (
                          <td key={d} style={{ padding: 2, borderBottom: `1px solid ${T.border}`, textAlign: 'center', background: isT ? T.surfaceLight : 'transparent', verticalAlign: 'top' }}>
                            {booked.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {hasInd ? (
                                  <>
                                    <div onClick={() => { setSelId(booked[0].memberId); setView('members'); }}
                                      style={{ background: 'rgba(167,139,250,.18)', color: indColor, borderRadius: 4, padding: '2px 1px', fontSize: 8, fontWeight: 700, cursor: 'pointer', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: '1px solid rgba(167,139,250,.3)' }}>
                                      {booked[0].name.split(' ')[0].slice(0, 5)}
                                    </div>
                                    <div style={{ color: indColor, fontSize: 7, opacity: 0.7 }}>IND</div>
                                  </>
                                ) : (
                                  <>
                                    {booked.map((b, i) => (
                                      <div key={i} onClick={() => { setSelId(b.memberId); setView('members'); }}
                                        style={{ background: b.trial ? T.redBg : `linear-gradient(135deg,${T.bronze},${T.bronzeDark})`, color: b.trial ? T.red : '#fff', borderRadius: 4, padding: '2px 1px', fontSize: 8, fontWeight: 600, cursor: 'pointer', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {b.trial ? 'P' : b.name.split(' ')[0].slice(0, 5)}
                                      </div>
                                    ))}
                                    {effTaken < MAX_REFORMERS && <div style={{ color: T.textDim, fontSize: 7 }}>{MAX_REFORMERS - effTaken} sl.</div>}
                                  </>
                                )}
                              </div>
                            ) : <div style={{ color: T.textDim, fontSize: 10 }}>{MAX_REFORMERS}</div>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>}

          {/* ===== MONTHLY STATS ===== */}
          {view === 'monthly' && <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
              <button onClick={() => shiftMonth(-1)} style={btnSecondary}>‹</button>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 700, color: T.gold }}>
                  {MONTHS_FULL[parseInt(statMonth.split('-')[1]) - 1]} {statMonth.split('-')[0]}
                </div>
              </div>
              <button onClick={() => shiftMonth(1)} style={btnSecondary}>›</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
              <StatBox label="Zarada" value={`${monthStats.revenue} KM`} />
              <StatBox label="Uplata" value={monthStats.paymentsCount} accent={T.green} />
              <StatBox label="Treninga" value={monthStats.sessionsCount} accent={T.blue} />
              <StatBox label="Aktivnih" value={monthStats.activeMembers} accent={T.green} />
              <StatBox label="Probnih" value={monthStats.trialCount} accent={T.orange} />
              <StatBox label="Novih" value={monthStats.trialMembers} accent={T.bronzeLight} />
            </div>

            {monthStats.revenue > 0 && (
              <Card>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: T.bronzeLight, marginBottom: 10 }}>Zarada po paketima</h4>
                {Object.entries(monthStats.pkgBreakdown).sort((a, b) => b[1].rev - a[1].rev).map(([pkg, s]) => (
                  <div key={pkg} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: T.textMuted }}>{pkg} ({s.count}x)</span>
                      <span style={{ fontWeight: 700, color: T.gold }}>{s.rev} KM</span>
                    </div>
                    <div style={{ height: 6, background: T.surfaceLighter, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(s.rev / monthStats.revenue) * 100}%`, background: `linear-gradient(90deg, ${T.bronze}, ${T.gold})`, borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </Card>
            )}

            <Card>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: T.bronzeLight, marginBottom: 10 }}>Uplate u ovom mjesecu</h4>
              {monthStats.payments.length === 0 && <p style={{ fontSize: 12, color: T.textDim }}>Nema uplata</p>}
              {monthStats.payments.sort((a, b) => b.date.localeCompare(a.date)).map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ color: T.textMuted }}><span style={{ color: T.text, fontWeight: 600 }}>{p.memberName}</span> — {p.package} ({fmtDate(p.date)})</span>
                  <span style={{ fontWeight: 700, color: T.green }}>{p.amount} KM</span>
                </div>
              ))}
            </Card>
          </>}

          {/* ===== FINANCE ===== */}
          {view === 'finance' && <>
            <div style={{ background: `linear-gradient(135deg, ${T.surfaceLight}, ${T.surface})`, borderRadius: 18, padding: 22, border: `1px solid ${T.border}`, marginBottom: 18, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: T.textMuted }}>Ukupna zarada</div>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 38, fontWeight: 700, color: T.gold }}>{totalRevenue} KM</div>
              <div style={{ fontSize: 12, color: T.textDim, marginTop: 4 }}>{activeCount} aktivnih • {members.reduce((a, m) => a + m.payments.length, 0)} uplata</div>
            </div>

            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: T.bronzeLight }}>Po paketima</h3>
            {(() => {
              const ps: Record<string, { count: number; rev: number }> = {};
              members.forEach(m => m.payments.forEach(p => { if (!ps[p.package]) ps[p.package] = { count: 0, rev: 0 }; ps[p.package].count++; ps[p.package].rev += p.amount; }));
              return Object.entries(ps).sort((a, b) => b[1].rev - a[1].rev).map(([pkg, s]) => (
                <Card key={pkg} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><div style={{ fontWeight: 600, fontSize: 13 }}>{pkg}</div><div style={{ fontSize: 11, color: T.textMuted }}>{s.count} uplata</div></div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: T.gold }}>{s.rev} KM</div>
                </Card>
              ));
            })()}

            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, marginTop: 14, color: T.bronzeLight }}>Sve uplate</h3>
            {members.flatMap(m => m.payments.map(p => ({ ...p, name: m.name }))).sort((a, b) => b.date.localeCompare(a.date)).map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                <span style={{ color: T.textMuted }}><span style={{ fontWeight: 600, color: T.text }}>{p.name}</span> — {p.package} ({fmtDate(p.date)})</span>
                <span style={{ fontWeight: 700, color: T.green }}>{p.amount} KM</span>
              </div>
            ))}
          </>}
        </div>

        {/* ADD MEMBER MODAL */}
        {showAdd && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
            onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
            <div style={{ background: T.surface, borderRadius: '20px 20px 0 0', padding: 22, width: '100%', maxWidth: 500, border: `1px solid ${T.border}`, maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ width: 36, height: 4, background: T.borderLight, borderRadius: 2, margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: T.gold }}>Nova članica</h3>
              <input placeholder="Ime i prezime *" value={newM.name} onChange={e => setNewM({ ...newM, name: e.target.value })} style={{ ...inputStyle, marginBottom: 10 }} />
              <input placeholder="Telefon" value={newM.phone} onChange={e => setNewM({ ...newM, phone: e.target.value })} style={{ ...inputStyle, marginBottom: 14 }} />

              {/* Opcija: zakaži prvi termin odmah */}
              <button onClick={() => setNewMSession(s => ({ ...s, add: !s.add }))}
                style={{ width: '100%', padding: 10, borderRadius: 10, border: `1px dashed ${newMSession.add ? T.bronze : T.border}`, background: newMSession.add ? T.orangeBg : 'transparent', color: newMSession.add ? T.orange : T.textMuted, fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: newMSession.add ? 12 : 14, textAlign: 'left' }}>
                {newMSession.add ? '▼' : '▶'} Zakaži prvi termin odmah (opciono)
              </button>

              {newMSession.add && (
                <div style={{ padding: 14, background: T.surfaceLight, borderRadius: 12, border: `1px solid ${T.border}`, marginBottom: 14 }}>
                  {/* Probni / Redovni toggle */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                    {[{ v: true, l: 'Probni trening' }, { v: false, l: 'Redovni trening' }].map(opt => (
                      <button key={String(opt.v)} onClick={() => setNewMSession(s => ({ ...s, trial: opt.v }))}
                        style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          background: newMSession.trial === opt.v ? (opt.v ? T.orangeBg : T.greenBg) : T.surfaceLighter,
                          color: newMSession.trial === opt.v ? (opt.v ? T.orange : T.green) : T.textMuted }}>
                        {opt.l}
                      </button>
                    ))}
                  </div>
                  <input type="date" value={newMSession.date} onChange={e => setNewMSession(s => ({ ...s, date: e.target.value }))} style={{ ...inputStyle, marginBottom: 8 }} />
                  <select value={newMSession.time} onChange={e => setNewMSession(s => ({ ...s, time: e.target.value }))} style={inputStyle}>
                    {getWorkingSlots(newMSession.date).map(t => <option key={t} value={t}>{t}</option>)}
                    {getWorkingSlots(newMSession.date).length === 0 && <option value="">Neradni dan</option>}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setShowAdd(false); setNewMSession({ add: false, date: getTodayStr(), time: '8h', trial: true }); }} style={{ ...btnSecondary, flex: 1, padding: 12 }}>Otkaži</button>
                <button onClick={addMember} style={{ ...btnPrimary, flex: 1, padding: 12 }}>Dodaj</button>
              </div>
            </div>
          </div>
        )}

        {/* TRIAL MODAL */}
        {trialModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
            onClick={e => e.target === e.currentTarget && setTrialModal(null)}>
            <div style={{ background: T.surface, borderRadius: '20px 20px 0 0', padding: 22, width: '100%', maxWidth: 500, border: `1px solid ${T.border}` }}>
              <div style={{ width: 36, height: 4, background: T.borderLight, borderRadius: 2, margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: T.gold }}>Nova osoba — {fmtDate(trialModal.date)} u {trialModal.time}</h3>

              {/* Probni / Redovni toggle */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 14, marginTop: 10 }}>
                {[{ v: true, l: 'Probni trening' }, { v: false, l: 'Redovni trening' }].map(opt => (
                  <button key={String(opt.v)} onClick={() => setTrialType(opt.v)}
                    style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      background: trialType === opt.v ? (opt.v ? T.orangeBg : T.greenBg) : T.surfaceLighter,
                      color: trialType === opt.v ? (opt.v ? T.orange : T.green) : T.textMuted,
                      outline: trialType === opt.v ? `1.5px solid ${opt.v ? T.orange : T.green}` : 'none' }}>
                    {opt.l}
                  </button>
                ))}
              </div>

              <input placeholder="Ime i prezime *" value={trialName} onChange={e => setTrialName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && bookTrial()} style={{ ...inputStyle, marginBottom: 14 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setTrialModal(null); setTrialType(true); }} style={{ ...btnSecondary, flex: 1, padding: 12 }}>Otkaži</button>
                <button onClick={bookTrial}
                  style={{ ...btnPrimary, flex: 1, padding: 12, background: trialType ? `linear-gradient(135deg, ${T.orange}, ${T.bronzeDark})` : `linear-gradient(135deg, ${T.green}, #4a9e6a)` }}>
                  Zakaži {trialType ? 'probni' : 'redovni'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
