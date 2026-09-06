import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EmployeeCard from '../components/EmployeeCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import FormField from '../components/FormField.jsx';
import Modal from '../components/Modal.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { api } from '../api/client.js';
import {
  DEPARTMENT_CHIP_CLASSES,
} from '../utils/employees.js';

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  email: '',
  position: '',
  department: 'Engineering',
  phone: '',
  status: 'active',
};

export default function Employees() {
  const { user, isManager } = useAuth();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [meta, setMeta] = useState({ total: 0 });
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [provisioned, setProvisioned] = useState(null);

  const debouncedQuery = useDebouncedValue(query);

  useEffect(() => {
    api('/api/employees/meta')
      .then((res) => setDepartments(res.data.departments))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ limit: '100' });
    if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim());
    if (department !== 'All') params.set('department', department);
    api(`/api/employees?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setEmployees(res.data);
        setMeta(res.meta);
      })
      .catch((err) => !cancelled && setError(err.message || 'Failed to load employees'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, department]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (employee) => {
    setEditing(employee);
    setForm({
      first_name: employee.first_name,
      last_name: employee.last_name,
      email: employee.email ?? '',
      position: employee.position,
      department: employee.department,
      phone: employee.phone ?? '',
      status: employee.status,
    });
    setFormError('');
    setModalOpen(true);
  };

  const setField = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      if (editing) {
        await api(`/api/employees/${editing.id}`, { method: 'PUT', body: form });
        setModalOpen(false);
        await refreshList();
      } else {
        const res = await api('/api/employees', { method: 'POST', body: form });
        setModalOpen(false);
        setProvisioned(res.data.account);
        await refreshList();
      }
    } catch (err) {
      setFormError(
        err.details?.map((d) => d.message).join('. ') || err.message || 'Something went wrong'
      );
    } finally {
      setSaving(false);
    }
  };

  async function refreshList() {
    const params = new URLSearchParams({ limit: '100' });
    if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim());
    if (department !== 'All') params.set('department', department);
    const res = await api(`/api/employees?${params.toString()}`);
    setEmployees(res.data);
    setMeta(res.meta);
  }

  const handleDelete = async () => {
    if (!editing) return;
    if (!window.confirm(`Delete ${editing.full_name}? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await api(`/api/employees/${editing.id}`, { method: 'DELETE' });
      setModalOpen(false);
      await refreshList();
    } catch (err) {
      setFormError(err.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const chips = useMemo(() => ['All', ...departments], [departments]);

  return (
    <div className="mx-auto flex max-w-container-max-width flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs font-bold text-primary">
              <span className="material-symbols-outlined text-[14px]">badge</span>
              <span>Workforce Directory</span>
            </span>
            <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-bold text-on-surface-variant">
              {loading ? '…' : `${meta.total} Members`}
            </span>
          </div>
          <h2 className="font-headline-lg text-2xl sm:text-3xl font-bold tracking-tight text-primary">
            Employee Directory
          </h2>
          <p className="text-sm text-on-surface-variant">
            Browse team members across your organisation
            {!isManager && user ? ' · click any card to view their profile' : ''}
          </p>
        </div>
        {isManager && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-container px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition-all duration-200 hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            <span>Add Employee</span>
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-md">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/60">
            <span className="material-symbols-outlined text-[20px]">search</span>
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, login ID, position or skill…"
            className="h-11 w-full rounded-xl border border-outline-variant/40 bg-white pl-11 pr-10 text-sm text-on-surface shadow-2xs placeholder:text-on-surface-variant/50 transition-all focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 hover:text-on-surface"
              title="Clear search"
            >
              <span className="material-symbols-outlined text-[18px]">cancel</span>
            </button>
          )}
        </div>

        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {chips.map((chip) => (
            <button
              key={chip}
              onClick={() => setDepartment(chip)}
              className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition-all duration-150 ${
                chip === department
                  ? 'bg-gradient-to-r from-primary to-primary-container text-white shadow-sm shadow-primary/20'
                  : 'border border-outline-variant/40 bg-white text-on-surface-variant hover:border-primary/40 hover:bg-surface-container/50'
              }`}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-error/30 bg-error-container p-4 font-body-md text-on-error-container">
          {error}
        </div>
      )}

      {!error && !loading && employees.length === 0 && (
        <EmptyState
          icon="group_search"
          title="No matches"
          message="No employees match this view."
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {employees.map((employee) => (
          <EmployeeCard
            key={employee.id}
            employee={employee}
            onClick={() => navigate(`/employees/${employee.id}`)}
            action={
              isManager ? (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    openEdit(employee);
                  }}
                  title="Edit"
                  className="material-symbols-outlined h-9 w-9 shrink-0 rounded-full text-on-surface-variant opacity-0 transition-all hover:bg-surface-container-high hover:text-primary group-hover:opacity-100"
                >
                  edit
                </button>
              ) : null
            }
          />
        ))}
      </div>

      {modalOpen && (
        <Modal title={editing ? `Edit ${editing.full_name}` : 'New Employee'} onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="First name">
                <input required value={form.first_name} onChange={setField('first_name')} className="input" />
              </FormField>
              <FormField label="Last name">
                <input required value={form.last_name} onChange={setField('last_name')} className="input" />
              </FormField>
            </div>
            <FormField label="Email">
              <input required type="email" value={form.email} onChange={setField('email')} className="input" />
            </FormField>
            <p className="-mt-1 text-xs text-on-surface-variant">
              A login ID and one-time temporary password are generated automatically.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Position">
                <input required value={form.position} onChange={setField('position')} className="input" />
              </FormField>
              <FormField label="Department">
                <select value={form.department} onChange={setField('department')} className="input">
                  {(departments.length ? departments : Object.keys(DEPARTMENT_CHIP_CLASSES)).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Phone">
                <input value={form.phone} onChange={setField('phone')} placeholder="+91 98765 43210" className="input" />
              </FormField>
              <FormField label="Status">
                <select value={form.status} onChange={setField('status')} className="input">
                  <option value="active">Active</option>
                  <option value="on_leave">On leave</option>
                </select>
              </FormField>
            </div>
            {formError && <p className="font-body-md text-error">{formError}</p>}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="font-label-md flex-1 rounded-lg border border-outline-variant py-2.5 text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-low"
              >
                Cancel
              </button>
              {editing && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setModalOpen(false);
                      navigate(`/employees/${editing.id}?tab=security`);
                    }}
                    className="rounded-lg border border-outline-variant py-2.5 px-4 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low"
                  >
                    Security
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={saving}
                    className="rounded-lg bg-error py-2.5 px-4 text-sm font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-60"
                  >
                    Delete
                  </button>
                </>
              )}
              <button
                type="submit"
                disabled={saving}
                className="font-label-md flex-1 rounded-lg bg-primary py-2.5 text-label-md text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {provisioned && (
        <Modal title="Employee created" onClose={() => setProvisioned(null)}>
          <div className="space-y-4">
            <div className="rounded-lg border border-error/30 bg-error-container p-4 font-body-md text-on-error-container">
              Copy these credentials now. The temporary password will{' '}
              <strong>not be shown again</strong>. The employee must change it at first login.
            </div>
            <CredentialRow label="Login ID" value={provisioned.login_id} />
            <CredentialRow label="Temporary password" value={provisioned.temp_password} />
            <button
              type="button"
              onClick={() => setProvisioned(null)}
              className="font-label-md w-full rounded-lg bg-primary py-2.5 text-label-md text-on-primary transition-colors hover:bg-primary/90"
            >
              Done
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CredentialRow({ label, value }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3">
      <div className="min-w-0">
        <p className="font-label-md text-xs uppercase tracking-wider text-on-surface-variant">{label}</p>
        <p className="truncate font-mono text-base font-bold text-on-surface">{value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="material-symbols-outlined rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
      >
        {copied ? 'check' : 'content_copy'}
      </button>
    </div>
  );
}
