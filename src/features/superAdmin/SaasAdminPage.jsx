import { useState, useEffect, useCallback } from 'react';
import { apiClient as axiosInstance } from '@/lib/apiClient';

const MODULES = [
  'crm','accounts','inventory','gst','tds','production','service','hr','rd','reports','payroll',
];

const PLAN_OPTS = ['free','trial','monthly','yearly','enterprise'];
const STATUS_OPTS = ['active','trial','expired','suspended'];

function Badge({ status }) {
  const color = {
    active: 'bg-green-100 text-green-800',
    trial: 'bg-blue-100 text-blue-800',
    expired: 'bg-red-100 text-red-800',
    suspended: 'bg-yellow-100 text-yellow-800',
  }[status] || 'bg-gray-100 text-gray-700';
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${color}`}>{status || 'none'}</span>;
}

// ─── Dashboard Tab ───────────────────────────────────────────────────────────
function DashboardTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    axiosInstance.get('/saas/dashboard').then(r => setData(r.data.data)).catch(() => {});
  }, []);
  if (!data) return <p className="text-gray-500 p-4">Loading...</p>;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
      {[
        { label: 'Total Companies', value: data.totalCompanies },
        { label: 'Active', value: data.activeCompanies },
        { label: 'Inactive', value: data.inactiveCompanies },
        { label: 'Active Subs', value: data.subscriptions?.active || 0 },
        { label: 'Trial Subs', value: data.subscriptions?.trial || 0 },
        { label: 'Expired Subs', value: data.subscriptions?.expired || 0 },
        { label: 'Suspended', value: data.subscriptions?.suspended || 0 },
      ].map(c => (
        <div key={c.label} className="bg-white rounded-xl shadow p-4 text-center">
          <p className="text-2xl font-bold text-indigo-700">{c.value ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">{c.label}</p>
        </div>
      ))}
      {data.recentActivity?.length > 0 && (
        <div className="col-span-2 md:col-span-4 bg-white rounded-xl shadow p-4">
          <h3 className="font-semibold mb-2 text-sm">Recent Activity</h3>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-gray-500"><th>User</th><th>Action</th><th>Module</th><th>Description</th><th>Time</th></tr></thead>
            <tbody>
              {data.recentActivity.map(a => (
                <tr key={a._id} className="border-t">
                  <td className="py-1">{a.username || '-'}</td>
                  <td>{a.action}</td>
                  <td>{a.module}</td>
                  <td className="max-w-xs truncate">{a.description}</td>
                  <td>{new Date(a.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Companies Tab ───────────────────────────────────────────────────────────
function CompaniesTab() {
  const [companies, setCompanies] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editModules, setEditModules] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    axiosInstance.get('/saas/companies').then(r => setCompanies(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (c) => {
    setSelected(c);
    setEditModules(c.enabledModules || [...MODULES]);
    setMsg('');
  };

  const toggleModule = (mod) => {
    setEditModules(prev => prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]);
  };

  const saveModules = async () => {
    setSaving(true);
    try {
      await axiosInstance.patch(`/saas/companies/${selected._id}/modules`, { enabledModules: editModules });
      setMsg('Modules saved.');
      load();
    } catch (e) {
      setMsg(e.response?.data?.message || 'Error saving');
    } finally { setSaving(false); }
  };

  const toggleActive = async (c) => {
    await axiosInstance.patch(`/saas/companies/${c._id}/toggle-active`);
    load();
  };

  const impersonate = async (c) => {
    try {
      const r = await axiosInstance.post(`/saas/companies/${c._id}/impersonate`);
      alert(`Impersonation token issued.\nSwitch to company "${r.data.data.companyName}" in the Company Selector.`);
    } catch (e) {
      alert(e.response?.data?.message || 'Failed');
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-base font-semibold mb-3">All Companies</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm bg-white rounded-xl shadow">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Company</th>
              <th>GSTIN</th>
              <th>Status</th>
              <th>Subscription</th>
              <th>Modules</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {companies.map(c => (
              <tr key={c._id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2 font-medium">{c.companyName}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{c.gstNumber || '-'}</td>
                <td className="px-3 py-2">{c.isActive ? <Badge status="active" /> : <span className="text-xs text-red-500">Inactive</span>}</td>
                <td className="px-3 py-2"><Badge status={c.subscription?.status} /></td>
                <td className="px-3 py-2 text-xs">{(c.enabledModules || []).join(', ') || 'all'}</td>
                <td className="px-3 py-2 space-x-2">
                  <button onClick={() => openEdit(c)} className="text-indigo-600 text-xs hover:underline">Modules</button>
                  <button onClick={() => toggleActive(c)} className="text-yellow-600 text-xs hover:underline">{c.isActive ? 'Deactivate' : 'Activate'}</button>
                  <button onClick={() => impersonate(c)} className="text-blue-600 text-xs hover:underline">Impersonate</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-96 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-base mb-4">Module Control — {selected.companyName}</h3>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {MODULES.map(mod => (
                <label key={mod} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={editModules.includes(mod)} onChange={() => toggleModule(mod)} />
                  {mod}
                </label>
              ))}
            </div>
            {msg && <p className="text-sm text-green-700 mb-2">{msg}</p>}
            <div className="flex gap-2">
              <button onClick={saveModules} disabled={saving} className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm">
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setSelected(null)} className="border px-4 py-1.5 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Subscriptions Tab ───────────────────────────────────────────────────────
function SubscriptionsTab() {
  const [companies, setCompanies] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    axiosInstance.get('/saas/companies').then(r => setCompanies(r.data.data || [])).catch(() => {});
  }, []);

  const openSub = async (c) => {
    setSelected(c);
    setMsg('');
    try {
      const r = await axiosInstance.get(`/saas/companies/${c._id}/subscription`);
      const s = r.data.data || {};
      setForm({
        plan: s.plan || 'trial',
        status: s.status || 'trial',
        userLimit: s.userLimit || 5,
        storageGb: s.storageGb || 2,
        startDate: s.startDate ? s.startDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
        expiresAt: s.expiresAt ? s.expiresAt.slice(0, 10) : '',
        trialEndsAt: s.trialEndsAt ? s.trialEndsAt.slice(0, 10) : '',
        notes: s.notes || '',
        invoiceRef: s.invoiceRef || '',
      });
    } catch { setForm({ plan: 'trial', status: 'trial', userLimit: 5, storageGb: 2 }); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await axiosInstance.put(`/saas/companies/${selected._id}/subscription`, form);
      setMsg('Subscription saved successfully.');
    } catch (e) {
      setMsg(e.response?.data?.message || 'Error');
    } finally { setSaving(false); }
  };

  const F = ({ label, name, type = 'text', options }) => (
    <div>
      <label className="text-xs text-gray-500 block mb-0.5">{label}</label>
      {options ? (
        <select value={form[name] || ''} onChange={e => setForm(p => ({ ...p, [name]: e.target.value }))}
          className="w-full border rounded px-2 py-1.5 text-sm">
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={form[name] || ''} onChange={e => setForm(p => ({ ...p, [name]: e.target.value }))}
          className="w-full border rounded px-2 py-1.5 text-sm" />
      )}
    </div>
  );

  return (
    <div className="p-4">
      <h2 className="text-base font-semibold mb-3">Subscription Management</h2>
      <table className="w-full text-sm bg-white rounded-xl shadow">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr><th className="px-3 py-2 text-left">Company</th><th>Plan</th><th>Status</th><th>Expires</th><th>Action</th></tr>
        </thead>
        <tbody>
          {companies.map(c => (
            <tr key={c._id} className="border-t hover:bg-gray-50">
              <td className="px-3 py-2 font-medium">{c.companyName}</td>
              <td className="px-3 py-2 text-xs">{c.subscription?.plan || '-'}</td>
              <td className="px-3 py-2"><Badge status={c.subscription?.status} /></td>
              <td className="px-3 py-2 text-xs">{c.subscription?.expiresAt ? new Date(c.subscription.expiresAt).toLocaleDateString() : '-'}</td>
              <td className="px-3 py-2">
                <button onClick={() => openSub(c)} className="text-indigo-600 text-xs hover:underline">Edit</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-96 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-base mb-4">Subscription — {selected.companyName}</h3>
            <div className="space-y-3">
              <F label="Plan" name="plan" options={PLAN_OPTS} />
              <F label="Status" name="status" options={STATUS_OPTS} />
              <F label="User Limit" name="userLimit" type="number" />
              <F label="Storage (GB)" name="storageGb" type="number" />
              <F label="Start Date" name="startDate" type="date" />
              <F label="Trial Ends At" name="trialEndsAt" type="date" />
              <F label="Expires At" name="expiresAt" type="date" />
              <F label="Invoice Ref" name="invoiceRef" />
              <F label="Notes" name="notes" />
            </div>
            {msg && <p className="text-sm text-green-700 mt-2">{msg}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={save} disabled={saving} className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm">
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setSelected(null)} className="border px-4 py-1.5 rounded-lg text-sm">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Activity Logs Tab ───────────────────────────────────────────────────────
function ActivityLogsTab() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState({ action: '', companyId: '' });

  const load = useCallback(() => {
    const params = { page, limit: 30 };
    if (filter.action) params.action = filter.action;
    if (filter.companyId) params.companyId = filter.companyId;
    axiosInstance.get('/saas/activity-logs', { params })
      .then(r => { setLogs(r.data.data.logs || []); setTotal(r.data.data.total || 0); })
      .catch(() => {});
  }, [page, filter]);

  useEffect(() => { load(); }, [load]);

  const ACTIONS = ['login','logout','create','update','delete','view','export','import','backup','restore','impersonate','permission_change'];

  return (
    <div className="p-4">
      <div className="flex gap-3 mb-4 flex-wrap">
        <select value={filter.action} onChange={e => setFilter(p => ({ ...p, action: e.target.value }))}
          className="border rounded px-2 py-1.5 text-sm">
          <option value="">All Actions</option>
          {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <input placeholder="Company ID (optional)" value={filter.companyId}
          onChange={e => setFilter(p => ({ ...p, companyId: e.target.value }))}
          className="border rounded px-2 py-1.5 text-sm w-56" />
        <button onClick={() => { setPage(1); load(); }} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Filter</button>
      </div>
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr><th className="px-3 py-2 text-left">User</th><th>Action</th><th>Module</th><th>Description</th><th>IP</th><th>Time</th></tr>
          </thead>
          <tbody>
            {logs.map(l => (
              <tr key={l._id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2">{l.username || '-'}</td>
                <td className="px-3 py-2">{l.action}</td>
                <td className="px-3 py-2">{l.module}</td>
                <td className="px-3 py-2 max-w-xs truncate">{l.description}</td>
                <td className="px-3 py-2">{l.ipAddress || '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 mt-3 items-center text-sm">
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40">Prev</button>
        <span>Page {page}</span>
        <button disabled={logs.length < 30} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded disabled:opacity-40">Next</button>
        <span className="text-gray-400">Total: {total}</span>
      </div>
    </div>
  );
}

// ─── Main SaaS Admin Page ────────────────────────────────────────────────────
const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'companies', label: 'Companies & Modules' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'activity', label: 'Activity Logs' },
];

export default function SaasAdminPage() {
  const [tab, setTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-800 mb-4">SaaS Super Admin</h1>
        <div className="flex gap-1 bg-white rounded-xl shadow px-2 py-1 mb-4 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${tab === t.id ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="bg-white rounded-xl shadow">
          {tab === 'dashboard' && <DashboardTab />}
          {tab === 'companies' && <CompaniesTab />}
          {tab === 'subscriptions' && <SubscriptionsTab />}
          {tab === 'activity' && <ActivityLogsTab />}
        </div>
      </div>
    </div>
  );
}
