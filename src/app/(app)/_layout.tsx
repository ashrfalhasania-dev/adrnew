import { useEffect } from "react";
import { Stack } from "expo-router";
import { canManageAllJobs } from "@shared/permissions";
import { useSession } from "@/context/SessionProvider";
import { startLive } from "@/lib/live";
import { useTheme } from "@/lib/theme";

export default function AppLayout() {
  const theme = useTheme();
  const { profile } = useSession();
  const staffId = profile?.id ?? null;
  const isManager = profile ? canManageAllJobs(profile) : false;

  // one live connection for every signed-in screen
  useEffect(() => {
    if (!staffId) return;
    return startLive(staffId, isManager);
  }, [staffId, isManager]);

  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg }, animation: "slide_from_left" }}
    />
  );
}
