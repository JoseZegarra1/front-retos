import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/*
 * Reglas de validacion compartidas. Son las mismas que aplica el backend en web/Dtos.java;
 * si cambias una, cambia la otra. El frontend solo ayuda al usuario: la barrera real es el backend.
 */

/** Letras (con tildes, ñ, ü), separadas por un solo espacio, apóstrofo o guion. */
export const FULL_NAME_RE = /^[\p{L}\p{M}]+(?:[ '\-][\p{L}\p{M}]+)*$/u;
export const USERNAME_RE = /^[A-Za-z0-9._-]+$/;
export const EMAIL_RE =
  /^[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

/** Nombre completo: caracteres permitidos, sin espacios al inicio/fin ni dobles. */
export const fullNameValidator: ValidatorFn = (c) => {
  const v: string = c.value ?? '';
  if (!v) return null;
  if (v !== v.trim()) return { edgeSpaces: true };
  if (/\s{2,}/.test(v)) return { doubleSpaces: true };
  return FULL_NAME_RE.test(v) ? null : { fullNameChars: true };
};

/** Correo estricto (más que Validators.email, que acepta `a@b`). */
export const strictEmailValidator: ValidatorFn = (c) => {
  const v: string = (c.value ?? '').trim();
  if (!v) return null;
  return EMAIL_RE.test(v) ? null : { strictEmail: true };
};

/** Política: 8+ caracteres, mayúscula, minúscula, número, especial, sin espacios. Vacío = válido. */
export const passwordPolicyValidator: ValidatorFn = (c) => {
  const v: string = c.value ?? '';
  if (!v) return null;
  const errors: ValidationErrors = {};
  if (v.length < 8) errors['pwMin'] = true;
  if (v.length > 100) errors['pwMax'] = true;
  if (!/\p{Ll}/u.test(v)) errors['pwLower'] = true;
  if (!/\p{Lu}/u.test(v)) errors['pwUpper'] = true;
  if (!/\p{N}/u.test(v)) errors['pwDigit'] = true;
  if (!/[^\p{L}\p{N}\s]/u.test(v)) errors['pwSpecial'] = true;
  if (/\s/.test(v)) errors['pwSpaces'] = true;
  return Object.keys(errors).length ? errors : null;
};

/** Validador de grupo: `field` debe ser igual a `other`. El error se pone en `field`. */
export function matchValidator(field: string, other: string): ValidatorFn {
  return (group: AbstractControl) => {
    const a = group.get(field);
    const b = group.get(other);
    if (!a || !b) return null;
    const mismatch = !!a.value && a.value !== b.value;
    setOwnError(a, 'mismatch', mismatch);
    return null;
  };
}

/** Validador de grupo: `field` debe ser distinto de `other`. */
export function differentValidator(field: string, other: string): ValidatorFn {
  return (group: AbstractControl) => {
    const a = group.get(field);
    const b = group.get(other);
    if (!a || !b) return null;
    setOwnError(a, 'sameAsCurrent', !!a.value && a.value === b.value);
    return null;
  };
}

function setOwnError(ctrl: AbstractControl, key: string, on: boolean): void {
  const errors = { ...(ctrl.errors ?? {}) };
  if (on) {
    errors[key] = true;
  } else {
    delete errors[key];
  }
  ctrl.setErrors(Object.keys(errors).length ? errors : null);
}

export const PASSWORD_MESSAGES: Record<string, string> = {
  pwMin: 'Debe tener al menos 8 caracteres.',
  pwMax: 'No puede exceder 100 caracteres.',
  pwUpper: 'Debe incluir al menos una mayúscula.',
  pwLower: 'Debe incluir al menos una minúscula.',
  pwDigit: 'Debe incluir al menos un número.',
  pwSpecial: 'Debe incluir al menos un carácter especial (por ejemplo ! # $ %).',
  pwSpaces: 'No puede contener espacios.',
};

/** Primer mensaje de error visible del control, o null si es válido o aún no se ha tocado. */
export function firstError(
  ctrl: AbstractControl | null,
  messages: Record<string, string>,
  force = false,
): string | null {
  if (!ctrl || !ctrl.errors || !(ctrl.touched || ctrl.dirty || force)) return null;
  for (const key of Object.keys(messages)) {
    if (ctrl.errors[key]) return messages[key];
  }
  return null;
}

export interface PasswordStrength {
  score: number; // 0..4
  label: string;
}

export function passwordStrength(v: string): PasswordStrength {
  if (!v) return { score: 0, label: '' };
  let points = 0;
  if (v.length >= 8) points++;
  if (v.length >= 12) points++;
  if (/\p{Ll}/u.test(v) && /\p{Lu}/u.test(v)) points++;
  if (/\p{N}/u.test(v)) points++;
  if (/[^\p{L}\p{N}\s]/u.test(v)) points++;
  const score = Math.min(4, Math.max(1, points - 1));
  return { score, label: ['', 'Débil', 'Media', 'Fuerte', 'Muy fuerte'][score] };
}

/** Valida un archivo .zip antes de subirlo. Devuelve el mensaje de error o null. */
export function zipFileError(file: File | null | undefined, maxBytes: number): string | null {
  if (!file) return 'Selecciona un archivo .zip.';
  if (!file.name.toLowerCase().endsWith('.zip')) return 'El archivo debe tener extensión .zip.';
  if (file.size === 0) return 'El archivo está vacío.';
  if (file.size > maxBytes) {
    return `El archivo pesa ${formatBytes(file.size)} y supera el máximo permitido de ${formatBytes(maxBytes)}.`;
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** 180 -> "3 h", 90 -> "1 h 30 min", 45 -> "45 min". */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
