/** Staff attendance by QR scan, fenced to the centre's own location. */

export interface AttendanceQr {
  branchId: number;
  branchName?: string;
  /** The URL encoded into the QR. Everything needed to scan is in it. */
  scanUrl: string;
  expiresOn: string;
  secondsValid: number;
}

export interface AttendanceScanRequest {
  token: string;
  latitude: number;
  longitude: number;
  accuracyMetres?: number;
}

/**
 * A mark that is accepted but waiting for the six-digit code emailed to the staff
 * member. Nothing is written to attendance until the code is confirmed.
 */
export interface AttendanceChallenge {
  challengeId: number;
  /** Partly hidden — enough to recognise, not enough to read out. */
  sentTo: string;
  markedOn: string;
  direction: string;
  branch?: string;
  expiresOn: string;
  message: string;
}

export interface AttendanceScanResult {
  staffName: string;
  staffType: string;
  branch?: string;
  /** 'In' or 'Out' — decided by the server, never by this app. */
  direction: string;
  scannedOn: string;
  distanceMetres: number;
  hoursToday?: number;
  message: string;
}

export interface AttendanceScanRow {
  direction: string;
  scannedOn: string;
  distanceMetres?: number;
}

export interface MyAttendance {
  staffName: string;
  staffType: string;
  onDate: string;
  firstIn?: string;
  lastOut?: string;
  isCurrentlyIn: boolean;
  hoursToday?: number;
  /** Minutes left to scan out before the day is written off as leave. */
  minutesLeftToScanOut?: number;
  countedAsLeave: boolean;
  scans: AttendanceScanRow[];
}

/* ------------------------------------------------------------- reporting */

export type AttendanceGrouping = 'Day' | 'Month' | 'Year';

export interface AttendanceReportRow {
  staffType: string;
  staffId: number;
  staffName?: string;
  periodLabel: string;
  periodStart: string;
  daysPresent: number;
  daysAbsent: number;
  totalHours: number;
  averageHoursPerPresentDay: number;
  /** Days lost because nobody scanned out — present, but counted as leave. */
  daysMissingScanOut: number;
}

export interface AttendanceDayRow {
  onDate: string;
  staffType: string;
  staffId: number;
  staffName?: string;
  branch?: string;
  firstIn?: string;
  lastOut?: string;
  hours?: number;
  missingScanOut: boolean;
  countedAsLeave: boolean;
  /** A teacher's finished day under the minimum hours (3), counted as absent. */
  shortHours?: boolean;
  stillOpen: boolean;
  /** Every separate In/Out visit that day. More than one is why "First in" to
   *  "Last out" can span far longer than Hours — the person left and came back. */
  visits: AttendanceVisit[];
}

export interface AttendanceVisit {
  in: string;
  out?: string;
  hours?: number;
}

export interface AttendanceReport {
  from: string;
  to: string;
  groupBy: string;
  rows: AttendanceReportRow[];
  days: AttendanceDayRow[];
  staffCount: number;
  totalHours: number;
  generatedOn: string;
}

/* ------------------------------------------------------------------ rota */

export interface AttendanceShift {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  scanOutBy: string;
  isActive: boolean;
}

export interface RotaLine {
  dayOfWeek: number;
  dayName: string;
  shiftId: number;
  shiftName: string;
}

export interface StaffRota {
  staffType: string;
  staffId: number;
  staffName: string;
  branch?: string;
  /** False when no sign-in exists for them — they could not scan even if rostered. */
  canSignIn: boolean;
  lines: RotaLine[];
}

export interface SaveRotaRequest {
  staffType: string;
  staffId: number;
  lines: { dayOfWeek: number; shiftId: number }[];
}
