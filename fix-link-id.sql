-- Fix link_id column issue in gold_links table
-- First check what the actual column name is
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'gold_links' 
ORDER BY ordinal_position;

-- If link_id doesn't exist, add it
ALTER TABLE gold_links ADD COLUMN IF NOT EXISTS link_id TEXT;

-- Update any existing records with link_id if it's missing
UPDATE gold_links SET link_id = 'link_' || id WHERE link_id IS NULL;
