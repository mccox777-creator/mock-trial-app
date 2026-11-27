import type { BulletinKind, RegistrationStatus, VideoVisibility } from './types';

export const KIND_LABEL: Record<BulletinKind, string> = {
  general: 'Announcement',
  case: 'Case bulletin',
  schedule: 'Schedule',
  results: 'Results',
};

export const REG_LABEL: Record<RegistrationStatus, string> = {
  pending: 'Awaiting approval',
  approved: 'Confirmed',
  waitlisted: 'Waitlisted',
  declined: 'Declined',
};

export const VIS_LABEL: Record<VideoVisibility, string> = {
  teams: 'The two teams in this trial',
  coaches: 'Coaches and staff',
  public: 'Anyone',
};
