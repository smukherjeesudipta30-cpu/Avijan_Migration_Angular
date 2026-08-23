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

export interface AboutPage {
  instituteName: string;
  tagline: string;
  introduction: string;
  highlights: string[];
  stats: AboutStat[];
  courses: AboutCourse[];
  contact: ContactDetails;
}

export interface ContactRequest {
  name: string;
  email: string;
  phone?: string;
  message: string;
}
