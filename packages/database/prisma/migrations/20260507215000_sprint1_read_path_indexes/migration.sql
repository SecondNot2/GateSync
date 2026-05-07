CREATE INDEX IF NOT EXISTS "trips_currentStatus_updatedAt_idx" ON "trips" ("currentStatus", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "trips_currentStatus_plannedStartAt_id_idx" ON "trips" ("currentStatus", "plannedStartAt" DESC, "id");

CREATE INDEX IF NOT EXISTS "trip_events_tripId_recordedAt_idx" ON "trip_events"("tripId", "recordedAt" DESC);
CREATE INDEX IF NOT EXISTS "notifications_recipientUserId_channel_status_createdAt_idx" ON "notifications"("recipientUserId", "channel", "status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "notifications_organizationId_channel_createdAt_idx" ON "notifications"("organizationId", "channel", "createdAt" DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'realtime'
      AND table_name = 'messages'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'realtime'
      AND tablename = 'messages'
      AND policyname = 'gatesync_org_broadcast_read'
  ) THEN
    CREATE POLICY "gatesync_org_broadcast_read"
    ON "realtime"."messages"
    FOR SELECT
    TO authenticated
    USING (
      "realtime"."messages"."extension" = 'broadcast'
      AND realtime.topic() LIKE 'org_%_events'
      AND EXISTS (
        SELECT 1
        FROM "public"."users" AS "u"
        INNER JOIN "public"."memberships" AS "m"
          ON "m"."userId" = "u"."id"
        WHERE "u"."supabaseUserId" = (SELECT auth.uid())::text
          AND "m"."status" = 'ACTIVE'
          AND "m"."deletedAt" IS NULL
          AND "m"."organizationId"::text = replace(replace(realtime.topic(), 'org_', ''), '_events', '')
      )
    );
  END IF;
END $$;