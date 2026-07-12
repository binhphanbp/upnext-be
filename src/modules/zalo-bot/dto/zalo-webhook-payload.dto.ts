export interface ZaloWebhookPayload {
  ok?: boolean;
  result?: {
    event_name?: string;
    message?: {
      from?: { id?: string; display_name?: string; is_bot?: boolean };
      chat?: { id?: string; chat_type?: string };
      text?: string;
      message_id?: string;
      date?: number;
    };
  };
}
