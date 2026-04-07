-- Migration: Hierarchical Categories
-- This migration adds a parent_id column to categories to support nested subcategories.

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;

-- Index for performance when searching subcategories
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories(parent_id);
