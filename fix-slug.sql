-- Fix slug column and other missing columns in gold_links
ALTER TABLE gold_links ADD COLUMN IF NOT EXISTS slug TEXT;

-- Update existing records with slug
UPDATE gold_links SET slug = 'gold_' || substring(id::text, 1, 8) WHERE slug IS NULL;

-- Also ensure all required columns exist
ALTER TABLE gold_links ADD COLUMN IF NOT EXISTS payment_id TEXT;
ALTER TABLE gold_links ADD COLUMN IF NOT EXISTS link_id TEXT;
ALTER TABLE gold_links ADD COLUMN IF NOT EXISTS recipient_phone TEXT;
ALTER TABLE gold_links ADD COLUMN IF NOT EXISTS recipient_glink_id TEXT;
ALTER TABLE gold_links ADD COLUMN IF NOT EXISTS grail_user_id TEXT;

-- Update any null values
UPDATE gold_links SET payment_id = 'pay_' || substring(id::text, 1, 8) WHERE payment_id IS NULL;
UPDATE gold_links SET link_id = 'link_' || substring(id::text, 1, 8) WHERE link_id IS NULL;
