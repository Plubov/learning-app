import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

// Expo copies EXPO_PUBLIC_* variables from .env into the app at build time.
// They must be read as written here (process.env.NAME), not dynamically.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
      'Copy .env.example to .env, fill it in, and restart `npx expo start`.',
  );
}

/** The one Supabase client the whole app shares. */
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    // On the web supabase-js keeps the session in localStorage by itself
    // (and in memory during server-side builds). Phones have no localStorage,
    // so the session is kept in AsyncStorage there.
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Only needed for links that log you in (magic links, OAuth); not used yet.
    detectSessionInUrl: false,
  },
});

// On phones, refresh the login token only while the app is in the foreground,
// as recommended by Supabase for React Native.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
