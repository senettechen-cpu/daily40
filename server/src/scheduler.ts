
import { pool, query } from './db';
import webpush from 'web-push';
import dotenv from 'dotenv';
import path from 'path';
import { sendEmail } from './services/email';
import { DEFAULT_TIME_ZONE, dayKey, minutesOfDay } from './shared/time';
import { dueReminders, normalizeSlots } from './shared/tasks';

dotenv.config({ path: path.join(__dirname, '../../.env') });

// VAPID Setup
const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;
let mailto = process.env.MAILTO || 'mailto:example@example.com';
if (!mailto.startsWith('mailto:') && !mailto.startsWith('https://')) {
    mailto = `mailto:${mailto}`;
}

if (publicVapidKey && privateVapidKey) {
    try {
        webpush.setVapidDetails(mailto, publicVapidKey, privateVapidKey);
    } catch (err) {
        console.error('[Scheduler] VAPID Setup Failed:', err);
        // Continue without VAPID
    }
} else {
    console.warn('[Scheduler] VAPID keys missing. Push notifications disabled.');
}

// Scheduler Configuration
const CHECK_INTERVAL_MS = 60000; // Check every 60 seconds

export const startScheduler = () => {
    console.log('[Scheduler] Vox-Link Initialized (notifications only)...');

    setInterval(async () => {
        try {
            // Corruption accumulation is owned by the frontend Corruption Engine
            // (see src/contexts/GameContext.tsx), which accounts for sector traits,
            // garrisons, fortification and attrition. Scheduler only handles notifications.

            // Check for Upcoming Tasks (Push Notification Logic)
            // Logic: Find tasks due between NOW and NOW + 10 mins
            // AND ensure we haven't spammed them (Need a way to track notification sent? 
            // - For now, let's keep it stateless and simple: 
            //   In a real app, we'd add 'notification_sent_at' column to tasks.
            //   Let's add a quick hack: Only notify if due_date is in [now + 9m, now + 10m] window.
            //   This avoids repeat notifications every minute.
            const upcomingTasks = await query(
                `SELECT t.id, t.title, t.due_date, t.user_id 
                 FROM tasks t
                 WHERE t.status = 'active'
                 AND t.due_date > NOW() + interval '9 minutes'
                 AND t.due_date <= NOW() + interval '10 minutes'`
            );

            for (const task of upcomingTasks.rows) {
                if (!task.user_id) continue;

                // 1. Web Push Notification
                // Find subscriptions for this user
                const subs = await query(
                    `SELECT * FROM push_subscriptions WHERE user_id = $1`,
                    [task.user_id]
                );

                const payload = JSON.stringify({
                    title: `⚠️ 任務臨將過期: ${task.title}`,
                    body: `距離截止僅剩 10 分鐘。盡速執行！`,
                    icon: '/pwa-192x192.png',
                    url: '/'
                });

                for (const sub of subs.rows) {
                    try {
                        const subscription = {
                            endpoint: sub.endpoint,
                            keys: {
                                p256dh: sub.p256dh,
                                auth: sub.auth
                            }
                        };
                        await webpush.sendNotification(subscription, payload);
                        console.log(`[Scheduler] Push sent to user ${task.user_id} for task ${task.id}`);
                    } catch (error: any) {
                        console.error('[Scheduler] Push failed:', error);
                        // Optional: Delete invalid subscription
                        if (error.statusCode === 410 || error.statusCode === 404) {
                            await query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
                        }
                    }
                }

                // 2. Email Notification (Astropathic Choir)
                try {
                    // Check if user has enabled email notifications
                    const userState = await query(
                        `SELECT email_enabled, notification_email FROM game_state WHERE user_id = $1`,
                        [task.user_id]
                    );

                    if (userState.rows.length > 0) {
                        const { email_enabled, notification_email } = userState.rows[0];

                        if (email_enabled && notification_email) {
                            const subject = `[IMPERIAL DECREE] 任務即將到期: ${task.title}`;
                            const html = `
                                <div style="font-family: monospace; background-color: #000; color: #fbbf24; padding: 20px; border: 2px solid #fbbf24;">
                                    <h1 style="text-align: center; text-transform: uppercase; letter-spacing: 5px; border-bottom: 1px solid #fbbf24; padding-bottom: 10px;">Imperial Vox-Link</h1>
                                    <p><strong>ATTENTION CITIZEN,</strong></p>
                                    <p>Your task <strong>${task.title}</strong> is due in less than 10 minutes.</p>
                                    <p>Time Remaining: <span style="color: red;">10 Minutes</span></p>
                                    <hr style="border-color: #fbbf24; opacity: 0.3;" />
                                    <p style="text-align: center; font-size: 12px; color: #666;">THE EMPEROR PROTECTS.</p>
                                </div>
                            `;

                            await sendEmail(notification_email, subject, html);
                            console.log(`[Scheduler] Email sent to ${notification_email} for task ${task.id}`);
                        }
                    }
                } catch (emailError) {
                    console.error('[Scheduler] Email notification failed:', emailError);
                }
            }

            await remindDueSlots();
        } catch (err) {
            console.error('[Scheduler] Error in scheduler cycle:', err);
        }
    }, CHECK_INTERVAL_MS);
};

/**
 * Reminders for recurring tasks that hold several times of day. The main pass
 * above keys off due_date, which for a recurring task is a fixed timestamp in
 * the past, so it never matches one: without this they are never announced.
 */
async function remindDueSlots() {
    const now = new Date();
    const today = dayKey(now, DEFAULT_TIME_ZONE);
    const nowMinutes = minutesOfDay(now, DEFAULT_TIME_ZONE);

    const tasks = await query(
        `SELECT id, title, user_id, due_times, slots_done, slots_day, reminded_slots, reminded_day
         FROM tasks
         WHERE status = 'active' AND is_recurring = TRUE AND due_times IS NOT NULL`,
    );

    for (const task of tasks.rows) {
        if (!task.user_id) continue;
        const slots = normalizeSlots(task.due_times);
        if (slots.length === 0) continue;

        const done = task.slots_day === today ? task.slots_done : [];
        const announced = task.reminded_day === today ? task.reminded_slots : [];
        const due = dueReminders(slots, done, announced, nowMinutes);
        if (due.length === 0) continue;

        const time = due[due.length - 1];
        const left = slots.length - normalizeSlots(done).length;
        await notifyUser(task.user_id, `⏰ ${task.title} · ${time}`,
            `今日還剩 ${left} 次。`);

        // Recorded even when every send failed: a reminder that could not be
        // delivered is not worth replaying every minute for the rest of the day.
        await query('UPDATE tasks SET reminded_slots = $1, reminded_day = $2 WHERE id = $3',
            [JSON.stringify(normalizeSlots([...normalizeSlots(announced), ...due])), today, task.id]);
    }
}

/** One reminder to every channel the user has turned on. */
async function notifyUser(userId: string, title: string, body: string) {
    const payload = JSON.stringify({ title, body, icon: '/pwa-192x192.png', url: '/' });
    const subs = await query('SELECT * FROM push_subscriptions WHERE user_id = $1', [userId]);

    for (const sub of subs.rows) {
        try {
            await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        } catch (error: any) {
            console.error('[Scheduler] Push failed:', error);
            if (error.statusCode === 410 || error.statusCode === 404) {
                await query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
            }
        }
    }

    try {
        const state = await query('SELECT email_enabled, notification_email FROM game_state WHERE user_id = $1', [userId]);
        const { email_enabled, notification_email } = state.rows[0] ?? {};
        if (email_enabled && notification_email) {
            await sendEmail(notification_email, `[IMPERIAL DECREE] ${title}`,
                `<div style="font-family: monospace; background-color: #000; color: #fbbf24; padding: 20px; border: 2px solid #fbbf24;">
                    <h1 style="text-align:center; letter-spacing:5px;">Imperial Vox-Link</h1>
                    <p><strong>${title}</strong></p><p>${body}</p>
                </div>`);
        }
    } catch (emailError) {
        console.error('[Scheduler] Email notification failed:', emailError);
    }
}
