-- Quick fix for missing columns in gold_links table
ALTER TABLE gold_links ADD COLUMN IF NOT EXISTS payment_id TEXT;
ALTER TABLE gold_links ADD COLUMN IF NOT EXISTS link_id TEXT;

-- Update existing records
UPDATE gold_links SET payment_id = 'pay_' || id WHERE payment_id IS NULL;
UPDATE gold_links SET link_id = 'link_' || id WHERE link_id IS NULL;
