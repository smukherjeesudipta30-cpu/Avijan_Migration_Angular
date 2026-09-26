import { ReferrerType } from './student.model';

/** From MinFee upward the referrer earns Percent of the admission fee collected. */
export interface ReferralSlab {
  minFee: number;
  percent: number;
}

export interface ReferralSettings {
  slabs: ReferralSlab[];
  modifiedBy?: string;
  modifiedOn?: string;
}

/** A teacher or receptionist who can be named as a student's referrer. */
export interface ReferrerOption {
  type: ReferrerType;
  id: number;
  name: string;
  branch?: string;
}
