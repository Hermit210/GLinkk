-- Only run these NEW tables/columns that don't exist yet

-- Blessing Registry Tables
CREATE TABLE IF NOT EXISTS blessing_registries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    registry_name TEXT NOT NULL,
    creator_name TEXT NOT NULL,
    creator_email TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blessings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    registry_id UUID REFERENCES blessing_registries(id) ON DELETE CASCADE,
    sender_name TEXT NOT NULL,
    sender_email TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_blessing_registries_slug ON blessing_registries(slug);
CREATE INDEX IF NOT EXISTS idx_blessing_registries_creator_email ON blessing_registries(creator_email);
CREATE INDEX IF NOT EXISTS idx_blessings_registry_id ON blessings(registry_id);
CREATE INDEX IF NOT EXISTS idx_blessings_sender_email ON blessings(sender_email);

-- Add database schema for gold blessing pages

CREATE TABLE IF NOT EXISTS gold_blessings (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    occasion TEXT NOT NULL,
    message TEXT,
    email TEXT,
    total_gold DECIMAL DEFAULT 0,
    total_inr DECIMAL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gold_blessing_entries (
    id SERIAL PRIMARY KEY,
    gold_blessing_id TEXT REFERENCES gold_blessings(id),
    blesser_name TEXT NOT NULL,
    blesser_message TEXT,
    amount_inr DECIMAL NOT NULL,
    gold_grams DECIMAL NOT NULL,
    grail_tx_id TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_gold_blessings_email ON gold_blessings(email);

-- Add recipient columns to existing gold_links table (if not already added)
ALTER TABLE gold_links ADD COLUMN IF NOT EXISTS recipient_phone TEXT;
ALTER TABLE gold_links ADD COLUMN IF NOT EXISTS recipient_glink_id TEXT;

-- Add receiver columns to existing registry_gifts table (if not already added)
ALTER TABLE registry_gifts ADD COLUMN IF NOT EXISTS receiver_name TEXT;
ALTER TABLE registry_gifts ADD COLUMN IF NOT EXISTS receiver_phone TEXT;

-- Create NEW groups table (if not exists)
CREATE TABLE IF NOT EXISTS groups (
  group_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  rules TEXT,
  creator_email TEXT NOT NULL,
  total_gold DECIMAL DEFAULT 0,
  member_count INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create NEW group_members table (if not exists)
CREATE TABLE IF NOT EXISTS group_members (
  id SERIAL PRIMARY KEY,
  group_id TEXT REFERENCES groups(group_id),
  email TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT NOW()
);

-- Create NEW group_contributions table (if not exists)
CREATE TABLE IF NOT EXISTS group_contributions (
  id SERIAL PRIMARY KEY,
  group_id TEXT REFERENCES groups(group_id),
  email TEXT NOT NULL,
  amount_inr DECIMAL NOT NULL,
  gold_grams DECIMAL NOT NULL,
  message TEXT,
  payment_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create NEW group_messages table (if not exists)
CREATE TABLE IF NOT EXISTS group_messages (
  id SERIAL PRIMARY KEY,
  group_id TEXT REFERENCES groups(group_id),
  sender_email TEXT NOT NULL,
  message TEXT NOT NULL,
  message_type TEXT DEFAULT 'text', -- 'text', 'system', 'gold_share'
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create functions for updating group totals (if not exists)
CREATE OR REPLACE FUNCTION increment_group_gold(group_id TEXT, gold_amount DECIMAL)
RETURNS void AS $$
BEGIN
  UPDATE groups 
  SET total_gold = total_gold + gold_amount 
  WHERE groups.group_id = increment_group_gold.group_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_group_members(group_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE groups 
  SET member_count = member_count + 1 
  WHERE groups.group_id = increment_group_members.group_id;
END;
$$ LANGUAGE plpgsql;
