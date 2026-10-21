export type Role = 'USER' | 'ADMIN' | 'GHD';
export type Track = 'DEVOPS' | 'DATA';
export type Level = 'PRINCIPIANTE' | 'COMPETENTE' | 'PROFICIENTE' | 'MASTER';
export type ChallengeStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED' | 'GRADED';
export type GradeResult = 'APTO' | 'NO_APTO';

export interface User {
  id: number;
  username: string;
  fullName: string;
  email: string | null;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface CreateUserRequest {
  username: string;
  fullName: string;
  email: string | null;
  password: string | null;
  role: Role;
}

export interface CreateUserResponse {
  user: User;
  temporaryPassword: string | null;
}

export interface Challenge {
  id: number;
  candidateId: number;
  candidateName: string;
  candidateUsername: string;
  track: Track;
  level: Level;
  status: ChallengeStatus;
  durationMinutes: number;
  assignedAt: string;
  startedAt: string | null;
  deadlineAt: string | null;
  submittedAt: string | null;
  remainingSeconds: number;
  hasSubmission: boolean;
  result: GradeResult | null;
  gradeComment: string | null;
  gradedByName: string | null;
  gradedAt: string | null;
}

/** GET /api/settings: límites que el backend aplica (MAX_UPLOAD y duración del reto). */
export interface AppSettings {
  maxUploadBytes: number;
  defaultDurationMinutes: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  maxUploadBytes: 200 * 1024 * 1024,
  defaultDurationMinutes: 180,
  minDurationMinutes: 15,
  maxDurationMinutes: 480,
};

export const TRACK_LABEL: Record<Track, string> = { DEVOPS: 'DevOps', DATA: 'Data' };

export const LEVEL_LABEL: Record<Level, string> = {
  PRINCIPIANTE: 'Principiante',
  COMPETENTE: 'Competente',
  PROFICIENTE: 'Proficiente',
  MASTER: 'Master',
};

export const STATUS_LABEL: Record<ChallengeStatus, string> = {
  ASSIGNED: 'Asignado',
  IN_PROGRESS: 'En curso',
  SUBMITTED: 'Entregado',
  EXPIRED: 'Vencido',
  GRADED: 'Calificado',
};

export const ROLE_LABEL: Record<Role, string> = {
  USER: 'Usuario',
  ADMIN: 'Administrador',
  GHD: 'GHD',
};
