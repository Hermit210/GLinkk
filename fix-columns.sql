-- Fix missing grail_user_id column in gold_links table
ALTER TABLE gold_links ADD COLUMN IF NOT EXISTS grail_user_id TEXT;

-- Also add any other missing columns that might be needed
ALTER TABLE gold_links ADD COLUMN IF NOT EXISTS recipient_phone TEXT;
ALTER TABLE gold_links ADD COLUMN IF NOT EXISTS recipient_glink_id TEXT;

-- Check if transactions table has grail_user_id
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS grail_user_id TEXT;

-- Check if registry_gifts table has grail_user_id  
ALTER TABLE registry_gifts ADD COLUMN IF NOT EXISTS grail_user_id TEXT;
ALTER TABLE registry_gifts ADD COLUMN IF NOT EXISTS receiver_name TEXT;
ALTER TABLE registry_gifts ADD COLUMN IF NOT EXISTS receiver_phone TEXT;

-- Update any existing records that might need grail_user_id
UPDATE gold_links SET grail_user_id = 'temp_' || link_id WHERE grail_user_id IS NULL;
