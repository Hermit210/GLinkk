-- Complete database fix for all missing grail_user_id columns

-- Fix users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS grail_user_id TEXT;

-- Fix gold_links table  
ALTER TABLE gold_links ADD COLUMN IF NOT EXISTS grail_user_id TEXT;
ALTER TABLE gold_links ADD COLUMN IF NOT EXISTS recipient_phone TEXT;
ALTER TABLE gold_links ADD COLUMN IF NOT EXISTS recipient_glink_id TEXT;

-- Fix transactions table
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS grail_user_id TEXT;

-- Fix registry_gifts table
ALTER TABLE registry_gifts ADD COLUMN IF NOT EXISTS grail_user_id TEXT;
ALTER TABLE registry_gifts ADD COLUMN IF NOT EXISTS receiver_name TEXT;
ALTER TABLE registry_gifts ADD COLUMN IF NOT EXISTS receiver_phone TEXT;

-- Update existing records with temporary values
UPDATE users SET grail_user_id = 'temp_user_' || id WHERE grail_user_id IS NULL;
UPDATE gold_links SET grail_user_id = 'temp_link_' || id WHERE grail_user_id IS NULL;
UPDATE transactions SET grail_user_id = 'temp_tx_' || id WHERE grail_user_id IS NULL;
UPDATE registry_gifts SET grail_user_id = 'temp_gift_' || id WHERE grail_user_id IS NULL;
