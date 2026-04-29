import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function DELETE(
  _: Request,
  { params }: { params: { id: string; sessionId: string } }
) {
  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('id', params.sessionId)
    .eq('member_id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
