const { Leads, Cutoffs, Otps, Predictions } = require('../config/db');
const { sendOTP, sendPredictionResults, sendAdminNotificationEmail, sendContactFormEmail } = require('../services/emailService');
const { generatePredictionPDF } = require('../services/pdfService');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

// Generate 6-digit OTP
function generateOtpCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send Verification OTP
 */
async function handleSendOTP(req, res) {
  const { email, name } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const otp = generateOtpCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Remove older OTPs for this email
    await Otps.deleteMany({ email });

    // Store new OTP
    await Otps.create({ email, otp, expiresAt });

    // Send email
    const emailResult = await sendOTP(email, name, otp);

    return res.json({
      message: 'OTP sent successfully',
      mode: emailResult.mode,
      otp: emailResult.mode === 'MOCK' ? otp : undefined // only expose OTP in response if running in MOCK mode for easy testing
    });
  } catch (error) {
    console.error('Error sending OTP:', error);
    return res.status(500).json({ message: 'Error sending OTP' });
  }
}

/**
 * Verify OTP
 */
async function handleVerifyOTP(req, res) {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ message: 'Email and OTP are required' });
  }

  try {
    const otpRecord = await Otps.findOne({ email, otp });

    if (!otpRecord) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (new Date() > new Date(otpRecord.expiresAt)) {
      await Otps.deleteMany({ email });
      return res.status(400).json({ message: 'OTP has expired' });
    }

    // Keep it verified but delete the OTP record so it cannot be reused
    await Otps.deleteMany({ email });

    // Generate JWT token for student
    const token = jwt.sign(
      { email, role: 'student' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({ 
      message: 'Email verified successfully', 
      verified: true,
      token
    });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return res.status(500).json({ message: 'Error verifying OTP' });
  }
}

/**
 * Predict Colleges based on rank and preferences
 */
/**
 * Helper to predict colleges based on CRL Rank and simple column criteria
 */
async function predictCollegesHelper({
  crlRank,
  categoryRank,
  seatType,
  gender,
  quota,
  academicProgram,
  state,
  examAppeared
}) {
  const studentCrl = Number(crlRank);
  if (isNaN(studentCrl)) return [];
  const studentCategoryRank = categoryRank ? Number(categoryRank) : studentCrl;

  // Match seatType
  const queryObj = {};
  if (seatType && seatType !== 'ALL') {
    queryObj.seatType = seatType;
  }
  
  // Exclude IITs if candidate only appeared for JEE Main
  if (examAppeared === 'JEE Main Only') {
    queryObj.instituteType = { $ne: 'IIT' };
  }

  // Match gender exactly
  if (gender) {
    queryObj.gender = gender;
  }

  // Match quota
  if (quota && quota !== 'ALL') {
    queryObj.quota = { $in: [quota, 'AI'] };
  }

  let allCutoffs = await Cutoffs.find(queryObj);

  // Fallback: If no cutoffs exist for the specific category/seatType yet, search OPEN
  if (allCutoffs.length === 0 && seatType && seatType !== 'OPEN') {
    const fallbackQuery = {
      seatType: 'OPEN'
    };
    if (examAppeared === 'JEE Main Only') {
      fallbackQuery.instituteType = { $ne: 'IIT' };
    }
    if (gender) {
      fallbackQuery.gender = gender;
    }
    if (quota && quota !== 'ALL') {
      fallbackQuery.quota = { $in: [quota, 'AI'] };
    }
    allCutoffs = await Cutoffs.find(fallbackQuery);
  }

  const results = [];

  allCutoffs.forEach(item => {
    const isOpenSeat = item.seatType === 'OPEN' || item.seatType === 'OPEN (PwD)';
    const compareRank = isOpenSeat ? studentCrl : studentCategoryRank;
    
    // Calculate Rank Boundaries
    const dreamRankMin = compareRank * 0.80; // Rank - 20%
    const realisticMin = compareRank * 0.90; // Rank - 10%
    const realisticMax = compareRank * 1.10; // Rank + 10%
    const safeRank = compareRank * 1.30;     // Rank + 30%

    // Categorization Logic
    let category = null;
    if (item.closingRank >= dreamRankMin && item.closingRank < realisticMin) {
      category = 'DREAM';
    } else if (item.closingRank >= realisticMin && item.closingRank <= realisticMax) {
      category = 'REALISTIC';
    } else if (item.closingRank >= safeRank) {
      category = 'SAFE';
    }

    if (!category) return; // Filter out out-of-reach colleges

    // Filter by academicProgram (Preferred Branch)
    if (academicProgram && academicProgram !== 'ALL BRANCHES' && academicProgram !== 'all') {
      const branchMatch = item.branch.toLowerCase().includes(academicProgram.toLowerCase());
      if (!branchMatch) return;
    }

    // Filter by State if a specific state is requested
    if (state && state !== 'All States' && state !== 'all' && state !== 'ALL') {
      if (!item.state || item.state.toLowerCase() !== state.toLowerCase()) return;
    }

    results.push({
      _id: item._id,
      collegeName: item.collegeName,     // Institute Name
      branch: item.branch,               // Academic Program Name
      quota: item.quota,                 // Quota
      seatType: item.seatType,           // Seat Type
      gender: item.gender,               // Gender
      openingRank: item.openingRank,     // Opening Rank
      closingRank: item.closingRank,     // Closing Rank
      predictionCategory: category
    });
  });

  // Sort by closingRank ascending (best rank first)
  results.sort((a, b) => a.closingRank - b.closingRank);

  return results;
}

/**
 * Predict Colleges based on rank and preferences
 */
async function handlePredictColleges(req, res) {
  const {
    name,
    mobileNumber,
    uniqueCode,
    crlRank,
    categoryRank,
    examAppeared,
    seatType,
    quota,
    academicProgram,
    email,
    gender,
    state
  } = req.body;

  // Validation
  if (!name || !email || !mobileNumber || crlRank === undefined || !seatType) {
    console.log('Missing fields debug:', { name, email, mobileNumber, crlRank, seatType });
    return res.status(400).json({ message: 'Required student details are missing' });
  }

  // Validate phone number: must be exactly 10 digits
  const phoneDigits = mobileNumber.replace(/\D/g, '');
  if (phoneDigits.length !== 10) {
    return res.status(400).json({ message: 'Mobile number must be exactly 10 digits.' });
  }

  try {
    // Check for duplicate phone number (another student already registered with this number)
    const existingPhoneLead = await Leads.findOne({ phone: mobileNumber });
    if (existingPhoneLead && existingPhoneLead.email !== email) {
      return res.status(409).json({ message: 'This mobile number is already registered by another student. Please use a different number.' });
    }

    // If uniqueCode is provided, check it's not already used by another student
    if (uniqueCode && uniqueCode.trim() !== '') {
      const existingCodeLead = await Leads.findOne({ rollNumber: uniqueCode });
      if (existingCodeLead && existingCodeLead.email !== email) {
        return res.status(409).json({ message: 'This Unique Code / Book ID is already used by another student. Please use a different code.' });
      }
    }

    const studentCrl = Number(crlRank);
    const studentCategoryRank = categoryRank ? Number(categoryRank) : studentCrl;

    // Save lead data (create or update using email as primary identifier)
    let existingLead = await Leads.findOne({ email });
    const leadData = {
      name,
      email,
      phone: mobileNumber,
      mobileNumber,
      rollNumber: uniqueCode || '',
      uniqueCode: uniqueCode || '',
      quota,
      instituteTypes: ['ALL'],
      academicProgram,
      gender,
      category: seatType,
      seatType,
      crlRank: studentCrl,
      categoryRank: studentCategoryRank,
      examAppeared: examAppeared || 'JEE Main Only',
      preferredBranch: academicProgram,
      preferredColleges: '',
      state: state || 'All States'
    };

    if (existingLead) {
      await Leads.findByIdAndUpdate(existingLead._id, leadData);
    } else {
      await Leads.create(leadData);
    }

    // Run prediction helper
    const predictions = await predictCollegesHelper({
      crlRank: studentCrl,
      categoryRank: studentCategoryRank,
      seatType,
      gender,
      quota,
      academicProgram,
      state,
      examAppeared: examAppeared || 'JEE Main Only'
    });

    const dreamColleges = predictions.filter(p => p.predictionCategory === 'DREAM');
    const realisticColleges = predictions.filter(p => p.predictionCategory === 'REALISTIC');
    const safeColleges = predictions.filter(p => p.predictionCategory === 'SAFE');

    // Generate PDF
    const { pdfPath, filename } = await generatePredictionPDF(
      { 
        name, 
        email, 
        mobileNumber, 
        crlRank: studentCrl, 
        category: seatType, 
        quota, 
        gender, 
        examAppeared: examAppeared || 'JEE Main Only', 
        state 
      },
      { dreamColleges, realisticColleges, safeColleges }
    );

    // Save Prediction History
    const predictionRecord = await Predictions.create({
      name,
      email,
      mobileNumber,
      crlRank: studentCrl,
      category: seatType,
      quota,
      gender,
      examAppeared: examAppeared || 'JEE Main Only',
      inputRank: studentCrl,
      dreamCount: dreamColleges.length,
      realisticCount: realisticColleges.length,
      safeCount: safeColleges.length,
      pdfFilename: filename,
      emailStatus: 'Pending'
    });

    // Send prediction report email asynchronously
    sendPredictionResults(email, name, pdfPath).then(async (result) => {
      if (result.success) {
        await Predictions.findByIdAndUpdate(predictionRecord._id, { emailStatus: 'Sent' });
        
        // Notify admin
        sendAdminNotificationEmail(name, studentCrl, seatType, new Date().toLocaleString(), pdfPath)
          .catch(err => console.error('Failed to send admin notification:', err));
      }
    }).catch(async (err) => {
      console.error('Failed to send prediction email:', err);
      await Predictions.findByIdAndUpdate(predictionRecord._id, { emailStatus: 'Failed' });
    });

    return res.json({
      message: 'Colleges predicted successfully',
      predictions,
      emailSent: true
    });
  } catch (error) {
    console.error('Error predicting colleges:', error);
    return res.status(500).json({ message: 'Error predicting colleges' });
  }
}

/**
 * Handle Student Login (Request OTP without new prediction)
 */
async function handleStudentLogin(req, res) {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const student = await Leads.findOne({ email });
    if (!student) {
      return res.status(404).json({ message: 'No account found with this email. Please predict colleges first to register.' });
    }

    const otp = generateOtpCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await Otps.deleteMany({ email });
    await Otps.create({ email, otp, expiresAt });

    const emailResult = await sendOTP(email, student.name, otp);

    return res.json({
      message: 'OTP sent to registered email',
      mode: emailResult.mode,
      otp: emailResult.mode === 'MOCK' ? otp : undefined
    });
  } catch (error) {
    console.error('Error in student login:', error);
    return res.status(500).json({ message: 'Error processing login' });
  }
}

/**
 * Get Student Profile & Past Predictions
 */
async function handleGetStudentProfile(req, res) {
  const email = req.user.email; // Extracted from JWT token
  
  try {
    const student = await Leads.findOne({ email });
    if (!student) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    // Run prediction helper using student profile details
    const predictions = await predictCollegesHelper({
      crlRank: student.crlRank,
      seatType: student.seatType || student.category,
      gender: student.gender,
      quota: student.quota,
      academicProgram: student.academicProgram || student.preferredBranch,
      examAppeared: student.examAppeared || 'JEE Main Only'
    });

    return res.json({
      profile: student,
      predictions
    });
  } catch (error) {
    console.error('Error fetching student profile:', error);
    return res.status(500).json({ message: 'Error fetching profile data' });
  }
}

/**
 * Handle Contact Form Submission
 */
async function handleContactFormSubmit(req, res) {
  const { name, phone, email, message } = req.body;
  if (!name || !phone || !email || !message) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    const result = await sendContactFormEmail(name, phone, email, message);
    if (result.success) {
      return res.json({ message: 'Message sent successfully. Our team will contact you soon.' });
    } else {
      return res.status(500).json({ message: 'Failed to send message.' });
    }
  } catch (error) {
    console.error('Error in contact form submission:', error);
    return res.status(500).json({ message: 'Error submitting contact form.' });
  }
}

/**
 * Middleware: Verify Student JWT Token
 */
function verifyStudentToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Access denied. Invalid token format.' });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    if (verified.role !== 'student') {
      return res.status(403).json({ message: 'Access denied. Student role required.' });
    }
    req.user = verified;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }
}

module.exports = {
  handleSendOTP,
  handleVerifyOTP,
  handlePredictColleges,
  handleStudentLogin,
  handleGetStudentProfile,
  handleContactFormSubmit,
  verifyStudentToken
};
