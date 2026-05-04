export type OrganizationAccessIssue = 'NO_ORGANIZATION' | 'INVITED' | 'SUSPENDED' | 'REMOVED';

export class OrganizationAccessError extends Error {
  issue: OrganizationAccessIssue;
  organizationName?: string;

  constructor(issue: OrganizationAccessIssue, message: string, organizationName?: string) {
    super(message);
    this.name = 'OrganizationAccessError';
    this.issue = issue;

    if (organizationName) {
      this.organizationName = organizationName;
    }
  }
}

export function isOrganizationAccessError(error: unknown): error is OrganizationAccessError {
  return error instanceof OrganizationAccessError;
}
