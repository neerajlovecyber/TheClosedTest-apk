import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// This trigger runs whenever a notification is inserted into the database
export const onNotificationCreated = internalMutation({
    handler: async (ctx, { notificationId }: { notificationId: any }) => {
        const notification = await ctx.db.get(notificationId);
        if (!notification) return;

        // Get the user to send the push notification to
        const user = await ctx.db.get(notification.userId);
        if (!user || !user.pushToken) {
            console.log("User has no push token, skipping push notification");
            return;
        }

        // Send push notification
        const message = {
            to: user.pushToken,
            sound: 'default',
            title: notification.title,
            body: notification.body,
            data: notification.data || {},
        };

        try {
            const response = await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(message),
            });

            if (!response.ok) {
                console.error(`Failed to send push notification: ${response.status}`);
            } else {
                const result = await response.json();
                console.log("Push notification sent:", result.data?.status);
            }
        } catch (error) {
            console.error('Error sending push notification:', error);
        }
    },
});
