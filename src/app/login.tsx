import { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { signIn, SIGN_IN_ERRORS_AR } from "@/lib/auth";
import { fonts, useTheme } from "@/lib/theme";

const LAST_USERNAME_KEY = "adr.lastUsername";

function readLastUsername(): string {
  try {
    return localStorage.getItem(LAST_USERNAME_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * Same username + password as the desktop app. The last username is
 * remembered on this phone (never the password) so a technician usually
 * only types the password.
 */
export default function LoginScreen() {
  const theme = useTheme();
  const [username, setUsername] = useState(readLastUsername);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const result = await signIn(username, password);
    if (result.ok) {
      try {
        localStorage.setItem(LAST_USERNAME_KEY, username.trim());
      } catch {}
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // navigation happens by itself: the root layout switches to the app once the profile loads
    } else {
      setError(SIGN_IN_ERRORS_AR[result.error]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={[styles.hero, { backgroundColor: theme.header }]}>
        <SafeAreaView edges={["top"]} style={styles.heroInner}>
          <View style={styles.logo}>
            <Ionicons name="construct" size={40} color={theme.header} />
          </View>
          <Text style={[styles.title, { fontFamily: fonts.bold }]}>ADR Pro</Text>
          <Text style={[styles.subtitle, { fontFamily: fonts.regular }]}>نظام الصيانة والمتابعة اللحظية</Text>
        </SafeAreaView>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text style={[styles.label, { color: theme.textMuted, fontFamily: fonts.medium }]}>اسم المستخدم</Text>
          <View style={[styles.field, { borderColor: theme.border, backgroundColor: theme.inputBg }]}>
            <Ionicons name="person-outline" size={20} color={theme.textMuted} />
            <TextInput
              style={[styles.input, { color: theme.text, fontFamily: fonts.regular }]}
              value={username}
              onChangeText={setUsername}
              placeholder="نفس اسمك في البرنامج المكتبي"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              editable={!busy}
            />
          </View>

          <Text style={[styles.label, { color: theme.textMuted, fontFamily: fonts.medium }]}>كلمة المرور</Text>
          <View style={[styles.field, { borderColor: theme.border, backgroundColor: theme.inputBg }]}>
            <Ionicons name="lock-closed-outline" size={20} color={theme.textMuted} />
            <TextInput
              ref={passwordRef}
              style={[styles.input, { color: theme.text, fontFamily: fonts.regular }]}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={theme.textMuted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={submit}
              editable={!busy}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={12}
              accessibilityLabel={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
            >
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={theme.textMuted} />
            </Pressable>
          </View>

          {error && (
            <View style={[styles.error, { backgroundColor: theme.danger + "18" }]}>
              <Ionicons name="alert-circle" size={18} color={theme.danger} />
              <Text style={[styles.errorText, { color: theme.danger, fontFamily: fonts.medium }]}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.brand, opacity: !canSubmit ? 0.5 : pressed ? 0.85 : 1 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[styles.buttonText, { fontFamily: fonts.bold }]}>تسجيل الدخول</Text>
            )}
          </Pressable>

          <Text style={[styles.hint, { color: theme.textMuted, fontFamily: fonts.regular }]}>
            تبقى مسجّلاً على هذا الهاتف حتى تخرج بنفسك أو تغيّر الإدارة كلمة مرورك.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  hero: { paddingBottom: 28, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroInner: { alignItems: "center", paddingTop: 24 },
  logo: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: { color: "#fff", fontSize: 28 },
  subtitle: { color: "#ffffffcc", fontSize: 14, marginTop: 2 },
  form: { padding: 24, gap: 8 },
  label: { fontSize: 13, marginTop: 8 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 54,
  },
  input: { flex: 1, fontSize: 16, textAlign: "right" },
  error: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, marginTop: 8 },
  errorText: { flex: 1, fontSize: 14 },
  button: { height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", marginTop: 18 },
  buttonText: { color: "#fff", fontSize: 17 },
  hint: { textAlign: "center", fontSize: 12, marginTop: 14, lineHeight: 20 },
});
