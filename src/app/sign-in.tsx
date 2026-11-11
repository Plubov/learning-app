import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type Message = { kind: 'error' | 'info'; text: string };

export default function SignInScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function signIn() {
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    // On success the session changes and the root layout switches screens.
    if (error) {
      setMessage({ kind: 'error', text: error.message });
    }
  }

  async function signUp() {
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setMessage({ kind: 'error', text: error.message });
    } else if (!data.session) {
      // Supabase requires email confirmation by default: no session until then.
      setMessage({
        kind: 'info',
        text: 'Account created. Open the confirmation link in your email, then sign in here.',
      });
    }
  }

  const canSubmit = email.trim() !== '' && password !== '' && !busy;
  const inputStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement },
  ];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.form}>
          <ThemedText type="subtitle">Learning App</ThemedText>

          <TextInput
            style={inputStyle}
            placeholder="Email"
            placeholderTextColor={theme.textSecondary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
          />
          <TextInput
            style={inputStyle}
            placeholder="Password"
            placeholderTextColor={theme.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            onSubmitEditing={canSubmit ? signIn : undefined}
          />

          {message && (
            <ThemedText
              type="small"
              style={{ color: message.kind === 'error' ? theme.danger : theme.textSecondary }}>
              {message.text}
            </ThemedText>
          )}

          <Pressable
            onPress={signIn}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.tint },
              (!canSubmit || pressed) && styles.dimmed,
            ]}>
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText style={styles.primaryText}>Sign in</ThemedText>
            )}
          </Pressable>

          <Pressable
            onPress={signUp}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.button,
              styles.secondaryButton,
              { borderColor: theme.border },
              (!canSubmit || pressed) && styles.dimmed,
            ]}>
            <ThemedText>Create account</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, padding: Spacing.four, alignItems: 'center', justifyContent: 'center' },
  form: { width: '100%', maxWidth: MaxContentWidth / 2, gap: Spacing.three },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  button: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two + Spacing.one,
    alignItems: 'center',
  },
  secondaryButton: { borderWidth: 1 },
  primaryText: { color: '#ffffff', fontWeight: 600 },
  dimmed: { opacity: 0.5 },
});
