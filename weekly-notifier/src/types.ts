export interface ExpiredPermit {
  id: string;
  permitRef: string;
  permitType: string;
  location: string;
  expiredAt: string; // ISO-8601 UTC instant
  daysOverdue: number;
  url: string;
  receiverName?: string; // raw typed receiver name on the permit (shown for orphaned permits)
  unassignedReason?: string; // why no receiver email could be resolved
}

export interface ReceiverGroup {
  receiverEmail: string; // routing only (Resend "to"); never rendered in email bodies
  displayName: string; // profile firstName + lastName exactly as stored; '' when blank/missing
  permits: ExpiredPermit[];
}
