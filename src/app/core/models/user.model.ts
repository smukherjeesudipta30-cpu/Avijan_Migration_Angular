export interface UserListItem {
  id: number;
  name?: string;
  email?: string;
  roles?: string;
  roleList: string[];
  phone?: string;
  dateOfBirth?: string;
  registerDate?: string;
  endDate?: string;
  isActive: boolean;
  lastLoginOn?: string;
  /** False for the one migrated account that had no password on record. */
  hasPassword: boolean;

  /**
   * For a student account only: the portal password as issued, which production
   * stores in clear so the office can read it back. Null for staff.
   */
  studentPassword?: string | null;
}

export interface UserSaveRequest {
  name: string;
  email: string;
  roles: string;
  phone: string | null;
  dateOfBirth: string | null;
  /** Required on create; leave null on update to keep the current password. */
  password: string | null;
  isActive: boolean;
}

export interface UpcomingBirthday {
  id: number;
  name?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  nextBirthday: string;
  daysAway: number;
  turningAge?: number;
}

export interface UserQuery {
  page?: number;
  pageSize?: number;
  isActive?: boolean | null;
  email?: string | null;
  role?: string | null;
  search?: string | null;
}
