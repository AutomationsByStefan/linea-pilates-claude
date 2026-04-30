import { NextResponse } from 'next/server';
import { supabase, transformMember } from '@/lib/supabase';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const today = new Date().toISOString().split('T')[0];

  const { error: payErr } = await supabase.from('payments').insert({
    member_id: id,
    date: today,
    package: body.package,
    amount: body.amount,
    sessions: body.sessions,
  });
  if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 });

  const { data: current } = await supabase
    .from('members')
    .select('total_sessions, paid, first_paid_date')
    .eq('id', id)
    .single();

  const newTotalSessions = ((current?.total_sessions as number) || 0) + body.sessions;
  const newPaid = ((current?.paid as number) || 0) + body.amount;
  const firstPaidDate = current?.first_paid_date || today;

  await supabase.from('members').update({
    total_sessions: newTotalSessions,
    paid: newPaid,
    package: body.package,
    package_price: body.amount,
    status: 'active',
    first_paid_date: firstPaidDate,
  }).eq('id', id);

  const { data } = await supabase
    .from('members')
    .select('*, sessions(*), payments(*)')
    .eq('id', id)
    .single();

  return NextResponse.json(transformMember(data as Record<string, unknown>));
}
