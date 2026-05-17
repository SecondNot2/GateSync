export {
  EXTERNAL_CHANNEL_ADAPTERS,
  InMemoryExternalChannelRegistry
} from './external-channel.port';
export type {
  ExternalChannelAdapter,
  ExternalChannelKind,
  ExternalChannelRegistry,
  ExternalDispatchInput,
  ExternalDispatchResult
} from './external-channel.port';
export { ZaloOaAdapter } from './zalo-oa.adapter';
export { SmsAdapter } from './sms.adapter';
export { EmailAdapter } from './email.adapter';
export { ExternalChannelDispatcher } from './external-channel-dispatcher.service';
export type { ExternalDispatchJobData } from './external-channel-dispatcher.service';
export { getTemplate, renderTemplate } from './templates';
export type { ExternalChannelTemplate, TemplateChannel } from './templates';
