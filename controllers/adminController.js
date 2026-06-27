const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const { Leads, Cutoffs, Predictions, AdminLoginLogs } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

/**
 * Admin Login
 */
async function handleLogin(req, res) {
  const { username, password } = req.body;
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'Unknown';

  if (!username || !password) {
    return res.status(400).json({ message: 'Username/Email and password are required' });
  }

  try {
    const adminUser = await Leads.findOne({ email: username, role: 'admin' });

    if (adminUser) {
      // Check if account is locked
      if (adminUser.lockUntil && adminUser.lockUntil > new Date()) {
        const remainingMinutes = Math.ceil((new Date(adminUser.lockUntil) - new Date()) / 1000 / 60);
        return res.status(429).json({ message: `Account locked due to too many failed attempts. Try again in ${remainingMinutes} minutes.` });
      }

      if (adminUser.password === password) {
        // Success! Reset attempts.
        await Leads.findByIdAndUpdate(adminUser._id, { loginAttempts: 0, lockUntil: null });
        await AdminLoginLogs.create({ ipAddress, userAgent, status: 'Success', username });
        const token = jwt.sign({ role: 'admin', username, email: username }, JWT_SECRET, { expiresIn: '24h' });
        return res.json({ message: 'Login successful', token });
      } else {
        // Failed attempt
        const attempts = (adminUser.loginAttempts || 0) + 1;
        let lockUntil = null;
        if (attempts >= 5) {
          lockUntil = new Date(Date.now() + 15 * 60 * 1000); // Lock for 15 minutes
        }
        await Leads.findByIdAndUpdate(adminUser._id, { loginAttempts: attempts, lockUntil });
        await AdminLoginLogs.create({ ipAddress, userAgent, status: 'Failed', username });
        
        if (lockUntil) {
          return res.status(429).json({ message: 'Account locked due to too many failed attempts. Try again in 15 minutes.' });
        }
        return res.status(401).json({ message: `Invalid admin credentials. Attempt ${attempts} of 5.` });
      }
    }

    // Fallback to environment variables
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      await AdminLoginLogs.create({ ipAddress, userAgent, status: 'Success', username });
      const token = jwt.sign({ role: 'admin', username, email: username }, JWT_SECRET, { expiresIn: '24h' });
      return res.json({ message: 'Login successful (Env)', token });
    }

    await AdminLoginLogs.create({ ipAddress, userAgent, status: 'Failed', username });
    return res.status(401).json({ message: 'Invalid admin credentials' });
  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({ message: 'Error processing login' });
  }
}

/**
 * Middleware: Verify Admin JWT Token
 */
function verifyToken(req, res, next) {
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
    if (verified.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }
    req.user = verified;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }
}

/**
 * Get Student Leads
 */
async function handleGetLeads(req, res) {
  try {
    const { search, category } = req.query;
    let filter = {};

    if (category && category !== 'all') {
      filter.category = category;
    }

    const leads = await Leads.find(filter);

    let filteredLeads = leads;
    if (search) {
      const q = search.toLowerCase();
      filteredLeads = leads.filter(l =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.phone || '').toLowerCase().includes(q) ||
        (l.mobileNumber || '').toLowerCase().includes(q) ||
        (l.rollNumber || '').toLowerCase().includes(q) ||
        (l.uniqueCode || '').toLowerCase().includes(q) ||
        (l.quota || '').toLowerCase().includes(q) ||
        (l.state || '').toLowerCase().includes(q)
      );
    }

    return res.json(filteredLeads);
  } catch (error) {
    console.error('Error fetching leads:', error);
    return res.status(500).json({ message: 'Error fetching leads' });
  }
}

/**
 * Export Leads to CSV
 */
async function handleExportLeads(req, res) {
  try {
    const leads = await Leads.find({});

    const headers = [
      'Name', 'Email', 'Mobile Number', 'Unique Code',
      'Gender', 'Quota', 'Seat Type', 'Category',
      'CRL Rank', 'Category Rank', 'Exam Appeared For',
      'Institute Types', 'Academic Program', 'Registration Date'
    ];

    let csvRows = [headers.join(',')];

    leads.forEach(l => {
      const row = [
        `"${(l.name || '').replace(/"/g, '""')}"`,
        `"${(l.email || '').replace(/"/g, '""')}"`,
        `"${(l.mobileNumber || l.phone || '').replace(/"/g, '""')}"`,
        `"${(l.uniqueCode || l.rollNumber || '').replace(/"/g, '""')}"`,
        `"${(l.gender || '').replace(/"/g, '""')}"`,
        `"${(l.quota || l.state || '').replace(/"/g, '""')}"`,
        `"${(l.seatType || l.category || '').replace(/"/g, '""')}"`,
        `"${(l.category || '').replace(/"/g, '""')}"`,
        l.crlRank,
        l.categoryRank || l.crlRank,
        `"${(l.examAppeared || 'JEE Main Only').replace(/"/g, '""')}"`,
        `"${(Array.isArray(l.instituteTypes) ? l.instituteTypes.join(';') : (l.instituteTypes || '')).replace(/"/g, '""')}"`,
        `"${(l.academicProgram || l.preferredBranch || '').replace(/"/g, '""')}"`,
        `"${new Date(l.createdAt).toISOString()}"`
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=student_leads.csv');
    return res.send(csvContent);
  } catch (error) {
    console.error('Error exporting leads:', error);
    return res.status(500).json({ message: 'Error exporting leads' });
  }
}

/**
 * Get Colleges/Cutoffs
 */
async function handleGetColleges(req, res) {
  try {
    const { search } = req.query;
    const cutoffs = await Cutoffs.find({});

    let filtered = cutoffs;
    if (search) {
      const q = search.toLowerCase();
      filtered = cutoffs.filter(c =>
        (c.collegeName || '').toLowerCase().includes(q) ||
        (c.branch || '').toLowerCase().includes(q) ||
        (c.seatType || c.category || '').toLowerCase().includes(q) ||
        (c.location || '').toLowerCase().includes(q) ||
        (c.state || '').toLowerCase().includes(q) ||
        (c.instituteType || '').toLowerCase().includes(q)
      );
    }

    return res.json(filtered);
  } catch (error) {
    console.error('Error fetching colleges:', error);
    return res.status(500).json({ message: 'Error fetching colleges' });
  }
}

/**
 * Create College Cutoff
 */
async function handleCreateCollege(req, res) {
  const { collegeName, branch, seatType, closingRank, location, state, year, gender, quota, openingRank, category } = req.body;
  if (!collegeName || !branch || closingRank === undefined) {
    return res.status(400).json({ message: 'College name, branch, and closing rank are required' });
  }

  try {
    const instituteType = detectInstituteType(collegeName);
    const newCutoff = await Cutoffs.create({
      collegeName,
      instituteType,
      branch,
      seatType: seatType || category || 'OPEN',
      gender: gender || 'Gender-Neutral',
      quota: quota || 'AI',
      openingRank: Number(openingRank) || 0,
      closingRank: Number(closingRank),
      year: Number(year) || 2025,
      location: location || '',
      state: state || '',
      category: category || seatType || 'OPEN'
    });
    return res.status(201).json(newCutoff);
  } catch (error) {
    console.error('Error creating college cutoff:', error);
    return res.status(500).json({ message: 'Error creating college cutoff' });
  }
}

/**
 * Update College Cutoff
 */
async function handleUpdateCollege(req, res) {
  const { id } = req.params;
  const { collegeName, branch, seatType, closingRank, location, state, year, gender, quota, openingRank, category } = req.body;

  try {
    const updateData = {};
    if (collegeName !== undefined) {
      updateData.collegeName = collegeName;
      updateData.instituteType = detectInstituteType(collegeName);
    }
    if (branch !== undefined) updateData.branch = branch;
    if (seatType !== undefined) updateData.seatType = seatType;
    if (closingRank !== undefined) updateData.closingRank = Number(closingRank);
    if (location !== undefined) updateData.location = location;
    if (state !== undefined) updateData.state = state;
    if (year !== undefined) updateData.year = Number(year);
    if (gender !== undefined) updateData.gender = gender;
    if (quota !== undefined) updateData.quota = quota;
    if (openingRank !== undefined) updateData.openingRank = Number(openingRank);
    if (category !== undefined) updateData.category = category;

    const updated = await Cutoffs.findByIdAndUpdate(id, updateData);

    if (!updated) {
      return res.status(404).json({ message: 'College cutoff not found' });
    }

    return res.json({ message: 'College cutoff updated successfully', data: updated });
  } catch (error) {
    console.error('Error updating college cutoff:', error);
    return res.status(500).json({ message: 'Error updating college cutoff' });
  }
}

/**
 * Delete College Cutoff
 */
async function handleDeleteCollege(req, res) {
  const { id } = req.params;

  try {
    const deleted = await Cutoffs.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: 'College cutoff not found' });
    }
    return res.json({ message: 'College cutoff deleted successfully' });
  } catch (error) {
    console.error('Error deleting college cutoff:', error);
    return res.status(500).json({ message: 'Error deleting college cutoff' });
  }
}

// =================================================
// DETECT INSTITUTE TYPE FROM COLLEGE NAME
// =================================================
function detectInstituteType(name) {
  const upper = (name || '').toUpperCase();
  if (upper.includes('INDIAN INSTITUTE OF TECHNOLOGY') || /\bIIT\b/.test(upper)) return 'IIT';
  if (upper.includes('INDIAN INSTITUTE OF INFORMATION TECHNOLOGY') || /\bIIIT\b/.test(upper)) return 'IIIT';
  if (upper.includes('NATIONAL INSTITUTE OF TECHNOLOGY') || /\bNIT\b/.test(upper)) return 'NIT';
  return 'GFTI';
}

// =================================================
// DETECT STATE FROM COLLEGE NAME
// =================================================
function detectStateFromCollegeName(name) {
  const n = (name || '').toUpperCase();
  if (n.includes('BOMBAY') || n.includes('NAGPUR') || n.includes('PUNE') || n.includes('MAHARASHTRA')) return 'Maharashtra';
  if (n.includes('DELHI')) return 'Delhi';
  if (n.includes('MADRAS') || n.includes('TRICHY') || n.includes('TIRUCHIRAPPALLI') || n.includes('TAMIL NADU')) return 'Tamil Nadu';
  if (n.includes('KHARAGPUR') || n.includes('WEST BENGAL') || n.includes('DURGAPUR')) return 'West Bengal';
  if (n.includes('KANPUR') || n.includes('ALLAHABAD') || n.includes('VARANASI') || n.includes('UTTAR PRADESH') || n.includes('LUCKNOW')) return 'Uttar Pradesh';
  if (n.includes('ROORKEE') || n.includes('UTTARAKHAND')) return 'Uttarakhand';
  if (n.includes('GUWAHATI') || n.includes('ASSAM') || n.includes('SILCHAR')) return 'Assam';
  if (n.includes('HYDERABAD') || n.includes('TELANGANA') || n.includes('WARANGAL')) return 'Telangana';
  if (n.includes('INDORE') || n.includes('MADHYA PRADESH') || n.includes('BHOPAL')) return 'Madhya Pradesh';
  if (n.includes('JAIPUR') || n.includes('RAJASTHAN') || n.includes('JODHPUR')) return 'Rajasthan';
  if (n.includes('SURATHKAL') || n.includes('KARNATAKA') || n.includes('BANGALORE')) return 'Karnataka';
  if (n.includes('ROURKELA') || n.includes('ODISHA') || n.includes('BHUBANESWAR')) return 'Odisha';
  if (n.includes('CALICUT') || n.includes('KERALA')) return 'Kerala';
  if (n.includes('PATNA') || n.includes('BIHAR')) return 'Bihar';
  if (n.includes('RAIPUR') || n.includes('CHHATTISGARH')) return 'Chhattisgarh';
  if (n.includes('GOA')) return 'Goa';
  if (n.includes('GUJARAT') || n.includes('SURAT') || n.includes('GANDHINAGAR')) return 'Gujarat';
  if (n.includes('HARYANA') || n.includes('KURUKSHETRA')) return 'Haryana';
  if (n.includes('HIMACHAL') || n.includes('HAMIRPUR')) return 'Himachal Pradesh';
  if (n.includes('JAMMU') || n.includes('SRINAGAR') || n.includes('KASHMIR')) return 'Jammu and Kashmir';
  if (n.includes('LADAKH')) return 'Ladakh';
  if (n.includes('PUDUCHERRY') || n.includes('PONDICHERRY')) return 'Puducherry';
  if (n.includes('PUNJAB') || n.includes('JALANDHAR')) return 'Punjab';
  if (n.includes('SIKKIM')) return 'Sikkim';
  if (n.includes('TRIPURA') || n.includes('AGARTALA')) return 'Tripura';
  if (n.includes('MEGHALAYA') || n.includes('SHILLONG')) return 'Meghalaya';
  if (n.includes('MANIPUR') || n.includes('IMPHAL')) return 'Manipur';
  if (n.includes('MIZORAM')) return 'Mizoram';
  if (n.includes('NAGALAND')) return 'Nagaland';
  if (n.includes('ARUNACHAL') || n.includes('YUPIA')) return 'Arunachal Pradesh';
  if (n.includes('ANDHRA') || n.includes('VIJAYAWADA') || n.includes('TADEPALLIGUDEM')) return 'Andhra Pradesh';
  if (n.includes('CHANDIGARH')) return 'Chandigarh';
  return '';
}

// =================================================
// SMART COLUMN NAME RESOLVER (JoSAA Format)
// =================================================
function resolveColumnName(header) {
  if (!header) return null;
  const h = header.trim().toLowerCase().replace(/[\s_\-\.]+/g, '');

  // Institute / College Name
  if (['collegename','college','institutename','institute','institutionname','institution','name'].includes(h) || h.includes('institute') || h.includes('college')) return 'collegeName';

  // Branch / Academic Program
  if (['branch','course','programme','program','branchname','coursename','department','dept','stream',
       'academicprogramname','academicprogram','programname'].includes(h) || h.includes('academicprogram') || h.includes('programname') || h.includes('branch')) return 'branch';

  // Seat Type (was category in old format)
  if (['seattype','category','caste','reservation','categoryname','castecategory'].includes(h) || h.includes('seattype')) return 'seatType';

  // Gender
  if (['gender','gendercategory','sex'].includes(h) || h.includes('gender')) return 'gender';

  // Quota
  if (['quota','quotatype','admissionquota'].includes(h) || h.includes('quota')) return 'quota';

  // Opening Rank
  if (['openingrank','openrank','or','startrank','openingrankno','openingrankl'].includes(h) || h.includes('openingrank') || h.includes('openrank')) return 'openingRank';

  // Closing Rank / Cutoff
  if (['closingrank','cutoff','closerank','closingcutoff','cutoffrank','rank','closingrankno','cr','lastrank'].includes(h) || h.includes('closingrank') || h.includes('closerank')) return 'closingRank';

  // Year
  if (['year','admissionyear','counsellingyear','session'].includes(h)) return 'year';

  // Institute Type
  if (['institutetype','collegetype','type','insttype'].includes(h)) return 'instituteType';

  // Location / City
  if (['location','city','place','campus','campuscity','collegecity'].includes(h)) return 'location';

  // State
  if (['state','statename','collegestate','region'].includes(h)) return 'state';

  return null;
}

/**
 * Parse rows from an array of objects into cutoff entries (multi-year format)
 */
function parseRowsIntoCutoffs(rowObjects, uploadYear) {
  const results = [];
  const skipped = [];

  for (let i = 0; i < rowObjects.length; i++) {
    const raw = rowObjects[i];
    const mapped = {};

    for (const key in raw) {
      const field = resolveColumnName(key);
      if (field) {
        const val = String(raw[key] || '').trim();
        mapped[field] = val;
      }
    }

    // Required: collegeName, branch, closingRank
    if (!mapped.collegeName || !mapped.branch || !mapped.closingRank) {
      skipped.push(i + 2);
      continue;
    }

    const closingRankNum = parseInt(String(mapped.closingRank).replace(/,/g, ''));
    if (isNaN(closingRankNum) || closingRankNum <= 0) {
      skipped.push(i + 2);
      continue;
    }

    const openingRankNum = mapped.openingRank ? parseInt(String(mapped.openingRank).replace(/,/g, '')) : 0;
    const rowYear = mapped.year ? parseInt(mapped.year) : uploadYear;

    // Detect institute type from name if not provided
    const instituteType = mapped.instituteType || detectInstituteType(mapped.collegeName);

    results.push({
      collegeName: mapped.collegeName,
      instituteType,
      branch: mapped.branch,
      seatType: mapped.seatType || 'OPEN',
      gender: mapped.gender || 'Gender-Neutral',
      quota: mapped.quota || 'AI',
      openingRank: isNaN(openingRankNum) ? 0 : openingRankNum,
      closingRank: closingRankNum,
      year: rowYear,
      location: mapped.location || '',
      state: mapped.state || detectStateFromCollegeName(mapped.collegeName),
      category: mapped.seatType || 'OPEN' // backward compat
    });
  }

  return { results, skipped };
}

/**
 * Parse Excel file (.xlsx / .xls) into row objects
 */
function parseExcelFile(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Parse as raw 2D array
  const rawSheetsData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  
  // Find header row dynamically
  let headerRowIndex = 0;
  for (let r = 0; r < rawSheetsData.length; r++) {
    const row = rawSheetsData[r];
    if (!row || row.length === 0) continue;
    
    let hasInstitute = false;
    let hasClosing = false;
    for (const val of row) {
      if (val) {
        const s = String(val).toLowerCase().replace(/[\s_\-\.]+/g, '');
        if (s.includes('institute') || s.includes('college')) {
          hasInstitute = true;
        }
        if (s.includes('closing') || s.includes('cutoff') || s.includes('closerank')) {
          hasClosing = true;
        }
      }
    }
    if (hasInstitute && hasClosing) {
      headerRowIndex = r;
      break;
    }
  }
  
  const headers = rawSheetsData[headerRowIndex] || [];
  const rows = [];
  
  for (let r = headerRowIndex + 1; r < rawSheetsData.length; r++) {
    const row = rawSheetsData[r];
    if (!row || row.length === 0) continue;
    
    const obj = {};
    let hasAnyValue = false;
    headers.forEach((header, colIndex) => {
      if (header !== undefined && header !== null && header !== '') {
        const val = row[colIndex] !== undefined ? row[colIndex] : '';
        obj[header] = val;
        if (val !== '') hasAnyValue = true;
      }
    });
    if (hasAnyValue) {
      rows.push(obj);
    }
  }

  return { rows, sheetName, totalSheets: workbook.SheetNames.length };
}

/**
 * Parse CSV file into row objects (returns a Promise)
 */
function parseCSVFile(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => rows.push(data))
      .on('end', () => resolve(rows))
      .on('error', (err) => reject(err));
  });
}

/**
 * Upload Cutoffs from CSV or Excel
 * Accepts optional query param ?year=2023|2024|2025
 * Only deletes cutoffs for the selected year (not all data)
 */
async function handleUploadCutoffs(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded. Please upload a CSV or Excel (.xlsx) file.' });
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname.toLowerCase();
  const ext = path.extname(originalName);

  // Get year from query param or body
  const uploadYear = parseInt(req.query.year || req.body.year) || 2025;

  try {
    let rawRows = [];
    let fileInfo = {};

    if (ext === '.xlsx' || ext === '.xls') {
      console.log(`Parsing Excel file: ${req.file.originalname} for year ${uploadYear}`);
      const parsed = parseExcelFile(filePath);
      rawRows = parsed.rows;
      fileInfo = { type: 'Excel', sheet: parsed.sheetName, totalSheets: parsed.totalSheets };
    } else if (ext === '.csv') {
      console.log(`Parsing CSV file: ${req.file.originalname} for year ${uploadYear}`);
      rawRows = await parseCSVFile(filePath);
      fileInfo = { type: 'CSV' };
    } else {
      fs.unlink(filePath, () => {});
      return res.status(400).json({
        message: `Unsupported file format "${ext}". Please upload a .csv, .xlsx, or .xls file.`
      });
    }

    // Remove temporary file
    fs.unlink(filePath, (err) => {
      if (err) console.error('Error deleting temp upload file:', err);
    });

    if (rawRows.length === 0) {
      return res.status(400).json({
        message: 'The uploaded file appears to be empty. No data rows were found.'
      });
    }

    // Parse into cutoff entries
    const { results, skipped } = parseRowsIntoCutoffs(rawRows, uploadYear);

    if (results.length === 0) {
      return res.status(400).json({
        message: `No valid cutoff records found. Ensure your file has columns like: Institute, Academic Program Name, Seat Type, Closing Rank.`,
        totalRows: rawRows.length,
        skippedRows: skipped.length
      });
    }

    // Merge all datasets and deduplicate by key: collegeName|branch|quota|seatType|gender
    const existingCutoffs = await Cutoffs.find({});
    const allCutoffs = [...existingCutoffs, ...results];
    
    const deduplicatedMap = new Map();
    allCutoffs.forEach(c => {
      // Create a unique key for deduplication
      const key = `${(c.collegeName||'').toLowerCase()}|${(c.branch||'').toLowerCase()}|${(c.quota||'').toLowerCase()}|${(c.seatType||'').toLowerCase()}|${(c.gender||'').toLowerCase()}`;
      
      // Since 'results' (new uploads) are appended after 'existingCutoffs', 
      // setting it in the map will overwrite older duplicates with newer ones.
      deduplicatedMap.set(key, c);
    });

    const finalCutoffs = Array.from(deduplicatedMap.values());

    // Clear existing to replace with the deduplicated merged dataset
    await Cutoffs.deleteMany({});
    await Cutoffs.insertMany(finalCutoffs);

    let successMessage = `✅ Successfully loaded ${results.length} cutoff records for JoSAA ${uploadYear}.`;
    if (skipped.length > 0) {
      successMessage += ` (${skipped.length} rows skipped due to missing data)`;
    }

    console.log(successMessage);

    return res.json({
      message: successMessage,
      count: results.length,
      skipped: skipped.length,
      year: uploadYear,
      fileType: fileInfo.type,
      sheetName: fileInfo.sheet || null
    });

  } catch (error) {
    fs.unlink(filePath, () => {});
    console.error('Error processing uploaded file:', error);
    return res.status(500).json({
      message: `Error reading the uploaded file. Please check the file format and try again. (${error.message})`
    });
  }
}

/**
 * Get which cutoff years have data and their counts
 */
async function handleGetCutoffYears(req, res) {
  try {
    const allCutoffs = await Cutoffs.find({});

    // Count per year
    const yearCounts = {};
    allCutoffs.forEach(c => {
      const y = c.year || 'Unknown';
      yearCounts[y] = (yearCounts[y] || 0) + 1;
    });

    const years = Object.keys(yearCounts)
      .map(y => ({ year: Number(y) || y, count: yearCounts[y] }))
      .sort((a, b) => (a.year > b.year ? 1 : -1));

    return res.json({
      totalRecords: allCutoffs.length,
      years
    });
  } catch (error) {
    console.error('Error fetching cutoff years:', error);
    return res.status(500).json({ message: 'Error fetching cutoff year data' });
  }
}

/**
 * Get Dashboard Stats
 */
async function handleGetStats(req, res) {
  try {
    const allLeads = await Leads.find({});
    const allColleges = await Cutoffs.find({});

    const totalLeads = allLeads.length;
    const totalColleges = allColleges.length;

    // Unique colleges (by name)
    const uniqueColleges = new Set(allColleges.map(c => c.collegeName)).size;

    // Category distribution
    const categoryMap = {};
    allLeads.forEach(lead => {
      const cat = lead.category || lead.seatType || 'Unknown';
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    });

    const categoryDistribution = Object.keys(categoryMap).map(key => ({
      _id: key,
      count: categoryMap[key]
    }));

    // Year distribution for cutoffs
    const yearMap = {};
    allColleges.forEach(c => {
      const y = c.year || 'Unknown';
      yearMap[y] = (yearMap[y] || 0) + 1;
    });

    const yearDistribution = Object.keys(yearMap)
      .map(key => ({ _id: key, count: yearMap[key] }))
      .sort((a, b) => Number(a._id) - Number(b._id));

    const recentLeads = allLeads.slice(0, 5);

    return res.json({
      totalLeads,
      totalColleges,
      uniqueColleges,
      categoryDistribution,
      yearDistribution,
      recentLeads
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return res.status(500).json({ message: 'Error fetching stats' });
  }
}

/**
 * Get Predictions History
 */
async function handleGetPredictions(req, res) {
  try {
    const { search } = req.query;
    let filter = {};

    const predictions = await Predictions.find(filter);

    let filteredPredictions = predictions;
    if (search) {
      const q = search.toLowerCase();
      filteredPredictions = predictions.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.mobileNumber || '').toLowerCase().includes(q)
      );
    }

    return res.json(filteredPredictions);
  } catch (error) {
    console.error('Error fetching predictions:', error);
    return res.status(500).json({ message: 'Error fetching predictions' });
  }
}

/**
 * Export Predictions History to CSV
 */
async function handleExportPredictions(req, res) {
  try {
    const predictions = await Predictions.find({});

    const headers = [
      'Name', 'Email', 'Mobile Number', 'CRL Rank',
      'Category', 'Quota', 'Gender', 'Exam Appeared',
      'Dream Colleges', 'Realistic Colleges', 'Safe Colleges', 'Date'
    ];

    let csvRows = [headers.join(',')];

    predictions.forEach(p => {
      const row = [
        `"${(p.name || '').replace(/"/g, '""')}"`,
        `"${(p.email || '').replace(/"/g, '""')}"`,
        `"${(p.mobileNumber || '').replace(/"/g, '""')}"`,
        p.crlRank,
        `"${(p.category || '').replace(/"/g, '""')}"`,
        `"${(p.quota || '').replace(/"/g, '""')}"`,
        `"${(p.gender || '').replace(/"/g, '""')}"`,
        `"${(p.examAppeared || '').replace(/"/g, '""')}"`,
        p.dreamCount || 0,
        p.realisticCount || 0,
        p.safeCount || 0,
        `"${new Date(p.createdAt).toISOString()}"`
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=prediction_history.csv');
    return res.send(csvContent);
  } catch (error) {
    console.error('Error exporting predictions:', error);
    return res.status(500).json({ message: 'Error exporting predictions' });
  }
}

/**
 * Resend Email for Prediction Report
 */
async function handleResendPredictionEmail(req, res) {
  const { id } = req.params;
  try {
    const prediction = await Predictions.findOne({ _id: id });
    if (!prediction) {
      return res.status(404).json({ message: 'Prediction report not found' });
    }

    const { sendPredictionResults } = require('../services/emailService');
    const path = require('path');
    let pdfPath = null;
    if (prediction.pdfFilename) {
      pdfPath = path.join(__dirname, '..', 'uploads', 'pdfs', prediction.pdfFilename);
    }

    const emailResult = await sendPredictionResults(prediction.email, prediction.name, pdfPath);
    if (emailResult.success) {
      await Predictions.findByIdAndUpdate(id, { emailStatus: 'Sent' });
      return res.json({ message: 'Email sent successfully' });
    } else {
      return res.status(500).json({ message: 'Failed to send email' });
    }
  } catch (error) {
    console.error('Error resending email:', error);
    return res.status(500).json({ message: 'Error resending email' });
  }
}

/**
 * Delete Prediction Report
 */
async function handleDeletePrediction(req, res) {
  const { id } = req.params;
  try {
    const deleted = await Predictions.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: 'Prediction report not found' });
    }
    return res.json({ message: 'Prediction report deleted successfully' });
  } catch (error) {
    console.error('Error deleting prediction:', error);
    return res.status(500).json({ message: 'Error deleting prediction' });
  }
}

module.exports = {
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
};
