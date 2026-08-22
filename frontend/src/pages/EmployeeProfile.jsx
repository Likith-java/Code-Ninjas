import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import FormField from '../components/FormField.jsx';
import Modal from '../components/Modal.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Tabs from '../components/Tabs.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/client.js';
import { departmentChipClass } from '../utils/employees.js';

const MAX_PDF_BYTES = 5 * 1024 * 1024;

function formatDate(value) {
  if (!value) return null;
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function monthYear(value) {
  if (!value) return null;
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return null;
  const parsed = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatBytes(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size)) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function roleLabel(role) {
  if (role === 'admin') return 'Administrator';
  if (role === 'hr') return 'HR Manager';
  return 'Employee';
}

function errorMessage(err, fallback) {
  return err.details?.map((d) => d.message).join('. ') || err.message || fallback;
}

const PRIMARY_BUTTON =
  'font-label-md flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-label-md text-on-primary transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60';

export default function EmployeeProfile() {
  const { id } = useParams();
  const { user, isManager } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setNotFound(false);
    try {
      const res = await api(`/api/employees/${id}`);
      setEmployee(res.data);
    } catch (err) {
      setEmployee(null);
      if (err.status === 404) setNotFound(true);
      else setError(err.message || 'Failed to load employee');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const tabs = [
    { key: 'overview', label: 'Overview' },
    ...(employee && employee.viewer !== 'other'
      ? [
          { key: 'private', label: 'Private Info' },
          { key: 'resume', label: 'Resume' },
        ]
      : []),
    { key: 'skills', label: 'Skills & Certifications' },
    ...(isManager ? [{ key: 'security', label: 'Security' }] : []),
  ];

  const tabParam = searchParams.get('tab');
  const activeTab = tabs.some((t) => t.key === tabParam) ? tabParam : 'overview';

  const setActiveTab = (key) => {
    const next = new URLSearchParams(searchParams);
    if (key === 'overview') next.delete('tab');
    else next.set('tab', key);
    setSearchParams(next);
  };

  if (loading) {
    return (
      <div className="font-body-lg mx-auto max-w-container-max-width py-16 text-center text-on-surface-variant">
        Loading profile…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-container-max-width">
        <EmptyState
          icon="person_off"
          title="Employee not found"
          message="This employee does not exist or has been removed."
        />
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="mx-auto max-w-container-max-width">
        <EmptyState icon="error" title="Something went wrong" message={error} />
      </div>
    );
  }

  const isSelf = user?.employee_id != null && Number(user.employee_id) === Number(id);
  const joined = monthYear(employee.hired_at);

  return (
    <div className="mx-auto flex max-w-container-max-width flex-col gap-6">
      <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-card-padding shadow-card">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar name={employee.full_name} url={employee.avatar_url} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="font-headline-lg truncate text-on-surface">{employee.full_name}</h2>
            <p className="font-body-lg mt-0.5 text-on-surface-variant">
              {employee.position}
              {employee.hired_at ? ` · Hired ${formatDate(employee.hired_at)}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${departmentChipClass(
                  employee.department
                )}`}
              >
                {employee.department}
              </span>
              <StatusBadge status={employee.status} />
              {joined && (
                <span className="font-body-md flex items-center gap-1 text-xs text-on-surface-variant">
                  <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                  Joined {joined}
                </span>
              )}
              {!employee.can_edit && (
                <span className="font-body-md rounded-full bg-surface-container-high px-2.5 py-0.5 text-xs text-on-surface-variant">
                  Read-only profile
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest shadow-card">
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
        <div className="p-4 md:p-6">
          {activeTab === 'overview' && <OverviewTab employee={employee} />}
          {activeTab === 'private' && employee.viewer !== 'other' && (
            <PrivateInfoTab id={id} employee={employee} onSaved={load} />
          )}
          {activeTab === 'resume' && employee.viewer !== 'other' && (
            <ResumeTab id={id} employee={employee} onChanged={load} />
          )}
          {activeTab === 'skills' && (
            <SkillsAndCertsTab id={id} employee={employee} onChanged={load} />
          )}
          {activeTab === 'security' && isManager && <SecuritySection id={id} isSelf={isSelf} />}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h3 className="font-label-md mb-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
      {children}
    </h3>
  );
}

function Fact({ icon, label, children }) {
  return (
    <div className="rounded-xl bg-surface-container-low p-4">
      <span className="material-symbols-outlined mb-1 block text-[20px] text-on-surface-variant/70">
        {icon}
      </span>
      <p className="text-xs uppercase tracking-wider text-on-surface-variant">{label}</p>
      <p className="font-body-md mt-1 break-words font-medium text-on-surface">{children}</p>
    </div>
  );
}

function OverviewTab({ employee }) {
  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>About</SectionTitle>
        {employee.about ? (
          <p className="font-body-lg whitespace-pre-line text-on-surface">{employee.about}</p>
        ) : (
          <p className="font-body-lg italic text-on-surface-variant/70">No bio added yet.</p>
        )}
      </section>
      <section>
        <SectionTitle>Quick facts</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <Fact icon="work" label="Position">
            {employee.position}
          </Fact>
          <Fact icon="groups" label="Department">
            {employee.department}
          </Fact>
          <Fact icon="verified" label="Status">
            <StatusBadge status={employee.status} />
          </Fact>
          <Fact icon="event" label="Joined">
            {formatDate(employee.hired_at) ?? '—'}
          </Fact>
          {employee.email && (
            <Fact icon="mail" label="Email">
              {employee.email}
            </Fact>
          )}
          {employee.phone && (
            <Fact icon="call" label="Phone">
              {employee.phone}
            </Fact>
          )}
        </div>
      </section>
    </div>
  );
}

function PrivateInfoTab({ id, employee, onSaved }) {
  const [form, setForm] = useState({
    date_of_birth: '',
    address: '',
    phone: '',
    avatar_url: '',
  });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({
      date_of_birth: employee.date_of_birth ?? '',
      address: employee.address ?? '',
      phone: employee.phone ?? '',
      avatar_url: employee.avatar_url ?? '',
    });
  }, [employee]);

  const canEdit = Boolean(employee.can_edit);

  const setField = (field) => (event) => {
    setSuccess('');
    setError('');
    setForm((f) => ({ ...f, [field]: event.target.value }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSuccess('');
    setError('');
    try {
      await api(`/api/employees/${id}`, {
        method: 'PUT',
        body: {
          phone: form.phone,
          avatar_url: form.avatar_url,
          date_of_birth: form.date_of_birth,
          address: form.address,
        },
      });
      setSuccess('Saved');
      await onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Could not save changes'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="max-w-xl space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Date of birth">
          <input
            type="date"
            value={form.date_of_birth}
            onChange={setField('date_of_birth')}
            disabled={!canEdit}
            className="input disabled:bg-surface-container-high"
          />
        </FormField>
        <FormField label="Phone">
          <input
            value={form.phone}
            onChange={setField('phone')}
            placeholder="+91 98765 43210"
            disabled={!canEdit}
            className="input disabled:bg-surface-container-high"
          />
        </FormField>
      </div>
      <FormField label="Address">
        <textarea
          rows={3}
          value={form.address}
          onChange={setField('address')}
          placeholder="Street, city, postal code"
          disabled={!canEdit}
          className="input resize-y disabled:bg-surface-container-high"
        />
      </FormField>
      <FormField label="Avatar URL">
        <input
          value={form.avatar_url}
          onChange={setField('avatar_url')}
          placeholder="https://…"
          disabled={!canEdit}
          className="input disabled:bg-surface-container-high"
        />
      </FormField>
      {success && <p className="font-body-md text-green-600">{success}</p>}
      {error && <p className="font-body-md text-error">{error}</p>}
      {canEdit && (
        <button type="submit" disabled={saving} className={`${PRIMARY_BUTTON} min-w-32`}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      )}
    </form>
  );
}

function ResumeTab({ id, employee, onChanged }) {
  const resume = employee.resume ?? {};
  return (
    <div className="space-y-8">
      <ResumeTextSection id={id} resume={resume} canEdit={employee.can_edit} onChanged={onChanged} />
      <ResumePdfSection id={id} resume={resume} canEdit={employee.can_edit} onChanged={onChanged} />
    </div>
  );
}

function ResumeTextSection({ id, resume, canEdit, onChanged }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setText(resume.text ?? '');
  }, [resume]);

  const handleSave = async () => {
    setSaving(true);
    setSuccess('');
    setError('');
    try {
      await api(`/api/employees/${id}/resume`, { method: 'PUT', body: { resume_text: text } });
      setSuccess('Resume saved');
      await onChanged();
    } catch (err) {
      setError(errorMessage(err, 'Could not save resume'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="max-w-3xl space-y-3">
      <SectionTitle>Resume text</SectionTitle>
      <textarea
        rows={7}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setSuccess('');
          setError('');
        }}
        placeholder="Paste your résumé summary here…"
        disabled={!canEdit}
        className="input resize-y font-mono text-xs leading-relaxed disabled:bg-surface-container-high"
      />
      {success && <p className="font-body-md text-green-600">{success}</p>}
      {error && <p className="font-body-md text-error">{error}</p>}
      {canEdit && (
        <button type="button" onClick={handleSave} disabled={saving} className={PRIMARY_BUTTON}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      )}
    </section>
  );
}

function ResumePdfSection({ id, resume, canEdit, onChanged }) {
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setSuccess('');
    if (file.size > MAX_PDF_BYTES) {
      setError('PDF must be 5 MB or smaller');
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = String(reader.result).split(',')[1] ?? '';
        await api(`/api/employees/${id}/resume`, {
          method: 'PUT',
          body: { resume_pdf_base64: base64, resume_pdf_name: file.name },
        });
        setSuccess(`Uploaded ${file.name}`);
        await onChanged();
      } catch (err) {
        setError(errorMessage(err, 'Upload failed'));
      } finally {
        setUploading(false);
      }
    };
    reader.onerror = () => {
      setError('Could not read the selected file');
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleRemove = async () => {
    setRemoving(true);
    setError('');
    setSuccess('');
    try {
      await api(`/api/employees/${id}/resume`, {
        method: 'PUT',
        body: { resume_pdf_base64: null },
      });
      setSuccess('Resume PDF removed');
      await onChanged();
    } catch (err) {
      setError(errorMessage(err, 'Could not remove PDF'));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <section className="max-w-3xl space-y-3">
      <SectionTitle>Resume PDF</SectionTitle>
      {resume.has_pdf ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3">
          <span className="material-symbols-outlined text-error">picture_as_pdf</span>
          <div className="min-w-0 flex-1">
            <p className="font-body-md truncate font-medium text-on-surface">{resume.pdf_name}</p>
            <p className="text-xs text-on-surface-variant">{formatBytes(resume.pdf_size)}</p>
          </div>
          <a
            href={`/api/employees/${id}/resume.pdf`}
            target="_blank"
            rel="noreferrer"
            className="font-label-md flex items-center gap-2 rounded-lg border border-outline-variant px-4 py-2 text-label-md text-primary transition-colors hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[18px]">open_in_new</span>
            Open
          </a>
          {canEdit && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={removing}
              className="font-label-md flex items-center gap-2 rounded-lg bg-error px-4 py-2 text-label-md text-white transition-colors hover:brightness-110 disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
              {removing ? 'Removing…' : 'Remove'}
            </button>
          )}
        </div>
      ) : canEdit ? (
        <FormField label="Upload PDF (max 5 MB)">
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFile}
            disabled={uploading}
            className="input file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-on-primary"
          />
        </FormField>
      ) : (
        <p className="font-body-md italic text-on-surface-variant/70">No resume PDF uploaded.</p>
      )}
      {uploading && <p className="font-body-md text-on-surface-variant">Uploading…</p>}
      {success && <p className="font-body-md text-green-600">{success}</p>}
      {error && <p className="font-body-md text-error">{error}</p>}
    </section>
  );
}

function SkillsAndCertsTab({ id, employee, onChanged }) {
  return (
    <div className="space-y-8">
      <SkillsEditor id={id} employee={employee} onChanged={onChanged} />
      <CertificationsEditor id={id} employee={employee} onChanged={onChanged} />
    </div>
  );
}

function SkillsEditor({ id, employee, onChanged }) {
  const [skills, setSkills] = useState([]);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setSkills(employee.skills ?? []);
  }, [employee]);

  const canEdit = Boolean(employee.can_edit);

  const addSkill = () => {
    const name = draft.trim();
    if (!name) return;
    if (skills.some((s) => s.toLowerCase() === name.toLowerCase())) {
      setDraft('');
      return;
    }
    setSkills((prev) => [...prev, name]);
    setDraft('');
    setSuccess('');
    setError('');
  };

  const removeSkill = (index) => {
    setSkills((prev) => prev.filter((_, i) => i !== index));
    setSuccess('');
    setError('');
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccess('');
    setError('');
    try {
      const deduped = [];
      const seen = new Set();
      for (const skill of skills) {
        const key = skill.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        deduped.push(skill.trim());
      }
      await api(`/api/employees/${id}/skills`, { method: 'PUT', body: { skills: deduped } });
      setSuccess('Skills saved');
      await onChanged();
    } catch (err) {
      setError(errorMessage(err, 'Could not save skills'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="max-w-3xl space-y-3">
      <SectionTitle>Skills</SectionTitle>
      {skills.length === 0 && !canEdit && (
        <p className="font-body-md italic text-on-surface-variant/70">No skills added yet.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {skills.map((skill, index) => (
          <span
            key={`${skill}-${index}`}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
              canEdit
                ? 'bg-secondary-container text-on-secondary-container'
                : 'border border-outline-variant bg-surface-container-low text-on-surface-variant'
            }`}
          >
            {skill}
            {canEdit && (
              <button
                type="button"
                onClick={() => removeSkill(index)}
                title={`Remove ${skill}`}
                className="material-symbols-outlined rounded-full p-0.5 text-[14px] transition-colors hover:bg-error/15 hover:text-error"
              >
                close
              </button>
            )}
          </span>
        ))}
      </div>
      {canEdit && (
        <>
          <div className="flex max-w-md gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addSkill();
                }
              }}
              placeholder="Add a skill and press Enter"
              className="input"
            />
            <button
              type="button"
              onClick={addSkill}
              className="font-label-md flex shrink-0 items-center gap-1 rounded-lg border border-outline-variant px-4 text-label-md text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Add
            </button>
          </div>
          {success && <p className="font-body-md text-green-600">{success}</p>}
          {error && <p className="font-body-md text-error">{error}</p>}
          <button type="button" onClick={handleSave} disabled={saving} className={PRIMARY_BUTTON}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
    </section>
  );
}

function CertificationsEditor({ id, employee, onChanged }) {
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setRows(
      (employee.certifications ?? []).map((c) => ({
        name: c.name ?? '',
        issuer: c.issuer ?? '',
        issued_on: c.issued_on ?? '',
        expires_on: c.expires_on ?? '',
      }))
    );
  }, [employee]);

  const canEdit = Boolean(employee.can_edit);

  const addRow = () => {
    setRows((prev) => [...prev, { name: '', issuer: '', issued_on: '', expires_on: '' }]);
    setSuccess('');
    setError('');
  };

  const removeRow = (index) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setSuccess('');
    setError('');
  };

  const setCell = (index, field) => (event) => {
    const value = event.target.value;
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
    setSuccess('');
    setError('');
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccess('');
    setError('');
    try {
      const certifications = rows.map((row) => ({
        name: row.name.trim(),
        issuer: row.issuer.trim() || null,
        issued_on: row.issued_on || null,
        expires_on: row.expires_on || null,
      }));
      await api(`/api/employees/${id}/certifications`, {
        method: 'PUT',
        body: { certifications },
      });
      setSuccess('Certifications saved');
      await onChanged();
    } catch (err) {
      setError(errorMessage(err, 'Could not save certifications'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="max-w-3xl space-y-3">
      <SectionTitle>Certifications</SectionTitle>
      {!canEdit &&
        (rows.length === 0 ? (
          <p className="font-body-md italic text-on-surface-variant/70">
            No certifications added yet.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-outline-variant/30 text-xs uppercase tracking-wider text-on-surface-variant">
                <th className="py-2 pr-4 font-semibold">Name</th>
                <th className="py-2 pr-4 font-semibold">Issuer</th>
                <th className="py-2 pr-4 font-semibold">Issued</th>
                <th className="py-2 font-semibold">Expires</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-b border-outline-variant/20 last:border-b-0">
                  <td className="py-2.5 pr-4 font-medium text-on-surface">{row.name}</td>
                  <td className="py-2.5 pr-4 text-on-surface-variant">{row.issuer || '—'}</td>
                  <td className="py-2.5 pr-4 text-on-surface-variant">
                    {formatDate(row.issued_on) || '—'}
                  </td>
                  <td className="py-2.5 text-on-surface-variant">
                    {formatDate(row.expires_on) || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      {canEdit && (
        <>
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div
                key={index}
                className="grid grid-cols-1 items-start gap-2 md:grid-cols-12 md:items-end"
              >
                <FormField label={index === 0 ? 'Name' : undefined}>
                  <input
                    value={row.name}
                    onChange={setCell(index, 'name')}
                    maxLength={120}
                    placeholder="AWS Certified Developer"
                    className="input md:col-span-4"
                  />
                </FormField>
                <FormField label={index === 0 ? 'Issuer' : undefined}>
                  <input
                    value={row.issuer}
                    onChange={setCell(index, 'issuer')}
                    maxLength={120}
                    placeholder="Amazon"
                    className="input md:col-span-3"
                  />
                </FormField>
                <FormField label={index === 0 ? 'Issued on' : undefined}>
                  <input
                    type="date"
                    value={row.issued_on}
                    onChange={setCell(index, 'issued_on')}
                    className="input md:col-span-2"
                  />
                </FormField>
                <FormField label={index === 0 ? 'Expires on' : undefined}>
                  <input
                    type="date"
                    value={row.expires_on}
                    onChange={setCell(index, 'expires_on')}
                    className="input md:col-span-2"
                  />
                </FormField>
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  title="Remove row"
                  className="material-symbols-outlined h-9 w-9 shrink-0 justify-self-start rounded-full text-on-surface-variant transition-colors hover:bg-error/15 hover:text-error md:justify-self-center"
                >
                  delete
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-2 rounded-lg border border-dashed border-outline-variant px-4 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Add row
          </button>
          {success && <p className="font-body-md text-green-600">{success}</p>}
          {error && <p className="font-body-md text-error">{error}</p>}
          <button type="button" onClick={handleSave} disabled={saving} className={PRIMARY_BUTTON}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
    </section>
  );
}

function SecuritySection({ id, isSelf }) {
  const [security, setSecurity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    api(`/api/employees/${id}/security`)
      .then((res) => !cancelled && setSecurity(res.data))
      .catch((err) => !cancelled && setLoadError(err.message || 'Failed to load security info'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const refresh = useCallback(async () => {
    const res = await api(`/api/employees/${id}/security`);
    setSecurity(res.data);
  }, [id]);

  const runAction = async (action) => {
    setBusy(true);
    setActionError('');
    try {
      await action();
    } catch (err) {
      setActionError(errorMessage(err, 'Action failed'));
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = () =>
    runAction(async () => {
      const res = await api(`/api/employees/${id}/reset-password`, { method: 'POST' });
      setTempPassword({ loginId: security.login_id, password: res.data.temp_password });
      refresh().catch(() => {});
    });

  const handleToggleStatus = () =>
    runAction(async () => {
      const nextStatus = security.account_status === 'active' ? 'disabled' : 'active';
      await api(`/api/employees/${id}/status`, {
        method: 'PATCH',
        body: { account_status: nextStatus },
      });
      await refresh();
    });

  return (
    <div className="max-w-2xl space-y-4">
      {loading && <p className="font-body-md text-on-surface-variant">Loading security info…</p>}
      {!loading && loadError && (
        <div className="font-body-md rounded-lg border border-error/30 bg-error-container p-4 text-on-error-container">
          {loadError}
        </div>
      )}
      {!loading && !loadError && security && (
        <>
          <div className="divide-y divide-outline-variant/20 rounded-xl border border-outline-variant/30 bg-surface-container-low px-4">
            <InfoRow label="Login ID">
              <span className="font-mono font-bold tracking-wide">{security.login_id}</span>
            </InfoRow>
            <InfoRow label="Email">{security.email}</InfoRow>
            <InfoRow label="Role">{roleLabel(security.role)}</InfoRow>
            <InfoRow label="Account status">
              <StatusBadge status={security.account_status} />
            </InfoRow>
            <InfoRow label="Must change password">
              {security.must_change_password ? 'Yes' : 'No'}
            </InfoRow>
            <InfoRow label="Last login">{formatDateTime(security.last_login_at) ?? '—'}</InfoRow>
            <InfoRow label="Created">{formatDateTime(security.created_at) ?? '—'}</InfoRow>
          </div>

          {!isSelf && (
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={handleResetPassword} disabled={busy} className={PRIMARY_BUTTON}>
                <span className="material-symbols-outlined text-[18px]">lock_reset</span>
                Reset password
              </button>
              <button
                type="button"
                onClick={handleToggleStatus}
                disabled={busy}
                className={
                  security.account_status === 'active'
                    ? 'font-label-md flex items-center justify-center gap-2 rounded-lg bg-error px-5 py-2.5 text-label-md text-white transition-colors hover:brightness-110 disabled:opacity-60'
                    : PRIMARY_BUTTON
                }
              >
                <span className="material-symbols-outlined text-[18px]">
                  {security.account_status === 'active' ? 'block' : 'check_circle'}
                </span>
                {security.account_status === 'active' ? 'Disable account' : 'Enable account'}
              </button>
            </div>
          )}

          {isSelf && (
            <p className="text-xs text-on-surface-variant">
              You cannot reset your own password or change your own account status.
            </p>
          )}

          {actionError && <p className="font-body-md text-error">{actionError}</p>}

          {tempPassword && (
            <Modal title="Temporary password" onClose={() => setTempPassword(null)}>
              <div className="space-y-4">
                <div className="font-body-md rounded-lg border border-error/30 bg-error-container p-4 text-on-error-container">
                  Copy it now. This password is <strong>shown only once</strong> and will not be
                  displayed again. The employee must change it at next login.
                </div>
                <CopyRow label="Login ID" value={tempPassword.loginId} />
                <CopyRow label="Temporary password" value={tempPassword.password} />
                <button
                  type="button"
                  onClick={() => setTempPassword(null)}
                  className={`${PRIMARY_BUTTON} w-full`}
                >
                  Done
                </button>
              </div>
            </Modal>
          )}
        </>
      )}
    </div>
  );
}

function InfoRow({ label, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3">
      <span className="text-xs uppercase tracking-wider text-on-surface-variant">{label}</span>
      <span className="font-body-md font-medium text-on-surface">{children}</span>
    </div>
  );
}

function CopyRow({ label, value }) {
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
        <p className="text-xs uppercase tracking-wider text-on-surface-variant">{label}</p>
        <p className="truncate font-mono text-base font-bold text-on-surface">{value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        title="Copy"
        className="material-symbols-outlined rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
      >
        {copied ? 'check' : 'content_copy'}
      </button>
    </div>
  );
}
