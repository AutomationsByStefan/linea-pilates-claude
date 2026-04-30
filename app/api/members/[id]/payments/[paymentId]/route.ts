import { NextResponse } from 'next/server';
import { supabase, transformMember } from '@/lib/supabase';

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  const { id, paymentId } = await params;

  // Get the payment being deleted so we know how much to subtract
  const { data: payment, error: fetchErr } = await supabase
    .from('payments')
    .select('amount, sessions, package')
    .eq('id', paymentId)
    .eq('member_id', id)
    .single();

  if (fetchErr || !payment) return NextResponse.json({ error: 'Uplata nije pronađena' }, { status: 404 });

  // Delete the payment
  const { error: delErr } = await supabase
    .from('payments')
    .delete()
    .eq('id', paymentId)
    .eq('member_id', id);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  // Recalculate member totals from remaining payments
  const { data: remaining } = await supabase
    .from('payments')
    .select('amount, sessions, package, date')
    .eq('member_id', id)
    .order('date', { ascending: false });

  const totalSessions = (remaining ?? []).reduce((s, p) => s + (p.sessions ?? 0), 0);
  const totalPaid = (remaining ?? []).reduce((s, p) => s + (p.amount ?? 0), 0);
  const lastPackage = remaining?.[0]?.package ?? '';
  const firstPaid = remaining && remaining.length > 0
    ? [...remaining].sort((a, b) => a.date.localeCompare(b.date))[0].date
    : null;

  await supabase.from('members').update({
    total_sessions: totalSessions,
    paid: totalPaid,
    package: lastPackage || '',
    status: remaining && remaining.length > 0 ? 'active' : 'trial',
    first_paid_date: firstPaid,
  }).eq('id', id);

  const { data: full } = await supabase
    .from('members')
    .select('*, sessions(*), payments(*)')
    .eq('id', id)
    .single();

  return NextResponse.json(transformMember(full as Record<string, unknown>));
}
