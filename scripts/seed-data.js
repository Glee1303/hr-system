const Datastore = require('nedb-promises');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

require('dotenv').config();

const dataDir = path.join(__dirname, '..', 'data');
const MONGODB_URI = process.env.MONGODB_URI;
let isMongoDB = false;

function createModel(dbName) {
    if (MONGODB_URI && !MONGODB_URI.includes('localhost')) {
        isMongoDB = true;
        const schema = new mongoose.Schema({}, { strict: false, timestamps: true });
        const MongooseModel = mongoose.models[dbName] || mongoose.model(dbName, schema);

        // Unified API for seeder
        return {
            insert: (data) => Array.isArray(data) ? MongooseModel.insertMany(data) : MongooseModel.create(data),
            remove: (query, options) => MongooseModel.deleteMany(query),
            find: (query) => MongooseModel.find(query).lean()
        };
    }

    const db = Datastore.create({
        filename: path.join(dataDir, `${dbName}.db`),
        autoload: true,
        timestampData: true
    });
    return db;
}

const User = createModel('users');
const Employee = createModel('employees');
const Attendance = createModel('attendance');
const LeaveRequest = createModel('leaves');
const Payroll = createModel('payrolls');
const KPI = createModel('kpis');
const Department = createModel('departments');
const ActivityLog = createModel('activity_logs');
const Document = createModel('documents');
const Notification = createModel('notifications');

async function seed() {
    console.log('🌱 Starting Professional Model Seeder...');

    if (isMongoDB) {
        await mongoose.connect(MONGODB_URI);
        console.log('🔌 Connected to MongoDB for seeding');
    }

    // 0. Clear old data for a clean model state
    await Promise.all([
        User.remove({}, { multi: true }),
        Employee.remove({}, { multi: true }),
        Attendance.remove({}, { multi: true }),
        LeaveRequest.remove({}, { multi: true }),
        Payroll.remove({}, { multi: true }),
        KPI.remove({}, { multi: true }),
        Department.remove({}, { multi: true }),
        ActivityLog.remove({}, { multi: true }),
        Document.remove({}, { multi: true }),
        Notification.remove({}, { multi: true })
    ]);
    console.log('🗑️  Cleared old data.');

    // 1. Departments
    const depts = [
        { name: 'Ban Giám Đốc', manager: 'Nguyễn Văn A', email: 'board@company.com', status: 'active' },
        { name: 'Phòng Nhân sự', manager: 'Lê Thị HR', email: 'hr@company.com', status: 'active' },
        { name: 'Phòng Kỹ thuật', manager: 'Trần Công Nghệ', email: 'tech@company.com', status: 'active' },
        { name: 'Phòng Kinh doanh', manager: 'Phạm Thị Sale', email: 'sales@company.com', status: 'active' },
        { name: 'Phòng Kế toán', manager: 'Hoàng Tài Chính', email: 'accounting@company.com', status: 'active' }
    ];

    const savedDepts = await Department.insert(depts);
    console.log(`✅ Seeded ${savedDepts.length} departments`);

    // 2. Users & Employees
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('123456', salt);

    const employeeData = [
        { name: 'Nguyễn Văn A', email: 'anv@company.com', role: 'admin', username: 'admin', dept: 'Ban Giám Đốc', pos: 'Giám đốc', sal: 50000000 },
        { name: 'Lê Thị HR', email: 'hr@company.com', role: 'manager', username: 'hr_mgr', dept: 'Phòng Nhân sự', pos: 'Trưởng phòng', sal: 25000000 },
        { name: 'Trần Công Nghệ', email: 'tech@company.com', role: 'manager', username: 'tech_mgr', dept: 'Phòng Kỹ thuật', pos: 'Trưởng phòng', sal: 35000000 },
        { name: 'Phạm Thị Sale', email: 'sale@company.com', role: 'manager', username: 'sale_mgr', dept: 'Phòng Kinh doanh', pos: 'Trưởng phòng', sal: 28000000 },
        { name: 'Hoàng Tài Chính', email: 'acc@company.com', role: 'manager', username: 'acc_mgr', dept: 'Phòng Kế toán', pos: 'Trưởng phòng', sal: 26000000 },
        { name: 'Nguyễn Văn Dev', email: 'dev1@company.com', role: 'employee', username: 'dev1', dept: 'Phòng Kỹ thuật', pos: 'Lập trình viên', sal: 18000000 },
        { name: 'Trần Thị Coder', email: 'dev2@company.com', role: 'employee', username: 'dev2', dept: 'Phòng Kỹ thuật', pos: 'Lập trình viên', sal: 20000000 },
        { name: 'Lê Văn Sales', email: 'sales1@company.com', role: 'employee', username: 'sales1', dept: 'Phòng Kinh doanh', pos: 'Nhân viên kinh doanh', sal: 12000000 },
        { name: 'Phạm Thị Kế Toán', email: 'acc1@company.com', role: 'employee', username: 'acc1', dept: 'Phòng Kế toán', pos: 'Kế toán viên', sal: 15000000 },
        { name: 'Đặng Văn Bảo Vệ', email: 'security@company.com', role: 'employee', username: 'security', dept: 'Phòng Nhân sự', pos: 'Bảo vệ', sal: 8000000 }
    ];

    const allEmps = [];
    for (const data of employeeData) {
        const user = await User.insert({
            username: data.username,
            password: hashedPassword,
            name: data.name,
            email: data.email,
            role: data.role,
            status: 'active'
        });

        const emp = await Employee.insert({
            name: data.name,
            email: data.email,
            phone: '090' + Math.floor(Math.random() * 9000000 + 1000000),
            department: data.dept,
            position: data.pos,
            salary: data.sal,
            startDate: new Date(2023, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
            status: 'active',
            userId: user._id
        });
        allEmps.push(emp);
    }
    console.log(`✅ Seeded ${allEmps.length} employees & users`);

    // 3. Attendance for the last 30 days with variations
    const now = new Date();
    const attendanceRecords = [];

    for (const emp of allEmps) {
        for (let i = 0; i < 30; i++) {
            const date = new Date();
            date.setDate(now.getDate() - i);
            if (date.getDay() === 0 || date.getDay() === 6) continue; // Skip weekends

            // Variation: some lates, some early leaves
            const isLate = Math.random() < 0.1; // 10% chance of being late
            const isEarlyLeave = Math.random() < 0.05; // 5% chance of early leave
            const isAbsent = Math.random() < 0.03; // 3% chance of unannounced absence

            if (isAbsent) {
                attendanceRecords.push({
                    employeeId: emp._id,
                    name: emp.name,
                    department: emp.department,
                    date: date.toISOString().split('T')[0],
                    checkIn: null,
                    checkOut: null,
                    status: 'absent',
                    note: 'Nghỉ không phép'
                });
                continue;
            }

            const checkIn = isLate ? `08:${Math.floor(Math.random() * 15) + 10}` : `07:${Math.floor(Math.random() * 30) + 30}`;
            const checkOut = isEarlyLeave ? `16:${Math.floor(Math.random() * 30) + 30}` : `17:${Math.floor(Math.random() * 30) + 30}`;

            attendanceRecords.push({
                employeeId: emp._id,
                name: emp.name,
                department: emp.department,
                date: date.toISOString().split('T')[0],
                checkIn,
                checkOut,
                status: 'present',
                note: isLate ? 'Đi muộn' : 'Đúng giờ'
            });
        }
    }
    await Attendance.insert(attendanceRecords);
    console.log(`✅ Seeded ${attendanceRecords.length} attendance records`);

    // 4. Leave Requests
    const leaveRequests = [
        {
            employeeId: allEmps[5]._id,
            name: allEmps[5].name,
            department: allEmps[5].department,
            type: 'Nghỉ phép năm',
            startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5),
            endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7),
            days: 3,
            reason: 'Đi du lịch gia đình',
            status: 'approved',
            createdAt: new Date()
        },
        {
            employeeId: allEmps[6]._id,
            name: allEmps[6].name,
            department: allEmps[6].department,
            type: 'Nghỉ ốm',
            startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 5),
            endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 4),
            days: 2,
            reason: 'Bị cảm cúm nặng',
            status: 'approved',
            createdAt: new Date()
        },
        {
            employeeId: allEmps[7]._id,
            name: allEmps[7].name,
            department: allEmps[7].department,
            type: 'Việc riêng',
            startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2),
            endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2),
            days: 1,
            reason: 'Giải quyết thủ tục nhà đất',
            status: 'pending',
            createdAt: new Date()
        },
        {
            employeeId: allEmps[8]._id,
            name: allEmps[8].name,
            department: allEmps[8].department,
            type: 'Nghỉ phép năm',
            startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 10),
            endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 15),
            days: 6,
            reason: 'Về quê ăn cưới',
            status: 'rejected',
            rejectReason: 'Dự án đang giai đoạn nước rút, không thể nghỉ nhiều ngày.',
            createdAt: new Date()
        }
    ];
    await LeaveRequest.insert(leaveRequests);
    console.log(`✅ Seeded ${leaveRequests.length} leave requests`);

    // 5. KPIs for current and last month
    const kpis = [];
    const months = [
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
        `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`
    ];

    for (const emp of allEmps) {
        for (const m of months) {
            kpis.push({
                employeeId: emp._id,
                employeeName: emp.name,
                month: m,
                target: 100,
                currentProgress: Math.floor(Math.random() * 40) + 60, // 60-100%
                description: `KPI tháng ${m}`,
                createdAt: new Date(),
                updatedAt: new Date()
            });
        }
    }
    await KPI.insert(kpis);
    console.log(`✅ Seeded ${kpis.length} KPIs`);

    // 6. Salaries for last 2 months
    const salaries = [];
    for (const emp of allEmps) {
        for (let i = 1; i <= 2; i++) {
            const date = new Date();
            date.setMonth(now.getMonth() - i);

            const base = emp.salary || 10000000;
            const allowance = Math.floor(base * 0.1);
            const bonus = Math.floor(Math.random() * 2000000);
            const deduction = Math.floor(Math.random() * 500000);
            const net = base + allowance + bonus - deduction;

            salaries.push({
                employeeId: emp._id,
                name: emp.name,
                department: emp.department,
                baseSalary: base,
                allowances: allowance,
                bonus: bonus,
                deductions: deduction,
                netSalary: net,
                month: date.getMonth() + 1,
                year: date.getFullYear(),
                status: 'paid',
                paymentDate: new Date(date.getFullYear(), date.getMonth() + 1, 5)
            });
        }
    }
    await Payroll.insert(salaries);
    console.log(`✅ Seeded ${salaries.length} payroll records`);

    // 7. Activity Logs
    const logs = [
        { action: 'SYSTEM_START', userName: 'system', details: 'Hệ thống khởi động chế độ Model', createdAt: new Date() },
        { action: 'SEED_DATA', userName: 'admin', details: 'Nạp dữ liệu mô hình nhân sự chuyên nghiệp', createdAt: new Date() },
        { action: 'UPDATE_CONFIG', userName: 'admin', details: 'Cập nhật cấu hình tính lương 2024', createdAt: new Date() }
    ];
    await ActivityLog.insert(logs);
    console.log(`✅ Seeded ${logs.length} activity logs`);

    // 8. Notifications
    const notifs = [
        { title: 'Chào mừng thành viên mới', message: 'Tất cả nhân viên vui lòng chào đón các đồng nghiệp mới gia nhập team Tech.', type: 'info', sender: 'Admin', createdAt: new Date() },
        { title: 'Lịch nghỉ lễ', message: 'Thông báo lịch nghỉ lễ Giỗ tổ Hùng Vương sắp tới.', type: 'warning', sender: 'HR', createdAt: new Date() }
    ];
    await Notification.insert(notifs);
    console.log(`✅ Seeded ${notifs.length} notifications`);

    console.log('✨ All systems go! Model dataset is ready.');
    if (isMongoDB) mongoose.disconnect();
    process.exit(0);
}

seed().catch(err => {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
});
