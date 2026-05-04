CREATE TYPE "MembershipInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

CREATE TABLE "membership_invitations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "status" "MembershipInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" UUID,
    "revokedAt" TIMESTAMP(3),
    "revokedById" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "membership_invitations_codeHash_key" ON "membership_invitations"("codeHash");

CREATE INDEX "membership_invitations_organizationId_status_expiresAt_idx" ON "membership_invitations"("organizationId", "status", "expiresAt");

CREATE INDEX "membership_invitations_email_status_idx" ON "membership_invitations"("email", "status");

ALTER TABLE "membership_invitations" ADD CONSTRAINT "membership_invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "membership_invitations" ADD CONSTRAINT "membership_invitations_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "membership_invitations" ADD CONSTRAINT "membership_invitations_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "membership_invitations" ADD CONSTRAINT "membership_invitations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE public.membership_invitations ENABLE ROW LEVEL SECURITY;
