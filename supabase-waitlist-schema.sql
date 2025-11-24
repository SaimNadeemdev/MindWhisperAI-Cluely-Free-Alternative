-- Simple MindWhisper AI waitlist table
-- Just name and email - that's it!

-- Enable UUID extension (required for UUID generation)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create table ONLY if it doesn't exist (SAFE)
CREATE TABLE IF NOT EXISTS waitlist_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fix existing table if it has wrong UUID function
DO $$
BEGIN
  -- Update the default for id column to use gen_random_uuid()
  ALTER TABLE waitlist_entries ALTER COLUMN id SET DEFAULT gen_random_uuid();
EXCEPTION
  WHEN others THEN
    -- If it fails, the column might already be correct
    NULL;
END $$;

-- Add name column if it doesn't exist (MIGRATION)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'waitlist_entries' AND column_name = 'name'
  ) THEN
    ALTER TABLE waitlist_entries ADD COLUMN name VARCHAR(255) NOT NULL DEFAULT 'Unknown';
  END IF;
END $$;

-- Drop device_id column if it exists (CLEANUP)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'waitlist_entries' AND column_name = 'device_id'
  ) THEN
    ALTER TABLE waitlist_entries DROP COLUMN device_id;
  END IF;
END $$;

-- Create unique index on email ONLY if it doesn't exist (SAFE)
CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist_entries(email);

-- Enable RLS ONLY if not already enabled (SAFE)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c 
    JOIN pg_namespace n ON n.oid = c.relnamespace 
    WHERE c.relname = 'waitlist_entries' AND c.relrowsecurity = true
  ) THEN
    ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Create policy ONLY if it doesn't exist (SAFE)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'waitlist_entries' AND policyname = 'Allow signup'
  ) THEN
    CREATE POLICY "Allow signup" ON waitlist_entries FOR INSERT WITH CHECK (true);
  END IF;
END $$;
