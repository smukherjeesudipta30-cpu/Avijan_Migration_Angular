export type UserRole = 'SuperAdmin' | 'Admin' | 'Editor' | 'Student' | 'Teacher' | 'Receptionist';

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
