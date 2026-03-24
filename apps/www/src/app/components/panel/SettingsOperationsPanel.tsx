import { useCallback, useEffect, useMemo, useState } from 'react';
import { panelFetch } from '../../api/panelApi';
import {
  PanelFeedbackMessage,
  PanelLoadingMessage,
  panelDescriptionClassName,
  panelEyebrowClassName,
  panelInputClassName,
  panelPrimaryButtonClassName,
  panelStatCardClassName,
  panelTitleClassName,
  panelSurfaceClassName,
} from './panelUi';

type SettingItem = {
  key: string;
  value: unknown;
  updated_by?: string | null;
  updated_at?: string | null;
};

type SettingsPayload = {
  items?: SettingItem[];
};

type ReleaseGateCheck = {
  code?: string;
  passed?: boolean;
  metrics?: Record<string, unknown>;
  thresholds?: Record<string, unknown>;
};

type ReleaseGateReport = {
  passed?: boolean;
  enabled?: boolean;
  campaign_code?: string | null;
  checked_at?: string | null;
  failed_checks?: string[];
  checks?: ReleaseGateCheck[];
};

type ReleaseGatePayload = {
  campaign_code?: string | null;
  release_gate?: ReleaseGateReport;
};

const SETTINGS_KEYS = {
  campaignCode: 'bursluluk.campaign.code',
  examForceOpen: 'bursluluk.exam_force_open',
  examOpenAt: 'bursluluk.exam_open_at',
  examCloseAt: 'bursluluk.campaign.exam_close_at',
  smsCredentialsTemplate: 'bursluluk.template.sms_credentials',
  smsExamOpenTemplate: 'bursluluk.template.sms_exam_open',
  waResultTemplate: 'bursluluk.template.wa_result',
  schoolSearchCity: 'bursluluk.schools.search_city',
  panelAllowedRoles: 'bursluluk.panel.allowed_roles',
} as const;

const LEGACY_SETTINGS_KEYS = {
  examForceOpen: 'exam.force_open',
  examOpenAt: 'bursluluk.campaign.exam_open_at',
  examOpenAtGlobal: 'exam.open_at',
} as const;

type FormState = {
  campaignCode: string;
  examForceOpen: boolean;
  examOpenAt: string;
  examCloseAt: string;
  smsCredentialsTemplate: string;
  smsExamOpenTemplate: string;
  waResultTemplate: string;
  schoolSearchCity: string;
  panelAllowedRoles: string;
};

const DEFAULT_FORM: FormState = {
  campaignCode: '2026_BURSLULUK',
  examForceOpen: false,
  examOpenAt: '',
  examCloseAt: '',
  smsCredentialsTemplate:
    'Başvurunuz alındı. Kullanıcı adı/şifre ve sınav giriş linkiniz: {{exam_login_url}}',
  smsExamOpenTemplate:
    'Sınav ekranı açıldı. Daha önce gönderilen kullanıcı adı/şifre ile giriş yapabilirsiniz.',
  waResultTemplate: 'Sınav sonucunuz yayınlandı: {{result_url}}',
  schoolSearchCity: 'Konya',
  panelAllowedRoles: 'SUPER_ADMIN,OPERATIONS,READ_ONLY',
};

const PANEL_ROLE_NORMALIZATION_MAP: Record<string, string> = {
  ADMIN: 'OPERATIONS',
  EDUCATION_ADVISOR: 'OPERATIONS',
};

function normalizeAllowedRoles(value: string) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value.split(',')) {
    const raw = item.trim().toUpperCase();
    if (!raw) continue;
    const normalized = PANEL_ROLE_NORMALIZATION_MAP[raw] || raw;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function toDisplayString(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item) => String(item)).join(',');
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function toDateTimeLocal(value: unknown) {
  const raw = toDisplayString(value).trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return raw.slice(0, 16);
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

function toBoolean(value: unknown, fallback: boolean | null = false): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const source = value as { enabled?: unknown; value?: unknown; force_open?: unknown; forceOpen?: unknown };
    const nestedCandidates = [source.enabled, source.value, source.force_open, source.forceOpen];
    for (const item of nestedCandidates) {
      const nested = toBoolean(item, null);
      if (typeof nested === 'boolean') return nested;
    }
  }
  return fallback;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString('tr-TR');
}

function formatPercent(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return `${num.toFixed(2)}%`;
}

function formatGateCheckLabel(code: string) {
  const normalized = String(code || '').trim().toLowerCase();
  if (normalized === 'sms_credentials_flow') return 'SMS Şifre Akışı';
  if (normalized === 'panel_write_update_flow') return 'Panel Write/Update Akışı';
  return code || '-';
}

function summarizeGateCheck(check: ReleaseGateCheck) {
  const metrics = check?.metrics && typeof check.metrics === 'object' ? check.metrics : {};
  const code = String(check?.code || '').trim().toLowerCase();
  if (code === 'sms_credentials_flow') {
    return [
      `Toplam: ${String(metrics.total_jobs ?? '-')}`,
      `Başarı: ${formatPercent(metrics.success_rate_pct)}`,
      `Fail: ${formatPercent(metrics.failed_rate_pct)}`,
      `Stuck: ${String(metrics.stuck_jobs ?? '-')}`,
    ].join(' • ');
  }
  if (code === 'panel_write_update_flow') {
    return [
      `Toplam write: ${String(metrics.total_writes ?? '-')}`,
      `Domain: ${String(metrics.domain_count ?? '-')}`,
      `Son write: ${formatDateTime(String(metrics.last_write_at || ''))}`,
    ].join(' • ');
  }
  return 'Detay mevcut.';
}

function readError(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    const maybe = payload as { message?: unknown; error?: unknown };
    if (typeof maybe.message === 'string' && maybe.message.trim()) return maybe.message.trim();
    if (typeof maybe.error === 'string' && maybe.error.trim()) return maybe.error.trim();
  }
  return fallback;
}

async function safeJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export default function SettingsOperationsPanel({
  active,
  role,
  permissions,
  initialCount,
}: {
  active: boolean;
  role?: string;
  permissions?: string[];
  initialCount: number;
}) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [settingsMap, setSettingsMap] = useState<Record<string, SettingItem>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const canEdit = String(role || '').toUpperCase() === 'SUPER_ADMIN' || String(role || '').toUpperCase() === 'ADMIN';

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      setSuccess('');
      try {
        const response = await panelFetch(`/api/panel/settings?keys=${encodeURIComponent(settingsQueryKeys)}`, { method: 'GET' });
        const payload = await safeJson<SettingsPayload>(response);
        if (!response.ok) {
          throw new Error(readError(payload, 'Ayarlar alınamadı.'));
        }

        const map = Object.fromEntries((payload?.items || []).map((item) => [item.key, item]));
        if (cancelled) return;
        setSettingsMap(map);
        const resolvedCampaignCode = toDisplayString(map[SETTINGS_KEYS.campaignCode]?.value) || DEFAULT_FORM.campaignCode;
        setForm({
          campaignCode: resolvedCampaignCode,
          examForceOpen: toBoolean(
            map[SETTINGS_KEYS.examForceOpen]?.value ?? map[LEGACY_SETTINGS_KEYS.examForceOpen]?.value,
            DEFAULT_FORM.examForceOpen,
          ),
          examOpenAt: toDateTimeLocal(
            map[SETTINGS_KEYS.examOpenAt]?.value
              ?? map[LEGACY_SETTINGS_KEYS.examOpenAt]?.value
              ?? map[LEGACY_SETTINGS_KEYS.examOpenAtGlobal]?.value,
          ),
          examCloseAt: toDateTimeLocal(map[SETTINGS_KEYS.examCloseAt]?.value),
          smsCredentialsTemplate:
            toDisplayString(map[SETTINGS_KEYS.smsCredentialsTemplate]?.value) || DEFAULT_FORM.smsCredentialsTemplate,
          smsExamOpenTemplate:
            toDisplayString(map[SETTINGS_KEYS.smsExamOpenTemplate]?.value) || DEFAULT_FORM.smsExamOpenTemplate,
          waResultTemplate: toDisplayString(map[SETTINGS_KEYS.waResultTemplate]?.value) || DEFAULT_FORM.waResultTemplate,
          schoolSearchCity: toDisplayString(map[SETTINGS_KEYS.schoolSearchCity]?.value) || DEFAULT_FORM.schoolSearchCity,
          panelAllowedRoles:
            normalizeAllowedRoles(toDisplayString(map[SETTINGS_KEYS.panelAllowedRoles]?.value) || DEFAULT_FORM.panelAllowedRoles).join(
              ',',
            ),
        });
        void loadReleaseGate(resolvedCampaignCode);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Ayarlar alınamadı.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [active, loadReleaseGate, settingsQueryKeys]);

  const trackedItems = useMemo(
    () =>
      Object.values(SETTINGS_KEYS).map((key) => ({
        key,
        updatedBy: settingsMap[key]?.updated_by || '-',
        updatedAt: formatDateTime(settingsMap[key]?.updated_at || null),
      })),
    [settingsMap],
  );

  const handleSave = async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const items = [
        { key: SETTINGS_KEYS.campaignCode, value: form.campaignCode.trim() },
        { key: SETTINGS_KEYS.examForceOpen, value: form.examForceOpen },
        { key: SETTINGS_KEYS.examOpenAt, value: form.examOpenAt.trim() || null },
        { key: SETTINGS_KEYS.examCloseAt, value: form.examCloseAt.trim() || null },
        { key: SETTINGS_KEYS.smsCredentialsTemplate, value: form.smsCredentialsTemplate.trim() },
        { key: SETTINGS_KEYS.smsExamOpenTemplate, value: form.smsExamOpenTemplate.trim() },
        { key: SETTINGS_KEYS.waResultTemplate, value: form.waResultTemplate.trim() },
        { key: SETTINGS_KEYS.schoolSearchCity, value: form.schoolSearchCity.trim() || 'Konya' },
        {
          key: SETTINGS_KEYS.panelAllowedRoles,
          value: normalizeAllowedRoles(form.panelAllowedRoles),
        },
      ].filter((item) => item.value !== null);

      const response = await panelFetch('/api/panel/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const payload = await safeJson<{ updated?: number }>(response);
      if (!response.ok) {
        throw new Error(readError(payload, 'Ayarlar kaydedilemedi.'));
      }
      setSuccess(`Ayarlar kaydedildi. Güncellenen anahtar sayısı: ${payload?.updated ?? items.length}.`);

      const refresh = await panelFetch(`/api/panel/settings?keys=${encodeURIComponent(settingsQueryKeys)}`, {
        method: 'GET',
      });
      const refreshedPayload = await safeJson<SettingsPayload>(refresh);
      if (refresh.ok && refreshedPayload?.items) {
        setSettingsMap(Object.fromEntries(refreshedPayload.items.map((item) => [item.key, item])));
      }
      await loadReleaseGate(form.campaignCode);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Ayarlar kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={panelSurfaceClassName}>
      <p className={panelEyebrowClassName}>Ayarlar</p>
      <h3 className={panelTitleClassName}>Kampanya + Şablon + Rol Konfigürasyonu</h3>
      <p className={panelDescriptionClassName}>
        Bu ekran kampanya zaman penceresi, SMS/WhatsApp şablonları, okul arama kapsamı ve panel rol matrisini tek yerden yönetir.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className={panelStatCardClassName}>
          <p className="text-[12px] font-['Neutraface_2_Text:Book',sans-serif] text-[#7A7063]">Toplam App Settings</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{initialCount}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="text-[12px] font-['Neutraface_2_Text:Book',sans-serif] text-[#7A7063]">Yönetilen Anahtar</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{trackedItems.length}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="text-[12px] font-['Neutraface_2_Text:Book',sans-serif] text-[#7A7063]">Yazma Yetkisi</p>
          <p className="mt-1 font-['Neutraface_2_Text:Demi',sans-serif] text-[14px] text-[#1B2B24]">{canEdit ? 'SUPER_ADMIN (Aktif)' : 'Read-only'}</p>
        </div>
      </div>

      {loading ? <PanelLoadingMessage>Ayar anahtarları yükleniyor...</PanelLoadingMessage> : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <input
          value={form.campaignCode}
          onChange={(event) => setForm((prev) => ({ ...prev, campaignCode: event.target.value }))}
          placeholder="Kampanya kodu"
          className={panelInputClassName}
        />
        <input
          type="text"
          value={form.schoolSearchCity}
          onChange={(event) => setForm((prev) => ({ ...prev, schoolSearchCity: event.target.value }))}
          placeholder="Okul arama şehri (örn: Konya)"
          className={panelInputClassName}
        />
        <input
          type="datetime-local"
          value={form.examOpenAt}
          onChange={(event) => setForm((prev) => ({ ...prev, examOpenAt: event.target.value }))}
          className={panelInputClassName}
        />
        <input
          type="datetime-local"
          value={form.examCloseAt}
          onChange={(event) => setForm((prev) => ({ ...prev, examCloseAt: event.target.value }))}
          className={panelInputClassName}
        />
      </div>

      <div className="mt-3 grid gap-3">
        <textarea
          value={form.smsCredentialsTemplate}
          onChange={(event) => setForm((prev) => ({ ...prev, smsCredentialsTemplate: event.target.value }))}
          rows={3}
          className="rounded-[18px] border border-[#DDD4C6] bg-[#FFFCF7] px-3 py-2 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#16251F] outline-none transition focus:border-[#9F865C] focus:bg-white focus:ring-4 focus:ring-[#EEE3CC]"
          placeholder="Credentials SMS şablonu"
        />
        <textarea
          value={form.smsExamOpenTemplate}
          onChange={(event) => setForm((prev) => ({ ...prev, smsExamOpenTemplate: event.target.value }))}
          rows={3}
          className="rounded-[18px] border border-[#DDD4C6] bg-[#FFFCF7] px-3 py-2 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#16251F] outline-none transition focus:border-[#9F865C] focus:bg-white focus:ring-4 focus:ring-[#EEE3CC]"
          placeholder="Exam open SMS şablonu"
        />
        <textarea
          value={form.waResultTemplate}
          onChange={(event) => setForm((prev) => ({ ...prev, waResultTemplate: event.target.value }))}
          rows={3}
          className="rounded-[18px] border border-[#DDD4C6] bg-[#FFFCF7] px-3 py-2 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#16251F] outline-none transition focus:border-[#9F865C] focus:bg-white focus:ring-4 focus:ring-[#EEE3CC]"
          placeholder="WhatsApp sonuç şablonu"
        />
        <input
          value={form.panelAllowedRoles}
          onChange={(event) => setForm((prev) => ({ ...prev, panelAllowedRoles: event.target.value }))}
          placeholder="Panel roller (virgülle)"
          className={panelInputClassName}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={loading || saving || !canEdit}
          className={panelPrimaryButtonClassName}
        >
          {saving ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
        </button>
        {!canEdit ? (
          <span className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Bu ekranı görüntüleyebilirsiniz, güncelleme için SUPER_ADMIN gerekir.</span>
        ) : null}
        </div>

      {success ? <PanelFeedbackMessage className="mt-3" tone="success">{success}</PanelFeedbackMessage> : null}
      {error ? <PanelFeedbackMessage className="mt-3" tone="error">{error}</PanelFeedbackMessage> : null}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[860px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
          <thead>
            <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
              <th className="px-2 py-2">Setting Key</th>
              <th className="px-2 py-2">Son Güncelleyen</th>
              <th className="px-2 py-2">Son Güncelleme</th>
            </tr>
          </thead>
          <tbody>
            {trackedItems.map((item) => (
              <tr key={item.key} className="border-b border-[#F0E7DA]">
                <td className="px-2 py-2">{item.key}</td>
                <td className="px-2 py-2">{item.updatedBy}</td>
                <td className="px-2 py-2">{item.updatedAt}</td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>

      <PanelIpPolicyPanel active={active} role={role} permissions={permissions} />
    </section>
  );
}
