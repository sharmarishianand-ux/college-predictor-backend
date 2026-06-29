const nodemailer = require('nodemailer');
const fs = require('fs');

const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = process.env.EMAIL_PORT;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_FROM = `Counselling Is Easy 4U <${EMAIL_USER}>`;

let transporter = null;
if (EMAIL_USER && EMAIL_PASS) {
  const port = EMAIL_PORT || 587;
  transporter = nodemailer.createTransport({
    host: EMAIL_HOST || 'smtp.gmail.com',
    port: port,
    secure: port == 465, // true for 465, false for other ports
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
  });
  console.log('Nodemailer email API configured.');
} else {
  console.log('No Nodemailer configuration found. Running email service in MOCK mode (emails print to console).');
}

/**
 * Robust email sender with retry logic
 */
async function sendMailWithRetry(mailOptions, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      if (transporter) {
        const nodemailerPayload = {
          from: EMAIL_FROM,
          to: mailOptions.to,
          subject: mailOptions.subject,
          html: mailOptions.html
        };

        if (mailOptions.attachments && mailOptions.attachments.length > 0) {
          nodemailerPayload.attachments = mailOptions.attachments.map(att => ({
            filename: att.filename,
            path: att.path
          }));
        }

        const info = await transporter.sendMail(nodemailerPayload);
        console.log('Email sent: %s', info.messageId);
        return { success: true, mode: 'NODEMAILER' };
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
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f0f1e; padding: 40px 20px; text-align: center;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2); text-align: left;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%); padding: 32px 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 28px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px;">
            ✨ Counselling Is Easy 4U
          </h1>
          <p style="margin: 10px 0 0 0; color: #e2e8f0; font-size: 15px;">Empowering your higher education decisions</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 40px 32px; color: #334155; line-height: 1.8; font-size: 16px;">
          ${content}
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f8fafc; padding: 32px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="margin: 0 0 12px 0; font-weight: 600; color: #475569; font-size: 15px;">We're here to help you succeed.</p>
          <div style="margin: 16px 0;">
            <a href="mailto:counsellingiseasy4u@gmail.com" style="display: inline-block; background-color: #7c3aed; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: bold; font-size: 14px;">Contact Support</a>
          </div>
          <p style="margin: 24px 0 0 0; color: #94a3b8; font-size: 12px;">© ${new Date().getFullYear()} Counselling Is Easy 4U. All rights reserved.</p>
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
    <h2 style="color: #1e293b; margin-top: 0; font-size: 22px;">Verify Your Email Address</h2>
    <p style="font-size: 16px;">Hello <strong>${studentName}</strong>,</p>
    <p style="font-size: 16px;">Welcome to Counselling Is Easy 4U! To continue with your college prediction, please use the verification code below:</p>
    <div style="text-align: center; margin: 40px 0;">
      <span style="font-size: 36px; font-weight: 800; letter-spacing: 12px; color: #7c3aed; background-color: #f3e8ff; padding: 20px 40px; border-radius: 12px; border: 2px dashed #c084fc; display: inline-block; margin-left: 12px;">
        ${otp}
      </span>
    </div>
    <p style="font-size: 16px; color: #475569;">This code will expire in <strong>10 minutes</strong>.</p>
    <p style="font-size: 14px; color: #64748b; margin-top: 32px;">If you didn't request this code, you can safely ignore this email.</p>
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
    <h2 style="color: #1e293b; margin-top: 0; font-size: 22px;">Your College Journey Starts Here! 🚀</h2>
    <p style="font-size: 16px;">Hi <strong>${studentName}</strong>,</p>
    <p style="font-size: 16px;">We are thrilled to share your personalized college prediction report! Our AI-driven system has thoroughly analyzed your profile against historical cutoffs to find the best possible matches for you.</p>
    
    <div style="background-color: #f1f5f9; border-left: 4px solid #7c3aed; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
      <h3 style="margin: 0 0 8px 0; color: #0f172a; font-size: 16px;">Inside your attached PDF, you'll find:</h3>
      <ul style="margin: 0; padding-left: 20px; color: #475569;">
        <li style="margin-bottom: 8px;"><strong>✨ Dream Colleges:</strong> Top-tier institutions you should aspire to.</li>
        <li style="margin-bottom: 8px;"><strong>🎯 Realistic Colleges:</strong> Your most probable and solid matches.</li>
        <li style="margin-bottom: 8px;"><strong>🛡️ Safe Colleges:</strong> Excellent fallback options to secure your future.</li>
        <li style="margin-bottom: 0;"><strong>📊 Trend Analysis & Choice Filling Guidance:</strong> Strategies to maximize your chances.</li>
      </ul>
    </div>

    <p style="font-size: 16px;">Please find your comprehensive <strong>Prediction Report PDF attached</strong> to this email. We recommend reviewing it carefully as you prepare for your counseling rounds.</p>
    <p style="font-size: 16px; margin-top: 24px;">Wishing you the absolute best for your admission process! If you need expert guidance for choice filling, feel free to reach out to us.</p>
    <br/>
    <p style="font-size: 16px; margin: 0;">Warm Regards,</p>
    <p style="font-size: 16px; font-weight: bold; margin: 4px 0 0 0; color: #7c3aed;">The Counselling Is Easy 4U Team</p>
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
