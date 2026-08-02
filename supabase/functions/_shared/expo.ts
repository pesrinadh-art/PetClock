/**
 * Expo Push API client.
 *
 * Two-phase by design: /send returns *tickets* (accepted for delivery), and only a later
 * /getReceipts call tells you whether delivery actually succeeded. A DeviceNotRegistered
 * receipt is how we learn a token is dead — that is what check-receipts exists for.
 */

const EXPO_SEND = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS = "https://exp.host/--/api/v2/push/getReceipts";

/** Expo rejects payloads with more than 100 messages. */
const CHUNK_SIZE = 100;

export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound?: "default" | null;
  categoryId?: string;
  channelId?: string;
  priority?: "default" | "normal" | "high";
  ttl?: number;
};

export type ExpoTicket = {
  token: string;
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function sendExpoPush(messages: ExpoMessage[]): Promise<ExpoTicket[]> {
  if (messages.length === 0) return [];

  const tickets: ExpoTicket[] = [];

  for (const batch of chunk(messages, CHUNK_SIZE)) {
    try {
      const res = await fetch(EXPO_SEND, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(batch),
      });

      if (!res.ok) {
        // A transport failure is not fatal to the dispatch run: the notification row is
        // already written, and the next cycle will try again. Record it and move on.
        console.error(`expo send failed: ${res.status} ${await res.text()}`);
        tickets.push(
          ...batch.map((m) => ({
            token: m.to,
            status: "error" as const,
            message: `http ${res.status}`,
          })),
        );
        continue;
      }

      const json = await res.json();
      const data = (json.data ?? []) as Array<Record<string, unknown>>;

      // Expo returns tickets positionally, so index maps back to the message.
      data.forEach((t, i) => {
        tickets.push({
          token: batch[i]?.to ?? "",
          status: t.status === "ok" ? "ok" : "error",
          id: t.id as string | undefined,
          message: t.message as string | undefined,
          details: t.details as { error?: string } | undefined,
        });
      });
    } catch (err) {
      console.error("expo send threw", err);
      tickets.push(
        ...batch.map((m) => ({
          token: m.to,
          status: "error" as const,
          message: String(err),
        })),
      );
    }
  }

  return tickets;
}

export type ExpoReceipt = {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

export async function getExpoReceipts(
  ticketIds: string[],
): Promise<Record<string, ExpoReceipt>> {
  if (ticketIds.length === 0) return {};

  const out: Record<string, ExpoReceipt> = {};

  for (const batch of chunk(ticketIds, 300)) {
    try {
      const res = await fetch(EXPO_RECEIPTS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: batch }),
      });
      if (!res.ok) {
        console.error(`expo receipts failed: ${res.status}`);
        continue;
      }
      const json = await res.json();
      Object.assign(out, json.data ?? {});
    } catch (err) {
      console.error("expo receipts threw", err);
    }
  }

  return out;
}
