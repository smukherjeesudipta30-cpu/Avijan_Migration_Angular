export type UserRole = 'SuperAdmin' | 'Admin' | 'Editor' | 'Student' | 'Teacher' | 'Receptionist'
  // Avijan PreSchool's own roles (see UserRoles.cs for why the names avoid "Admin" and "Teacher").
  | 'PreSchoolHead' | 'PreSchoolFrontDesk' | 'PreSchoolTutor' | 'Parent';

/** How a role reads on screen. Roles not listed read as they are stored. */
export const ROLE_LABELS: Partial<Record<UserRole, string>> = {
  PreSchoolHead: 'PreSchool Admin',
  PreSchoolFrontDesk: 'PreSchool Receptionist',
  PreSchoolTutor: 'PreSchool Teacher'
};

/** The PreSchool's staff: its admin, receptionist and teachers. */
export const PRESCHOOL_STAFF: UserRole[] = ['PreSchoolHead', 'PreSchoolFrontDesk', 'PreSchoolTutor'];

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  /** Most privileged role held — decides the landing page. */
  role: UserRole;
  /** Every role held. Legacy data stores combined values like "Receptionist & Teacher". */
  roles: UserRole[];
  loginId?: string;
  /** Server-supplied landing page for the role — mirrors the legacy redirect logic. */
  landingRoute: string;
  /**
   * True while the account still carries a password migrated from the legacy
   * system. The user is held on /change-password until they replace it. The API
   * enforces the same hold, so this only decides where the router sends them.
   */
  mustChangePassword: boolean;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface LoginRequest {
  email: string;
  password: string;
}
