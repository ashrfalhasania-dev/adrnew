import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { canManageAllJobs } from "@shared/permissions";
import type { JobStatus } from "@shared/statuses";
import { useSession } from "@/context/SessionProvider";
import { cachedJobs, fetchJobs, pendingJobIds, type Job } from "@/lib/api";
import { useJobChanges, subscribeOnline } from "@/lib/live";
import { safeStatus, statusLabel, STATUS_COLORS, STATUS_ORDER } from "@/lib/status";
import { ROLE_LABELS_AR } from "@/lib/auth";
import { fonts, useTheme, type Theme } from "@/lib/theme";

type Scope = "mine" | "all" | "unassigned";

/**
 * The work list. Opens instantly from the device cache, then refreshes;
 * updates live when anything changes elsewhere. Technicians see only their
 * own jobs (enforced by the database, not just this screen); management
 * can switch between "mine", "all" and "unassigned".
 */
export default function JobsScreen() {
  const theme = useTheme();
  const { profile, signOut } = useSession();
  const isManager = profile ? canManageAllJobs(profile) : false;

  const [jobs, setJobs] = useState<Job[]>(() => cachedJobs() ?? []);
  const [loading, setLoading] = useState(jobs.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<Scope>(isManager ? "all" : "mine");
  const [statusFilter, setStatusFilter] = useState<JobStatus | null>(null);
  const [pending, setPending] = useState<Set<number>>(() => new Set(pendingJobIds()));

  const load = useCallback(async () => {
    try {
      const fresh = await fetchJobs();
      setJobs(fresh);
      setError(null);
    } catch {
      setError("تعذّر التحديث — تعرض آخر نسخة محفوظة على الهاتف.");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setPending(new Set(pendingJobIds()));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => subscribeOnline(setOnline), []);
  useJobChanges(() => void load());

  const counts = useMemo(() => {
    const c = new Map<JobStatus, number>();
    for (const j of jobs) {
      const s = safeStatus(j.status);
      c.set(s, (c.get(s) ?? 0) + 1);
    }
    return c;
  }, [jobs]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((j) => {
      if (scope === "mine" && j.assignedTo !== profile?.id) return false;
      if (scope === "unassigned" && j.assignedTo !== null) return false;
      if (statusFilter && safeStatus(j.status) !== statusFilter) return false;
      if (!q) return true;
      return [j.trackingCode, j.deviceType, j.deviceBrand, j.deviceModel, j.customerName, j.assignedToName, j.serialNumber]
        .some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [jobs, search, scope, statusFilter, profile?.id]);

  const openMenu = () =>
    Alert.alert(profile?.fullName || profile?.username || "", profile ? ROLE_LABELS_AR[profile.role] : "", [
      { text: "إغلاق", style: "cancel" },
      {
        text: "تسجيل الخروج",
        style: "destructive",
        onPress: () =>
          Alert.alert("تسجيل الخروج", "هل تريد تسجيل الخروج من هذا الهاتف؟", [
            { text: "إلغاء", style: "cancel" },
            { text: "خروج", style: "destructive", onPress: () => void signOut() },
          ]),
      },
    ]);

  if (!profile) return null;
  const initial = (profile.fullName || profile.username).trim().charAt(0);

  return (
    <View style={[styles.root, { backgroundColor: theme.surface }]}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: theme.header }}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.headerText, fontFamily: fonts.bold }]}>
            {isManager ? "الأجهزة" : "أجهزتي"}
          </Text>
          <Pressable onPress={openMenu} style={[styles.avatar, { backgroundColor: theme.brand }]} accessibilityLabel="حسابي">
            <Text style={[styles.avatarText, { fontFamily: fonts.bold }]}>{initial}</Text>
          </Pressable>
        </View>
        <View style={[styles.searchBox, { backgroundColor: theme.inputBg }]}>
          <Ionicons name="search" size={18} color={theme.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="ابحث بالكود، الجهاز، الموديل..."
            placeholderTextColor={theme.textMuted}
            style={[styles.searchInput, { color: theme.text, fontFamily: fonts.regular }]}
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={theme.textMuted} />
            </Pressable>
          )}
        </View>
      </SafeAreaView>

      {!online && (
        <View style={[styles.banner, { backgroundColor: "#F59E0B" }]}>
          <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
          <Text style={[styles.bannerText, { fontFamily: fonts.medium }]}>بدون إنترنت — تعمل على النسخة المحفوظة</Text>
        </View>
      )}

      {isManager && (
        <View style={styles.scopeRow}>
          {(
            [
              ["all", "الكل"],
              ["mine", "المسندة لي"],
              ["unassigned", "غير مسندة"],
            ] as [Scope, string][]
          ).map(([key, label]) => (
            <Chip key={key} theme={theme} label={label} active={scope === key} onPress={() => setScope(key)} />
          ))}
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsScroll}>
        <Chip theme={theme} label={`الكل ${jobs.length}`} active={statusFilter === null} onPress={() => setStatusFilter(null)} />
        {STATUS_ORDER.filter((s) => (counts.get(s) ?? 0) > 0).map((s) => (
          <Chip
            key={s}
            theme={theme}
            label={`${statusLabel(s)} ${counts.get(s)}`}
            color={STATUS_COLORS[s]}
            active={statusFilter === s}
            onPress={() => setStatusFilter(statusFilter === s ? null : s)}
          />
        ))}
      </ScrollView>

      {error && <Text style={[styles.error, { color: theme.danger, fontFamily: fonts.medium }]}>{error}</Text>}

      <FlashList
        data={visible}
        keyExtractor={(j) => String(j.id)}
        renderItem={({ item }) => (
          <JobCard
            job={item}
            theme={theme}
            showAssignee={isManager}
            pending={pending.has(item.id)}
            onPress={() => router.push({ pathname: "/job/[id]", params: { id: String(item.id) } })}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            colors={[theme.brand]}
          />
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: theme.textMuted, fontFamily: fonts.regular }]}>
            {loading ? "جارٍ التحميل..." : search || statusFilter ? "لا توجد أجهزة مطابقة." : "لا توجد أجهزة حالياً."}
          </Text>
        }
      />
    </View>
  );
}

function Chip({
  theme,
  label,
  active,
  color,
  onPress,
}: {
  theme: Theme;
  label: string;
  active: boolean;
  color?: string;
  onPress: () => void;
}) {
  const tint = color ?? theme.brand;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: active ? tint : theme.border, backgroundColor: active ? tint + "22" : theme.card },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? tint : theme.text, fontFamily: fonts.medium }]}>{label}</Text>
    </Pressable>
  );
}

function JobCard({
  job,
  theme,
  showAssignee,
  pending,
  onPress,
}: {
  job: Job;
  theme: Theme;
  showAssignee: boolean;
  pending: boolean;
  onPress: () => void;
}) {
  const status = safeStatus(job.status);
  const color = STATUS_COLORS[status];
  const device = [job.deviceType, job.deviceBrand, job.deviceModel].filter(Boolean).join(" ") || "جهاز";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: theme.card, opacity: pressed ? 0.85 : 1, borderRightColor: color }]}
    >
      <View style={styles.cardTop}>
        <Text style={[styles.code, { color: theme.text, fontFamily: fonts.bold }]}>{job.trackingCode ?? `#${job.id}`}</Text>
        <View style={[styles.pill, { backgroundColor: color + "22" }]}>
          <Text style={[styles.pillText, { color, fontFamily: fonts.bold }]}>{statusLabel(status)}</Text>
        </View>
      </View>
      <Text style={[styles.device, { color: theme.text, fontFamily: fonts.medium }]} numberOfLines={1}>
        {device}
      </Text>
      {job.issue ? (
        <Text style={[styles.issue, { color: theme.textMuted, fontFamily: fonts.regular }]} numberOfLines={1}>
          {job.issue}
        </Text>
      ) : null}
      <View style={styles.cardBottom}>
        {job.isUrgent && <Badge text="مستعجل" color={theme.danger} />}
        {pending && <Badge text="بانتظار الإرسال" color="#F59E0B" />}
        {showAssignee && (
          <Text style={[styles.meta, { color: theme.textMuted, fontFamily: fonts.regular }]} numberOfLines={1}>
            <Ionicons name="person-outline" size={12} /> {job.assignedToName ?? "غير مسند"}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + "22" }]}>
      <Text style={[styles.badgeText, { color, fontFamily: fonts.bold }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { height: 56, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { fontSize: 21 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 16 },
  searchBox: {
    marginHorizontal: 12,
    marginBottom: 10,
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, textAlign: "right" },
  banner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 6 },
  bannerText: { color: "#fff", fontSize: 13 },
  scopeRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingTop: 10 },
  chipsScroll: { flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, height: 32, justifyContent: "center" },
  chipText: { fontSize: 13 },
  error: { textAlign: "center", fontSize: 12, paddingBottom: 6 },
  listContent: { paddingHorizontal: 12, paddingBottom: 24 },
  card: { borderRadius: 14, padding: 14, marginBottom: 10, borderRightWidth: 4, gap: 4 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  code: { fontSize: 16 },
  pill: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2 },
  pillText: { fontSize: 12 },
  device: { fontSize: 15 },
  issue: { fontSize: 13 },
  cardBottom: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" },
  meta: { fontSize: 12 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11 },
  empty: { textAlign: "center", marginTop: 60, fontSize: 14 },
});
