import { useEffect, useState } from "react";
import { ActivityIndicator, I18nManager, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts, Cairo_400Regular, Cairo_600SemiBold, Cairo_700Bold } from "@expo-google-fonts/cairo";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "@/context/SessionProvider";
import { useTheme } from "@/lib/theme";
import { hydrateStorage } from "@/lib/storage";

// Arabic app: right-to-left everywhere (also forced natively via the
// expo-localization plugin options in app.json).
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { loading, session, profileLoading } = useSession();
  const theme = useTheme();
  // Navigate as soon as we have a session — don't wait for profile RPC.
  const signedIn = Boolean(session);

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);

  if (loading) return null; // splash screen stays up until the stored session is read

  // First login on this device: session is ready but profile RPC is still in flight.
  // Show a full-screen spinner so the user sees progress instead of the login screen.
  if (signedIn && profileLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
        <ActivityIndicator size="large" color={theme.brand} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg }, animation: "fade" }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Cairo_400Regular, Cairo_600SemiBold, Cairo_700Bold });
  const [storageReady, setStorageReady] = useState(false);
  useEffect(() => {
    hydrateStorage().finally(() => setStorageReady(true));
  }, []);
  if (!fontsLoaded || !storageReady) return null; // splash screen stays up

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SessionProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
