import { NextResponse } from 'next/server';
import { supabase, transformMember } from '@/lib/supabase';
import { syncNewMember } from '@/lib/sheets';

export async function GET() {
  const { data, error } = await supabase
    .from('members')
    .select('*, sessions(*), payments(*)')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).map(transformMember));
}

export async function POST(req: Request) {
  const body = await req.json();
  const today = new Date().toISOString().split('T')[0];

  const { data: member, error } = await supabase
    .from('members')
    .insert({
      name: body.name,
      phone: body.phone || '',
      trial_date: today,
      comment: 'Novi član',
      status: 'trial',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // optionally add a trial session right away
  if (body.trialDate && body.trialTime) {
    await supabase.from('sessions').insert({
      member_id: member.id,
      date: body.trialDate,
      time: body.trialTime,
      trial: true,
    });
  }

  const { data: full } = await supabase
    .from('members')
    .select('*, sessions(*), payments(*)')
    .eq('id', member.id)
    .single();

  const transformed = transformMember(full as Record<string, unknown>);
  syncNewMember(transformed.name, transformed.phone, today);
  return NextResponse.json(transformed);
}
