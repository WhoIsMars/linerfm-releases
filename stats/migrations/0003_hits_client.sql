-- Telefono o tablet ("mobile") contro computer ("desktop"), deciso dal sito; '' per le visite di prima.
ALTER TABLE hits ADD COLUMN client TEXT NOT NULL DEFAULT '';
