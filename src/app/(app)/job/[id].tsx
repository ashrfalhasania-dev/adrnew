import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { canManageAllJobs } from "@shared/permissions";
import { useSession } from "@/context/SessionProvider";
import {
  cachedFaultSections,
  cachedJobDetail,
  fetchFaultSections,
  fetchJobDetail,
  saveJobFaults,
  type FaultSection,
  type JobDetail,
} from "@/lib/api";
import { useJobChanges } from "@/lib/live";
import { safeStatus, statusLabel } from "@/lib/status";
import { fonts, useTheme, type Theme } from "@/lib/theme";

const QUICK_COUNTS = [1, 2, 4, 6, 8];

/**
 * One job: device info + the fault checklist.
 * The technician taps a section (خرج، دخل، بور...) and sets how many pieces
 * the repair needs; saving reserves exactly that many of the section's
 * linked part (they leave stock only when the job becomes "جاهز"). No
 * prices appear here for technicians -- the database never sends them.
 */
export default function JobScreen() {
  const theme = useTheme();
  const { profile } = useSession();
  const isManager = profile ? canManageAllJobs(profile) : false;
  const { id } = useLocalSearchParams<{ id: string }>();
  const jobId = Number(id);

  const [job, setJob] = useState<JobDetail | null>(() => cachedJobDetail(jobId));
  const [sections, setSections] = useState<FaultSection[]>(() => cachedFaultSections() ?? []);
  const [draft, setDraft] = useState<Record<number, number>>({});
  const [dirty, setDirtyState] = useState(false);
  const dirtyRef = useRef(false);
  const setDirty = useCallback((v: boolean) => {
    dirtyRef.current = v;
    setDirtyState(v);
  }, []);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  const applyJob = useCallback((detail: JobDetail) => {
    setJob(detail);
    const next: Record<number, number> = {};
    for (const f of detail.faults) next[f.sectionId] = f.quantity;
    setDraft(next);
    setDirty(false);
  }, [setDirty]);

  const load = useCallback(async () => {
    try {
      const [detail, secs] = await Promise.all([fetchJobDetail(jobId), fetchFaultSections()]);
      setSections(secs);
      // never overwrite what the technician is changing right now
      if (dirtyRef.current) setJob(detail);
      else applyJob(detail);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("NO_ACCESS")) {
        Alert.alert("غير متاح", "هذا الجهاز لم يعد مسنداً لك.");
        router.back();
      }
    }
  }, [jobId, applyJob]);

  useEffect(() => {
    const cached = cachedJobDetail(jobId);
    if (cached) applyJob(cached);
    void load();
  }, [jobId, load, applyJob]);

  useJobChanges((changedId) => {
    if (changedId === null || changedId === jobId) void load();
  });

  // sections the admin later switched off still show if this job already has them
  const rows = useMemo(() => {
    const list = sections.map((s) => ({ ...s, legacyName: null as string | null }));
    for (const f of job?.faults ?? []) {
      if (!list.some((s) => s.id === f.sectionId)) {
        list.push({
          id: f.sectionId,
          name: f.sectionName,
          hasPart: f.inStock !== null,
          partName: f.partName,
          stock: f.stock,
          inStock: f.inStock,
          legacyName: f.sectionName,
        });
      }
    }
    return list;
  }, [sections, job?.faults]);

  const locked = Boolean(job?.partsDeducted);
  const selectedCount = Object.values(draft).filter((q) => q > 0).length;

  const setQty = (sectionId: number, qty: number) => {
    if (locked) return;
    const safe = Math.max(0, Math.min(999, Math.trunc(qty) || 0));
    setDraft((d) => ({ ...d, [sectionId]: safe }));
    setDirty(true);
    setNotice(null);
    Haptics.selectionAsync().catch(() => {});
  };

  const save = async () => {
    if (!dirty || saving || locked) return;
    setSaving(true);
    const entries = Object.entries(draft)
      .map(([sectionId, quantity]) => ({ sectionId: Number(sectionId), quantity }))
      .filter((e) => e.quantity > 0);
    const result = await saveJobFaults(jobId, entries);
    setSaving(false);
    if (result.ok) {
      applyJob(result.detail);
      setNotice({ kind: "ok", text: "تم حفظ الأعطال وحجز القطع." });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else if (result.queued) {
      setDirty(false);
      setNotice({ kind: "warn", text: "لا يوجد إنترنت — حُفظت على الهاتف وستُرسل تلقائياً عند عودة الاتصال." });
    } else {
      setNotice({ kind: "error", text: result.message });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  if (!job) {
    return (
      <View style={[styles.center, { backgroundColor: theme.surface }]}>
        <ActivityIndicator color={theme.brand} />
      </View>
    );
  }

  const status = safeStatus(job.status);
  const device = [job.deviceType, job.deviceBrand, job.deviceModel].filter(Boolean).join(" ") || "جهاز";

  return (
    <View style={[styles.root, { backgroundColor: theme.surface }]}>
      <SafeAreaView edges={["top"]} style={{ backgroundColor: theme.header }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="رجوع">
            <Ionicons name="arrow-forward" size={24} color={theme.headerText} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={[styles.headerTitle, { color: theme.headerText, fontFamily: fonts.bold }]} numberOfLines={1}>
              {job.trackingCode ?? `#${job.id}`}
            </Text>
            <Text style={[styles.headerSub, { color: theme.headerText, fontFamily: fonts.regular }]} numberOfLines={1}>
              {device}
            </Text>
          </View>
          <View style={[styles.pill, { backgroundColor: "#ffffff26" }]}>
            <Text style={[styles.pillText, { color: theme.headerText, fontFamily: fonts.bold }]}>{statusLabel(status)}</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card theme={theme}>
          <InfoRow theme={theme} icon="hardware-chip-outline" label="الجهاز" value={device} />
          {job.serialNumber ? <InfoRow theme={theme} icon="barcode-outline" label="الرقم التسلسلي" value={job.serialNumber} /> : null}
          {job.issue ? <InfoRow theme={theme} icon="alert-circle-outline" label="العطل المذكور" value={job.issue} /> : null}
          {job.technicalNotes ? <InfoRow theme={theme} icon="document-text-outline" label="ملاحظات فنية" value={job.technicalNotes} /> : null}
          {isManager ? <InfoRow theme={theme} icon="person-outline" label="الفني" value={job.assignedToName ?? "غير مسند"} /> : null}
          {job.customerName ? (
            <InfoRow
              theme={theme}
              icon="call-outline"
              label="الزبون"
              value={[job.customerName, job.customerPhone].filter(Boolean).join(" — ")}
              onPress={job.customerPhone ? () => Linking.openURL(`tel:${job.customerPhone}`) : undefined}
            />
          ) : null}
          {job.isUrgent && (
            <View style={[styles.urgent, { backgroundColor: theme.danger + "18" }]}>
              <Ionicons name="flash" size={14} color={theme.danger} />
              <Text style={[styles.urgentText, { color: theme.danger, fontFamily: fonts.bold }]}>
                مستعجل{job.expectedDelivery ? ` — التسليم: ${job.expectedDelivery}` : ""}
              </Text>
            </View>
          )}
        </Card>

        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: theme.text, fontFamily: fonts.bold }]}>الأعطال</Text>
          <Text style={[styles.sectionHint, { color: theme.textMuted, fontFamily: fonts.regular }]}>
            {locked ? "مقفلة — تم خصم القطع" : selectedCount > 0 ? `${selectedCount} مختارة` : "اختر القسم واكتب العدد"}
          </Text>
        </View>

        {locked && (
          <Notice theme={theme} kind="warn" text="وصل الجهاز لحالة جاهز وتم خصم قطعه من المخزون، لذلك لا يمكن تعديل الأعطال." />
        )}

        {rows.length === 0 ? (
          <Card theme={theme}>
            <Text style={[styles.emptyText, { color: theme.textMuted, fontFamily: fonts.regular }]}>
              لم تُضف أقسام الأعطال بعد. تضيفها الإدارة من البرنامج المكتبي: الإعدادات ← أقسام الأعطال.
            </Text>
          </Card>
        ) : (
          <Card theme={theme} padded={false}>
            {rows.map((s, idx) => {
              const qty = draft[s.id] ?? 0;
              const selected = qty > 0;
              const short = selected && s.inStock === false;
              return (
                <View key={s.id} style={[styles.faultRow, idx > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                  <Pressable
                    style={styles.faultMain}
                    disabled={locked}
                    onPress={() => setQty(s.id, selected ? 0 : 1)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                  >
                    <Ionicons
                      name={selected ? "checkbox" : "square-outline"}
                      size={24}
                      color={selected ? theme.brand : theme.textMuted}
                    />
                    <View style={styles.faultNameBox}>
                      <Text style={[styles.faultName, { color: theme.text, fontFamily: fonts.medium }]}>
                        {s.name}
                        {s.legacyName ? " (موقوف)" : ""}
                      </Text>
                      {isManager && s.partName ? (
                        <Text style={[styles.faultPart, { color: theme.textMuted, fontFamily: fonts.regular }]}>
                          {s.partName} — المتوفر {s.stock ?? 0}
                        </Text>
                      ) : null}
                      {short ? (
                        <Text style={[styles.faultPart, { color: theme.danger, fontFamily: fonts.medium }]}>
                          القطعة غير متوفرة في المخزون حالياً
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>

                  {selected && (
                    <View style={styles.stepper}>
                      <StepButton theme={theme} icon="remove" disabled={locked} onPress={() => setQty(s.id, qty - 1)} />
                      {editing === s.id ? (
                        <TextInput
                          autoFocus
                          keyboardType="number-pad"
                          defaultValue={String(qty)}
                          onEndEditing={(e) => {
                            setQty(s.id, Number(e.nativeEvent.text));
                            setEditing(null);
                          }}
                          style={[styles.qtyInput, { color: theme.text, borderColor: theme.brand, fontFamily: fonts.bold }]}
                        />
                      ) : (
                        <Pressable onPress={() => !locked && setEditing(s.id)} hitSlop={8}>
                          <Text style={[styles.qty, { color: theme.text, fontFamily: fonts.bold }]}>{qty}</Text>
                        </Pressable>
                      )}
                      <StepButton theme={theme} icon="add" disabled={locked} onPress={() => setQty(s.id, qty + 1)} />
                    </View>
                  )}

                  {selected && !locked && (
                    <View style={styles.quickRow}>
                      {QUICK_COUNTS.map((n) => (
                        <Pressable
                          key={n}
                          onPress={() => setQty(s.id, n)}
                          style={[
                            styles.quick,
                            { borderColor: qty === n ? theme.brand : theme.border, backgroundColor: qty === n ? theme.brand + "22" : "transparent" },
                          ]}
                        >
                          <Text style={[styles.quickText, { color: qty === n ? theme.brand : theme.textMuted, fontFamily: fonts.bold }]}>{n}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </Card>
        )}

        {notice && <Notice theme={theme} kind={notice.kind} text={notice.text} />}
        <View style={{ height: 90 }} />
      </ScrollView>

      {!locked && rows.length > 0 && (
        <SafeAreaView edges={["bottom"]} style={[styles.footer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <Pressable
            onPress={save}
            disabled={!dirty || saving}
            style={({ pressed }) => [
              styles.saveBtn,
              { backgroundColor: theme.brand, opacity: !dirty || saving ? 0.45 : pressed ? 0.85 : 1 },
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[styles.saveText, { fontFamily: fonts.bold }]}>
                {dirty ? `حفظ الأعطال (${selectedCount})` : "محفوظة"}
              </Text>
            )}
          </Pressable>
        </SafeAreaView>
      )}
    </View>
  );
}

function Card({ theme, children, padded = true }: { theme: Theme; children: ReactNode; padded?: boolean }) {
  return <View style={[styles.card, { backgroundColor: theme.card, padding: padded ? 14 : 0 }]}>{children}</View>;
}

function InfoRow({
  theme,
  icon,
  label,
  value,
  onPress,
}: {
  theme: Theme;
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={theme.brand} />
      <Text style={[styles.infoLabel, { color: theme.textMuted, fontFamily: fonts.regular }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: onPress ? theme.brand : theme.text, fontFamily: fonts.medium }]}>{value}</Text>
    </Pressable>
  );
}

function StepButton({
  theme,
  icon,
  disabled,
  onPress,
}: {
  theme: Theme;
  icon: "add" | "remove";
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [styles.stepBtn, { backgroundColor: theme.surface, opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={icon} size={20} color={theme.text} />
    </Pressable>
  );
}

function Notice({ theme, kind, text }: { theme: Theme; kind: "ok" | "warn" | "error"; text: string }) {
  const color = kind === "ok" ? theme.brand : kind === "warn" ? "#F59E0B" : theme.danger;
  const icon = kind === "ok" ? "checkmark-circle" : kind === "warn" ? "time" : "alert-circle";
  return (
    <View style={[styles.notice, { backgroundColor: color + "1A" }]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.noticeText, { color, fontFamily: fonts.medium }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { height: 60, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 18 },
  headerSub: { fontSize: 12, opacity: 0.85 },
  pill: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 12 },
  content: { padding: 12, gap: 12 },
  card: { borderRadius: 16, overflow: "hidden", gap: 10 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  infoLabel: { fontSize: 13, width: 92 },
  infoValue: { flex: 1, fontSize: 14 },
  urgent: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, padding: 8 },
  urgentText: { fontSize: 13 },
  sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 4 },
  sectionTitle: { fontSize: 17 },
  sectionHint: { fontSize: 12 },
  emptyText: { fontSize: 14, lineHeight: 22, textAlign: "center" },
  faultRow: { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  faultMain: { flexDirection: "row", alignItems: "center", gap: 12 },
  faultNameBox: { flex: 1 },
  faultName: { fontSize: 16 },
  faultPart: { fontSize: 12, marginTop: 2 },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18 },
  stepBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  qty: { fontSize: 22, minWidth: 44, textAlign: "center" },
  qtyInput: { fontSize: 20, minWidth: 64, textAlign: "center", borderBottomWidth: 2, paddingVertical: 2 },
  quickRow: { flexDirection: "row", justifyContent: "center", gap: 8 },
  quick: { minWidth: 40, height: 30, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  quickText: { fontSize: 13 },
  notice: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, padding: 12 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 20 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1 },
  saveBtn: { height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  saveText: { color: "#fff", fontSize: 16 },
});
