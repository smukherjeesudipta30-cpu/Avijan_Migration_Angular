/** A teacher's standing assignment to be periodically re-tested on a course. */
export interface TeacherExamAssignment {
  id: number;
  teacherId: number;
  teacherName: string;
  courseId: number;
  courseName: string;
  isActive: boolean;

  /** Null until a sitting has ever been completed. */
  lastCompletedOn?: string;
  lastScorePercent?: number;
  lastPassed?: boolean;

  /** The date/time Admin has already set for the next sitting, if any is pending. */
  pendingScheduleOn?: string;

  /** True once this assignment needs a new sitting scheduled. */
  needsScheduling: boolean;

  /** When it became (or will become) due. */
  dueOn: string;
}

export interface TeacherExamAssignmentRequest {
  teacherId: number;
  courseId: number;
}

export interface TeacherExamScheduleRequest {
  teacherExamAssignmentId: number;
  /** ISO datetime. */
  scheduledOn: string;
  questionCount: number;
}

/** Upcoming, Ready (the scheduled time has arrived) or Completed. */
export type TeacherExamStatus = 'Upcoming' | 'Ready' | 'Completed';

export interface TeacherExamScheduleItem {
  id: number;
  teacherExamAssignmentId: number;
  teacherId: number;
  teacherName: string;
  courseId: number;
  courseName: string;
  scheduledOn: string;
  questionCount: number;
  status: TeacherExamStatus;
  scorePercent?: number;
  passed?: boolean;
  submittedOn?: string;
  /** AI-generated notes to prepare from — null if generation failed or has not run yet. */
  studyGuide?: string;
}

/* -------------------------------------------------------------- taking it */

export interface TeacherExamQuestion {
  id: number;
  orderNo: number;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
}

export interface TeacherExamPaper {
  scheduleId: number;
  courseName: string;
  scheduledOn: string;
  attemptId: number;
  startedOn: string;
  questions: TeacherExamQuestion[];
}

export interface TeacherExamAnswerRequest {
  questionId: number;
  /** 'A' | 'B' | 'C' | 'D'. */
  selectedOption: string;
}

export interface TeacherExamSubmitRequest {
  attemptId: number;
  answers: TeacherExamAnswerRequest[];
}

export interface TeacherExamResult {
  attemptId: number;
  scheduleId: number;
  courseName: string;
  totalQuestions: number;
  correctCount: number;
  scorePercent: number;
  passed: boolean;
}

export interface RecordTeacherExamViolationRequest {
  attemptId: number;
  reason: string;
  answers: TeacherExamAnswerRequest[];
}

export interface TeacherExamViolationResult {
  violationCount: number;
  limit: number;
  mustSubmit: boolean;
  result?: TeacherExamResult;
}
