const DEPARTMENTS = ['Design', 'Product', 'Engineering', 'Human Resources', 'Marketing', 'Finance'];
const STATUSES = ['active', 'on_leave'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s\-()]{5,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value) {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime());
}

function str(v) {
  return typeof v === 'string' ? v.trim() : v;
}

function optionalStr(value, maxLength) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (maxLength && trimmed.length > maxLength) return undefined;
  return trimmed;
}

export function validateEmployee(body, { currentId = null } = {}) {
  const errors = [];

  const fields = {
    first_name: str(body.first_name),
    last_name: str(body.last_name),
    email: str(body.email),
    position: str(body.position),
    department: str(body.department),
    phone: str(body.phone) ?? null,
    avatar_url: str(body.avatar_url) ?? null,
    status: body.status === undefined ? 'active' : body.status,
    hired_at: str(body.hired_at) ?? null,
  };

  for (const key of ['first_name', 'last_name', 'email', 'position', 'department']) {
    if (!fields[key]) errors.push({ field: key, message: `${key} is required` });
  }
  if (fields.email && !EMAIL_RE.test(fields.email)) {
    errors.push({ field: 'email', message: 'Email is not valid' });
  }
  if (fields.department && !DEPARTMENTS.includes(fields.department)) {
    errors.push({
      field: 'department',
      message: `Department must be one of: ${DEPARTMENTS.join(', ')}`,
    });
  }
  if (fields.status !== undefined && !STATUSES.includes(fields.status)) {
    errors.push({ field: 'status', message: `Status must be one of: ${STATUSES.join(', ')}` });
  }
  if (fields.phone && !PHONE_RE.test(fields.phone)) {
    errors.push({ field: 'phone', message: 'Phone number is not valid' });
  }
  if (fields.hired_at && !isValidDate(fields.hired_at)) {
    errors.push({ field: 'hired_at', message: 'Hiring date must be a valid date (YYYY-MM-DD)' });
  }

  return { errors, fields };
}

export function validateProfileFields(body) {
  const errors = [];
  const fields = {};

  if (body.date_of_birth !== undefined) {
    const dob = optionalStr(body.date_of_birth);
    if (dob === undefined || (dob !== null && !isValidDate(dob))) {
      errors.push({ field: 'date_of_birth', message: 'Date of birth must be a valid date (YYYY-MM-DD)' });
    } else {
      fields.date_of_birth = dob;
    }
  }

  if (body.address !== undefined) {
    const address = optionalStr(body.address, 500);
    if (address === undefined) {
      errors.push({ field: 'address', message: 'Address must be a string of at most 500 characters' });
    } else {
      fields.address = address;
    }
  }

  if (body.about !== undefined) {
    const about = optionalStr(body.about, 5000);
    if (about === undefined) {
      errors.push({ field: 'about', message: 'About must be a string of at most 5000 characters' });
    } else {
      fields.about = about;
    }
  }

  return { errors, fields };
}

export function validateSkillsPayload(body) {
  const raw = body?.skills;
  if (!Array.isArray(raw)) {
    return { errors: [{ field: 'skills', message: 'skills must be an array of strings' }], skills: [] };
  }
  if (raw.length > 50) {
    return { errors: [{ field: 'skills', message: 'A maximum of 50 skills is allowed' }], skills: [] };
  }
  const errors = [];
  const skills = [];
  const seen = new Set();
  for (const item of raw) {
    const name = typeof item === 'string' ? item.trim() : '';
    if (!name || name.length > 60) {
      errors.push({ field: 'skills', message: 'Each skill must be a non-empty string of at most 60 characters' });
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      errors.push({ field: 'skills', message: `Duplicate skill: ${name}` });
      continue;
    }
    seen.add(key);
    skills.push(name);
  }
  return { errors, skills };
}

export function validateCertificationsPayload(body) {
  const raw = body?.certifications;
  if (!Array.isArray(raw)) {
    return {
      errors: [{ field: 'certifications', message: 'certifications must be an array of objects' }],
      certifications: [],
    };
  }
  if (raw.length > 50) {
    return {
      errors: [{ field: 'certifications', message: 'A maximum of 50 certifications is allowed' }],
      certifications: [],
    };
  }
  const errors = [];
  const certifications = [];
  raw.forEach((item, index) => {
    const entry = typeof item === 'object' && item !== null ? item : {};
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    const issuer = typeof entry.issuer === 'string' ? entry.issuer.trim() : null;
    const issued_on = typeof entry.issued_on === 'string' ? entry.issued_on.trim() : null;
    const expires_on = typeof entry.expires_on === 'string' ? entry.expires_on.trim() : null;

    if (!name || name.length > 120) {
      errors.push({ field: `certifications[${index}].name`, message: 'Certification name is required (max 120 chars)' });
    }
    if (issuer && issuer.length > 120) {
      errors.push({ field: `certifications[${index}].issuer`, message: 'Issuer must be at most 120 characters' });
    }
    for (const [field, value] of [['issued_on', issued_on], ['expires_on', expires_on]]) {
      if (value !== null && !isValidDate(value)) {
        errors.push({ field: `certifications[${index}].${field}`, message: `${field} must be a valid date (YYYY-MM-DD)` });
      }
    }
    if (name) certifications.push({ name, issuer, issued_on, expires_on });
  });
  return { errors, certifications };
}

const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_PDF_BYTES / 3) * 4;

export function validateResumePayload(body) {
  const errors = [];
  const result = { resume_text: undefined, resume_pdf: undefined, resume_pdf_name: undefined };

  if (body.resume_text !== undefined) {
    const text = optionalStr(body.resume_text, 20000);
    if (text === undefined) {
      errors.push({ field: 'resume_text', message: 'resume_text must be a string of at most 20000 characters' });
    } else {
      result.resume_text = text;
    }
  }

  if (body.resume_pdf_base64 !== undefined) {
    const provided = body.resume_pdf_base64;
    if (provided === null || provided === '') {
      result.resume_pdf = null;
      result.resume_pdf_name = null;
    } else if (typeof provided !== 'string') {
      errors.push({ field: 'resume_pdf_base64', message: 'resume_pdf_base64 must be a base64 string or null' });
    } else {
      let buffer = null;
      try {
        buffer = Buffer.from(provided, 'base64');
      } catch {
        buffer = null;
      }
      if (!buffer || buffer.length === 0) {
        errors.push({ field: 'resume_pdf_base64', message: 'resume_pdf_base64 is not valid base64' });
      } else if (buffer.length > MAX_PDF_BYTES) {
        errors.push({ field: 'resume_pdf_base64', message: 'PDF must be 5 MB or smaller' });
      } else if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
        errors.push({ field: 'resume_pdf_base64', message: 'File does not look like a PDF document' });
      } else {
        result.resume_pdf = buffer;
        const name = typeof body.resume_pdf_name === 'string' ? body.resume_pdf_name.trim() : '';
        result.resume_pdf_name = name ? name.slice(0, 200) : 'resume.pdf';
      }
    }
  }

  if (body.resume_pdf_base64 === undefined && typeof body.resume_pdf_name === 'string') {
    const name = body.resume_pdf_name.trim();
    if (name) result.resume_pdf_name = name.slice(0, 200);
  }

  return { errors, ...result, maxBytes: MAX_PDF_BYTES, maxBase64Length: MAX_BASE64_LENGTH };
}

export { DEPARTMENTS, STATUSES };
