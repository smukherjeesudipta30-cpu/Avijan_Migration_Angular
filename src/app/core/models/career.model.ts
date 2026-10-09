/** A job vacancy as the public site and Admin see it. Times are "HH:mm:ss". */
export interface Vacancy {
  id: number;
  title: string;
  branch: string;
  shiftName?: string | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  workingDays?: string | null;
  qualification: string;
  experience?: string | null;
  salary?: string | null;
  description?: string | null;
  openings: number;
  closesOn?: string | null;
  isActive: boolean;
  /** Admin only. */
  applications?: number;
  newApplications?: number;
}

export interface VacancySave {
  title: string;
  branch: string;
  shiftName: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  workingDays: string | null;
  qualification: string;
  experience: string | null;
  salary: string | null;
  description: string | null;
  openings: number;
  closesOn: string | null;
  isActive: boolean;
}

export interface CareerUpload {
  fileName: string;
  contentType: string;
  base64: string;
}

export interface JobApply {
  name: string;
  phone: string;
  email: string | null;
  qualification: string;
  experience: string | null;
  address: string | null;
  message: string | null;
  cv: CareerUpload | null;
  photo: CareerUpload | null;
}

export type JobApplicationStatus = 'New' | 'Shortlisted' | 'Interviewed' | 'Hired' | 'Rejected';

export interface JobApplication {
  id: number;
  vacancyId: number;
  vacancyTitle: string;
  branch: string;
  name: string;
  phone: string;
  email?: string | null;
  qualification: string;
  experience?: string | null;
  address?: string | null;
  message?: string | null;
  cvFileName?: string | null;
  status: JobApplicationStatus;
  adminNote?: string | null;
  appliedOn: string;
  reviewedBy?: string | null;
  reviewedOn?: string | null;
}

/** The public careers page, for sharing on Facebook, Instagram and WhatsApp. */
export const CAREERS_URL = 'https://www.avijan.in/careers';

/** Avijan's own pages, where vacancies are also advertised. */
export const AVIJAN_INSTAGRAM = 'https://www.instagram.com/avijan.c/';
export const AVIJAN_FACEBOOK = 'https://www.facebook.com/share/1brUSoLU58/';

/** The posts Admin usually advertises; any other can be typed in. */
export const JOB_POSTS = ['Receptionist', 'Teacher'];

/** Shown when Admin leaves the salary blank — no figure is advertised. */
export const SALARY_NORMS = 'As per institute norms';

/**
 * What is open, for headlines: "Teacher" for a single vacancy, otherwise the
 * posts in plural — "Teachers & Receptionists".
 */
export function hiringHeadline(list: Pick<Vacancy, 'title'>[]): string {
  const posts = [...new Set(list.map(v => v.title.trim()))];
  if (list.length === 1) return posts[0];
  const plural = posts.map(p => (/s$/i.test(p) ? p : p + 's'));
  return plural.length > 1 ? plural.slice(0, -1).join(', ') + ' & ' + plural[plural.length - 1] : plural[0];
}

/** "09:00:00" -> "9:00 AM". */
export function shiftTime(t?: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function shiftLabel(v: Pick<Vacancy, 'shiftName' | 'shiftStart' | 'shiftEnd'>): string {
  const time = v.shiftStart && v.shiftEnd ? `${shiftTime(v.shiftStart)} – ${shiftTime(v.shiftEnd)}` : '';
  return [v.shiftName ? `${v.shiftName} shift` : '', time].filter(Boolean).join(' · ');
}
