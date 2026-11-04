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
