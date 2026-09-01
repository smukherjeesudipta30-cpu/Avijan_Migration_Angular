/**
 * The walk-in enquiry register.
 *
 * Distinct from `Enquiry` in `dashboard.model.ts`, which is the public website's
 * "Send Us Message" form. This one is typed by a receptionist at the counter and
 * is followed up over days or weeks.
 */

/** Where an enquiry has got to. Mirrors `CourseEnquiryStatus` on the server. */
export type EnquiryStatus = 'New' | 'Following' | 'Converted' | 'NotInterested';

export interface CourseEnquiry {
  id: number;
  studentName: string;
  phone: string;
  address?: string;
  courseId?: number;
  courseName?: string;
  remarks?: string;
  enquiryDate: string;
  status: EnquiryStatus;
  nextFollowUpOn?: string;
  lastFollowUpOn?: string;
  followUpCount: number;
  branchId?: number;
  branchName?: string;
  convertedStudentRegistrationId?: string;

  /** Open, and the follow-up date has arrived. Decided by the server. */
  isDue: boolean;

  createdBy?: string;
  createdOn: string;
}

export interface CourseEnquirySaveRequest {
  studentName: string;
  phone: string;
  address?: string | null;
  courseId?: number | null;
  remarks?: string | null;
  enquiryDate?: string | null;
  nextFollowUpOn?: string | null;
  branchId?: number | null;
}

/** Recording a call. Separate from the save so a call cannot overwrite the address. */
export interface CourseEnquiryFollowUpRequest {
  status: EnquiryStatus;
  remarks?: string | null;
  nextFollowUpOn?: string | null;
  convertedStudentRegistrationId?: string | null;
}

export interface EnquiryTotals {
  total: number;
  new: number;
  following: number;
  converted: number;
  notInterested: number;
  /** Open and past their follow-up date. */
  due: number;
  conversionRate: number;
}

export interface EnquiryCourseTotal {
  courseId?: number;
  courseName: string;
  enquiries: number;
  converted: number;
}

export interface EnquiryReport {
  rows: CourseEnquiry[];
  totals: EnquiryTotals;
  byCourse: EnquiryCourseTotal[];
  fromDate?: string;
  toDate?: string;
}
