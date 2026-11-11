import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const KEY = 'device_id';
let cached: Promise<string> | null = null;

/**
 * A random name for this installation, stored with each review event to
 * debug sync between devices. Not a secret and not used for security.
 */
export function getDeviceId(): Promise<string> {
  cached ??= (async () => {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored) {
      return stored;
    }
    const id = `${Platform.OS}-${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(KEY, id);
    return id;
  })();
  return cached;
}
