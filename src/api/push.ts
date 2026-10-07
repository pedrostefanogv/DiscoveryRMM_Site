import { api } from "./client";

export interface PushConfig {
  enabled: boolean;
  vapidPublicKey: string;
  subscriptionCount: number;
}

export interface PushSubscriptionDto {
  id: string;
  endpoint: string;
  createdAt: string;
}

export interface RegisterPushSubscriptionRequest {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}

export interface PushTestResult {
  attempted: number;
  delivered: number;
  failed: number;
  removed: number;
}

/**
 * Inscricoes de Web Push do usuario autenticado. O destinatario e sempre
 * resolvido pelo token no servidor — nada de userId no corpo.
 */
export const pushApi = {
  getConfig: () => api.get<PushConfig>("/api/v1/push"),

  subscribe: (data: RegisterPushSubscriptionRequest) =>
    api.post<PushSubscriptionDto>("/api/v1/push/subscriptions", data),

  unsubscribe: (endpoint: string) =>
    api.del<void>(
      "/api/v1/push/subscriptions?endpoint=" + encodeURIComponent(endpoint),
    ),

  sendTest: () => api.post<PushTestResult>("/api/v1/push/test"),
};
