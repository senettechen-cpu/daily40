
import nodemailer from 'nodemailer';

// Configure transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

/**
 * Send an email notification
 * @param to Recipient email
 * @param subject Subject line
 * @param html HTML content
 */
export const sendEmail = async (to: string, subject: string, html: string) => {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('[Email Service] SMTP credentials missing. Email not sent.');
        return;
    }

    try {
        const info = await transporter.sendMail({
            from: `"Emperor's Vox-Link" <${process.env.SMTP_USER}>`,
            to,
            subject,
            html
        });
        console.log(`[Email Service] Message sent: ${info.messageId}`);
    } catch (error) {
        console.error('[Email Service] Error sending email:', error);
    }
};
