import { appendMessage, findUserById } from "~/lib/db.server";

export async function sendWhatsAppMessage(
  userId: string,
  body: string,
): Promise<void> {
  await appendMessage(userId, body, "out");

  if (process.env.NODE_ENV === "production") {
    const user = await findUserById(userId);
    if (!user) return;
    // TODO: Twilio client.messages.create({ to: user.phone, from: TWILIO_WHATSAPP_FROM, body })
  }
}
