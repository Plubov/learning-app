import { Stack } from 'expo-router';

/** Layout for every screen that needs a logged-in user. */
export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
