declare namespace Cloudflare { interface Env {
  DB: D1Database;
  APP_ORIGIN: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_MODE?: string;
  EMAIL_TEST_RECIPIENT?: string;
  GMAIL_OWNER_EMAIL?: string;
  GMAIL_TOKEN_KEY?: string;
  GMAIL_ACCESS_MODE?: string;
  RESEND_WEBHOOK_SECRET?: string;
} }
