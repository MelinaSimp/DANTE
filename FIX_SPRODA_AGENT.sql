-- Fix Sproda agent modality to handle voice calls
-- This agent has phone_number '+12166770276' but modality is 'chat'
-- It needs to be 'voice' or 'multi-modal' to handle calls

-- Option 1: Change to 'multi-modal' (handles both SMS and calls)
UPDATE agents
SET modality = 'multi-modal'
WHERE id = '623ccdbc-3633-42ad-99a4-497753d8a3aa'
  AND name = 'Sproda'
  AND phone_number = '+12166770276';

-- Option 2: Change to 'voice' (voice calls only, SMS won't work)
-- UPDATE agents
-- SET modality = 'voice'
-- WHERE id = '623ccdbc-3633-42ad-99a4-497753d8a3aa'
--   AND name = 'Sproda'
--   AND phone_number = '+12166770276';

-- Verify the change
SELECT id, name, phone_number, modality, status
FROM agents
WHERE id = '623ccdbc-3633-42ad-99a4-497753d8a3aa';
