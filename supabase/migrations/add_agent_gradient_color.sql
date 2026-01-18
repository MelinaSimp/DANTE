-- Add gradient_color field to agents table for frontend theming
-- This field stores a JSON array of colors for radial gradients (e.g., ["#FF6B6B", "#4ECDC4", "#45B7D1"])

ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS gradient_color TEXT;

-- Generate random gradient colors for existing agents (optional - can be done in app)
-- For now, we'll generate colors in the application code


