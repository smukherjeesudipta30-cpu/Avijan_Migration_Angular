/**
 * The envelope every InstituteMS endpoint returns (MIGRATION_PLAN §3.1).
 * Kept in one place so the future APK client can be generated from the same shape.
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  errors: string[];
  traceId?: string;
}
