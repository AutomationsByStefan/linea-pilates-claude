import { NextResponse } from 'next/server';
import { supabase, transformMember } from '@/lib/supabase';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const { data, error } = await supabase
    .from('members')
    .select('*, sessions(*), payments(*)')
    .eq('id', params.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(transformMember(data as Record<string, unknown>));
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.phone !== undefined) update.phone = body.phone;
  if (body.comment !== undefined) update.comment = body.comment;
  if (body.note !== undefined) update.note = body.note;
  if (body.status !== undefined) update.status = body.status;
  if (body.totalSessions !== undefined) update.total_sessions = body.totalSessions;
  if (body.package !== undefined) update.package = body.package;
  if (body.packagePrice !== undefined) update.package_price = body.packagePrice;
  if (body.paid !== undefined) update.paid = body.paid;
  if (body.firstPaidDate !== undefined) update.first_paid_date = body.firstPaidDate || null;

  const { error } = await supabase.from('members').update(update).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = await supabase
    .from('members')
    .select('*, sessions(*), payments(*)')
    .eq('id', params.id)
    .single();

  return NextResponse.json(transformMember(data as Record<string, unknown>));
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const { error } = await supabase.from('members').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
