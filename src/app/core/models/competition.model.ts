/** A drawing division (by class) or a dance group (by age). */
export interface CompetitionGroup {
  id: number;
  kind: 'Drawing' | 'Dance';
  code: string;
  labelEnglish: string;
  labelBengali?: string;
  minAge?: number;
  maxAge?: number;
  minClass?: number;
  maxClass?: number;

  /** How many may enter — 30, 30, 15 for the dance groups. Absent for drawing. */
  capacity?: number;

  sortOrder: number;
}

export interface CompetitionOrganiser {
  id: number;
  name: string;
  designation?: string;
  phone?: string;
  sortOrder: number;
  isActive: boolean;
}

/** The advertisement as the public sees it, in both languages. */
export interface CompetitionPublic {
  competitionId: number;
  year: number;
  eventDate?: string;
  venue?: string;
  venueBengali?: string;

  drawingFee: number;
  danceFee: number;

  drawingStartTime?: string;
  danceStartTime?: string;
  prizeGivingTime?: string;

  noticeEnglish?: string;
  noticeBengali?: string;
  /* Separate lists: a drawing entrant should not have to read past the dance
     rules to find theirs. */
  drawingRulesEnglish?: string;
  drawingRulesBengali?: string;
  danceRulesEnglish?: string;
  danceRulesBengali?: string;

  contactPhones?: string;

  /** The institute's UPI id, for the QR. Absent disables online payment. */
  upiId?: string;
  payeeName?: string;

  /** False when registration has closed; the form is then not offered. */
  isOpen: boolean;
  registrationOpensOn?: string;
  registrationClosesOn?: string;

  drawingDivisions: CompetitionGroup[];
  danceGroups: CompetitionGroup[];
  organisers: CompetitionOrganiser[];

  /** True when a poster has been uploaded for that competition. */
  hasDrawingAdvert: boolean;
  hasDanceAdvert: boolean;
}

export interface CompetitionUpload {
  fileName: string;
  contentType: string;
  base64: string;
}

export interface CompetitionRegisterRequest {
  participantName: string;
  guardianName: string | null;
  dateOfBirth: string | null;
  schoolName: string | null;
  className: string | null;
  phone: string;
  email: string | null;
  address: string | null;

  drawingGroupId: number | null;
  danceGroupId: number | null;

  paymentMode: 'Online' | 'Venue';
  transactionRef: string | null;

  photo: CompetitionUpload | null;
  schoolId: CompetitionUpload | null;
  birthCertificate: CompetitionUpload | null;
  paymentSlip: CompetitionUpload | null;

  rulesAccepted: boolean;

  /** The registration code from a save-and-resume draft, if this continues one. */
  draftCode: string | null;
}

/* -------------------------------------------------------- save and resume */

export interface CompetitionDraftStartRequest {
  participantName: string;
  phone: string;
  email: string;
  password: string;
}

export interface CompetitionDraftStarted {
  registrationCode: string;
  participantName: string;
}

export interface CompetitionDraftLoginRequest {
  registrationCode: string;
  password: string;
}

export interface CompetitionDraft {
  registrationCode: string;
  competitionId: number;
  participantName: string;
  phone: string;
  status: 'Draft' | 'Completed';
}

export interface CompetitionDraftChangePasswordRequest {
  registrationCode: string;
  currentPassword: string;
  newPassword: string;
}

export interface CompetitionDraftForgotPasswordRequest {
  registrationCode: string;
}

export interface CompetitionDraftResetPasswordRequest {
  registrationCode: string;
  code: string;
  newPassword: string;
}

/** One row of the office's follow-up list for started-but-unfinished registrations. */
export interface CompetitionDraftRow {
  registrationCode: string;
  participantName: string;
  phone: string;
  status: 'Draft' | 'Completed';
  createdOn: string;
  lastAccessedOn?: string;
}

export interface CompetitionEntry {
  kind: 'Drawing' | 'Dance';
  registrationNo: string;
  groupCode?: string;
  groupLabel?: string;

  /** The chest number a dancer prints and pins on. Absent for drawing. */
  batchNo?: number;
}

export interface CompetitionRegistered {
  applicantId: number;
  participantName: string;
  amount: number;
  paymentMode: string;
  paymentStatus: string;
  entries: CompetitionEntry[];
  message: string;
}

/* ------------------------------------------------------------ the office */

export interface CompetitionReportRow {
  applicantId: number;
  registrationNo: string;
  kind: 'Drawing' | 'Dance';
  groupCode?: string;
  groupLabel?: string;

  /** The dancer's chest number. Absent for drawing. */
  batchNo?: number;

  participantName: string;
  guardianName?: string;
  dateOfBirth?: string;
  age?: number;
  schoolName?: string;
  className?: string;
  phone: string;
  email?: string;

  amount: number;
  paymentMode: string;
  paymentStatus: string;
  transactionRef?: string;

  /** Why the office cancelled it, when it did. */
  cancelReason?: string;

  confirmedBy?: string;
  confirmedOn?: string;
  submittedOn: string;

  hasPhoto: boolean;
  hasSchoolId: boolean;
  hasBirthCertificate: boolean;
  hasPaymentSlip: boolean;
}

export interface CompetitionReport {
  year: number;
  availableYears: number[];
  rows: CompetitionReportRow[];

  drawingCount: number;
  danceCount: number;
  pendingCount: number;
  totalCollected: number;

  /** Still to be taken at the desk on the day. */
  totalDueAtVenue: number;

  generatedOn: string;
}

export interface CompetitionSaveRequest {
  year: number;
  eventDate: string | null;
  venue: string | null;
  venueBengali: string | null;

  drawingFee: number;
  danceFee: number;

  drawingStartTime: string | null;
  danceStartTime: string | null;
  prizeGivingTime: string | null;

  noticeEnglish: string | null;
  noticeBengali: string | null;
  drawingRulesEnglish: string | null;
  drawingRulesBengali: string | null;
  danceRulesEnglish: string | null;
  danceRulesBengali: string | null;

  registrationOpensOn: string | null;
  registrationClosesOn: string | null;

  contactPhones: string | null;
  isActive: boolean;
}

export interface CompetitionOrganiserSaveRequest {
  name: string;
  designation: string | null;
  phone: string | null;
  sortOrder: number;
  isActive: boolean;
}
