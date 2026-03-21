import { useEffect, useMemo, useState } from 'react';
import { panelFetch } from '../../api/panelApi';
import { canReadIpPolicy, canWriteIpPolicy, resolvePanelRoleLabel } from './panelRoleAccess';

type IpPolicyItem = {
  role_code: string;
  is_enabled: boolean;
  allowed_ips: string[];
  note?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
};

type IpPolicyPayload = {
  items?: IpPolicyItem[];
  message?: string;
  error?: string;
};

type IpPolicyDraft = {
  is_enabled: boolean;
  allowed_ips_text: string;
  note: string;
};

const ROLE_ORDER = ['SUPER_ADMIN', 'OPERATIONS', 'READ_ONLY'] as const;

function normalizeRoleCode(value: unknown) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function normalizeMessage(payload: IpPolicyPayload | null, fallback: string) {
  const message = String(payload?.message || '').trim();
  if (message) return message;
  const error = String(payload?.error || '').trim();
  if (error) return error;
  return fallback;
}

function parseIpList(raw: string) {
  const values: string[] = [];
  const seen = new Set<string>();
  const pieces = raw
    .replace(/\n+/g, ',')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  for (const item of pieces) {
    if (seen.has(item)) continue;
    seen.add(item);
    values.push(item);
  }
  return values;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString('tr-TR');
}

function toPolicyMap(items: IpPolicyItem[]) {
  const map: Record<string, IpPolicyItem> = {};
  for (const item of items) {
    const roleCode = normalizeRoleCode(item.role_code);
    if (!roleCode) continue;
    map[roleCode] = {
      role_code: roleCode,
      is_enabled: Boolean(item.is_enabled),
      allowed_ips: Array.isArray(item.allowed_ips) ? item.allowed_ips.map((entry) => String(entry).trim()).filter(Boolean) : [],
      note: String(item.note || '').trim() || null,
      updated_by: String(item.updated_by || '').trim() || null,
      updated_at: String(item.updated_at || '').trim() || null,
    };
  }
  return map;
}

function buildPolicyList(items: IpPolicyItem[]) {
  const map = toPolicyMap(items);
  const output: IpPolicyItem[] = [];
  for (const roleCode of ROLE_ORDER) {
    if (map[roleCode]) {
      output.push(map[roleCode]);
      continue;
    }
    output.push({
      role_code: roleCode,
      is_enabled: false,
      allowed_ips: [],
      note: null,
      updated_by: null,
      updated_at: null,
    });
  }
  for (const value of Object.values(map)) {
    if (!ROLE_ORDER.includes(value.role_code as (typeof ROLE_ORDER)[number])) {
      output.push(value);
    }
  }
  return output;
}

function createDrafts(items: IpPolicyItem[]) {
  return Object.fromEntries(
    items.map((item) => [
      item.role_code,
      {
        is_enabled: Boolean(item.is_enabled),
        allowed_ips_text: (Array.isArray(item.allowed_ips) ? item.allowed_ips : []).join('\n'),
        note: String(item.note || ''),
      } satisfies IpPolicyDraft,
    ]),
  );
}

async function readJsonSafe(response: Response) {
  try {
    return (await response.json()) as IpPolicyPayload;
  } catch {
    return null;
  }
}

export default function PanelIpPolicyPanel({
  active,
  role,
  permissions,
}: {
  active: boolean;
  role?: string;
  permissions?: string[];
}) {
  const [items, setItems] = useState<IpPolicyItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, IpPolicyDraft>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [savingRole, setSavingRole] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const canRead = canReadIpPolicy(role, permissions);
  const canWrite = canWriteIpPolicy(role, permissions);

  const orderedItems = useMemo(() => buildPolicyList(items), [items]);

  useEffect(() => {
    if (!active || !canRead) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setErrorMessage('');
      setMessage('');
      try {
        const response = await panelFetch('/api/panel/security/ip-policy', { method: 'GET' });
        const payload = await readJsonSafe(response);
        if (!response.ok) {
          throw new Error(normalizeMessage(payload, 'IP policy listesi alınamadı.'));
        }
        if (cancelled) return;
        const nextItems = Array.isArray(payload?.items) ? payload.items : [];
        const normalized = buildPolicyList(nextItems);
        setItems(normalized);
        setDrafts(createDrafts(normalized));
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'IP policy listesi alınamadı.');
          setItems([]);
          setDrafts({});
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [active, canRead]);

  const updateDraft = (roleCode: string, patch: Partial<IpPolicyDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [roleCode]: {
        ...(prev[roleCode] || { is_enabled: false, allowed_ips_text: '', note: '' }),
        ...patch,
      },
    }));
  };

  const saveRolePolicy = async (roleCode: string) => {
    if (!canWrite || savingRole) return;
    const draft = drafts[roleCode] || { is_enabled: false, allowed_ips_text: '', note: '' };
    setSavingRole(roleCode);
    setErrorMessage('');
    setMessage('');

    try {
      const response = await panelFetch('/api/panel/security/ip-policy', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          role_code: roleCode,
          is_enabled: Boolean(draft.is_enabled),
          allowed_ips: parseIpList(draft.allowed_ips_text),
          note: String(draft.note || '').trim(),
        }),
      });
      const payload = await readJsonSafe(response);
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, `${resolvePanelRoleLabel(roleCode)} policy kaydedilemedi.`));
      }

      const refreshResponse = await panelFetch('/api/panel/security/ip-policy', { method: 'GET' });
      const refreshPayload = await readJsonSafe(refreshResponse);
      if (refreshResponse.ok) {
        const refreshed = buildPolicyList(Array.isArray(refreshPayload?.items) ? refreshPayload.items : []);
        setItems(refreshed);
        setDrafts(createDrafts(refreshed));
      }

      setMessage(`${resolvePanelRoleLabel(roleCode)} policy kaydedildi.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'IP policy kaydedilemedi.');
    } finally {
      setSavingRole('');
    }
  };

  if (!active) return null;
  if (!canRead) {
    return (
      <section className="rounded-[22px] border border-[#1A273A] bg-[#071021]/82 p-5 shadow-[0_14px_38px_rgba(0,0,0,0.28)]">
        <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/54">IP Policy</p>
        <h4 className="mt-2 text-[20px] font-semibold text-white">Role Bazli IP Allowlist</h4>
        <p className="mt-2 text-[13px] text-white/62">Bu bolumu goruntulemek icin PANEL_IP_POLICY_READ izni gerekir.</p>
      </section>
    );
  }

  return (
    <section className="rounded-[22px] border border-[#1A273A] bg-[#071021]/82 p-5 shadow-[0_14px_38px_rgba(0,0,0,0.28)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/54">IP Policy</p>
          <h4 className="mt-2 text-[20px] font-semibold text-white">Role Bazli IP Allowlist</h4>
          <p className="mt-2 text-[13px] leading-[1.7] text-white/64">
            Super-admin, danisman ve kullanici rollerinin panel erisimi IP bazli kilitlenebilir.
          </p>
        </div>
        <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 px-3 py-2 text-[12px] text-white/66">
          Mod: {canWrite ? 'Read / Write (Super Admin)' : 'Read-only'}
        </div>
      </div>

      {isLoading ? <p className="mt-3 text-[13px] text-white/70">IP policy verileri yukleniyor...</p> : null}
      {message ? <p className="mt-3 rounded-lg border border-[#244B39] bg-[#0E261E] px-3 py-2 text-[12px] text-[#9FE4D0]">{message}</p> : null}
      {errorMessage ? (
        <p className="mt-3 rounded-lg border border-[#6F2824] bg-[#2B1214]/80 px-3 py-2 text-[12px] text-[#FFB8B1]">{errorMessage}</p>
      ) : null}

      <div className="mt-4 space-y-4">
        {orderedItems.map((item) => {
          const roleCode = normalizeRoleCode(item.role_code);
          const draft = drafts[roleCode] || {
            is_enabled: Boolean(item.is_enabled),
            allowed_ips_text: (item.allowed_ips || []).join('\n'),
            note: String(item.note || ''),
          };
          const isSaving = savingRole === roleCode;
          return (
            <article key={roleCode} className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h5 className="text-[15px] font-semibold text-white">{resolvePanelRoleLabel(roleCode)}</h5>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-white/52">{roleCode}</p>
                </div>
                <label className="inline-flex items-center gap-2 rounded-full border border-[#1A273A] bg-[#0A192B]/90 px-3 py-1 text-[12px] text-white/76">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.is_enabled)}
                    disabled={!canWrite}
                    onChange={(event) => updateDraft(roleCode, { is_enabled: event.target.checked })}
                    className="h-3.5 w-3.5 accent-[#D92E27]"
                  />
                  <span>Policy aktif</span>
                </label>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-white/58">Allowed IP listesi</label>
                  <textarea
                    rows={5}
                    value={draft.allowed_ips_text}
                    onChange={(event) => updateDraft(roleCode, { allowed_ips_text: event.target.value })}
                    disabled={!canWrite}
                    placeholder={'Her satira bir IP (ornek)\n203.0.113.10\n198.51.100.7'}
                    className="w-full rounded-xl border border-[#1A273A] bg-[#030B18] px-3 py-2 text-[12px] text-white/90 outline-none focus:border-[#2D4363] disabled:opacity-70"
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-white/58">Not</label>
                    <textarea
                      rows={3}
                      value={draft.note}
                      onChange={(event) => updateDraft(roleCode, { note: event.target.value })}
                      disabled={!canWrite}
                      className="w-full rounded-xl border border-[#1A273A] bg-[#030B18] px-3 py-2 text-[12px] text-white/90 outline-none focus:border-[#2D4363] disabled:opacity-70"
                    />
                  </div>
                  <div className="rounded-lg border border-[#1A273A] bg-[#030B18]/70 px-3 py-2 text-[11px] text-white/60">
                    <p>Son guncelleyen: {item.updated_by || '-'}</p>
                    <p>Son guncelleme: {formatDateTime(item.updated_at)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveRolePolicy(roleCode)}
                    disabled={!canWrite || isSaving}
                    className="h-[38px] rounded-xl bg-[#D92E27] px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-[#bf251f] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving ? 'Kaydediliyor...' : 'Policy Kaydet'}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
