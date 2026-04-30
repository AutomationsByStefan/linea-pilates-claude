import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { date, time, trial } = await req.json();

  const { data, error } = await supabase
    .from('sessions')
    .insert({ member_id: id, date, time, trial: trial ?? false })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id, date: data.date, time: data.time, trial: data.trial });
}
