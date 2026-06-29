const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Local database directory
const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let useMongoDB = false;
let isConnected = false;

// Attempt MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('MongoDB connected successfully.');
      isConnected = true;
      useMongoDB = true;
    })
    .catch((err) => {
      console.error('MongoDB connection error:', err.message);
      console.log('Falling back to local JSON database storage.');
      useMongoDB = false;
    });
} else {
  console.log('No MONGODB_URI provided. Using local JSON database storage.');
  useMongoDB = false;
}

// ==========================================
// MONGODB SCHEMAS
// ==========================================

const LeadSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  mobileNumber: { type: String },
  rollNumber: { type: String, default: '' },
  uniqueCode: { type: String, default: '' },
  address: { type: String, default: '' },
  state: { type: String, default: '' },
  category: { type: String },
  seatType: { type: String },
  quota: { type: String },
  instituteTypes: { type: [String] },
  academicProgram: { type: String },
  gender: { type: String },
  crlRank: { type: Number },
  categoryRank: { type: Number },
  examAppeared: { type: String, default: 'JEE Main Only' },
  preferredBranch: { type: String },
  preferredColleges: { type: String },
  role: { type: String, enum: ['student', 'admin'], default: 'student' },
  password: { type: String }, // Used for admin login
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

const CutoffSchema = new mongoose.Schema({
  collegeName: { type: String, required: true },
  instituteType: { type: String, default: '' },       // IIT, NIT, IIIT, GFTI
  branch: { type: String, required: true },
  seatType: { type: String, required: true },          // OPEN, EWS, OBC-NCL, SC, ST, etc.
  gender: { type: String, default: 'Gender-Neutral' },
  quota: { type: String, default: 'AI' },
  openingRank: { type: Number, default: 0 },
  closingRank: { type: Number, required: true },
  year: { type: Number, default: 2025 },              // 2023, 2024, or 2025
  location: { type: String, default: '' },
  state: { type: String, default: '' },
  // Legacy fields for backward compat
  category: { type: String, default: '' }
});

const OtpSchema = new mongoose.Schema({
  email: { type: String, required: true },
  otp: { type: String, required: true },
  expiresAt: { type: Date, required: true }
});

const MongoLead = mongoose.models.Lead || mongoose.model('Lead', LeadSchema);
const MongoCutoff = mongoose.models.Cutoff || mongoose.model('Cutoff', CutoffSchema);
const MongoOtp = mongoose.models.Otp || mongoose.model('Otp', OtpSchema);

const PredictionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  mobileNumber: { type: String },
  uniqueCode: { type: String },
  crlRank: { type: Number, required: true },
  category: { type: String },
  quota: { type: String },
  gender: { type: String },
  examAppeared: { type: String },
  instituteType: { type: String },
  academicProgram: { type: String },
  inputRank: { type: Number },
  dreamCount: { type: Number, default: 0 },
  realisticCount: { type: Number, default: 0 },
  safeCount: { type: Number, default: 0 },
  dreamColleges: { type: Array, default: [] },
  realisticColleges: { type: Array, default: [] },
  safeColleges: { type: Array, default: [] },
  pdfFilename: { type: String },
  emailStatus: { type: String, default: 'Pending' },
  createdAt: { type: Date, default: Date.now }
});
const MongoPrediction = mongoose.models.Prediction || mongoose.model('Prediction', PredictionSchema);

const AdminLoginLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  ipAddress: { type: String },
  userAgent: { type: String },
  status: { type: String, enum: ['Success', 'Failed'] },
  username: { type: String }
});
const MongoAdminLoginLog = mongoose.models.AdminLoginLog || mongoose.model('AdminLoginLog', AdminLoginLogSchema);

const BookSchema = new mongoose.Schema({
  bookId: { type: String, required: true, unique: true },
  status: { type: String, enum: ['Unused', 'Active', 'Expired', 'Deactivated'], default: 'Unused' },
  studentName: { type: String },
  studentEmail: { type: String },
  studentMobile: { type: String },
  predictionLimit: { type: Number, default: 20 },
  predictionsUsed: { type: Number, default: 0 },
  remainingPredictions: { type: Number, default: 20 },
  activationDate: { type: Date },
  lastUsed: { type: Date },
  createdAt: { type: Date, default: Date.now }
});
const MongoBook = mongoose.models.Book || mongoose.model('Book', BookSchema);

// ==========================================
// LOCAL JSON DATABASE HELPER
// ==========================================

class JSONDatabase {
  constructor(collectionName) {
    this.filePath = path.join(DATA_DIR, `${collectionName}.json`);
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify([], null, 2));
    }
  }

  read() {
    try {
      const data = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.error(`Error reading database file: ${this.filePath}`, e);
      return [];
    }
  }

  write(data) {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error(`Error writing database file: ${this.filePath}`, e);
    }
  }

  async find(filter = {}) {
    const list = this.read();
    return list.filter(item => {
      for (const key in filter) {
        if (filter[key] && typeof filter[key] === 'object') {
          // Handle custom operators ($gte, $lte, $regex, $options)
          if (filter[key].$gte !== undefined && item[key] < filter[key].$gte) return false;
          if (filter[key].$lte !== undefined && item[key] > filter[key].$lte) return false;
          if (filter[key].$regex !== undefined) {
            const pattern = new RegExp(filter[key].$regex, filter[key].$options || 'i');
            if (!pattern.test(item[key])) return false;
          }
        } else if (item[key] !== filter[key]) {
          return false;
        }
      }
      return true;
    });
  }

  async findOne(filter = {}) {
    const list = await this.find(filter);
    return list[0] || null;
  }

  async create(doc) {
    const list = this.read();
    const newDoc = {
      _id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
      createdAt: new Date(),
      ...doc
    };
    list.push(newDoc);
    this.write(list);
    return newDoc;
  }

  async findByIdAndUpdate(id, updateDoc) {
    const list = this.read();
    const index = list.findIndex(item => item._id === id);
    if (index === -1) return null;
    list[index] = { ...list[index], ...updateDoc };
    this.write(list);
    return list[index];
  }

  async findByIdAndDelete(id) {
    const list = this.read();
    const index = list.findIndex(item => item._id === id);
    if (index === -1) return null;
    const deleted = list.splice(index, 1);
    this.write(list);
    return deleted[0];
  }

  async deleteMany(filter = {}) {
    const list = this.read();
    const remaining = list.filter(item => {
      for (const key in filter) {
        if (item[key] === filter[key]) return false;
      }
      return true;
    });
    const deletedCount = list.length - remaining.length;
    this.write(remaining);
    return { deletedCount };
  }

  async insertMany(docs) {
    const list = this.read();
    const newDocs = docs.map(doc => ({
      _id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
      ...doc
    }));
    list.push(...newDocs);
    this.write(list);
    return newDocs;
  }
}

const localLeads = new JSONDatabase('leads');
const localCutoffs = new JSONDatabase('cutoffs');
const localOtps = new JSONDatabase('otps');
const localPredictions = new JSONDatabase('predictions');
const localAdminLoginLogs = new JSONDatabase('admin_login_logs');
const localBooks = new JSONDatabase('books');

// ==========================================
// UNIFIED API WRAPPER
// ==========================================

const Leads = {
  find: async (query = {}) => {
    if (useMongoDB && isConnected) return MongoLead.find(query).sort({ createdAt: -1 });
    const list = await localLeads.find(query);
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  findOne: async (query = {}) => {
    if (useMongoDB && isConnected) return MongoLead.findOne(query);
    return localLeads.findOne(query);
  },
  create: async (doc) => {
    if (useMongoDB && isConnected) return MongoLead.create(doc);
    return localLeads.create(doc);
  },
  findByIdAndUpdate: async (id, doc) => {
    if (useMongoDB && isConnected) return MongoLead.findByIdAndUpdate(id, doc, { new: true });
    return localLeads.findByIdAndUpdate(id, doc);
  },
  findByIdAndDelete: async (id) => {
    if (useMongoDB && isConnected) return MongoLead.findByIdAndDelete(id);
    return localLeads.findByIdAndDelete(id);
  }
};

const Cutoffs = {
  find: async (query = {}) => {
    if (useMongoDB && isConnected) return MongoCutoff.find(query);
    return localCutoffs.find(query);
  },
  findOne: async (query = {}) => {
    if (useMongoDB && isConnected) return MongoCutoff.findOne(query);
    return localCutoffs.findOne(query);
  },
  create: async (doc) => {
    if (useMongoDB && isConnected) return MongoCutoff.create(doc);
    return localCutoffs.create(doc);
  },
  insertMany: async (docs) => {
    if (useMongoDB && isConnected) return MongoCutoff.insertMany(docs);
    return localCutoffs.insertMany(docs);
  },
  findByIdAndUpdate: async (id, doc) => {
    if (useMongoDB && isConnected) return MongoCutoff.findByIdAndUpdate(id, doc, { new: true });
    return localCutoffs.findByIdAndUpdate(id, doc);
  },
  findByIdAndDelete: async (id) => {
    if (useMongoDB && isConnected) return MongoCutoff.findByIdAndDelete(id);
    return localCutoffs.findByIdAndDelete(id);
  },
  deleteMany: async (query = {}) => {
    if (useMongoDB && isConnected) return MongoCutoff.deleteMany(query);
    return localCutoffs.deleteMany(query);
  }
};

const Otps = {
  create: async (doc) => {
    if (useMongoDB && isConnected) return MongoOtp.create(doc);
    return localOtps.create(doc);
  },
  findOne: async (query = {}) => {
    if (useMongoDB && isConnected) return MongoOtp.findOne(query);
    return localOtps.findOne(query);
  },
  deleteMany: async (query = {}) => {
    if (useMongoDB && isConnected) return MongoOtp.deleteMany(query);
    return localOtps.deleteMany(query);
  }
};

const Predictions = {
  find: async (query = {}) => {
    if (useMongoDB && isConnected) return MongoPrediction.find(query).sort({ createdAt: -1 });
    const list = await localPredictions.find(query);
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  findOne: async (query = {}) => {
    if (useMongoDB && isConnected) return MongoPrediction.findOne(query);
    return localPredictions.findOne(query);
  },
  create: async (doc) => {
    if (useMongoDB && isConnected) return MongoPrediction.create(doc);
    return localPredictions.create(doc);
  },
  findByIdAndUpdate: async (id, doc) => {
    if (useMongoDB && isConnected) return MongoPrediction.findByIdAndUpdate(id, doc, { new: true });
    return localPredictions.findByIdAndUpdate(id, doc);
  },
  findByIdAndDelete: async (id) => {
    if (useMongoDB && isConnected) return MongoPrediction.findByIdAndDelete(id);
    return localPredictions.findByIdAndDelete(id);
  },
  deleteMany: async (query = {}) => {
    if (useMongoDB && isConnected) return MongoPrediction.deleteMany(query);
    return localPredictions.deleteMany(query);
  }
};

const AdminLoginLogs = {
  create: async (doc) => {
    if (useMongoDB && isConnected) return MongoAdminLoginLog.create(doc);
    return localAdminLoginLogs.create(doc);
  }
};

const Books = {
  find: async (query = {}) => {
    if (useMongoDB && isConnected) return MongoBook.find(query).sort({ createdAt: -1 });
    const list = await localBooks.find(query);
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  findOne: async (query = {}) => {
    if (useMongoDB && isConnected) return MongoBook.findOne(query);
    return localBooks.findOne(query);
  },
  create: async (doc) => {
    if (useMongoDB && isConnected) return MongoBook.create(doc);
    return localBooks.create(doc);
  },
  insertMany: async (docs) => {
    if (useMongoDB && isConnected) return MongoBook.insertMany(docs);
    return localBooks.insertMany(docs);
  },
  findByIdAndUpdate: async (id, doc) => {
    if (useMongoDB && isConnected) return MongoBook.findByIdAndUpdate(id, doc, { new: true });
    return localBooks.findByIdAndUpdate(id, doc);
  },
  findByIdAndDelete: async (id) => {
    if (useMongoDB && isConnected) return MongoBook.findByIdAndDelete(id);
    return localBooks.findByIdAndDelete(id);
  },
  deleteMany: async (query = {}) => {
    if (useMongoDB && isConnected) return MongoBook.deleteMany(query);
    return localBooks.deleteMany(query);
  },
  countDocuments: async (query = {}) => {
    if (useMongoDB && isConnected) return MongoBook.countDocuments(query);
    const list = await localBooks.find(query);
    return list.length;
  }
};

module.exports = {
  Leads,
  Cutoffs,
  Otps,
  Predictions,
  AdminLoginLogs,
  Books,
  checkConnectionStatus: () => ({
    useMongoDB,
    isConnected: useMongoDB && isConnected,
    storageType: useMongoDB ? 'MongoDB' : 'Local JSON Files'
  }),
  initAdmin: async () => {
    // Seed admin if it doesn't exist
    const adminEmail = process.env.ADMIN_USERNAME || 'admin@admin.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    
    try {
      const existingAdmin = await Leads.findOne({ email: adminEmail, role: 'admin' });
      if (!existingAdmin) {
        // We do not hash password here for simplicity, but in production we should
        await Leads.create({
          name: 'System Admin',
          email: adminEmail,
          password: adminPassword,
          role: 'admin',
          phone: '0000000000',
          category: 'OPEN',
          crlRank: 1,
          categoryRank: 1
        });
        console.log('Admin user initialized in database');
      }
    } catch (error) {
      console.error('Error initializing admin user:', error);
    }
    
    // Seed Book IDs
    try {
      const bookCount = await Books.countDocuments({});
      if (bookCount === 0) {
        const seedBooks = [];
        for (let i = 1; i <= 20; i++) {
          seedBooks.push({
            bookId: `BOOK${i.toString().padStart(3, '0')}`,
            status: 'Unused',
            predictionLimit: 20,
            predictionsUsed: 0,
            remainingPredictions: 20
          });
        }
        await Books.insertMany(seedBooks);
        console.log('Seeded 20 initial Book IDs.');
      }
    } catch (err) {
      console.error('Error seeding book IDs:', err);
    }
  }
};
