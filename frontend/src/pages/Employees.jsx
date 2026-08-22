import { useEffect, useMemo, useState } from 'react';
import Avatar from '../components/Avatar.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/client.js';
import { departmentChipClass, DEPARTMENT_CHIP_CLASSES } from '../utils/employees.js';

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
  const { user, isAdmin } = useAuth();
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

  useEffect(() => {
    api('/api/employees/meta')
      .then((res) => setDepartments(res.data.departments))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(loadEmployees, query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [query, department]);

  async function loadEmployees() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (query.trim()) params.set('q', query.trim());
      if (department !== 'All') params.set('department', department);
      const res = await api(`/api/employees?${params.toString()}`);
      setEmployees(res.data);
      setMeta(res.meta);
    } catch (err) {
      setError(err.message || 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  }

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (employee) => {
    if (!isAdmin) return;
    setEditing(employee);
    setForm({
      first_name: employee.first_name,
      last_name: employee.last_name,
      email: employee.email,
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
      } else {
        await api('/api/employees', { method: 'POST', body: form });
      }
      setModalOpen(false);
      await loadEmployees();
    } catch (err) {
      setFormError(
        err.details?.map((d) => d.message).join('. ') || err.message || 'Something went wrong'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    if (!window.confirm(`Delete ${editing.full_name}? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await api(`/api/employees/${editing.id}`, { method: 'DELETE' });
      setModalOpen(false);
      await loadEmployees();
    } catch (err) {
      setFormError(err.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  const chips = useMemo(() => ['All', ...departments], [departments]);

  return (
    <div className="mx-auto flex max-w-container-max-width flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-headline-lg text-primary">Employee Directory</h2>
          <p className="font-body-lg mt-1 text-on-surface-variant">
            {loading ? 'Loading…' : `${meta.total} people across your organisation`}
            {!isAdmin && user ? ' · read-only access' : ''}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={openCreate}
            className="font-label-md flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-label-md text-on-primary shadow-sm transition-colors hover:bg-primary/90"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            Add Employee
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="relative w-full md:max-w-sm">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60">
            search
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email or position…"
            className="font-body-md h-10 w-full rounded-lg border border-outline-variant/30 bg-surface-container-low pl-10 pr-4 text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {chips.map((chip) => (
            <button
              key={chip}
              onClick={() => setDepartment(chip)}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                chip === department
                  ? 'bg-primary text-on-primary'
                  : 'border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-primary'
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
        <div className="font-body-lg rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-12 text-center text-on-surface-variant">
          No employees match this view.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {employees.map((employee) => (
          <div
            key={employee.id}
            onClick={() => openEdit(employee)}
            className={`group flex items-center gap-4 rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-card-padding shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/30 ${
              isAdmin ? 'cursor-pointer' : 'cursor-default'
            }`}
          >
            <Avatar name={employee.full_name} url={employee.avatar_url} />
            <div className="min-w-0 flex-1">
              <p className="font-headline-md truncate text-[16px] font-bold text-on-surface">
                {employee.full_name}
              </p>
              <p className="font-body-md truncate text-on-surface-variant">{employee.position}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${departmentChipClass(
                    employee.department
                  )}`}
                >
                  {employee.department}
                </span>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider ${
                    employee.status === 'on_leave' ? 'text-error' : 'text-green-600'
                  }`}
                >
                  {employee.status === 'on_leave' ? 'On leave' : 'Active'}
                </span>
              </div>
            </div>
            {isAdmin && (
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
            )}
          </div>
        ))}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModalOpen(false);
          }}
        >
          <form
            onSubmit={handleSave}
            className="max-h-full w-full max-w-lg space-y-3 overflow-y-auto rounded-xl bg-surface-container-lowest p-6 shadow-xl"
          >
            <h3 className="font-headline-md mb-2 font-bold text-primary">
              {editing ? `Edit ${editing.full_name}` : 'New Employee'}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name">
                <input required value={form.first_name} onChange={setField('first_name')} className="input" />
              </Field>
              <Field label="Last name">
                <input required value={form.last_name} onChange={setField('last_name')} className="input" />
              </Field>
            </div>
            <Field label="Email">
              <input required type="email" value={form.email} onChange={setField('email')} className="input" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Position">
                <input required value={form.position} onChange={setField('position')} className="input" />
              </Field>
              <Field label="Department">
                <select value={form.department} onChange={setField('department')} className="input">
                  {(departments.length ? departments : Object.keys(DEPARTMENT_CHIP_CLASSES)).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone">
                <input value={form.phone} onChange={setField('phone')} placeholder="+91 98765 43210" className="input" />
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={setField('status')} className="input">
                  <option value="active">Active</option>
                  <option value="on_leave">On leave</option>
                </select>
              </Field>
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
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="rounded-lg bg-error py-2.5 px-4 text-sm font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-60"
                >
                  Delete
                </button>
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
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="font-label-md mb-1 block uppercase tracking-wider text-on-surface-variant">
        {label}
      </span>
      {children}
    </label>
  );
}
