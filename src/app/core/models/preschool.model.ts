/** Avijan PreSchool masters, as the API's PreSchoolController returns them. */

export interface PreSchoolSubject {
  id: number;
  classId: number;
  name: string;
  maxMarks: number;
  sortOrder: number;
  isActive: boolean;
}

export interface PreSchoolFeeHead {
  id: number;
  classId: number;
  name: string;
  monthlyAmount: number;
  sortOrder: number;
  isActive: boolean;
}

export interface PreSchoolClass {
  id: number;
  name: string;
  sortOrder: number;
  admissionFee: number;
  minAgeMonths: number | null;
  maxAgeMonths: number | null;
  isActive: boolean;
  /** Sum of the active monthly fee heads. */
  monthlyTotal: number;
  subjects: PreSchoolSubject[];
  feeHeads: PreSchoolFeeHead[];
}

export interface PreSchoolGradeBand {
  id: number;
  minPercent: number;
  grade: string;
  remark: string | null;
}

export interface PreSchoolSettings {
  schoolName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  mapUrl: string | null;
  uniformShopName: string | null;
  uniformShopAddress: string | null;
  uniformShopPhone: string | null;
  uniformShopMapUrl: string | null;
  receiptPrefix: string;
  /** The Champahati centre's opening day, "yyyy-MM-dd". */
  opensOn?: string | null;
  modifiedBy: string | null;
  modifiedOn: string | null;
}

export interface PreSchoolOverview {
  settings: PreSchoolSettings;
  classes: PreSchoolClass[];
  gradeBands: PreSchoolGradeBand[];
}

export interface PreSchoolClassSave {
  name: string;
  sortOrder: number;
  admissionFee: number;
  minAgeMonths: number | null;
  maxAgeMonths: number | null;
  isActive: boolean;
}

export interface PreSchoolSubjectSave {
  classId: number;
  name: string;
  maxMarks: number;
  sortOrder: number;
  isActive: boolean;
}

export interface PreSchoolFeeHeadSave {
  classId: number;
  name: string;
  monthlyAmount: number;
  sortOrder: number;
  isActive: boolean;
}

export interface PreSchoolGradeBandSave {
  minPercent: number;
  grade: string;
  remark: string | null;
}

export type PreSchoolSettingsSave = Omit<PreSchoolSettings, 'modifiedBy' | 'modifiedOn'>;

/** "2 yrs 6 mths" from months, for showing a class's age range. */
export function ageLabel(months: number | null | undefined): string {
  // The API leaves empty values out of its JSON, so "not set" arrives as undefined.
  if (months == null) return '';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years ? `${years} yr${years === 1 ? '' : 's'}` : '', rest ? `${rest} mth${rest === 1 ? '' : 's'}` : '']
    .filter(Boolean).join(' ') || '0 mths';
}

/** The public PreSchool page's data: active classes only, no staff details. */
export interface PreSchoolPublicClass {
  name: string;
  minAgeMonths?: number | null;
  maxAgeMonths?: number | null;
  admissionFee: number;
  monthlyTotal: number;
  subjects: string[];
}

export interface PreSchoolPublic {
  schoolName: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  mapUrl?: string | null;
  uniformShopName?: string | null;
  uniformShopAddress?: string | null;
  uniformShopPhone?: string | null;
  uniformShopMapUrl?: string | null;
  opensOn?: string | null;
  classes: PreSchoolPublicClass[];
  holidays: PreSchoolHoliday[];
}

export interface PreSchoolEnquirySave {
  childName: string;
  childDateOfBirth: string | null;
  parentName: string;
  phone: string;
  email: string | null;
  classWanted: string | null;
  message: string | null;
}

export interface PreSchoolEnquiry extends PreSchoolEnquirySave {
  id: number;
  createdOn: string;
  isHandled: boolean;
  handledBy?: string | null;
  handledOn?: string | null;
}

/** A PreSchool closure; dates are "yyyy-MM-dd" and the same for a single day. */
export interface PreSchoolHoliday {
  id: number;
  fromDate: string;
  toDate: string;
  title: string;
  note?: string | null;
}

export interface PreSchoolHolidaySave {
  fromDate: string;
  toDate: string | null;
  title: string;
  note: string | null;
}

/** Today as "yyyy-MM-dd" in local time. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}

/**
 * True while the Champahati centre has not opened: no opening day set yet, or
 * one still ahead. From the opening day on, the "coming soon" tagline goes.
 */
export function isComingSoon(opensOn: string | null | undefined): boolean {
  return !opensOn || opensOn > todayIso();
}
