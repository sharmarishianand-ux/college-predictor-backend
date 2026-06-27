const { Resend } = require('resend');
const fs = require('fs');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
// If you verify your domain on Resend, change this to something like 'Counselling Is Easy <info@vijaypathtestseries.com>'
const EMAIL_FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';

let resend = null;
if (RESEND_API_KEY) {
  resend = new Resend(RESEND_API_KEY);
  console.log('Resend email API configured.');
} else {
  console.log('No RESEND_API_KEY configuration found. Running email service in MOCK mode (emails print to console).');
}

/**
 * Robust email sender with retry logic
 */
async function sendMailWithRetry(mailOptions, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      if (resend) {
        const resendPayload = {
          from: EMAIL_FROM,
          to: mailOptions.to,
          subject: mailOptions.subject,
          html: mailOptions.html
        };

        if (mailOptions.attachments && mailOptions.attachments.length > 0) {
          const attachment = mailOptions.attachments[0];
          // Read the PDF file into a buffer for Resend
          const contentBuffer = fs.readFileSync(attachment.path);
          resendPayload.attachments = [
            {
              filename: attachment.filename,
              content: contentBuffer
            }
          ];
        }

        const data = await resend.emails.send(resendPayload);
        if (data.error) {
           throw new Error(data.error.message);
        }

        return { success: true, mode: 'RESEND' };
      } else {
        console.log('\n==================================================');
        console.log(`MOCK EMAIL SENT TO: ${mailOptions.to}`);
        console.log(`SUBJECT: ${mailOptions.subject}`);
        console.log(`BODY PREVIEW:\n${mailOptions.html.substring(0, 150)}...`);
        console.log('==================================================\n');
        return { success: true, mode: 'MOCK' };
      }
    } catch (error) {
      console.error(`Attempt ${i + 1} to send email failed:`, error.message);
      if (i === retries - 1) {
        throw new Error(`Failed to send email after ${retries} attempts: ${error.message}`);
      }
      // Wait for exponential backoff before next retry (1s, 2s, 4s...)
      await new Promise(res => setTimeout(res, 1000 * Math.pow(2, i)));
    }
  }
}

/**
 * Base Template for beautiful HTML emails
 */
function getBaseTemplate(content) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; background-color: #f8fafc; padding: 20px;">
      <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <!-- Header -->
        <div style="background-color: #2563eb; padding: 24px; text-align: center; color: white;">
          <h1 style="margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 1px;">
            📘 Counselling Is Easy 4U
          </h1>
        </div>
        
        <!-- Content -->
        <div style="padding: 32px 24px; color: #1e293b; line-height: 1.6;">
          ${content}
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f1f5f9; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">
          <p style="margin: 0 0 8px 0; font-weight: bold; color: #475569;">Need help?</p>
          <p style="margin: 0 0 16px 0;">📧 <a href="mailto:counsellingiseasy4u@gmail.com" style="color: #2563eb; text-decoration: none;">counsellingiseasy4u@gmail.com</a></p>
          <p style="margin: 0; font-size: 12px;">Copyright © 2026 Counselling Is Easy 4U</p>
        </div>
      </div>
    </div>
  `;
}

/**
 * Send OTP for verification
 */
async function sendOTP(email, name, otp) {
  const studentName = name || 'Student';
  const content = `
    <h2 style="color: #0f172a; margin-top: 0;">Verify Your Email</h2>
    <p style="font-size: 16px;">Hello ${studentName},</p>
    <p style="font-size: 16px;">Your verification code is:</p>
    <div style="text-align: center; margin: 32px 0;">
      <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2563eb; background-color: #eff6ff; padding: 16px 32px; border-radius: 8px; border: 2px dashed #bfdbfe; display: inline-block;">
        ${otp}
      </span>
    </div>
    <p style="font-size: 16px;">This OTP expires in <strong>10 minutes</strong>.</p>
    <p style="font-size: 14px; color: #64748b;">If you did not request this code, ignore this email.</p>
  `;

  const html = getBaseTemplate(content);

  const mailOptions = {
    to: email,
    subject: 'Verify Your Email',
    html: html
  };

  const result = await sendMailWithRetry(mailOptions);
  if (result.mode === 'MOCK') result.otp = otp;
  return result;
}

/**
 * Send Predicted College list to student
 */
async function sendPredictionResults(email, name, pdfPath) {
  const studentName = name || 'Student';
  const content = `
    <p style="font-size: 16px;">Hello ${studentName},</p>
    <p style="font-size: 16px;">Thank you for using Counselling Is Easy 4U.</p>
    <p style="font-size: 16px;">Your personalized prediction report has been generated successfully.</p>
    <p style="font-size: 16px;">The attached PDF includes:</p>
    <ul style="font-size: 16px; color: #334155; line-height: 1.8;">
      <li>Dream Colleges</li>
      <li>Realistic Colleges</li>
      <li>Safe Colleges</li>
      <li>Trend Analysis</li>
      <li>Choice Filling Guidance</li>
    </ul>
    <p style="font-size: 16px; margin-top: 24px;">If you need counseling support, contact us anytime.</p>
    <p style="font-size: 16px;">📧 <a href="mailto:counsellingiseasy4u@gmail.com" style="color: #2563eb; text-decoration: none;">counsellingiseasy4u@gmail.com</a></p>
    <br/>
    <p style="font-size: 16px; margin: 0;">Regards,</p>
    <p style="font-size: 16px; font-weight: bold; margin: 4px 0 0 0;">Counselling Is Easy 4U</p>
  `;

  const html = getBaseTemplate(content);

  const mailOptions = {
    to: email,
    subject: '🎓 Your Personalized College Prediction Report',
    html: html
  };

  if (pdfPath) {
    mailOptions.attachments = [
      {
        filename: 'Prediction_Report.pdf',
        path: pdfPath
      }
    ];
  }

  return await sendMailWithRetry(mailOptions);
}

/**
 * Send Contact Form Email to Admin
 */
async function sendContactFormEmail(name, phone, email, message) {
  const content = `
    <h2 style="color: #0f172a; margin-top: 0;">New Contact Form Submission</h2>
    <p style="font-size: 16px;">A student has submitted the contact form:</p>
    <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold; width: 120px;">Name</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">${name}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Phone</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">${phone}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Email</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">${email}</td>
      </tr>
      <tr>
        <td style="padding: 16px 0 8px 0; font-weight: bold;" colspan="2">Message</td>
      </tr>
      <tr>
        <td colspan="2" style="background-color: #f1f5f9; padding: 16px; border-radius: 8px;">
          ${message.replace(/\n/g, '<br/>')}
        </td>
      </tr>
    </table>
  `;

  const html = getBaseTemplate(content);

  const mailOptions = {
    to: 'counsellingiseasy4u@gmail.com', // Always send contact forms to admin
    subject: `Contact Form Submission from ${name}`,
    html: html
  };

  return await sendMailWithRetry(mailOptions);
}

/**
 * Send Admin Notification Email on new prediction
 */
async function sendAdminNotificationEmail(studentName, rank, category, predictionTime, pdfPath) {
  const content = `
    <h2 style="color: #0f172a; margin-top: 0;">New Prediction Generated</h2>
    <p style="font-size: 16px;">A new college prediction report has been successfully generated.</p>
    <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold; width: 150px;">Student Name</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">${studentName}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Rank</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">${rank}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Category</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">${category}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Prediction Time</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">${predictionTime}</td>
      </tr>
    </table>
    <p style="font-size: 16px; margin-top: 24px;">The generated PDF report is attached for your reference.</p>
  `;

  const html = getBaseTemplate(content);

  const mailOptions = {
    to: 'counsellingiseasy4u@gmail.com',
    subject: `Admin Alert: New Prediction - ${studentName}`,
    html: html
  };

  if (pdfPath) {
    mailOptions.attachments = [
      {
        filename: 'Student_Prediction_Report.pdf',
        path: pdfPath
      }
    ];
  }

  return await sendMailWithRetry(mailOptions);
}

module.exports = {
  sendOTP,
  sendPredictionResults,
  sendContactFormEmail,
  sendAdminNotificationEmail
};
