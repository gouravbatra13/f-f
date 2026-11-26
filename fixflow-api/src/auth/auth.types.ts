import type { UserRole } from '../users/user-role.enum.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface AccessTokenClaims {
  sub: string;
  av: number;
  sid: string;
  iat: number;
  exp: number;
  iss: 'fixflow-api';
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthenticatedUser;
}
