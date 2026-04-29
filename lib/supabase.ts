import { createClient } from '@supabase/supabase-js';
import type { Member } from './types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, key);

export function transformMember(m: Record<string, unknown>): Member {
  const sessions = (m.sessions as Record<string, unknown>[] | null) ?? [];
  const payments = (m.payments as Record<string, unknown>[] | null) ?? [];
  return {
    id: m.id as string,
    name: m.name as string,
    phone: (m.phone as string) || '',
    trialDate: (m.trial_date as string) || '',
    comment: (m.comment as string) || '',
    totalSessions: (m.total_sessions as number) || 0,
    package: (m.package as string) || '',
    packagePrice: Number(m.package_price) || 0,
    paid: Number(m.paid) || 0,
    status: (m.status as 'active' | 'trial') || 'trial',
    note: (m.note as string) || '',
    firstPaidDate: (m.first_paid_date as string) || '',
    sessions: sessions.map((s) => ({
      id: s.id as string,
      date: s.date as string,
      time: s.time as string,
      trial: s.trial as boolean,
    })),
    payments: payments.map((p) => ({
      id: p.id as string,
      date: p.date as string,
      package: p.package as string,
      amount: Number(p.amount),
      sessions: p.sessions as number,
    })),
  };
}
