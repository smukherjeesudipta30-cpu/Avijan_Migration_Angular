/** One box on the staff hierarchy chart. */
export interface OrgNode {
  id: number;
  personName: string;

  /** The position, as the administrator typed it. Free text — there is no fixed list. */
  designation: string | null;

  qualification: string | null;

  /** What computer training this person holds. Blank for technical staff. */
  computerTraining: string | null;

  /** Technical staff are excused the qualification and computer-training rule. */
  isTechnical: boolean;

  /** Every branch this person belongs to. Empty means the whole centre. */
  branches: string[];

  isActive: boolean;
  sortOrder: number;

  staffType: string | null;
  staffId: number | null;

  hasPhoto: boolean;

  /**
   * True for a teacher or receptionist drawn from the staff register rather than
   * added by hand. There is no row behind it, so it cannot be edited or removed
   * here — change the person on their master screen, or give them a box of their
   * own to override what is shown.
   */
  isAutomatic: boolean;

  /** True on the one box that teachers and receptionists hang beneath. */
  isDefaultStaffParent: boolean;

  /** Every box directly above this one. More than one is normal. */
  parentIds: number[];

  /** Only ever filled in for the back office. */
  email: string | null;
}

export interface OrgChart {
  nodes: OrgNode[];

  /** Boxes with nobody above them. */
  rootIds: number[];

  generatedOn: string;
}

export interface OrgNodeSaveRequest {
  personName: string;
  designation: string | null;
  qualification: string | null;
  computerTraining: string | null;
  isTechnical: boolean;
  email: string | null;
  branches: string[];
  isActive: boolean;
  sortOrder: number;
  staffType: string | null;
  staffId: number | null;

  /** Tick on the one box that teachers and receptionists hang beneath. */
  isDefaultStaffParent: boolean;

  parentIds: number[];
}
