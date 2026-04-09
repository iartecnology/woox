-- Migration: Add menu_pdf_url to merchants
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS menu_pdf_url TEXT;
