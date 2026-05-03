import { z } from 'zod';

export type ApiSuccessEnvelope<TData, TMeta = Record<string, never>> = {
  data: TData;
  meta: TMeta;
};

export type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiEnvelope<TData, TMeta = Record<string, never>> =
  | ApiSuccessEnvelope<TData, TMeta>
  | ApiErrorEnvelope;

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional()
});

export const organizationIdParamSchema = z.object({
  organizationId: z.string().uuid()
});

export const tripIdParamSchema = organizationIdParamSchema.extend({
  tripId: z.string().uuid()
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type OrganizationIdParams = z.infer<typeof organizationIdParamSchema>;
export type TripIdParams = z.infer<typeof tripIdParamSchema>;
