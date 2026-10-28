export type WinnerNotificationChannel = "sms" | "voice";

export type WinnerNotificationConfig = {
  accountSid?: string;
  authToken?: string;
  messagingServiceSid?: string;
  smsFrom?: string;
  voiceFrom?: string;
  voiceUrl?: string;
  enabled?: boolean;
};

export type WinnerNotification = {
  rank: 1 | 2 | 3;
  playerName: string;
  phoneNumber: string;
  score: number;
  roomCode: string;
  channels?: WinnerNotificationChannel[];
};

export function normalizeKenyanPhone(input: string): string | null {
  const compact = input.trim().replace(/[\s()-]/g, "");
  if (/^07\d{8}$/.test(compact)) return `+254${compact.slice(1)}`;
  if (/^2547\d{8}$/.test(compact)) return `+${compact}`;
  if (/^\+2547\d{8}$/.test(compact)) return compact;
  return null;
}

export function createWinnerMessage(winner: WinnerNotification): string {
  return `ViperQuiz result: congratulations ${winner.playerName}! You finished #${winner.rank} in room ${winner.roomCode} with ${winner.score} points.`;
}

export function getTwilioConfig(env: NodeJS.ProcessEnv = process.env): WinnerNotificationConfig {
  return {
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
    smsFrom: env.TWILIO_SMS_FROM,
    voiceFrom: env.TWILIO_VOICE_FROM,
    voiceUrl: env.TWILIO_VOICE_URL,
    enabled: env.TWILIO_WINNER_NOTIFICATIONS_ENABLED === "true",
  };
}

function isConfigured(config: WinnerNotificationConfig) {
  return Boolean(config.enabled && config.accountSid && config.authToken && (config.messagingServiceSid || config.smsFrom) && config.voiceFrom && config.voiceUrl);
}

async function twilioPost(path: string, body: URLSearchParams, config: WinnerNotificationConfig, fetchImpl: typeof fetch) {
  if (!config.accountSid || !config.authToken) throw new Error("Twilio credentials are not configured.");
  const response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const payload = await response.json() as { sid?: string; status?: string; message?: string };
  if (!response.ok || !payload.sid) throw new Error(payload.message || `Twilio request failed (${response.status}).`);
  return { sid: payload.sid, status: payload.status };
}

export async function notifyWinner(winner: WinnerNotification, config = getTwilioConfig(), fetchImpl: typeof fetch = fetch) {
  const phoneNumber = normalizeKenyanPhone(winner.phoneNumber);
  if (!phoneNumber) return { sent: false, reason: "invalid_phone" as const };
  if (!isConfigured(config)) return { sent: false, reason: "disabled_or_incomplete_configuration" as const };
  const message = createWinnerMessage(winner);
  const results: Array<{ channel: WinnerNotificationChannel; sid: string; status?: string }> = [];
  for (const channel of winner.channels || ["sms", "voice"]) {
    if (channel === "sms") {
      const body = new URLSearchParams({ To: phoneNumber, Body: message });
      if (config.messagingServiceSid) body.set("MessagingServiceSid", config.messagingServiceSid);
      else body.set("From", config.smsFrom!);
      results.push({ channel, ...(await twilioPost("/Messages.json", body, config, fetchImpl)) });
    } else {
      const body = new URLSearchParams({ To: phoneNumber, From: config.voiceFrom!, Url: config.voiceUrl! });
      results.push({ channel, ...(await twilioPost("/Calls.json", body, config, fetchImpl)) });
    }
  }
  return { sent: true, phoneNumber, results };
}
