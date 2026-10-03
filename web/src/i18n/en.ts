/** English UI strings. Key skeleton mirrors the reference prototype's `T.en` */
// where the screen still exists, extended with the auth/Phase-1..2 vocabulary.
export interface Messages {
  brand: string;
  portal: string;
  language: string;
  english: string;
  arabic: string;
  login: string;
  register: string;
  volunteer: string;
  admin: string;
  logout: string;
  submit: string;
  save: string;
  cancel: string;
  search: string;
  all: string;
  pending: string;
  approved: string;
  denied: string;
  declined: string;
  rejected: string;
  status: string;
  reason: string;
  details: string;
  role_admin: string;
  role_volunteer: string;

  loginTitle: string;
  loginSubtitle: string;
  loginIdentifier: string;
  loginIdentifierAdmin: string;
  loginIdentifierVolunteer: string;
  loginPassword: string;
  loginFootAdmin: string;
  loginFootVolunteer: string;
  loginGenericError: string;
  loginRateLimited: string;

  registerTitle: string;
  registerSubtitle: string;
  registerBranch: string;
  registerBranchPlaceholder: string;
  registerEnglishName: string;
  registerArabicName: string;
  registerPhone: string;
  registerEmail: string;
  registerOrganization: string;
  registerQuestionWhy: string;
  registerQuestionBenefit: string;
  registerPassword: string;
  registerConfirmPassword: string;
  registerPasswordMismatch: string;
  registerSubmittedTitle: string;
  registerSubmittedBody: string;
  registerBackToLogin: string;
  registerRequiredField: string;

  errorEmailAlreadyRegistered: string;
  errorValidation: string;
  errorNetwork: string;
  errorUnexpected: string;
  errorCsrf: string;

  shellWelcome: string;
  shellMadeOfficialNotice: string;
  shellScopeHq: string;
  shellScopeBranch: string;

  dashMyTime: string;
  dashMyRequests: string;
  dashMyProfile: string;
  dashActivity: string;
  dashDocuments: string;
  dashPlaceholder: string;

  unitHours: string;
  unitMinutes: string;

  timeApprovedHours: string;
  timePending: string;
  timeServiceDays: string;
  timePendingRequests: string;
  timeRecordsTitle: string;
  timeRecordsSubtitle: string;
  timeAddTime: string;
  timeEditRecord: string;
  timeNoRecords: string;
  timeRequestsTitle: string;
  timeRequestsSubtitle: string;
  timeEditRequestsTitle: string;
  timeEditRequestsSubtitle: string;
  timeNoRequests: string;
  timeRequestAddTitle: string;
  timeRequestEditTitle: string;
  timeDate: string;
  timeEvent: string;
  timeHours: string;
  timeMinutes: string;
  timeReason: string;
  timeAssignTo: string;
  timeAssignToOptional: string;
  timeSubmitRequest: string;
  timeSubmitted: string;
  timeOriginal: string;
  timeRequested: string;
  timeEditWindowHint: string;
  timeLockedTitle: string;
  timeLockedHint: string;

  navTime: string;
  navProfile: string;
  navOverview: string;
  navRequests: string;
  navVolunteers: string;
  navAdjustments: string;

  profileTitle: string;
  completionTitle: string;
  completionPassed: string;
  completionHint: string;
  profileIdentityStatus: string;
  profileIdentityVerified: string;
  profileIdentityPending: string;
  profileEmailStatus: string;
  profileEmailVerified: string;
  profileEmailPending: string;
  profileEdit: string;
  profileSave: string;
  profileSaved: string;
  profileEnglishName: string;
  profileArabicName: string;
  profilePhone: string;
  profileEmailAddress: string;
  profileIdNumber: string;
  profileOrganization: string;
  profileEducationInfo: string;
  profileSkills: string;
  profileCertifications: string;
  profileTagsHint: string;
  profileReadOnlyNote: string;
  timeLockedNotice: string;

  adminOverviewTitle: string;
  adminStatPendingAdd: string;
  adminStatPendingEdit: string;
  adminStatPendingMinutes: string;
  adminStatThisMonth: string;
  adminStatVolunteers: string;
  adminStatServiceDays: string;
  adminRequestsTitle: string;
  adminRequestsSubtitle: string;
  adminEditRequestsTitle: string;
  adminEditRequestsSubtitle: string;
  adminApprove: string;
  adminReject: string;
  adminNoPending: string;
  adminSearchPlaceholder: string;
  adminVolunteersTitle: string;
  adminVolunteerCompletion: string;
  adminOnboardingComplete: string;
  adminOnboardingIncomplete: string;
  adminVerifyIdentity: string;
  adminVerified: string;
  adminUnverified: string;
  adminViewRecords: string;
  adminClose: string;
  adminAdjustTitle: string;
  adminAdjustSubtitle: string;
  adminAdjustVolunteer: string;
  adminAdjustSelectVolunteer: string;
  adminAdjustDate: string;
  adminAdjustEvent: string;
  adminAdjustMinutes: string;
  adminAdjustSignedHint: string;
  adminAdjustReason: string;
  adminAdjustSubmit: string;
  adminAdjustDone: string;
  adminNoVolunteers: string;

  // Phase 6
  pagePrev: string;
  pageNext: string;
  pageStatus: string;
  rowsCount: string;
  navAudit: string;
  navActivity: string;

  auditTitle: string;
  auditSubtitle: string;
  auditWhen: string;
  auditActor: string;
  auditRole: string;
  auditAction: string;
  auditTarget: string;
  auditNoRows: string;
  auditFilterAction: string;
  auditFilterTarget: string;
  auditFrom: string;
  auditTo: string;

  targetVolunteer: string;
  targetTimeAddRequest: string;
  targetTimeEditRequest: string;
  targetServiceTimeRecord: string;
  targetRegistration: string;
  targetDocument: string;

  act_auth_login: string;
  act_auth_logout: string;
  act_auth_login_failed: string;
  act_auth_email_verified: string;
  act_auth_email_verification_resent: string;
  act_registration_created: string;
  act_registration_approved: string;
  act_registration_rejected: string;
  act_document_uploaded: string;
  act_document_deleted: string;
  act_document_approved: string;
  act_document_rejected: string;
  act_time_add_request_created: string;
  act_time_add_request_approved: string;
  act_time_add_request_rejected: string;
  act_time_edit_request_created: string;
  act_time_edit_request_approved: string;
  act_time_edit_request_rejected: string;
  act_time_adjustment_created: string;
  act_volunteer_identity_verified: string;
  act_volunteer_profile_updated: string;
  act_report_generated: string;
  act_service_report_revoked: string;

  activityTitle: string;
  activitySubtitle: string;
  activityNoRows: string;
  activityWhen: string;
  activityWhat: string;
  activityBy: string;

  reportGenerate: string;
  reportTitle: string;
  reportBranch: string;
  reportTotal: string;
  reportRecordsCount: string;
  reportGeneratedAt: string;
  reportRefLabel: string;
  reportQrLabel: string;
  reportCopyLink: string;
  reportLinkCopied: string;
  reportOpenVerify: string;

  reportShelfTitle: string;
  reportFrozenTotal: string;
  reportCurrentTotal: string;
  reportServiceDays: string;
  reportActive: string;
  reportRevoked: string;
  reportRevokedBy: string;
  reportRevoke: string;
  reportRevokeHint: string;
  reportRevokeReasonLabel: string;
  reportRevokeReasonPlaceholder: string;
  reportRevokeConfirm: string;
  reportRevokeDone: string;
  reportNoReports: string;
  reportAllRevoked: string;

  verifyTitle: string;
  verifyHint: string;
  verifyRefLabel: string;
  verifyCheck: string;
  verifyBadgeValid: string;
  verifyBadgeInvalid: string;
  verifyValidSubtitle: string;
  verifyIssuedAt: string;
  verifyNotValidBody: string;
  verifyTryAnother: string;
  verifyLoading: string;
  verifyScopeLabel: string;
  verifyRecordsCount: string;
  verifyServiceDays: string;
}

export const en: Messages = {
  brand: 'Egyptian Red Crescent',
  portal: 'Volunteer Time Portal',
  language: 'العربية',
  english: 'English',
  arabic: 'العربية',
  login: 'Login',
  register: 'Register',
  volunteer: 'Volunteer',
  admin: 'Administrator',
  logout: 'Log out',
  submit: 'Submit',
  save: 'Save',
  cancel: 'Cancel',
  search: 'Search',
  all: 'All',
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
  declined: 'Declined',
  rejected: 'Rejected',
  status: 'Status',
  reason: 'Reason',
  details: 'View details',
  role_admin: 'Administrator',
  role_volunteer: 'Volunteer',

  loginTitle: 'Sign in',
  loginSubtitle: 'Manage volunteer registration, service hours, and approvals in one secure, simple workspace.',
  loginIdentifier: 'Username or registered number',
  loginIdentifierAdmin: 'Username',
  loginIdentifierVolunteer: 'Registered number',
  loginPassword: 'Password',
  loginFootAdmin: 'Administrator access is restricted to authorized ERC staff.',
  loginFootVolunteer: 'Your registration must be approved and onboarding completed before time requests are available.',
  loginGenericError: 'Incorrect identifier or password.',
  loginRateLimited: 'Too many attempts. Please wait a few minutes and try again.',

  registerTitle: 'Volunteer registration',
  registerSubtitle: 'Submit your details for administrator approval.',
  registerBranch: 'Branch',
  registerBranchPlaceholder: 'Select your branch',
  registerEnglishName: 'English name',
  registerArabicName: 'Arabic name',
  registerPhone: 'Phone',
  registerEmail: 'Email',
  registerOrganization: 'Organization',
  registerQuestionWhy: 'Why do you want to volunteer with the Red Crescent?',
  registerQuestionBenefit: 'What do you hope to gain from volunteering?',
  registerPassword: 'Password',
  registerConfirmPassword: 'Confirm password',
  registerPasswordMismatch: 'Passwords do not match.',
  registerSubmittedTitle: 'Registration submitted',
  registerSubmittedBody: 'A branch administrator will review your registration. Await administrator review — the email address you provided will receive a verification link once approved.',
  registerBackToLogin: 'Back to login',
  registerRequiredField: 'This field is required.',

  errorEmailAlreadyRegistered: 'This email is already registered — sign in or use another address.',
  errorValidation: 'Please review the highlighted fields and try again.',
  errorNetwork: 'Could not reach the server. Check your connection and try again.',
  errorUnexpected: 'Something went wrong. Please try again.',
  errorCsrf: 'Your session has expired. Reload the page and try again.',

  shellWelcome: 'Welcome',
  shellMadeOfficialNotice: 'Volunteer time becomes official only after administrator approval.',
  shellScopeHq: 'Headquarters',
  shellScopeBranch: 'Branch',
  dashMyTime: 'My time',
  dashMyRequests: 'My requests',
  dashMyProfile: 'My profile',
  dashActivity: 'Activity',
  dashDocuments: 'Documents',
  dashPlaceholder: 'This module arrives in a later phase.',

  unitHours: 'h',
  unitMinutes: 'm',

  timeApprovedHours: 'Approved hours',
  timePending: 'Waiting for approval',
  timeServiceDays: 'Service days',
  timePendingRequests: 'Pending requests',
  timeRecordsTitle: 'My time',
  timeRecordsSubtitle: 'Official time is calculated from approved records only.',
  timeAddTime: 'Request time',
  timeEditRecord: 'Request a change',
  timeNoRecords: 'No records yet',
  timeRequestsTitle: 'Time requests',
  timeRequestsSubtitle: 'Submitted time becomes official only after administrator approval.',
  timeEditRequestsTitle: 'Edit requests',
  timeEditRequestsSubtitle: 'The original record remains unchanged until approval.',
  timeNoRequests: 'No requests yet',
  timeRequestAddTitle: 'Request service time',
  timeRequestEditTitle: 'Request a correction',
  timeDate: 'Date',
  timeEvent: 'Event',
  timeHours: 'Hours',
  timeMinutes: 'Minutes',
  timeReason: 'Reason',
  timeAssignTo: 'Assign to',
  timeAssignToOptional: 'No specific supervisor',
  timeSubmitRequest: 'Send request',
  timeSubmitted: 'Request submitted. It awaits administrator review.',
  timeOriginal: 'Current',
  timeRequested: 'Requested',
  timeEditWindowHint: 'Corrections are accepted only within 14 days of the service date.',
  timeLockedTitle: 'Time requests are locked',
  timeLockedHint:
    'Complete your registration approval, email verification, and administrator review first.',

  navTime: 'My time',
  navProfile: 'My profile',
  navOverview: 'Overview',
  navRequests: 'Requests',
  navVolunteers: 'Volunteers',
  navAdjustments: 'Adjustments',

  profileTitle: 'My profile',
  completionTitle: 'Onboarding progress',
  completionPassed: 'Completed checks',
  completionHint: 'Complete every check to unlock time requests.',
  profileIdentityStatus: 'Identity verification',
  profileIdentityVerified: 'Verified',
  profileIdentityPending: 'Awaiting administrator verification',
  profileEmailStatus: 'Email verification',
  profileEmailVerified: 'Verified',
  profileEmailPending: 'Not verified',
  profileEdit: 'Edit profile',
  profileSave: 'Save changes',
  profileSaved: 'Profile saved.',
  profileEnglishName: 'English name',
  profileArabicName: 'Arabic name',
  profilePhone: 'Phone',
  profileEmailAddress: 'Email address',
  profileIdNumber: 'National ID number',
  profileOrganization: 'Organization',
  profileEducationInfo: 'Education',
  profileSkills: 'Skills',
  profileCertifications: 'Certifications',
  profileTagsHint: 'One per line; an empty list clears the field.',
  profileReadOnlyNote: 'Email and identity verification are handled by the Red Crescent; they cannot be edited here.',
  timeLockedNotice: 'Time requests are locked until your profile is complete (100%).',

  adminOverviewTitle: 'Time management',
  adminStatPendingAdd: 'Pending add requests',
  adminStatPendingEdit: 'Pending edit requests',
  adminStatPendingMinutes: 'Awaiting approval (minutes)',
  adminStatThisMonth: 'Approved this month',
  adminStatVolunteers: 'Volunteers',
  adminStatServiceDays: 'Service days',
  adminRequestsTitle: 'Time requests',
  adminRequestsSubtitle: 'Review requests from volunteers in your branch.',
  adminEditRequestsTitle: 'Edit requests',
  adminEditRequestsSubtitle: 'An approved edit applies to the live record; the request history is preserved.',
  adminApprove: 'Approve',
  adminReject: 'Reject',
  adminNoPending: 'Nothing pending in this view.',
  adminSearchPlaceholder: 'Search by name or ID',
  adminVolunteersTitle: 'Volunteers',
  adminVolunteerCompletion: 'Onboarding',
  adminOnboardingComplete: 'Complete',
  adminOnboardingIncomplete: 'Incomplete',
  adminVerifyIdentity: 'Verify identity',
  adminVerified: 'Verified',
  adminUnverified: 'Not verified',
  adminViewRecords: 'Records',
  adminClose: 'Close',
  adminAdjustTitle: 'Manual adjustment',
  adminAdjustSubtitle: 'Add or subtract official time for a volunteer. A reason is required and every change is audited.',
  adminAdjustVolunteer: 'Volunteer',
  adminAdjustSelectVolunteer: 'Select a volunteer',
  adminAdjustDate: 'Date',
  adminAdjustEvent: 'Event',
  adminAdjustMinutes: 'Minutes',
  adminAdjustSignedHint: 'Positive adds time, negative subtracts.',
  adminAdjustReason: 'Reason',
  adminAdjustSubmit: 'Apply adjustment',
  adminAdjustDone: 'Adjustment applied.',
  adminNoVolunteers: 'No volunteers found.',

  pagePrev: 'Previous',
  pageNext: 'Next',
  pageStatus: 'Page {{page}} of {{pages}}',
  rowsCount: '{{count}} rows',
  navAudit: 'Audit log',
  navActivity: 'Activity',

  auditTitle: 'Audit log',
  auditSubtitle: 'Every permissioned action in this branch is recorded append-only and cannot be modified.',
  auditWhen: 'When',
  auditActor: 'Actor',
  auditRole: 'Role',
  auditAction: 'Action',
  auditTarget: 'Target',
  auditNoRows: 'No matching entries.',
  auditFilterAction: 'Action filter',
  auditFilterTarget: 'Target type',
  auditFrom: 'From',
  auditTo: 'To',

  targetVolunteer: 'Volunteer',
  targetTimeAddRequest: 'Time request',
  targetTimeEditRequest: 'Edit request',
  targetServiceTimeRecord: 'Time record',
  targetRegistration: 'Registration',
  targetDocument: 'Document',

  act_auth_login: 'Signed in',
  act_auth_logout: 'Signed out',
  act_auth_login_failed: 'Failed sign-in',
  act_auth_email_verified: 'Email verified',
  act_auth_email_verification_resent: 'Verification email resent',
  act_registration_created: 'Registration submitted',
  act_registration_approved: 'Registration approved',
  act_registration_rejected: 'Registration rejected',
  act_document_uploaded: 'Document uploaded',
  act_document_deleted: 'Document deleted',
  act_document_approved: 'Document approved',
  act_document_rejected: 'Document rejected',
  act_time_add_request_created: 'Time request submitted',
  act_time_add_request_approved: 'Time request approved',
  act_time_add_request_rejected: 'Time request rejected',
  act_time_edit_request_created: 'Correction requested',
  act_time_edit_request_approved: 'Correction approved',
  act_time_edit_request_rejected: 'Correction rejected',
  act_time_adjustment_created: 'Official adjustment',
  act_volunteer_identity_verified: 'Identity verified',
  act_volunteer_profile_updated: 'Profile updated',
  act_report_generated: 'Service report generated',
  act_service_report_revoked: 'Service report revoked',

  activityTitle: 'My activity',
  activitySubtitle: 'Sign-ins and events about your account and service time.',
  activityNoRows: 'No activity yet.',
  activityWhen: 'When',
  activityWhat: 'What happened',
  activityBy: 'By',

  reportGenerate: 'Generate service report',
  reportTitle: 'Service report',
  reportBranch: 'Branch',
  reportTotal: 'Approved total',
  reportRecordsCount: 'Records',
  reportGeneratedAt: 'Generated at',
  reportRefLabel: 'Verification reference',
  reportQrLabel: 'Scan to verify',
  reportCopyLink: 'Copy verification link',
  reportLinkCopied: 'Link copied.',
  reportOpenVerify: 'Open verification page',

  reportShelfTitle: 'Service report shelf',
  reportFrozenTotal: 'On report',
  reportCurrentTotal: 'Current now',
  reportServiceDays: 'Service days',
  reportActive: 'Active',
  reportRevoked: 'Revoked',
  reportRevokedBy: 'Revoked by',
  reportRevoke: 'Revoke reference',
  reportRevokeHint: 'Public verification of this reference stops working. Live totals stay admin-only.',
  reportRevokeReasonLabel: 'Reason (optional)',
  reportRevokeReasonPlaceholder: 'e.g. issued to the wrong volunteer by mistake',
  reportRevokeConfirm: 'Confirm revocation',
  reportRevokeDone: 'Report revoked.',
  reportNoReports: 'No service reports issued yet.',
  reportAllRevoked: 'All of this volunteer\u2019s references are revoked.',

  verifyTitle: 'Verify a service report',
  verifyHint: 'Paste a verification reference or scan its QR code. References are public and reveal no personal data.',
  verifyRefLabel: 'Reference',
  verifyCheck: 'Check',
  verifyBadgeValid: 'Reference verified',
  verifyBadgeInvalid: 'Reference not found',
  verifyValidSubtitle: 'This reference was issued by the ERC Volunteer Service Portal for the report shown below.',
  verifyIssuedAt: 'Reference issued',
  verifyNotValidBody:
    'This reference does not exist, was revoked, or is malformed. It cannot be used to verify a report. References are case-sensitive.',
  verifyTryAnother: 'Try another reference',
  verifyLoading: 'Checking reference…',
  verifyScopeLabel: 'Service hours report',
  verifyRecordsCount: 'Records',
  verifyServiceDays: 'Service days',
};