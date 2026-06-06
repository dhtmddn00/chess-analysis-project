-- Migration: add coach_narrative column to style_profiles_worker
-- Generated: 2026-06-06
-- Safe to run multiple times (IF NOT EXISTS guard).

ALTER TABLE style_profiles_worker
  ADD COLUMN IF NOT EXISTS coach_narrative TEXT;

COMMENT ON COLUMN style_profiles_worker.coach_narrative IS
  'JSON object with AI-generated coaching narrative. '
  'Keys: pattern (string), why_losing (string), one_action (string). '
  'NULL means narrative has not been generated yet (e.g. analysis pre-dates this feature '
  'or GEMINI_API_KEY is not configured).';
