import { DEPARTMENTS } from './employee.validator.js';

// ---------------------------------------------------------------------------
// Employee Profile payload validation (server-side, authoritative).
//
// Field classes mirror the PRD Private Info tab:
//   - personal contact/private data -> editable by the record owner
//   - job details, joining date, work email, bank details, protected
//     identifiers (emp code / PAN / UAN) -> admin-editable only
//   - account/security state (role, login_id, account_status, ...) and any
//     compensation field are NOT part of this resource at all; submitting
//     them is rejected, never silently ignored.
// ---------------------------------------------------------------------------

export const PROFILE_SELF_FIELDS = [
  'phone',
  'date_of_birth',
  'address',
  'personal_email',
  'gender',
  'nationality',
  'marital_status',
  'about',
  'love_about_job',
];

export const PROFILE_ADMIN_FIELDS = [
  'email',
  'position',
  'department',
  'company',
  'location',
  'manager_id',
  'hired_at',
  'employee_code',
  'pan',
  'uan',
  'bank_name',
  'bank_account_number',
  'bank_ifsc',
];

// Never part of the profile resource regardless of caller privileges.
const FORBIDDEN_KEYS = new Set([
  'role',
  'login_id',
  'account_status',
  'must_change_password',
  'password_hash',
  'token_version',
  'salary',
  'ctc',
  'compensation',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s\-()]{5,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const UAN_RE = /^\d{12}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_NUMBER_RE = /^[\d\s-]{4,24}$/;
const EMPLOYEE_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

function isValidDate(value) {
  if (!DATE_RE.test(value)) return false;
  return !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function optionalStr(value, maxLength) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) return undefined;
  return trimmed;
}

/**
 * Validate a PUT /employees/:id/profile body.
 * Returns { errors, fields } where `fields` only ever contains keys from
 * PROFILE_SELF_FIELDS ∪ PROFILE_ADMIN_FIELDS that were present in the body.
 */
export function validateProfileUpdate(body, { isManager }) {
  const input = typeof body === 'object' && body !== null ? body : {};
  const allowed = isManager ? [...PROFILE_SELF_FIELDS, ...PROFILE_ADMIN_FIELDS] : PROFILE_SELF_FIELDS;
  const allowedSet = new Set(allowed);
  const errors = [];
  const fields = {};

  for (const key of Object.keys(input)) {
    if (allowedSet.has(key)) continue;
    if (!isManager && PROFILE_ADMIN_FIELDS.includes(key)) {
      errors.push({ field: key, message: 'Only administrators can edit this field' });
    } else {
      errors.push({
        field: key,
        message: FORBIDDEN_KEYS.has(key)
          ? 'This field is managed through account security endpoints and cannot be set here'
          : 'Unknown or read-only field',
      });
    }
  }

  const text = (key, max, message) => {
    if (!(key in input)) return;
    const value = optionalStr(input[key], max);
    if (value === undefined) errors.push({ field: key, message });
    else fields[key] = value;
  };

  const date = (key) => {
    if (!(key in input)) return;
    const value = optionalStr(input[key]);
    if (value === undefined || (value !== null && !isValidDate(value))) {
      errors.push({ field: key, message: `${key} must be a valid date (YYYY-MM-DD)` });
    } else {
      fields[key] = value;
    }
  };

  // Personal / private contact fields ---------------------------------------
  if ('phone' in input) {
    const value = optionalStr(input.phone, 25);
    if (value === undefined || (value !== null && !PHONE_RE.test(value))) {
      errors.push({ field: 'phone', message: 'Phone number is not valid' });
    } else {
      fields.phone = value;
    }
  }
  date('date_of_birth');
  text('address', 500, 'Address must be a string of at most 500 characters');
  text('gender', 60, 'Gender must be a string of at most 60 characters');
  text('nationality', 80, 'Nationality must be a string of at most 80 characters');
  text('marital_status', 40, 'Marital status must be a string of at most 40 characters');
  text('about', 5000, 'About must be a string of at most 5000 characters');
  text('love_about_job', 2000, 'Love about job must be a string of at most 2000 characters');

  if ('personal_email' in input) {
    const value = optionalStr(input.personal_email, 254);
    if (value === undefined || (value !== null && !EMAIL_RE.test(value))) {
      errors.push({ field: 'personal_email', message: 'Personal email is not valid' });
    } else {
      fields.personal_email = value ? value.toLowerCase() : null;
    }
  }

  // Job details (admin) ------------------------------------------------------
  if ('position' in input) {
    const value = optionalStr(input.position, 120);
    if (!value) errors.push({ field: 'position', message: 'Position is required' });
    else fields.position = value;
  }
  if ('department' in input && input.department !== null) {
    if (!DEPARTMENTS.includes(input.department)) {
      errors.push({
        field: 'department',
        message: `Department must be one of: ${DEPARTMENTS.join(', ')}`,
      });
    } else {
      fields.department = input.department;
    }
  }
  text('company', 120, 'Company must be a string of at most 120 characters');
  text('location', 120, 'Location must be a string of at most 120 characters');

  if ('manager_id' in input) {
    const raw = input.manager_id;
    if (raw === null || raw === '') {
      fields.manager_id = null;
    } else if (!Number.isInteger(raw) || raw < 1) {
      errors.push({ field: 'manager_id', message: 'manager_id must be a positive integer or null' });
    } else {
      fields.manager_id = raw;
    }
  }

  date('hired_at');

  // Work email (admin) -------------------------------------------------------
  if ('email' in input) {
    const raw = typeof input.email === 'string' ? input.email.trim() : '';
    if (!raw || !EMAIL_RE.test(raw)) {
      errors.push({ field: 'email', message: 'Email is not valid' });
    } else if (raw.length > 254) {
      errors.push({ field: 'email', message: 'Email must be at most 254 characters' });
    } else {
      fields.email = raw.toLowerCase();
    }
  }

  // Bank details + protected identifiers (admin) ------------------------------
  text('bank_name', 120, 'Bank name must be a string of at most 120 characters');

  if ('bank_account_number' in input) {
    const value = optionalStr(input.bank_account_number, 24)?.replace(/\s+/g, '') ?? null;
    if (value === undefined || (value !== null && !ACCOUNT_NUMBER_RE.test(value))) {
      errors.push({
        field: 'bank_account_number',
        message: 'Account number must be 4-24 digits (spaces/dashes allowed)',
      });
    } else {
      fields.bank_account_number = value;
    }
  }

  if ('bank_ifsc' in input) {
    const value = optionalStr(input.bank_ifsc, 11)?.toUpperCase() ?? null;
    if (value === undefined || (value !== null && !IFSC_RE.test(value))) {
      errors.push({ field: 'bank_ifsc', message: 'IFSC code must match e.g. HDFC0001234' });
    } else {
      fields.bank_ifsc = value;
    }
  }

  if ('pan' in input) {
    const value = optionalStr(input.pan, 10)?.toUpperCase() ?? null;
    if (value === undefined || (value !== null && !PAN_RE.test(value))) {
      errors.push({ field: 'pan', message: 'PAN must match e.g. ABCDE1234F' });
    } else {
      fields.pan = value;
    }
  }

  if ('uan' in input) {
    const value = optionalStr(input.uan) ?? null;
    if (value === undefined || (value !== null && !UAN_RE.test(value))) {
      errors.push({ field: 'uan', message: 'UAN must be exactly 12 digits' });
    } else {
      fields.uan = value;
    }
  }

  if ('employee_code' in input) {
    const value = optionalStr(input.employee_code, 40);
    if (value === undefined || (value !== null && !EMPLOYEE_CODE_RE.test(value))) {
      errors.push({
        field: 'employee_code',
        message: 'Employee code must be alphanumeric (max 40 chars)',
      });
    } else {
      fields.employee_code = value;
    }
  }

  return { errors, fields };
}

/** Validate POST /employees/:id/skills body ({ name }). */
export function validateSkillCreate(body) {
  const raw = body?.name;
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name) {
    return { errors: [{ field: 'name', message: 'Skill name is required' }], name: null };
  }
  if (name.length > 60) {
    return {
      errors: [{ field: 'name', message: 'Skill must be at most 60 characters' }],
      name: null,
    };
  }
  return { errors: [], name };
}

/** Validate POST /employees/:id/certifications body. */
export function validateCertificationCreate(body) {
  const entry = typeof body === 'object' && body !== null ? body : {};
  const errors = [];
  const name = typeof entry.name === 'string' ? entry.name.trim() : '';
  const issuer = typeof entry.issuer === 'string' ? entry.issuer.trim() : null;
  const issued_on = typeof entry.issued_on === 'string' ? entry.issued_on.trim() : '';
  const expires_on = typeof entry.expires_on === 'string' ? entry.expires_on.trim() : '';

  if (!name || name.length > 120) {
    errors.push({ field: 'name', message: 'Certification name is required (max 120 chars)' });
  }
  if (issuer && issuer.length > 120) {
    errors.push({ field: 'issuer', message: 'Issuer must be at most 120 characters' });
  }
  for (const [field, value] of [
    ['issued_on', issued_on],
    ['expires_on', expires_on],
  ]) {
    if (value && !isValidDate(value)) {
      errors.push({ field, message: `${field} must be a valid date (YYYY-MM-DD)` });
    }
  }
  if (
    !errors.some((e) => e.field === 'issued_on') &&
    !errors.some((e) => e.field === 'expires_on') &&
    issued_on &&
    expires_on &&
    expires_on < issued_on
  ) {
    errors.push({ field: 'expires_on', message: 'expires_on cannot be before issued_on' });
  }

  return {
    errors,
    certification: errors.length
      ? null
      : {
          name,
          issuer: issuer || null,
          issued_on: issued_on || null,
          expires_on: expires_on || null,
        },
  };
}

/** Route params (:skillId / :certificationId) must be positive integers. */
export function parseResourceId(raw) {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
