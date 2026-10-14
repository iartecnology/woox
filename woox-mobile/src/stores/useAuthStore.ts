import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { Profile, Merchant } from '../types/domain';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const STORAGE_KEY_USER = 'woox_mobile_user_profile';

interface AuthState {
  profile: Profile | null;
  merchant: Merchant | null;
  isLoading: boolean;
  initialize: () => Promise<void>;
  signIn: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  setMerchant: (merchant: Merchant | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  profile: null,
  merchant: null,
  isLoading: true,

  initialize: async () => {
    try {
      let savedUserJson: string | null = null;
      if (Platform.OS === 'web') {
        savedUserJson = localStorage.getItem(STORAGE_KEY_USER);
      } else {
        savedUserJson = await SecureStore.getItemAsync(STORAGE_KEY_USER);
      }

      if (savedUserJson) {
        const parsed = JSON.parse(savedUserJson);
        set({
          profile: parsed.profile,
          merchant: parsed.merchant,
          isLoading: false,
        });
        return;
      }
      set({ profile: null, merchant: null, isLoading: false });
    } catch (error) {
      console.error('[useAuthStore] Error initializing:', error);
      set({ profile: null, merchant: null, isLoading: false });
    }
  },

  signIn: async (email: string, pass: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, merchants(*)')
        .eq('email', email.trim().toLowerCase())
        .eq('password', pass)
        .maybeSingle();

      if (error || !data) {
        return { success: false, error: 'Credenciales incorrectas o usuario no encontrado.' };
      }

      const profile: Profile = {
        id: data.id,
        email: data.email,
        full_name: data.full_name,
        role: data.role,
        merchant_id: data.merchant_id,
      };

      const merchant: Merchant | null = data.merchants
        ? {
            id: data.merchants.id,
            name: data.merchants.name,
            business_name: data.merchants.name,
            slug: data.merchants.slug,
            industry_type: data.merchants.industry_type,
            is_active: data.merchants.is_active,
            logo_url: data.merchants.logo_url,
          }
        : null;

      const sessionPayload = JSON.stringify({ profile, merchant });
      if (Platform.OS === 'web') {
        localStorage.setItem(STORAGE_KEY_USER, sessionPayload);
      } else {
        await SecureStore.setItemAsync(STORAGE_KEY_USER, sessionPayload);
      }

      set({ profile, merchant, isLoading: false });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de autenticación' };
    }
  },

  signOut: async () => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(STORAGE_KEY_USER);
    } else {
      await SecureStore.deleteItemAsync(STORAGE_KEY_USER);
    }
    set({ profile: null, merchant: null });
  },

  setMerchant: (merchant: Merchant | null) => set({ merchant }),
}));
