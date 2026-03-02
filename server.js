require('dotenv').config();
const express = require('express');
const cors = require('cors');
// const mongoose = require('mongoose'); // NeDB migration
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Datastore = require('nedb-promises');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const ZKLib = require('node-zklib');

// --- Cấu hình MongoDB (Dành cho Vercel/Cloud) ---
const MONGODB_URI = process.env.MONGODB_URI;
let isMongoDB = false;

if (MONGODB_URI && !MONGODB_URI.includes('localhost')) {
  mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }).then(() => {
    console.log('✅ Connected to MongoDB Atlas');
    isMongoDB = true;
  }).catch(err => {
    console.error('❌ MongoDB connection error:', err);
  });
} else {
  console.log('ℹ️ Using local NeDB storage');
}

// --- Cấu hình Email ---
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// --- Bộ quản lý thông báo tập trung ---
const NotificationManager = {
  /**
   * Gửi thông báo đến App và optionally qua Email
   * @param {Object} options { userId, title, message, type, email }
   */
  async notify({ userId, title, message, type = 'info', email = null }) {
    try {
      // 1. Tạo thông báo trong App
      await Notification.create({
        userId,
        title,
        message,
        type,
        isRead: false,
        createdAt: new Date()
      });
      broadcastSync('notification:created', { userId });

      // 2. Gửi Email nếu có địa chỉ email
      if (email && process.env.SMTP_USER && process.env.SMTP_USER !== 'your_email@gmail.com') {
        const mailOptions = {
          from: process.env.SYSTEM_EMAIL_FROM,
          to: email,
          subject: title,
          html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                   <h2 style="color: #2563eb;">${title}</h2>
                   <p>${message.replace(/\n/g, '<br>')}</p>
                   <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                   <small style="color: #64748b;">Đây là thông báo tự động từ hệ thống HRM Pro.</small>
                 </div>`
        };
        await transporter.sendMail(mailOptions);
      }
      return true;
    } catch (error) {
      console.error('Notification Error:', error);
      return false;
    }
  }
};

// Ensure data directory exists
// In production environments (like Render/Railway), you might want to mount a persistent disk to /data
const dataDir = process.env.DATA_PATH || path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ==================== WRAPPER HELPER ====================
class BaseWrapper {
  constructor(db, data) {
    this.db = db;
    Object.assign(this, data);
  }
  async save() {
    if (this._id) {
      await this.db.update({ _id: this._id }, this, { upsert: true });
      return this;
    } else {
      const newDoc = await this.db.insert(this);
      Object.assign(this, newDoc);
      return this;
    }
  }
}

function createModel(dbName) {
  if (isMongoDB || (MONGODB_URI && !MONGODB_URI.includes('localhost'))) {
    // MongoDB Implementation using Mongoose
    const schema = new mongoose.Schema({}, { strict: false, timestamps: true });
    const MongooseModel = mongoose.models[dbName] || mongoose.model(dbName, schema);

    class Model {
      constructor(data) {
        this._doc = new MongooseModel(data);
        Object.assign(this, data);
      }
      async save() {
        const saved = await this._doc.save();
        Object.assign(this, saved.toObject());
        return this;
      }
      static get db() { return MongooseModel; }
      static find(query = {}) { return MongooseModel.find(query).lean(); }
      static findOne(query) { return MongooseModel.findOne(query).lean(); }
      static findById(id) {
        if (typeof id === 'string' && id.length === 24) return MongooseModel.findById(id).lean();
        return MongooseModel.findOne({ _id: id }).lean();
      }
      static async create(data) {
        return await MongooseModel.create(data).then(doc => doc.toObject());
      }
      static async findByIdAndUpdate(id, update, options) {
        const query = (typeof id === 'string' && id.length === 24) ? { _id: id } : { _id: id };
        return await MongooseModel.findOneAndUpdate(query, update, { ...options, new: true }).lean();
      }
      static async findOneAndUpdate(query, update, options) {
        return await MongooseModel.findOneAndUpdate(query, update, { ...options, new: true }).lean();
      }
      static async findByIdAndDelete(id) {
        const query = (typeof id === 'string' && id.length === 24) ? { _id: id } : { _id: id };
        return await MongooseModel.findOneAndDelete(query).lean();
      }
      static async deleteMany(query) { return await MongooseModel.deleteMany(query); }
      static async countDocuments(query) { return await MongooseModel.countDocuments(query); }
      static lean() { return this; }
    }
    return Model;
  } else {
    // Existing NeDB Implementation
    const dbPath = path.join(dataDir, `${dbName}.db`);
    const db = Datastore.create({
      filename: dbPath,
      autoload: true,
      timestampData: true
    });
    class Model extends BaseWrapper {
      constructor(data) { super(db, data); }
      static get db() { return db; }
      static find(query = {}) { return db.find(query); }
      static findOne(query) { return db.findOne(query); }
      static findById(id) { return db.findOne({ _id: id }); }
      static async create(data) { return await db.insert(data); }
      static async findByIdAndUpdate(id, update, options) {
        const returnUpdated = options && options.new;
        await db.update({ _id: id }, update, options);
        return returnUpdated ? await db.findOne({ _id: id }) : null;
      }
      static async findOneAndUpdate(query, update, options) {
        const returnUpdated = options && options.new;
        const doc = await db.findOne(query);
        if (!doc) return null;
        await db.update(query, update, options);
        return returnUpdated ? await db.findOne({ _id: doc._id }) : doc;
      }
      static async findByIdAndDelete(id) {
        const doc = await db.findOne({ _id: id });
        await db.remove({ _id: id }, {});
        return doc;
      }
      static async deleteMany(query) { return db.remove(query, { multi: true }); }
      static async countDocuments(query) { return db.count(query); }
      static lean() { return this; }
    }
    return Model;
  }
}

const User = createModel('users');
const Employee = createModel('employees');
const Attendance = createModel('attendance');
const LeaveRequest = createModel('leaves');
const Payroll = createModel('payrolls');
const ActivityLog = createModel('activity_logs');
const Notification = createModel('notifications');
const Document = createModel('documents');
const Department = createModel('departments');
const KPI = createModel('kpis');
const Job = createModel('jobs');
const Candidate = createModel('candidates');


const app = express();
const PORT = process.env.PORT || 5000;
// MONGODB_URI đã được định nghĩa ở trên
const JWT_SECRET = process.env.JWT_SECRET || 'test-key-123';

// xử lý request
// xử lý request
app.use(cors({
  origin: function (origin, callback) {
    // Cho phép requests không có origin (như Mobile apps hoặc Curl hoặc file:// trong Electron)
    if (!origin) return callback(null, true);

    // Các domain được phép khác
    const allowedOrigins = ['http://localhost:5000', 'http://localhost:3000'];
    if (allowedOrigins.indexOf(origin) === -1) {
      // Trong môi trường dev, có thể cho phép tất cả để dễ test
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Default route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dangnhap.html'));
});
app.get('/api/documents/:id/content', verifyToken, async (req, res) => { });

// ==================== REAL-TIME SYNC (SSE) ====================
let syncClients = [];

function broadcastSync(type, payload = {}) {
  const data = JSON.stringify({ type, payload, timestamp: Date.now() });
  syncClients.forEach(client => {
    client.res.write(`data: ${data}\n\n`);
  });
  console.log(`📢 SSE Broadcast: ${type}`);
}

app.get('/api/sync/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  syncClients.push(newClient);

  req.on('close', () => {
    syncClients = syncClients.filter(c => c.id !== clientId);
    console.log(`🔌 SSE Client disconnected: ${clientId}`);
  });

  console.log(`🔌 SSE Client connected: ${clientId} (Total: ${syncClients.length})`);
});


// Cài đặt cập nhật file
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

// kết nối tới Mongodb -> Chuyển sang NeDB (Standalone)
// mongoose.connect ... removed.
// NeDB autoloads when models are required.
console.log('Using NeDB for Standalone Desktop App');
createDefaultUsers();

// mongoose.connect(MONGODB_URI, {
//   useNewUrlParser: true,
//   useUnifiedTopology: true
// })
//   .then(() => {
//     createDefaultUsers();
//   })
//   .catch(err => {
//     process.exit(1);
//   });

async function createDefaultUsers() {
  try {
    const adminExists = await User.findOne({ username: 'admin', role: 'admin' });
    if (!adminExists) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('admin123', salt);

      await User.create({
        username: 'admin',
        password: hashedPassword,
        name: 'Administrator',
        email: 'admin@company.com',
        role: 'admin',
        status: 'active'
      });
    }
  } catch (err) { }
}

function verifyToken(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'Token không tồn tại' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token không hợp lệ' });
  }
}

// phục vụ html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dangnhap.html'));
});

app.get('/dangnhap', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dangnhap.html'));
});

app.post('/api/auth/login', async (req, res) => {
  try {
    // Chỉ lấy username và password, bỏ role
    const { username, password } = req.body;

    //Tìm theo tên bỏ vai trò
    const user = await User.findOne({
      username: username.toLowerCase()
    });

    if (!user) {
      return res.json({
        success: false,
        message: 'Tên đăng nhập hoặc mật khẩu không chính xác'
      });
    }

    //kiểm tra password 
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.json({
        success: false,
        message: 'Tên đăng nhập hoặc mật khẩu không chính xác'
      });
    }

    if (user.status && user.status !== 'active') {
      return res.json({
        success: false,
        message: 'Tài khoản đã bị khóa. Liên hệ quản trị viên.'
      });
    }


    const token = jwt.sign({
      id: user._id,
      username: user.username,
      role: user.role,
      name: user.name
    }, JWT_SECRET, { expiresIn: '30d' });

    await ActivityLog.create({
      action: 'LOGIN',
      userId: user._id,
      userName: user.username,
      details: `${user.username} đăng nhập hệ thống (Role: ${user.role})`
    });

    // Unified Notification: Login Alert
    await NotificationManager.notify({
      userId: user._id,
      title: 'Thông báo đăng nhập mới',
      message: `Tài khoản ${user.username} vừa đăng nhập vào hệ thống lúc ${new Date().toLocaleString('vi-VN')}`,
      type: 'info'
    });

    // --- Security Alert: Detect New Device/IP ---
    const currentDevice = req.headers['user-agent'] || 'Bản desktop';
    if (user.lastDevice && user.lastDevice !== currentDevice) {
      await NotificationManager.notify({
        userId: user._id,
        title: '⚠️ Cảnh báo bảo mật: Thiết bị mới',
        message: `Tài khoản của bạn vừa được đăng nhập từ một thiết bị mới.\nThiết bị: ${currentDevice}\nNếu đây không phải là bạn, hãy đổi mật khẩu ngay lập tức!`,
        type: 'warning',
        email: user.email
      });
    }
    await User.findByIdAndUpdate(user._id, { lastDevice: currentDevice });

    // trả vai trò từ csdl
    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
app.get('/api/auth/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Người dùng không tồn tại' });
    }

    let profile = { ...user };
    delete profile.password;

    const employee = await Employee.findOne({ userId: user._id });
    if (employee) {
      Object.assign(profile, employee);
      profile.employeeInfo = employee;
    }

    res.json({ success: true, user: profile, data: profile });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Quản lý chấm công

app.get('/api/attendance', verifyToken, async (req, res) => {
  try {
    const records = await Attendance.find()
      .sort({ date: -1, createdAt: -1 })
      .limit(1000)
      .lean();
    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/attendance', verifyToken, async (req, res) => {
  try {
    const { employeeId, name, department, date, checkIn, checkOut, status, note } = req.body;

    if (!name || !date) {
      return res.status(400).json({ success: false, message: 'Tên và ngày là bắt buộc' });
    }

    const record = await Attendance.create({
      employeeId: employeeId || null,
      name: name.trim(),
      department: department?.trim() || '',
      date: new Date(date),
      checkIn: checkIn?.trim() || '',
      checkOut: checkOut?.trim() || '',
      status: status || 'present',
      note: note?.trim() || ''
    });

    broadcastSync('attendance:created', record);
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/attendance/:id', verifyToken, async (req, res) => {
  try {
    const record = await Attendance.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );

    if (!record) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bản ghi chấm công' });
    }

    broadcastSync('attendance:updated', record);
    res.json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/attendance/:id', verifyToken, async (req, res) => {
  try {
    await Attendance.findByIdAndDelete(req.params.id);
    broadcastSync('attendance:deleted', { id: req.params.id });
    res.json({ success: true, message: 'Xóa chấm công thành công' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Quản lý đơn nghỉ phép
app.get('/api/leaves', verifyToken, async (req, res) => {
  try {
    const leaves = await LeaveRequest.find()
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean();
    res.json({ success: true, data: leaves });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/leaves', verifyToken, async (req, res) => {
  try {
    const { employeeId, name, department, type, startDate, endDate, days, reason } = req.body;

    if (!name || !type || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Thông tin không đầy đủ' });
    }

    const leave = await LeaveRequest.create({
      employeeId: employeeId || null,
      name: name.trim(),
      department: department?.trim() || '',
      type: type.trim(),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      days: Number(days) || 1,
      reason: reason?.trim() || ''
    });

    broadcastSync('leave:created', leave);

    // Unified Notification for Admins
    const admins = await User.find({ role: 'admin' });
    for (const admin of admins) {
      await NotificationManager.notify({
        userId: admin._id,
        title: '📅 Đơn nghỉ phép mới',
        message: `Nhân viên ${leave.name} vừa gửi đơn nghỉ phép (${leave.days} ngày).\nLý do: ${leave.reason}`,
        type: 'info',
        email: admin.email
      });
    }

    res.status(201).json({ success: true, data: leave });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/leaves/:id', verifyToken, async (req, res) => {
  try {
    const existing = await LeaveRequest.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn nghỉ phép' });
    }

    const leave = await LeaveRequest.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );

    // Automation: Deduct leave days from employee record when approved
    if (req.body.status === 'approved' && existing.status !== 'approved') {
      if (leave.employeeId) {
        const employee = await Employee.findById(leave.employeeId);
        if (employee) {
          const currentLeave = Number(employee.availableLeave) || 0;
          const leaveDays = Number(leave.days) || 1;
          await Employee.findByIdAndUpdate(employee._id, {
            availableLeave: Math.max(0, currentLeave - leaveDays)
          }, { new: true });
        }
      }

      await ActivityLog.create({
        action: 'APPROVE_LEAVE',
        userId: req.user.id,
        userName: req.user.username,
        details: `Duyệt đơn nghỉ phép cho ${leave.name} (${leave.days} ngày)`
      });

      // Notify Employee
      if (leave.employeeId) {
        const employeeUser = await User.findById(leave.employeeId); // Note: employeeId in leave is likely the userId or employee record id
        // Let's check if we can get the user. In this system, leave.employeeId is usually the _id of Employee model.
        const empRecord = await Employee.findById(leave.employeeId);
        if (empRecord && empRecord.userId) {
          const u = await User.findById(empRecord.userId);
          await NotificationManager.notify({
            userId: empRecord.userId,
            title: '✅ Đơn nghỉ phép đã được duyệt',
            message: `Quản lý đã duyệt đơn nghỉ phép (${leave.days} ngày) của bạn.`,
            type: 'success',
            email: u ? u.email : null
          });
        }
      }
    } else if (req.body.status === 'rejected' && existing.status !== 'rejected') {
      await ActivityLog.create({
        action: 'REJECT_LEAVE',
        userId: req.user.id,
        userName: req.user.username,
        details: `Từ chối đơn nghỉ phép của ${leave.name}`
      });
    }

    broadcastSync('leave:updated', leave);
    res.json({ success: true, data: leave });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/leaves/:id', verifyToken, async (req, res) => {
  try {
    await LeaveRequest.findByIdAndDelete(req.params.id);
    broadcastSync('leave:deleted', { id: req.params.id });
    res.json({ success: true, message: 'Xóa đơn nghỉ phép thành công' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// quản lý lương
app.get('/api/salaries', verifyToken, async (req, res) => {
  try {
    const salaries = await Payroll.find()
      .sort({ month: -1 });
    res.json({ success: true, data: salaries });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/salaries/:id', verifyToken, async (req, res) => {
  try {
    const salary = await Payroll.findById(req.params.id);
    if (!salary) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bảng lương' });
    }
    res.json({ success: true, data: salary });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/salaries', verifyToken, async (req, res) => {
  try {

    const { employeeId, name, department, baseSalary, allowances, deductions, bonus, month, status } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    if (!baseSalary && baseSalary !== 0) {
      return res.status(400).json({ success: false, message: 'Base salary is required' });
    }

    if (!month) {
      return res.status(400).json({ success: false, message: 'Month is required' });
    }

    let monthDate;
    try {
      monthDate = new Date(month);
      if (isNaN(monthDate.getTime())) {
        throw new Error('Invalid date format');
      }
    } catch (e) {
      return res.status(400).json({ success: false, message: `Invalid month format: ${month}` });
    }

    const base = Number(baseSalary) || 0;
    const allowanceAmount = Number(allowances) || 0;
    const bonusAmount = Number(bonus) || 0;
    const deductionAmount = Number(deductions) || 0;

    if (base <= 0) {
      return res.status(400).json({ success: false, message: 'Base salary must be greater than 0' });
    }

    const netSalary = base + allowanceAmount + bonusAmount - deductionAmount;

    const payrollData = {
      employeeId: employeeId || null,
      name: name.trim(),
      department: department?.trim() || '',
      baseSalary: base,
      allowances: allowanceAmount,
      bonus: bonusAmount,
      deductions: deductionAmount,
      netSalary: netSalary,
      month: monthDate,
      status: status || 'pending'
    };
    const payroll = new Payroll(payrollData);
    await payroll.save();

    await ActivityLog.create({
      action: 'CREATE_PAYROLL',
      userId: req.user.id,
      userName: req.user.username,
      details: `Created payroll: ${name} - ${payroll.year}/${payroll.monthNum}`
    });

    broadcastSync('salary:created', payroll);
    res.status(201).json({
      success: true,
      data: payroll,
      message: 'Salary created successfully'
    });

  } catch (error) {

    let errorMessage = error.message || 'Unknown error';

    if (error.name === 'ValidationError') {
      const details = Object.keys(error.errors).map(key =>
        `${key}: ${error.errors[key].message}`
      ).join('; ');
      errorMessage = `Validation error: ${details}`;
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.toString() : undefined
    });
  }
});

app.put('/api/salaries/:id', verifyToken, async (req, res) => {
  try {

    const { baseSalary, allowances, deductions, bonus, status, month } = req.body;
    const id = req.params.id;

    const existing = await Payroll.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Payroll not found' });
    }

    const updates = { updatedAt: new Date() };

    if (baseSalary !== undefined) updates.baseSalary = Number(baseSalary);
    if (allowances !== undefined) updates.allowances = Number(allowances);
    if (deductions !== undefined) updates.deductions = Number(deductions);
    if (bonus !== undefined) updates.bonus = Number(bonus);
    if (status) updates.status = status;

    if (month) {
      try {
        const monthDate = new Date(month);
        if (isNaN(monthDate.getTime())) {
          throw new Error('Invalid date format');
        }
        updates.month = monthDate;
        updates.year = monthDate.getFullYear();
        updates.monthNum = monthDate.getMonth() + 1;
      } catch (e) {
        return res.status(400).json({ success: false, message: `Invalid month format: ${month}` });
      }
    }

    const base = updates.baseSalary !== undefined ? updates.baseSalary : existing.baseSalary;
    const allowanceAmount = updates.allowances !== undefined ? updates.allowances : existing.allowances;
    const deductionAmount = updates.deductions !== undefined ? updates.deductions : existing.deductions;
    const bonusAmount = updates.bonus !== undefined ? updates.bonus : existing.bonus;

    updates.netSalary = base + allowanceAmount + bonusAmount - deductionAmount;

    const payroll = await Payroll.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    broadcastSync('salary:updated', payroll);
    res.json({
      success: true,
      data: payroll,
      message: 'Salary updated successfully'
    });

  } catch (error) {


    let errorMessage = error.message || 'Unknown error';
    if (error.name === 'ValidationError') {
      const details = Object.keys(error.errors).map(key =>
        `${key}: ${error.errors[key].message}`
      ).join('; ');
      errorMessage = `Validation error: ${details}`;
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.toString() : undefined
    });
  }
});

app.delete('/api/salaries/:id', verifyToken, async (req, res) => {
  try {
    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll not found' });
    }

    await Payroll.findByIdAndDelete(req.params.id);

    await ActivityLog.create({
      action: 'DELETE_PAYROLL',
      userId: req.user.id,
      userName: req.user.username,
      details: `Deleted payroll: ${payroll.name}`
    });

    res.json({ success: true, message: 'Salary deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

//Thống kê lương
app.get('/api/salaries/stats/by-month', verifyToken, async (req, res) => {
  try {
    const salaries = await Payroll.find({});

    // Group by Year-Month
    const groups = {};
    salaries.forEach(s => {
      if (!s.year || !s.monthNum) return;
      const key = `${s.year}-${s.monthNum}`;
      if (!groups[key]) {
        groups[key] = {
          _id: { year: s.year, month: s.monthNum },
          totalBaseSalary: 0,
          totalAllowances: 0,
          totalDeductions: 0,
          totalNetSalary: 0,
          count: 0
        };
      }
      groups[key].totalBaseSalary += (s.baseSalary || 0);
      groups[key].totalAllowances += (s.allowances || 0);
      groups[key].totalDeductions += (s.deductions || 0);
      groups[key].totalNetSalary += (s.netSalary || 0);
      groups[key].count++;
    });

    const stats = Object.values(groups).sort((a, b) => {
      if (b._id.year !== a._id.year) return b._id.year - a._id.year;
      return b._id.month - a._id.month;
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/salaries/stats/by-employee/:employeeId', verifyToken, async (req, res) => {
  try {
    const salaries = await Payroll.find({ employeeId: req.params.employeeId });

    if (salaries.length === 0) {
      return res.json({ success: true, data: {} });
    }

    const total = salaries.reduce((acc, curr) => {
      acc.baseSalary += (curr.baseSalary || 0);
      acc.allowances += (curr.allowances || 0);
      acc.deductions += (curr.deductions || 0);
      acc.netSalary += (curr.netSalary || 0);
      return acc;
    }, { baseSalary: 0, allowances: 0, deductions: 0, netSalary: 0 });

    const count = salaries.length;
    const stats = {
      _id: null,
      avgBaseSalary: total.baseSalary / count,
      avgAllowances: total.allowances / count,
      avgDeductions: total.deductions / count,
      avgNetSalary: total.netSalary / count,
      totalNetSalary: total.netSalary,
      count: count
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- QUẢN LÝ KPI ---
app.get('/api/kpis', verifyToken, async (req, res) => {
  try {
    const kpis = await KPI.find({}).sort({ month: -1 });
    res.json({ success: true, data: kpis });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/kpis', verifyToken, async (req, res) => {
  try {
    const kpi = await KPI.create({
      ...req.body,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await ActivityLog.create({
      action: 'CREATE_KPI',
      userId: req.user.id,
      userName: req.user.username,
      details: `Thiết lập KPI cho: ${req.body.employeeName} - Tháng ${req.body.month}`
    });

    res.status(201).json({ success: true, data: kpi });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/kpis/:id', verifyToken, async (req, res) => {
  try {
    const kpi = await KPI.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    res.json({ success: true, data: kpi });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- QUẢN LÝ TUYỂN DỤNG ---
app.get('/api/candidates', verifyToken, async (req, res) => {
  try {
    const candidates = await Candidate.find({}).sort({ createdAt: -1 });
    res.json({ success: true, data: candidates });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/candidates', verifyToken, async (req, res) => {
  try {
    const candidate = await Candidate.create({
      ...req.body,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    res.status(201).json({ success: true, data: candidate });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/candidates/:id', verifyToken, async (req, res) => {
  try {
    const candidate = await Candidate.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    res.json({ success: true, data: candidate });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/candidates/:id', verifyToken, async (req, res) => {
  try {
    await Candidate.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Xóa ứng viên thành công' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

//Quản lý tài liệu
app.get('/api/documents', verifyToken, async (req, res) => {
  try {
    const documents = await Document.find()
      .sort({ createdAt: -1 });
    res.json({ success: true, data: documents });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/documents/:id', verifyToken, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu' });
    }
    res.json({ success: true, data: document });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/documents', verifyToken, upload.single('file'), async (req, res) => {
  try {
    const { employeeId, name, type, description } = req.body;

    if (!name || !type || !req.file) {
      return res.status(400).json({ success: false, message: 'Thông tin không đầy đủ' });
    }

    const document = await Document.create({
      employeeId: employeeId || null,
      name: name.trim(),
      type: type.trim(),
      description: description?.trim() || '',
      fileName: req.file.filename,
      filePath: `/uploads/${req.file.filename}`,
      fileSize: req.file.size,
      uploadedBy: req.user.id,
      uploadedByName: req.user.username
    });

    await ActivityLog.create({
      action: 'UPLOAD_DOCUMENT',
      userId: req.user.id,
      userName: req.user.username,
      details: `Tải tài liệu: ${name}`
    });

    res.status(201).json({ success: true, data: document });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/documents/:id', verifyToken, async (req, res) => {
  try {
    const { name, type, description } = req.body;

    const document = await Document.findByIdAndUpdate(
      req.params.id,
      {
        name: name?.trim(),
        type: type?.trim(),
        description: description?.trim(),
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!document) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu' });
    }

    res.json({ success: true, data: document });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/documents/:id', verifyToken, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu' });
    }

    const filePath = path.join(__dirname, 'uploads', document.fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await Document.findByIdAndDelete(req.params.id);

    await ActivityLog.create({
      action: 'DELETE_DOCUMENT',
      userId: req.user.id,
      userName: req.user.username,
      details: `Xóa tài liệu: ${document.name}`
    });

    res.json({ success: true, message: 'Xóa tài liệu thành công' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// quản lý thông báo
app.get('/api/notifications', verifyToken, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/notifications/unread', verifyToken, async (req, res) => {
  try {
    const unread = await Notification.countDocuments({
      userId: req.user.id,
      isRead: false
    });
    res.json({ success: true, count: unread });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/notifications', verifyToken, async (req, res) => {
  try {
    const { userId, title, message, type } = req.body;

    if (!userId || !title || !message) {
      return res.status(400).json({ success: false, message: 'Thông tin không đầy đủ' });
    }

    const notification = await Notification.create({
      userId,
      title: title.trim(),
      message: message.trim(),
      type: type || 'info',
      isRead: false
    });

    res.status(201).json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/notifications/:id/read', verifyToken, async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo' });
    }

    res.json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/notifications/read-all', verifyToken, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user.id, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.json({ success: true, message: 'Đã đánh dấu tất cả thông báo' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/notifications/:id', verifyToken, async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Xóa thông báo thành công' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Lưu tất cả hành động
app.get('/api/activity-logs', verifyToken, async (req, res) => {
  try {
    const logs = await ActivityLog.find()
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean();
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/activity-logs/user/:userId', verifyToken, async (req, res) => {
  try {
    const logs = await ActivityLog.find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/activity-logs/stats', verifyToken, async (req, res) => {
  try {
    const stats = await ActivityLog.aggregate([
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/activity-logs/:id', verifyToken, async (req, res) => {
  try {
    await ActivityLog.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Xóa nhật ký thành công' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Thống kê tổng quan 
app.get('/api/stats/dashboard', verifyToken, async (req, res) => {
  try {
    const totalEmployees = await Employee.countDocuments();
    const activeEmployees = await Employee.countDocuments({ status: 'active' });
    const totalAccounts = await User.countDocuments();
    const pendingLeaves = await LeaveRequest.countDocuments({ status: 'pending' });
    const recentActivity = await ActivityLog.find().sort({ createdAt: -1 }).limit(5).lean();

    res.json({
      success: true,
      data: {
        totalEmployees,
        activeEmployees,
        totalAccounts,
        pendingLeaves,
        recentActivity
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/stats/attendance', verifyToken, async (req, res) => {
  try {
    const total = await Attendance.countDocuments();
    const present = await Attendance.countDocuments({ status: 'present' });
    const absent = await Attendance.countDocuments({ status: 'absent' });
    const late = await Attendance.countDocuments({ status: 'late' });

    res.json({
      success: true,
      data: {
        total,
        present,
        absent,
        late,
        presentRate: total > 0 ? ((present / total) * 100).toFixed(2) : 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

//Cho phép tải xuống
app.get('/api/download/:filename', verifyToken, (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = path.join(__dirname, 'uploads', filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ success: false, message: 'File không tồn tại' });
    }

    res.download(filepath);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// xuất dữ liệu JSon

app.get('/api/export/employees', verifyToken, async (req, res) => {
  try {
    const employees = await Employee.find().lean();
    res.json({ success: true, data: employees });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/export/attendance', verifyToken, async (req, res) => {
  try {
    const records = await Attendance.find().lean();
    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/export/leaves', verifyToken, async (req, res) => {
  try {
    const leaves = await LeaveRequest.find().lean();
    res.json({ success: true, data: leaves });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Bắt lỗi server toàn cục
app.use((err, req, res, next) => {
  res.status(500).json({
    success: false,
    message: 'Lỗi server: ' + err.message
  });
});

// lắng nghe cổng và chạy

app.listen(PORT, () => {
});

module.exports = app;

app.get('/api/auth/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password').lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    const employee = await Employee.findOne({ userId: user._id }).lean();

    res.json({
      success: true,
      data: {
        _id: user._id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        department: employee?.department || '',
        position: employee?.position || '',
        phone: employee?.phone || ''
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/auth/logout', verifyToken, (req, res) => {
  try {
    res.json({ success: true, message: 'Đăng xuất thành công' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/auth/change-password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập mật khẩu' });
    }

    const user = await User.findById(req.user.id);
    const isValid = await bcrypt.compare(currentPassword, user.password);

    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không chính xác' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/auth/verify-password', verifyToken, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập mật khẩu' });
    }

    const user = await User.findById(req.user.id);
    const isValid = await bcrypt.compare(password, user.password);

    res.json({ success: true, isValid });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/auth/refresh-token', verifyToken, (req, res) => {
  try {
    const token = jwt.sign({
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      name: req.user.name
    }, JWT_SECRET, { expiresIn: '30d' });

    res.json({ success: true, token });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
//Quản lý phòng ban 
app.get('/api/departments', verifyToken, async (req, res) => {
  try {
    const departments = await Department.find()
      .sort({ createdAt: -1 });

    res.json({ success: true, data: departments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/departments/:id', verifyToken, async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);
    if (!department) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy phòng ban' });
    }
    res.json({ success: true, data: department });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/departments', verifyToken, async (req, res) => {
  try {
    const { name, description, managerId, manager, email, budget, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Tên phòng ban là bắt buộc' });
    }

    const existing = await Department.findOne({ name: name.trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Tên phòng ban đã tồn tại' });
    }

    const department = await Department.create({
      name: name.trim(),
      description: description ? description.trim() : '',
      manager: manager ? manager.trim() : '',
      managerId: managerId || null,
      email: email ? email.trim() : '',
      budget: budget ? parseInt(budget) : 0,
      status: status || 'active'
    });

    await ActivityLog.create({
      action: 'CREATE_EMPLOYEE',
      userId: req.user.id,
      userName: req.user.username,
      details: `Tạo phòng ban: ${department.name}`
    });

    broadcastSync('department:created', department);
    res.status(201).json({
      success: true,
      data: department,
      message: 'Tạo phòng ban thành công'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/departments/:id', verifyToken, async (req, res) => {
  try {
    const { name, description, managerId, manager, email, budget, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Tên phòng ban là bắt buộc' });
    }

    const existing = await Department.findOne({
      name: name.trim(),
      _id: { $ne: req.params.id }
    });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Tên phòng ban đã tồn tại' });
    }

    const department = await Department.findByIdAndUpdate(
      req.params.id,
      {
        name: name.trim(),
        description: description ? description.trim() : '',
        manager: manager ? manager.trim() : '',
        managerId: managerId || null,
        email: email ? email.trim() : '',
        budget: budget ? parseInt(budget) : 0,
        status: status || 'active',
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    );

    if (!department) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy phòng ban' });
    }

    await ActivityLog.create({
      action: 'UPDATE_EMPLOYEE',
      userId: req.user.id,
      userName: req.user.username,
      details: `Cập nhật phòng ban: ${department.name}`
    });

    broadcastSync('department:updated', department);
    res.json({ success: true, data: department });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/departments/:id', verifyToken, async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);
    if (!department) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy phòng ban' });
    }

    const deptName = department.name;
    await Department.findByIdAndDelete(req.params.id);

    await ActivityLog.create({
      action: 'DELETE_EMPLOYEE',
      userId: req.user.id,
      userName: req.user.username,
      details: `Xóa phòng ban: ${deptName}`
    });

    broadcastSync('department:deleted', { id: req.params.id });
    res.json({ success: true, message: 'Xóa phòng ban thành công' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Quản lý thông tin nhân viên
app.get('/api/employees', verifyToken, async (req, res) => {
  try {
    const employees = await Employee.find()
      .sort({ createdAt: -1 });

    res.json({ success: true, data: employees });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/employees/:id', verifyToken, async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên' });
    }
    res.json({ success: true, data: employee });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/employees', verifyToken, async (req, res) => {
  try {
    const { name, email, phone, address, department, position, salary, startDate, status, username, password } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Tên và email là bắt buộc' });
    }

    const existing = await Employee.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email nhân viên đã tồn tại' });
    }

    // 1. Nếu có Username/Password, kiểm tra và tạo tài khoản trước
    let userId = null;
    if (username && password) {
      const existingUser = await User.findOne({ username: username.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Username đã tồn tại' });
      }

      const existingUserEmail = await User.findOne({ email: email.toLowerCase() });
      if (existingUserEmail) {
        return res.status(400).json({ success: false, message: 'Email đã được sử dụng cho một tài khoản khác' });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const user = await User.create({
        username: username.toLowerCase(),
        password: hashedPassword,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        role: 'employee',
        status: 'active'
      });
      userId = user._id;
    }

    // 2. Tạo bản ghi nhân viên
    const employee = await Employee.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone?.trim() || '',
      address: address?.trim() || '',
      department: department?.trim() || '',
      position: position?.trim() || '',
      salary: Number(salary) || 0,
      startDate: startDate ? new Date(startDate) : new Date(),
      status: status || 'active',
      userId: userId // Liên kết nếu có
    });

    await ActivityLog.create({
      action: 'CREATE_EMPLOYEE',
      userId: req.user.id,
      userName: req.user.username,
      details: `Tạo nhân viên: ${employee.name}${userId ? ' (Có tài khoản: ' + username + ')' : ''}`
    });

    broadcastSync('employee:created', { ...employee, employeeName: employee.name });
    res.status(201).json({
      success: true,
      data: employee,
      message: userId ? 'Tạo nhân viên và tài khoản thành công' : 'Tạo nhân viên thành công'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/employees/:id', verifyToken, async (req, res) => {
  try {
    const { name, email, phone, address, department, position, salary, status } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Tên và email là bắt buộc' });
    }

    const existing = await Employee.findOne({
      email: email.toLowerCase(),
      _id: { $ne: req.params.id }
    });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email đã tồn tại' });
    }

    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone?.trim() || '',
        address: address?.trim() || '',
        department: department?.trim() || '',
        position: position?.trim() || '',
        salary: Number(salary) || 0,
        status: status || 'active',
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên' });
    }

    if (employee.userId) {
      await User.findByIdAndUpdate(
        employee.userId,
        {
          name: name.trim(),
          email: email.toLowerCase().trim(),
          status: status === 'inactive' ? 'locked' : 'active'
        }
      );
    }

    // Generate detailed changes for log
    const changes = [];
    const fields = ['name', 'email', 'phone', 'address', 'department', 'position', 'salary', 'status'];
    fields.forEach(f => {
      // Comparison: check for undefined and simple equality
      if (req.body[f] !== undefined && String(req.body[f]) !== String(existing[f])) {
        changes.push(`${f}: ${existing[f]} -> ${req.body[f]}`);
      }
    });

    await ActivityLog.create({
      action: 'UPDATE_EMPLOYEE',
      userId: req.user.id,
      userName: req.user.username,
      details: `Cập nhật nhân viên: ${employee.name}${changes.length ? ' (' + changes.join(', ') + ')' : ''}`
    });

    broadcastSync('employee:updated', employee);
    res.json({ success: true, data: employee });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/employees/:id', verifyToken, async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên' });
    }

    if (employee.userId) {
      await User.findByIdAndDelete(employee.userId);
    }

    await Promise.all([
      Attendance.deleteMany({ employeeId: req.params.id }),
      LeaveRequest.deleteMany({ employeeId: req.params.id }),
      Payroll.deleteMany({ employeeId: req.params.id }),
      Document.deleteMany({ employeeId: req.params.id })
    ]);

    await Employee.findByIdAndDelete(req.params.id);

    await ActivityLog.create({
      action: 'DELETE_EMPLOYEE',
      userId: req.user.id,
      userName: req.user.username,
      details: `Xóa nhân viên: ${employee.name}`
    });

    broadcastSync('employee:deleted', { id: req.params.id });
    res.json({ success: true, message: 'Xóa nhân viên thành công' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Quản lý tài khoản người dùng
app.get('/api/accounts', verifyToken, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    const accounts = await Promise.all(users.map(async (u) => {
      const emp = await Employee.findOne({ userId: u._id });
      return {
        _id: u._id,
        username: u.username,
        fullName: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        department: emp?.department || '',
        position: emp?.position || '',
        phone: emp?.phone || '',
        createdAt: u.createdAt
      };
    }));
    res.json({ success: true, data: accounts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
app.get('/api/accounts/:id', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });
    }

    const employee = await Employee.findOne({ userId: user._id });

    res.json({
      success: true,
      data: {
        _id: user._id,
        username: user.username,
        fullName: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        department: employee?.department || '',
        position: employee?.position || '',
        phone: employee?.phone || ''
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/accounts', verifyToken, async (req, res) => {
  try {
    const { username, password, fullName, email, phone, address, department, position, role } = req.body;

    if (!username || !password || !fullName || !email) {
      return res.status(400).json({ success: false, message: 'Thông tin không đầy đủ' });
    }

    if (!department) {
      return res.status(400).json({ success: false, message: 'Phòng ban là bắt buộc' });
    }

    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Username đã tồn tại' });
    }

    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({ success: false, message: 'Email đã tồn tại' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const roleToUse = role || 'employee';

    const user = await User.create({
      username: username.toLowerCase(),
      password: hashedPassword,
      name: fullName.trim(),
      email: email.toLowerCase().trim(),
      role: roleToUse,
      status: 'active'
    });

    let employee = null;
    const employeeData = {
      name: fullName.trim(),
      email: email.toLowerCase().trim(),
      phone: phone?.trim() || '',
      address: address?.trim() || '',
      department: department?.trim() || '',
      position: position?.trim() || (roleToUse === 'employee' ? 'Nhân viên' : ''),
      userId: user._id,
      status: 'active'
    };
    employee = await Employee.create(employeeData);

    await ActivityLog.create({
      action: 'CREATE_ACCOUNT',
      userId: req.user.id,
      userName: req.user.username,
      details: `Tạo tài khoản: ${user.username} - Phòng ban: ${department}`
    });

    // Trả về đầy đủ thông tin bao gồm department 
    broadcastSync('account:created', { user, employee });

    // Unified Notification for Admins
    const admins = await User.find({ role: 'admin' });
    for (const admin of admins) {
      await NotificationManager.notify({
        userId: admin._id,
        title: '👤 Tài khoản mới được tạo',
        message: `Tài khoản: ${user.username}\nPhòng ban: ${department}\nChức vụ: ${position}`,
        type: 'info',
        email: admin.email
      });
    }
    res.status(201).json({
      success: true,
      message: 'Tạo tài khoản thành công',
      data: {
        _id: user._id,
        username: user.username,
        fullName: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        department: department?.trim() || '',
        position: position?.trim() || '',
        phone: phone?.trim() || '',
        address: address?.trim() || '',
        employee: employee ? {
          _id: employee._id,
          name: employee.name,
          email: employee.email,
          department: employee.department,
          position: employee.position,
          phone: employee.phone,
          address: employee.address
        } : null,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/accounts/:id', verifyToken, async (req, res) => {
  try {
    const { fullName, email, phone, address, department, position, role, status } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });
    }
    //  Kiểm tra email đã tồn tại chưa
    if (email && email !== user.email) {
      const existing = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: req.params.id }
      });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Email đã tồn tại' });
      }
    }

    // Cập nhật user info
    user.name = fullName || user.name;
    user.email = email ? email.toLowerCase() : user.email;

    // Cập nhật vai trò nếu có
    if (role) {
      const validRoles = ['admin', 'manager', 'employee', 'department_head', 'vice_head', 'auditor'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          message: `Invalid role: ${role}`
        });
      }
      user.role = role;
      // khi đổi vai trò, LUÔN set status = 'active'
      user.status = 'active';
    } else if (status) {
      // Nếu không đổi vai trò, chỉ cập nhật status nếu có
      user.status = status;
    }

    await user.save();

    // Sync to Employee record
    const employee = await Employee.findOne({ userId: user._id });
    if (employee) {
      employee.name = fullName || employee.name;
      employee.email = email ? email.toLowerCase() : employee.email;
      if (department !== undefined) employee.department = department;
      if (position !== undefined) employee.position = position;
      if (phone !== undefined) employee.phone = phone;
      if (address !== undefined) employee.address = address;
      if (status !== undefined) employee.status = status;
      await employee.save();
    } else if (role !== 'admin') {
      await Employee.create({
        name: fullName || user.name,
        email: email ? email.toLowerCase() : user.email,
        phone: phone || '',
        address: address || '',
        department: department || '',
        position: position || (role === 'employee' ? 'Nhân viên' : ''),
        userId: user._id,
        status: user.status
      });
    }

    // Trả về response đầy đủ
    broadcastSync('account:updated', { user, employee });
    res.json({
      success: true,
      message: 'Cập nhật tài khoản thành công',
      data: {
        _id: user._id,
        username: user.username,
        fullName: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        department: department || employee?.department || '',
        position: position || employee?.position || '',
        phone: phone || employee?.phone || '',
        address: address || employee?.address || '',
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/accounts/:id', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });
    }

    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ success: false, message: 'Không thể xóa tài khoản của chính mình' });
    }

    await Employee.findOneAndDelete({ userId: user._id });
    await User.findByIdAndDelete(req.params.id);

    await ActivityLog.create({
      action: 'DELETE_ACCOUNT',
      userId: req.user.id,
      userName: req.user.username,
      details: `Xóa tài khoản: ${user.username}`
    });

    broadcastSync('account:deleted', { id: req.params.id });
    res.json({ success: true, message: 'Xóa tài khoản thành công' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- DEVICE API (Attendance Machine) ---
app.post('/api/devices/connect', verifyToken, async (req, res) => {
  const { ip, port } = req.body;
  try {
    console.log(`Connecting to device at ${ip}:${port}...`);
    // Logic thực tế với node-zklib
    // const zkInstance = new ZKLib(ip, port, 10000, 4000);
    // await zkInstance.createSocket();

    // Giả lập phản hồi thành công như trong main.js cũ
    res.json({ success: true, message: "Kết nối thành công (giả lập)!" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi kết nối: " + error.message });
  }
});

app.post('/api/devices/attendance', verifyToken, async (req, res) => {
  const { ip, port } = req.body;
  try {
    // Logic lấy dữ liệu từ máy chấm công
    res.json({ success: true, data: [], message: "Lấy dữ liệu thành công (giả lập)!" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- ACTIVITY LOGS API ---
app.get('/api/activity-logs', verifyToken, async (req, res) => {
  try {
    const logs = await ActivityLog.find({}).sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- NOTIFICATIONS API ---
app.get('/api/notifications', verifyToken, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, data: notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/notifications/:id/read', verifyToken, async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(req.params.id, {
      isRead: true,
      readAt: new Date()
    }, { new: true });
    res.json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/notifications/:id', verifyToken, async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Đã xóa thông báo' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Only run intervals in non-serverless environments
if (!process.env.VERCEL) {
  // --- LEAVE ACCRUAL LOGIC ---
  async function runLeaveAccrual() {
    console.log('Running monthly leave accrual...');
    const employees = await Employee.find({ status: 'active' });
    for (const emp of employees) {
      const currentLeave = Number(emp.availableLeave) || 0;
      await Employee.findByIdAndUpdate(emp._id, {
        availableLeave: currentLeave + 1,
        lastAccrualDate: new Date()
      }, { new: true });
    }
    console.log(`Accrued leave for ${employees.length} employees.`);
  }

  // Simple interval-based check
  setInterval(async () => {
    const now = new Date();
    if (now.getDate() === 1 && now.getHours() === 0) {
      await runLeaveAccrual();
    }
  }, 3600000); // Check every hour
}

// --- BACKUP SYSTEM ---
const backupsDir = path.join(__dirname, 'backups');
if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

async function runAutoBackup() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = path.join(backupsDir, `backup-${timestamp}`);
    if (!fs.existsSync(backupPath)) fs.mkdirSync(backupPath, { recursive: true });

    const files = fs.readdirSync(dataDir);
    for (const file of files) {
      if (file.endsWith('.db')) {
        fs.copyFileSync(path.join(dataDir, file), path.join(backupPath, file));
      }
    }
    console.log(`Backup completed: ${backupPath}`);
    const admins = await User.find({ role: 'admin' });
    for (const admin of admins) {
      await NotificationManager.notify({
        userId: admin._id,
        title: '💾 Sao lưu thành công',
        message: `Hệ thống vừa hoàn tất sao lưu dữ liệu tự động vào thư mục: ${timestamp}`,
        type: 'success',
        email: admin.email
      });
    }
  } catch (error) {
    console.error('Backup failed:', error);
  }
}

// Only run backup in non-serverless environments
if (!process.env.VERCEL) {
  // Chạy sao lưu mỗi 24 giờ
  setInterval(runAutoBackup, 24 * 60 * 60 * 1000);
  // Chạy thử lần đầu sau 1 phút khởi động
  setTimeout(runAutoBackup, 60 * 1000);
}

// Khởi động server (Chỉ chạy khi không ở môi trường Vercel)
if (!process.env.VERCEL) {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`
  🚀 Hệ thống HRM đang chạy tại:
     - Local:    http://localhost:${PORT}
     - Mạng:     http://0.0.0.0:${PORT} (Truy cập từ máy khác qua IP của máy này)
    `);
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.log(`Port ${PORT} is already in use. Assuming server is already running.`);
    } else {
      console.error('Server error:', e);
    }
  });
}

// Export app cho Vercel
module.exports = app;