require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const {
  handleSendOTP,
  handleVerifyOTP,
  handlePredictColleges,
  handleStudentLogin,
  handleGetStudentProfile,
  handleContactFormSubmit,
  verifyStudentToken
} = require('./controllers/studentController');

const {
  handleLogin,
  verifyToken,
  handleGetLeads,
  handleExportLeads,
  handleGetColleges,
  handleCreateCollege,
  handleUpdateCollege,
  handleDeleteCollege,
  handleUploadCutoffs,
  handleGetCutoffYears,
  handleGetStats,
  handleGetPredictions,
  handleExportPredictions,
  handleResendPredictionEmail,
  handleDeletePrediction
} = require('./controllers/adminController');

const { checkConnectionStatus, initAdmin } = require('./config/db');

// Ensure uploads folder exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

// Setup Multer for CSV & Excel Uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ];
  const ext = path.extname(file.originalname).toLowerCase();
  if (['.csv', '.xlsx', '.xls'].includes(ext) || allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only .csv, .xlsx, and .xls files are accepted'), false);
  }
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// Connection Health Check Route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    database: checkConnectionStatus(),
    timestamp: new Date()
  });
});

// ==========================================
// STUDENT PATHS
// ==========================================
app.post('/api/otp/send', handleSendOTP);
app.post('/api/otp/verify', handleVerifyOTP);
app.post('/api/predict', handlePredictColleges);
app.post('/api/student/login', handleStudentLogin);
app.get('/api/student/profile', verifyStudentToken, handleGetStudentProfile);
app.post('/api/contact', handleContactFormSubmit);

// ==========================================
// ADMIN PATHS
// ==========================================
app.post('/api/admin/login', handleLogin);

// Protected Admin Dashboard Endpoints (verifyToken required)
app.get('/api/admin/stats', verifyToken, handleGetStats);
app.get('/api/admin/leads', verifyToken, handleGetLeads);
app.get('/api/admin/leads/export', verifyToken, handleExportLeads);
app.get('/api/admin/colleges', verifyToken, handleGetColleges);
app.post('/api/admin/colleges', verifyToken, handleCreateCollege);
app.put('/api/admin/colleges/:id', verifyToken, handleUpdateCollege);
app.delete('/api/admin/colleges/:id', verifyToken, handleDeleteCollege);
app.post('/api/admin/cutoff/upload', verifyToken, upload.single('file'), handleUploadCutoffs);
app.get('/api/admin/cutoff/years', verifyToken, handleGetCutoffYears);
app.get('/api/admin/predictions', verifyToken, handleGetPredictions);
app.get('/api/admin/predictions/export', verifyToken, handleExportPredictions);
app.post('/api/admin/predictions/:id/resend-email', verifyToken, handleResendPredictionEmail);
app.delete('/api/admin/predictions/:id', verifyToken, handleDeletePrediction);

// Root path fallback
app.get('/', (req, res) => {
  res.send('College Predictor & Counseling API Server is running.');
});

// Start Server
app.listen(PORT, async () => {
  await initAdmin();
  console.log(`\n==================================================`);
  console.log(`Server started on Port: ${PORT}`);
  console.log(`Health endpoint: http://localhost:${PORT}/api/health`);
  console.log(`==================================================\n`);
});
