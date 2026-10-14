import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_SETTINGS = 'woox_app_settings';

interface AppSettingsState {
  showOrdersMenu: boolean;
  showReservationsMenu: boolean;
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  setShowOrdersMenu: (val: boolean) => Promise<void>;
  setShowReservationsMenu: (val: boolean) => Promise<void>;
}

export const useSettingsStore = create<AppSettingsState>((set, get) => ({
  showOrdersMenu: true,
  showReservationsMenu: false, // Desactivado por defecto según requerimiento
  isLoaded: false,

  loadSettings: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY_SETTINGS);
      if (stored) {
        const parsed = JSON.parse(stored);
        set({
          showOrdersMenu: parsed.showOrdersMenu !== undefined ? parsed.showOrdersMenu : true,
          showReservationsMenu: parsed.showReservationsMenu !== undefined ? parsed.showReservationsMenu : false,
          isLoaded: true,
        });
        return;
      }
      set({ showOrdersMenu: true, showReservationsMenu: false, isLoaded: true });
    } catch (err) {
      console.warn('[useSettingsStore] Failed to load settings:', err);
      set({ showOrdersMenu: true, showReservationsMenu: false, isLoaded: true });
    }
  },

  setShowOrdersMenu: async (val: boolean) => {
    set({ showOrdersMenu: val });
    try {
      const current = {
        showOrdersMenu: val,
        showReservationsMenu: get().showReservationsMenu,
      };
      await AsyncStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(current));
    } catch (err) {
      console.warn('[useSettingsStore] Failed to save settings:', err);
    }
  },

  setShowReservationsMenu: async (val: boolean) => {
    set({ showReservationsMenu: val });
    try {
      const current = {
        showOrdersMenu: get().showOrdersMenu,
        showReservationsMenu: val,
      };
      await AsyncStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(current));
    } catch (err) {
      console.warn('[useSettingsStore] Failed to save settings:', err);
    }
  },
}));
