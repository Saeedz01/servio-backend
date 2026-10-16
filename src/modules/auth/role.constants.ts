export const ROLE_NAMES = {
  ADMIN: 'admin',
  SEEKER: 'seeker',
  PROVIDER: 'provider',
} as const;

export type RoleName = (typeof ROLE_NAMES)[keyof typeof ROLE_NAMES];

export type AuthRoleLabel = 'ADMIN' | 'SEEKER' | 'PROVIDER';

export function toAuthRoleLabel(roleName: string): AuthRoleLabel {
  switch (roleName) {
    case ROLE_NAMES.ADMIN:
      return 'ADMIN';
    case ROLE_NAMES.SEEKER:
      return 'SEEKER';
    case ROLE_NAMES.PROVIDER:
      return 'PROVIDER';
    default:
      throw new Error(`Unknown role_name: ${roleName}`);
  }
}
