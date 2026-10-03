import { requireAuth } from '../src/middleware/auth';

// Small wrappers so probe routes read naturally. They exist only for tests.
export const requireAdmin = requireAuth('admin');
export const requireVolunteer = requireAuth('volunteer');

export { requireBranchScope, requireOwnership } from '../src/middleware/auth';