import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Platform-aware storage utility.
 * Uses expo-secure-store on Native (iOS/Android) for security.
 * Falls back to localStorage on Web (since SecureStore is not supported there).
 */

const isWeb = Platform.OS === 'web';

export const storage = {
  setItem: async (key, value) => {
    try {
      if (isWeb) {
        localStorage.setItem(key, value);
      } else {
        await SecureStore.setItemAsync(key, value);
      }
      return true;
    } catch (e) {
      console.warn(`Storage Error (setItem ${key}):`, e.message);
      return false;
    }
  },

  getItem: async (key) => {
    try {
      if (isWeb) {
        return localStorage.getItem(key);
      } else {
        return await SecureStore.getItemAsync(key);
      }
    } catch (e) {
      console.warn(`Storage Error (getItem ${key}):`, e.message);
      return null;
    }
  },

  removeItem: async (key) => {
    try {
      if (isWeb) {
        localStorage.removeItem(key);
      } else {
        await SecureStore.deleteItemAsync(key);
      }
      return true;
    } catch (e) {
      console.warn(`Storage Error (removeItem ${key}):`, e.message);
      return false;
    }
  }
};
