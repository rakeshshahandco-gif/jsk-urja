import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import ENV from '../config/env';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../theme/colors';

export const LoginScreen = () => {
  const { login, testRemoteConnection } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Required', 'Please enter username and password.');
      return;
    }
    setLoading(true);
    const result = await login(username.trim(), password);
    setLoading(false);
    if (!result.success) {
      Alert.alert('Login Failed', result.error || 'Invalid credentials. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>SHR</Text>
            </View>
            <Text style={styles.brand}>SHREEJAL</Text>
            <Text style={{ fontSize: 20, color: 'red', fontWeight: 'bold' }}>[MOBILE APK TEST MODE]</Text>
            <Text style={styles.subtitle}>Task Management</Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Welcome Back</Text>
            <Text style={styles.cardSubtitle}>Sign in with your CRM credentials</Text>

            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your username"
              placeholderTextColor={COLORS.gray400}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />

            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Enter your password"
                placeholderTextColor={COLORS.gray400}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPwd}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPwd(v => !v)}>
                <Text style={styles.eyeText}>{showPwd ? '🙈' : '👁'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color={COLORS.white} />
                : <Text style={styles.loginBtnText}>LOGIN →</Text>
              }
            </TouchableOpacity>

            <View style={styles.envBadge}>
              <Text style={styles.envText}>v{ENV.version} • {ENV.envName}</Text>
              <Text style={styles.serverText}>{ENV.apiUrl}</Text>
            </View>

            <TouchableOpacity 
              style={styles.testBtn} 
              onPress={async () => {
                setLoading(true);
                const info = await testRemoteConnection();
                setLoading(false);
                Alert.alert(
                  info.success ? 'System Online ✅' : 'Network Problem ❌',
                  `${info.message}\n\n${info.details || info.data || ''}`
                );
              }}
            >
              <Text style={styles.testBtnText}>TEST CONNECTION</Text>
            </TouchableOpacity>

            <Text style={styles.hint}>
              Use the same credentials as your CRM desktop login
            </Text>
          </View>

          {/* Footer */}
          <Text style={styles.footer}>Shreejal CRM • Task Management v1.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.primary },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'space-between', padding: SPACING.xl },
  header: { alignItems: 'center', paddingTop: SPACING.xxl, paddingBottom: SPACING.xl },
  logoCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.white + '20',
    borderWidth: 2, borderColor: COLORS.white + '60',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.base,
  },
  logoText: { fontSize: FONT.xl, fontWeight: FONT.bold, color: COLORS.white, letterSpacing: 2 },
  brand: { fontSize: FONT.xxl, fontWeight: FONT.bold, color: COLORS.white, letterSpacing: 3 },
  subtitle: { fontSize: FONT.md, color: COLORS.white + 'CC', marginTop: 4 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    ...SHADOW.strong,
  },
  cardTitle: { fontSize: FONT.xl, fontWeight: FONT.bold, color: COLORS.gray900, marginBottom: 4 },
  cardSubtitle: { fontSize: FONT.sm, color: COLORS.gray400, marginBottom: SPACING.lg },
  label: { fontSize: FONT.sm, fontWeight: FONT.semibold, color: COLORS.gray600, marginBottom: 6 },
  input: {
    height: 50,
    backgroundColor: COLORS.gray50,
    borderWidth: 1.5, borderColor: COLORS.gray200,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.base,
    fontSize: FONT.base,
    color: COLORS.gray900,
    marginBottom: SPACING.base,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.xl, gap: SPACING.sm },
  eyeBtn: { padding: SPACING.sm },
  eyeText: { fontSize: 20 },
  loginBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.strong,
  },
  loginBtnDisabled: { opacity: 0.7 },
  loginBtnText: { color: COLORS.white, fontSize: FONT.md, fontWeight: FONT.bold, letterSpacing: 1 },
  testBtn: {
    marginTop: SPACING.base,
    padding: SPACING.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
    borderRadius: RADIUS.md,
  },
  testBtnText: { color: COLORS.primary, fontSize: FONT.xs, fontWeight: FONT.bold },
  hint: { textAlign: 'center', fontSize: FONT.xs, color: COLORS.gray400, marginTop: SPACING.base },
  envBadge: {
    marginTop: SPACING.base,
    marginBottom: SPACING.sm,
    padding: SPACING.sm,
    backgroundColor: COLORS.primary + '08',
    borderRadius: RADIUS.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary + '20',
  },
  envText: { fontSize: 10, fontWeight: 'bold', color: COLORS.gray500, marginBottom: 2 },
  serverText: { fontSize: 9, color: COLORS.primary, opacity: 0.7 },
  footer: { textAlign: 'center', fontSize: FONT.xs, color: COLORS.white + '80', paddingTop: SPACING.xl },
});
