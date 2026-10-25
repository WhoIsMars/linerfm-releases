-- Quando il link è partito da solo con Resend (src/lead.ts); NULL = da mandare a mano (scripts/leads.mjs).
ALTER TABLE leads ADD COLUMN sent_ts INTEGER;
