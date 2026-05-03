import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, RequestUser } from './request-user';

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): RequestUser => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  return request.user;
});
