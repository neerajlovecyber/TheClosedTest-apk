import { asc, eq } from "drizzle-orm"

import { db } from "../db"
import { matches, messages } from "../db/schema"
import { sendExpoPushNotification } from "./expo-push"

export interface SendMessageDTO {
  content: string
  type: "text" | "image" | "video"
  storageUrl?: string | null
}

export class MessageService {
  /**
   * Fetches message history for a match, ensuring caller is an authorized participant.
   */
  static async getHistory(matchId: string, userId: string, limit = 50, offset = 0) {
    const match = await db.query.matches.findFirst({
      where: (m, { eq }) => eq(m.id, matchId),
    })

    if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
      return { forbidden: true as const }
    }

    const items = await db.query.messages.findMany({
      where: (m, { eq }) => eq(m.matchId, matchId),
      with: {
        sender: true,
      },
      orderBy: [asc(messages.sentAt)],
      limit,
      offset,
    })

    return { items }
  }

  /**
   * Sends a message, updates match activity and lastRead timestamps, and notifies partner.
   */
  static async sendMessage(matchId: string, sender: { id: string; name?: string | null }, dto: SendMessageDTO) {
    const match = await db.query.matches.findFirst({
      where: (m, { eq }) => eq(m.id, matchId),
    })

    if (!match || (match.user1Id !== sender.id && match.user2Id !== sender.id)) {
      return { forbidden: true as const }
    }

    const isUser1 = match.user1Id === sender.id
    const partnerId = isUser1 ? match.user2Id : match.user1Id
    const now = new Date()

    const [newMessage] = await db
      .insert(messages)
      .values({
        matchId,
        senderId: sender.id,
        content: dto.content,
        type: dto.type,
        storageUrl: dto.storageUrl,
      })
      .returning()

    // Update match lastActivity and sender's lastRead timestamp
    await db
      .update(matches)
      .set({
        lastActivity: now,
        ...(isUser1 ? { lastRead1: now } : { lastRead2: now }),
      })
      .where(eq(matches.id, matchId))

    // Background push notification to peer partner
    db.query.users
      .findFirst({
        where: (u, { eq }) => eq(u.id, partnerId),
      })
      .then((partner) => {
        if (partner?.pushToken) {
          sendExpoPushNotification({
            to: partner.pushToken,
            title: `Message from ${sender.name || "Testing Partner"}`,
            body: dto.type === "text" ? dto.content : "Sent an attachment",
            data: { matchId, messageId: newMessage.id },
          }).catch(() => {})
        }
      })
      .catch((err) => {
        console.error("Message push error:", err)
      })

    return { message: newMessage }
  }

  /**
   * Marks match messages as read for the user.
   */
  static async markRead(matchId: string, userId: string) {
    const match = await db.query.matches.findFirst({
      where: (m, { eq }) => eq(m.id, matchId),
    })

    if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
      return { forbidden: true as const }
    }

    const isUser1 = match.user1Id === userId
    const now = new Date()

    await db
      .update(matches)
      .set(isUser1 ? { lastRead1: now } : { lastRead2: now })
      .where(eq(matches.id, matchId))

    return { success: true as const }
  }
}
