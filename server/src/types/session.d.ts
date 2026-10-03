import 'express-session';

declare module 'express-session' {
  interface SessionData {
    auth?: {
      role: 'admin' | 'volunteer';
      userId: string;
      adminId?: string;
      volunteerId?: string;
      branchId: string | null;
      isHq: boolean;
      displayName?: string;
      loginId?: string;
    };
  }
}