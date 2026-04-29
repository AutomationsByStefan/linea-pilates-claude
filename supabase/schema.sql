-- Linea Pilates Reformer Trebinje — Supabase schema
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text DEFAULT '',
  trial_date date,
  comment text DEFAULT '',
  total_sessions integer DEFAULT 0,
  package text DEFAULT '',
  package_price numeric(10,2) DEFAULT 0,
  paid numeric(10,2) DEFAULT 0,
  status text DEFAULT 'trial' CHECK (status IN ('active', 'trial')),
  note text DEFAULT '',
  first_paid_date date,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  date date NOT NULL,
  time text NOT NULL,
  trial boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(member_id, date, time)
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  date date NOT NULL,
  package text NOT NULL,
  amount numeric(10,2) NOT NULL,
  sessions integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Row Level Security (open policies – add auth later if needed)
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on members" ON members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on sessions" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on payments" ON payments FOR ALL USING (true) WITH CHECK (true);
