export interface AboutStat {
  label: string;
  value: string;
  icon: string;
}

export interface AboutCourse {
  courseId: number;
  name: string;
  durationMonths?: number;
}

export interface ContactDetails {
  addressLine1: string;
  addressLine2: string;
  phone: string;
  email: string;
  officeHours: string;
}

export interface AboutNotice {
  id: number;
  text?: string;
  noticeDate?: string;
}

/** One row of the weekly class routine. Served by the API; no longer shown on
 * the front page, which dropped its Show Timing panel. */
export interface RoutineRow {
  id: number;
  name?: string;
  sunday?: string;
  monday?: string;
  tuesday?: string;
  wednesday?: string;
  thursday?: string;
  friday?: string;
  saturday?: string;
}

export interface AboutPage {
  instituteName: string;
  tagline: string;
  introduction: string;
  highlights: string[];
  stats: AboutStat[];
  courses: AboutCourse[];
  contact: ContactDetails;
  /* Optional because a client cannot assume the server's shape: an API build
     older than these fields simply omits them. */
  notices?: AboutNotice[];
  routine?: RoutineRow[];
}

export interface ContactRequest {
  name: string;
  email: string;
  phone?: string;
  message: string;
}
