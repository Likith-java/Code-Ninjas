import { PROFILE_ADMIN_FIELDS, PROFILE_SELF_FIELDS } from '../validators/profile.validator.js';

// ---------------------------------------------------------------------------
// Employee Profile DTOs.
//
// Three distinct response shapes, chosen server-side by the caller's relation
// to the record — never by client-side filtering:
//
//   OwnProfileDto            viewer is the record owner (employee)
//   OtherEmployeeProfileDto  any authenticated user viewing someone else;
//                            strictly read-only public content
//   AdminProfileDto          manager-role viewers; full profile incl. the
//                            security/account block
//
// Sensitive material (resume bytes/metadata, bank details, identifiers, login
// id, account state) only ever enters the DTO the caller is authorized to
// receive. password_hash has no representation anywhere here.
// ---------------------------------------------------------------------------

const SELF_EDITABLE_FIELDS = [...PROFILE_SELF_FIELDS];
const ADMIN_EDITABLE_FIELDS = [...PROFILE_SELF_FIELDS, ...PROFILE_ADMIN_FIELDS];

function baseCard(employee) {
  return {
    id: employee.id,
    first_name: employee.first_name,
    last_name: employee.last_name,
    full_name: `${employee.first_name} ${employee.last_name}`.trim(),
    position: employee.position,
    department: employee.department,
    avatar_url: employee.avatar_url ?? null,
  };
}

function jobDetails(employee, managerRow) {
  return {
    position: employee.position,
    company: employee.company ?? null,
    department: employee.department,
    location: employee.location ?? null,
    manager: managerRow
      ? {
          id: managerRow.id,
          full_name: `${managerRow.first_name} ${managerRow.last_name}`.trim(),
        }
      : null,
    hired_at: employee.hired_at,
  };
}

function privateInfo(employee, profile, account) {
  return {
    // Contact -----------------------------------------------------------------
    phone: employee.phone ?? null,
    email: employee.email,
    personal_email: profile?.personal_email ?? null,
    address: profile?.address ?? null,
    // Personal ----------------------------------------------------------------
    date_of_birth: profile?.date_of_birth ?? null,
    gender: profile?.gender ?? null,
    nationality: profile?.nationality ?? null,
    marital_status: profile?.marital_status ?? null,
    // Account linkage (display-only; changes go through security endpoints) ---
    login_id: account?.login_id ?? null,
    // Bank details --------------------------------------------------------------
    bank_details: {
      bank_name: profile?.bank_name ?? null,
      account_number: profile?.bank_account_number ?? null,
      ifsc_code: profile?.bank_ifsc ?? null,
    },
    // Protected identifiers (admin-editable only) --------------------------------
    identifiers: {
      employee_code: employee.employee_code ?? null,
      pan: employee.pan ?? null,
      uan: employee.uan ?? null,
    },
  };
}

function resumeInfo(profile) {
  return {
    text: profile?.resume_text ?? null,
    pdf_name: profile?.resume_pdf_name ?? null,
    pdf_size: profile?.resume_pdf_size ?? null,
    has_pdf: Boolean(profile?.resume_pdf),
  };
}

/**
 * @param {object} record assembled by the service layer:
 *   { employee, profile, skills, certifications, manager, account, status }
 */
export function serializeOwnProfile(record) {
  const { employee, profile, skills, certifications, manager, account, status } = record;
  return {
    ...baseCard(employee),
    status,
    viewer: 'self',
    can_edit: true,
    editable_fields: SELF_EDITABLE_FIELDS,
    job_details: jobDetails(employee, manager),
    private_info: privateInfo(employee, profile, account),
    about: profile?.about ?? null,
    love_about_job: profile?.love_about_job ?? null,
    resume: resumeInfo(profile),
    skills,
    certifications,
  };
}

export function serializeOtherEmployeeProfile(record) {
  const { employee, profile, skills, certifications, status } = record;
  return {
    ...baseCard(employee),
    status,
    viewer: 'other',
    can_edit: false,
    editable_fields: [],
    hired_at: employee.hired_at,
    about: profile?.about ?? null,
    love_about_job: profile?.love_about_job ?? null,
    skills,
    certifications,
  };
}

export function serializeAdminProfile(record) {
  const { employee, profile, skills, certifications, manager, account, status } = record;
  return {
    ...baseCard(employee),
    status,
    viewer: 'manager',
    can_edit: true,
    editable_fields: ADMIN_EDITABLE_FIELDS,
    created_at: employee.created_at,
    updated_at: employee.updated_at,
    job_details: jobDetails(employee, manager),
    private_info: privateInfo(employee, profile, account),
    about: profile?.about ?? null,
    love_about_job: profile?.love_about_job ?? null,
    resume: resumeInfo(profile),
    skills,
    certifications,
    // Security / account administration section (manager-role callers only).
    security: account
      ? {
          user_id: account.user_id,
          employee_id: employee.id,
          login_id: account.login_id,
          email: account.email,
          role: account.role,
          account_status: account.account_status,
          must_change_password: Boolean(account.must_change_password),
          last_login_at: account.last_login_at,
          created_at: account.created_at,
        }
      : null,
  };
}

/**
 * Dispatch to the correct DTO from the caller's relation to the target
 * ('manager' | 'self' | 'other'), resolved by the service layer from the
 * database-backed role — never from token claims.
 */
export function serializeProfileFor(actor, record) {
  const actorEmployeeId = Number(actor?.employee_id);
  if (actor && ['admin', 'hr'].includes(String(actor.role))) {
    return serializeAdminProfile(record);
  }
  if (Number.isInteger(actorEmployeeId) && actorEmployeeId === Number(record.employee.id)) {
    return serializeOwnProfile(record);
  }
  return serializeOtherEmployeeProfile(record);
}
