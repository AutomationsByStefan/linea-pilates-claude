import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { syncSessionBooked } from '@/lib/sheets';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { date, time, trial } = await req.json();

  const [{ data, error }, { data: member }] = await Promise.all([
    supabase.from('sessions').insert({ member_id: id, date, time, trial: trial ?? false }).select().single(),
    supabase.from('members').select('name, sessions(date, time, trial)').eq('id', id).single(),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (member?.name && !trial) {
    const today = new Date().toISOString().split('T')[0];
    const sessions = (member.sessions ?? []) as { date: string; trial: boolean }[];
    const usedCount = sessions.filter(s => !s.trial && s.date <= today).length;
    syncSessionBooked(member.name, usedCount);
  }

  return NextResponse.json({ id: data.id, date: data.date, time: data.time, trial: data.trial });
}
