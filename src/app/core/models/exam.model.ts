import { PagedResult } from './student.model';

/* ============================================================ admin: papers */

export type PaperType = 'Theory' | 'Practical';

export interface ExamPaper {
  examId: number;
  title: string;
  subject?: string;
  courseId?: number;
  courseName?: string;
  totalMarks: number;
  passMarks?: number;
  durationMinutes: number;
  opensOn?: string;
  closesOn?: string;
  isPublished: boolean;

  paperType: PaperType;
  /** Which examination of the course. Not capped. */
  termNumber: number;

  /** Always 0 for a practical — it carries no questions. */
  questionCount: number;
  /** Sum of the question marks; must equal totalMarks to publish a theory paper. */
  uploadedMarks: number;
  attemptCount: number;
  createdOn: string;

  /**
   * True when the other half of this examination exists — a theory paper's
   * practical, or a practical's theory, on the same course and term. Without it
   * the term can never be graded.
   */
  hasCounterpart: boolean;
}

export interface ExamPaperSaveRequest {
  title: string;
  subject: string | null;
  courseId: number | null;
  paperType: PaperType;
  termNumber: number;
  totalMarks: number;
  passMarks: number | null;
  durationMinutes: number;
  opensOn: string | null;
  closesOn: string | null;
}

/* ========================================================= admin: questions */

/** A question with its answer key — never sent to a student. */
export interface ExamQuestion {
  questionId: number;
  questionNo: number;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC?: string;
  optionD?: string;
  correctOption: string;
  marks: number;
}

export interface ExamUploadResult {
  examId: number;
  rowsRead: number;
  questionsSaved: number;
  uploadedMarks: number;
  paperTotalMarks: number;
  marksBalance: boolean;
  errors: string[];
}

/* ========================================================= practical marks */

export interface PracticalRosterRow {
  registrationId: string;
  studentName?: string;
  score?: number;
  totalMarks: number;
  enteredOn?: string;
  enteredBy?: string;
}

export interface PracticalMarkRequest {
  examId: number;
  registrationId: string;
  score: number;
}

/* ============================================ scheduling and access codes */

/** One student on a paper's scheduling sheet. Admin only — it carries the code. */
export interface ExamScheduleRow {
  registrationId: string;
  studentName?: string;
  guardianName?: string;

  scheduleId?: number;
  scheduledOn?: string;
  /** Six digits. Read out at the desk; never sent to the student. */
  accessCode?: string;
  codeIssuedOn?: string;
  codeIssuedBy?: string;

  hasAttempted: boolean;
  submittedOn?: string;

  /**
   * Still enrolled. The sheet lists only enrolled students, so this is false only
   * on someone kept on it because they already have a sitting here.
   */
  isActive: boolean;

  /** Has finished the course, and will not come in to sit anything. */
  isComplete: boolean;

  /**
   * Null on a Theory paper's own sheet. On a Practical's, when this student
   * submitted the Theory paper of the same course and term — the Practical
   * date cannot be set for them until then.
   */
  theorySubmittedOn?: string;
}

export interface ExamScheduleSaveRequest {
  examId: number;
  registrationId: string;
  scheduledOn: string;
}

export interface ExamScheduleBulkRequest {
  examId: number;
  scheduledOn: string;
  /** Empty means every student on the paper's course. */
  registrationIds?: string[];
  overwriteExisting: boolean;
}

export interface ExamScheduleBulkResult {
  scheduled: number;
  skippedAlreadyScheduled: number;
  skippedAlreadySat: number;
}

/* ================================================== the admit card */

export interface AdmitCardPaper {
  paperType: PaperType;
  examId?: number;
  title?: string;
  scheduledOn?: string;
  durationMinutes?: number;
}

export interface AdmitCard {
  registrationId: string;
  studentName?: string;
  guardianName?: string;
  courseId?: number;
  courseName?: string;
  termNumber: number;

  theory: AdmitCardPaper;
  practical: AdmitCardPaper;

  generatedOn: string;
}

/* ========================================================= student: sitting */

export type ExamStatus =
  | 'NotScheduled'
  | 'Scheduled'
  | 'NotStarted'
  | 'InProgress'
  | 'Submitted'
  | 'NotOpen'
  | 'Closed';

export interface AvailableExam {
  examId: number;
  title: string;
  subject?: string;
  courseName?: string;
  totalMarks: number;
  passMarks?: number;
  durationMinutes: number;
  opensOn?: string;
  closesOn?: string;
  questionCount: number;
  status: ExamStatus;
  submittedOn?: string;
  score?: number;

  /** When the institute has sat this student. The paper will not open before it. */
  scheduledOn?: string;
  isScheduled: boolean;
}

/** No correct-answer field: the key never leaves the server. */
export interface ExamQuestionForStudent {
  questionId: number;
  questionNo: number;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC?: string;
  optionD?: string;
  marks: number;
  selectedOption?: string;
}

export interface ExamSitting {
  attemptId: number;
  examId: number;
  title: string;
  subject?: string;
  totalMarks: number;
  durationMinutes: number;
  startedOn: string;
  /** The server's deadline. The on-screen countdown is cosmetic. */
  dueOn: string;
  secondsRemaining: number;
  questions: ExamQuestionForStudent[];
  /** Carried over from a previous sitting of the same attempt, on resume. */
  violationCount: number;
}

export interface ExamViolationResult {
  violationCount: number;
  limit: number;
  /** True once the strike limit is reached — the client must auto-submit. */
  mustSubmit: boolean;
}

export interface SubmitExamRequest {
  attemptId: number;
  answers: Record<number, string>;
}

export interface ExamResult {
  attemptId: number;
  examId: number;
  title: string;
  subject?: string;
  score: number;
  totalMarks: number;
  percentScored: number;
  correctCount: number;
  questionCount: number;
  passMarks?: number;
  passed?: boolean;
  grade: string;
  submittedOn: string;
  autoSubmitted: boolean;
  /** Times the student left the exam window during this sitting. */
  violationCount: number;
  /** True when the paper was auto-submitted for exceeding the violation limit. */
  flagged: boolean;
}

/* =============================================== the combined standing */

export interface TermPaperResult {
  termNumber: number;
  paperType: PaperType;
  examId?: number;
  title?: string;
  score?: number;
  totalMarks?: number;
  completedOn?: string;
  /** False while the paper is still to be sat, or still to be marked. */
  isComplete: boolean;

  /**
   * True when the mark came from the legacy Marks register rather than the
   * practical paper's own mark sheet.
   */
  fromMarksRegister?: boolean;
}

export interface TermResult {
  termNumber: number;
  theory: TermPaperResult;
  practical: TermPaperResult;
  obtainedMarks: number;
  fullMarks: number;
  percentScored: number;
  /** Withheld until both papers of the term are in. */
  grade?: string;
  isComplete: boolean;
}

export interface CourseExamResult {
  courseId: number;
  courseName?: string;
  terms: TermResult[];
  papersCompleted: number;
  papersExpected: number;
  totalObtained: number;
  totalFull: number;
  /** Average mark per completed paper. */
  averageMarks: number;
  percentScored: number;
  grade: string;
  isFinal: boolean;
}

export interface StudentExamResults {
  registrationId: string;
  studentName?: string;
  courses: CourseExamResult[];
  generatedOn: string;
}

export type ExamPaperPage = PagedResult<ExamPaper>;
