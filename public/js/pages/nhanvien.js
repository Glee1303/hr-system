(function () {
    const publicPages = ['dangnhap.html', 'index.html', ''];
    const currentPath = window.location.pathname.split('/').pop();
    if (!publicPages.includes(currentPath)) {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token) window.location.replace('dangnhap.html');
    }
})();

const TIME_REGEX = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;
const ALLOWED_FILE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

let currentUser = null;
let attendanceData = [];
let leaveData = [];
let notificationData = [];
let profileDocuments = [];

//Tải thông tin người dùng hiện tại từ api
async function loadCurrentUser() {
    try {
        const user = await AuthAPI.getCurrentUser();
        if (user) {
            currentUser = user;
            localStorage.setItem('currentUserProfile', JSON.stringify(currentUser));
            return currentUser;
        }
    } catch (error) {
        console.error('Error loading current user:', error);
    }

    const stored = localStorage.getItem('currentUserProfile');
    if (stored) {
        currentUser = JSON.parse(stored);
        return currentUser;
    }
    return null;
}
//Khởi tạo trang, tải dữ liệu
async function initializePage() {
    try {
        console.log('Initializing page...');

        const user = await loadCurrentUser();
        if (!user) {
            console.warn('Could not load user');
            return;
        }

        updateEmployeeHeader();

        await Promise.allSettled([
            loadEmployeeAttendance(),
            loadEmployeeLeave(),
            loadProfileDocuments()
        ]);

        updateDashboardStats();
        setupDataSyncListeners();

        console.log('Page initialized successfully');
    } catch (error) {
        console.error('Page initialization error:', error);
        showNotification('Có lỗi khi khởi tạo trang. Vui lòng F5 để refresh', 'error');
    }
}
//Theo dõi thay đổi chấm công, nghỉ phép, tài liệu
function setupDataSyncListeners() {
    if (typeof DataSync === 'undefined') return;

    const events = [
        'employee:updated', 'account:updated',
        'attendance:created', 'attendance:updated', 'attendance:deleted',
        'leave:created', 'leave:updated', 'leave:deleted',
        'salary:created', 'salary:updated', 'salary:deleted',
        'notification:created', 'document:created', 'document:deleted'
    ];

    events.forEach(event => {
        DataSync.on(event, (payload) => {
            console.log(`📢 UI Sync: ${event}`);

            if (event.includes('employee')) EmployeeAPI.clearCache();
            if (event.includes('attendance')) AttendanceAPI.clearCache();
            if (event.includes('leave')) LeaveAPI.clearCache();
            if (event.includes('salary')) SalaryAPI.clearCache();
            if (event.includes('notification')) NotificationAPI.clearCache();
            if (event.includes('document')) DocumentAPI.clearCache();

            if (event === 'employee:updated' && payload && payload._id === currentUser?._id) {
                loadCurrentUser().then(() => {
                    updateEmployeeHeader();
                    renderProfileInfo();
                });
            }

            updateDashboardStats();
            if (event.includes('attendance')) loadEmployeeAttendance();
            if (event.includes('leave')) loadEmployeeLeave();
            if (event.includes('salary')) renderEmployeeSalary();
            if (event.includes('document')) loadProfileDocuments();
            if (event.includes('notification')) loadEmployeeNotifications();
        });
    });
}

// Chuyển đổi tab hiển thị
function showTab(tabId) {
    console.log('Switching to employee tab:', tabId);

    // Ẩn tất cả các tab
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
        tab.style.display = 'none';
        tab.classList.remove('active');
    });

    // Hiện tab được chọn với hiệu ứng
    const selectedTab = document.getElementById(tabId + '-tab');
    if (selectedTab) {
        selectedTab.style.display = 'block';
        // Delay nhẹ để animation active (nếu có) khởi chạy
        setTimeout(() => selectedTab.classList.add('active'), 10);

        // Gọi hàm render tương ứng nếu cần
        if (tabId === 'salary') renderEmployeeSalary();
        if (tabId === 'attendance') renderEmployeeAttendance();
        if (tabId === 'leave') renderEmployeeLeave();
        if (tabId === 'profile') {
            loadProfileDocuments();
            renderProfileInfo();
        }
        if (tabId === 'notification') {
            loadEmployeeNotifications();
        }
    }
}

//tải thông báo
async function loadEmployeeNotifications() {
    try {
        notificationData = [];
        try {
            const data = await NotificationAPI.getAll();
            if (data && Array.isArray(data)) {
                notificationData = data;
            }
        } catch (error) {
        }

        try {
            const stored = localStorage.getItem('notifications_sent');
            if (stored) {
                const sentNotifications = JSON.parse(stored);
                sentNotifications.forEach(notif => {
                    if (!notificationData.find(n => n._id === notif._id)) {
                        notificationData.push(notif);
                    }
                });
            }
        } catch (e) { }

        notificationData.sort((a, b) => {
            const dateA = new Date(b.sentAt || b.createdAt || 0);
            const dateB = new Date(a.sentAt || a.createdAt || 0);
            return dateA - dateB;
        });

        renderNotificationPanel();
        renderNotificationTab(); // Thêm hàm render cho tab mới
        updateNotificationBadge();
    } catch (error) {
        console.error('Error loading notifications:', error);
        notificationData = [];
    }
}
//Tải chấm công
async function loadEmployeeAttendance() {
    try {
        const data = await AttendanceAPI.getAll();
        attendanceData = Array.isArray(data) ? data : [];
        console.log('Attendance loaded:', attendanceData.length);
        renderEmployeeAttendance();
    } catch (error) {
        console.error('Error loading attendance:', error);
        attendanceData = [];
    }
}
//Tải danh sách nghỉ phép
async function loadEmployeeLeave() {
    try {
        const data = await LeaveAPI.getAll();
        leaveData = Array.isArray(data) ? data : [];
        console.log('Leave data loaded:', leaveData.length);
        renderEmployeeLeave();
    } catch (error) {
        console.error('Error loading leave:', error);
        leaveData = [];
    }
}
//Tải hồ sơ
async function loadProfileDocuments() {
    try {
        const data = await DocumentAPI.getAll();
        const allDocs = Array.isArray(data) ? data : [];

        allDocs.forEach(doc => {
            console.log(`  - ${doc.name} | employeeId: ${doc.employeeId} | uploadedBy: ${doc.uploadedBy}`);
        });

        const userId = currentUser._id;
        const userName = AuthManager.getUserName();
        profileDocuments = allDocs.filter(doc => {
            const isOwnerById = doc.employeeId && doc.employeeId.toString() === userId.toString();
            const isOwnerByName = doc.uploadedBy && doc.uploadedBy === userName;

            console.log(`${doc.name}: isOwnerById=${isOwnerById}, isOwnerByName=${isOwnerByName}`);

            return isOwnerById || isOwnerByName;
        });
        renderProfileDocuments();

    } catch (error) {
        profileDocuments = [];
        renderProfileDocuments();
    }
}

function renderProfileDocuments() {
    const grid = document.getElementById('profileDocumentsGrid');
    if (!grid) return;

    if (profileDocuments.length === 0) {
        grid.innerHTML = `
            <div class="empty-state-container" style="grid-column: 1/-1;">
                <div class="empty-state-icon"><i class="fas fa-folder-open"></i></div>
                <p class="empty-state-text">Bạn chưa tải lên tài liệu nào. Các tài liệu nhân sự sẽ được liệt kê tại đây.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = profileDocuments.map(doc => {
        const fileType = doc.fileType || getFileExtension(doc.fileName || doc.name);

        return `
            <div class="document-card" style="
                border: 1px solid #e5e7eb;
                border-radius: 0.5rem;
                padding: 1rem;
                background: white;
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
            ">
                <div style="display: flex; align-items: start; gap: 0.75rem;">
                    <div style="font-size: 2rem; flex-shrink: 0;">
                        ${getFileIcon(fileType)}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 700; color: #1e293b; word-break: break-word; margin-bottom: 0.35rem; font-size: 0.95rem; letter-spacing: -0.01em;">
                            ${escapeHtml(doc.name)}
                        </div>
                        <div style="font-size: 0.8rem; color: #64748b; font-weight: 500;">
                            ${getDocTypeLabel(doc.type)} • ${(fileType || 'FILE').toUpperCase()} • ${doc.fileSize ? (doc.fileSize / 1024 / 1024).toFixed(2) + 'MB' : '?'}
                        </div>
                        <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.35rem; font-weight: 400;">
                            Giao dịch: ${formatDate(doc.createdAt)}
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 0.5rem; padding-top: 0.5rem; border-top: 1px solid #f3f4f6;">
                    <button onclick="viewProfileDocument('${escapeHtml(doc._id)}')" style="
                        flex: 1;
                        padding: 0.5rem;
                        background: #eff6ff;
                        color: #1e40af;
                        border: none;
                        border-radius: 0.375rem;
                        cursor: pointer;
                        font-size: 0.875rem;
                        font-weight: 500;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 0.25rem;
                        transition: all 0.2s;
                    " 
                    onmouseover="this.style.background='#dbeafe'" 
                    onmouseout="this.style.background='#eff6ff'"
                    title="Xem/Tải">
                        <i class="fas fa-eye"></i> Xem
                    </button>
                    <button onclick="deleteProfileDocument('${escapeHtml(doc._id)}')" style="
                        padding: 0.5rem;
                        background: #fef2f2;
                        color: #991b1b;
                        border: none;
                        border-radius: 0.375rem;
                        cursor: pointer;
                        font-size: 0.875rem;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.2s;
                    " 
                    onmouseover="this.style.background='#fee2e2'" 
                    onmouseout="this.style.background='#fef2f2'"
                    title="Xóa">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}
//phần mở rộng
function getFileExtension(filename) {
    if (!filename) return 'file';
    const ext = filename.split('.').pop()?.toLowerCase();
    return ext || 'file';
}
//vẽ bảng châm công
function renderEmployeeAttendance() {
    const tbody = document.getElementById('employeeAttendanceTable');
    if (!tbody) return;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Lọc chấm công của người dùng hiện tại, tháng hiện tại, bỏ chủ nhật
    const myAttendance = attendanceData.filter(a => {
        const isSameUser = a.employeeId === currentUser._id || a.name === currentUser.name;
        const isCurrentMonth = new Date(a.date).getMonth() === currentMonth &&
            new Date(a.date).getFullYear() === currentYear;

        if (!isSameUser || !isCurrentMonth) return false;

        // Bỏ chỉ chủ nhật (0)
        const dayOfWeek = new Date(a.date).getDay();
        return dayOfWeek !== 0;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    if (myAttendance.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state-cell">
                    <div class="empty-state-container">
                        <div class="empty-state-icon"><i class="fas fa-calendar-times"></i></div>
                        <p class="empty-state-text">Hiện tại chưa có dữ liệu chấm công cho tháng này.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = myAttendance.map(record => {
        let status = 'present';
        let statusText = 'Có mặt';
        let badgeClass = 'success';

        // Nếu không có checkIn = không chấm công
        if (!record.checkIn) {
            status = 'absent';
            statusText = 'Vắng mặt';
            badgeClass = 'danger';
        }
        // Nếu checkin sau 08:00 = đi muộn
        else if (record.checkIn > '08:00') {
            status = 'late';
            statusText = 'Đi muộn';
            badgeClass = 'warning';
        }

        const totalHours = calculateTotalHours(record.checkIn, record.checkOut);

        return `
            <tr>
                <td>${formatDate(record.date)}</td>
                <td>${record.checkIn || '-'}</td>
                <td>${record.checkOut || '-'}</td>
                <td>${totalHours}</td>
                <td><span class="badge ${badgeClass}">${statusText}</span></td>
                <td>${record.note || '-'}</td>
            </tr>
        `;
    }).join('');
}
//bảng nghỉ phép
function renderEmployeeLeave() {
    const tbody = document.getElementById('leaveTable');
    if (!tbody) return;

    const myLeaves = leaveData.filter(l =>
        l.employeeId === currentUser._id || l.name === currentUser.name
    ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (myLeaves.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state-cell">
                    <div class="empty-state-container">
                        <div class="empty-state-icon"><i class="fas fa-plane-slash"></i></div>
                        <p class="empty-state-text">Bạn chưa gửi yêu cầu nghỉ phép nào. Lịch sử nghỉ phép sẽ xuất hiện tại đây.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = myLeaves.map(leave => {
        const statusMap = {
            'approved': { class: 'success', text: 'Duyệt' },
            'rejected': { class: 'danger', text: 'Từ chối' },
            'pending': { class: 'warning', text: 'Chờ' }
        };
        const statusInfo = statusMap[leave.status] || statusMap['pending'];

        return `
            <tr>
                <td>${formatDate(leave.startDate || leave.fromDate)}</td>
                <td>${formatDate(leave.endDate || leave.toDate)}</td>
                <td>${leave.days || leave.numberOfDays || 0}</td>
                <td>${getLeaveTypeBadge(leave.type)}</td>
                <td>${leave.reason || '-'}</td>
                <td><span class="badge ${statusInfo.class}">${statusInfo.text}</span></td>
            </tr>
        `;
    }).join('');
}
//bảng lương
function renderEmployeeSalary() {
    const tbody = document.getElementById('salaryTable');
    if (!tbody) return;

    async function loadAndRender() {
        try {
            const allSalaries = await SalaryAPI.getAll();
            const mySalaries = allSalaries.filter(s =>
                s.employeeId === currentUser._id || s.name === currentUser.name
            ).sort((a, b) => {
                const aDate = new Date(a.year, a.month - 1);
                const bDate = new Date(b.year, b.month - 1);
                return bDate - aDate;
            });

            if (mySalaries.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="empty-state-cell">
                            <div class="empty-state-container">
                                <div class="empty-state-icon"><i class="fas fa-money-check-alt"></i></div>
                                <p class="empty-state-text">Hệ thống chưa ghi nhận bảng lương của bạn. Vui lòng quay lại sau.</p>
                            </div>
                        </td>
                    </tr>
                `;

                document.getElementById('latestSalary').textContent = '--';
                return;
            }

            const latest = mySalaries[0];
            // Cập nhật thẻ chi tiết lương (Payslip style)
            const baseEl = document.getElementById('salaryBase');
            const allowanceEl = document.getElementById('salaryAllowance');
            const deductionEl = document.getElementById('salaryDeduction');

            if (baseEl) baseEl.textContent = formatCurrency(latest.baseSalary || 0);
            if (allowanceEl) allowanceEl.textContent = formatCurrency(latest.allowance || 0);
            if (deductionEl) deductionEl.textContent = formatCurrency(latest.deduction || 0);

            tbody.innerHTML = mySalaries.map(salary => {
                const statusClass = salary.status === 'paid' ? 'success' : 'warning';
                const statusText = salary.status === 'paid' ? 'Đã thanh toán' : 'Chờ thanh toán';

                return `
                    <tr>
                        <td>Tháng ${String(salary.month).padStart(2, '0')}/${salary.year}</td>
                        <td>${formatCurrency(salary.baseSalary || 0)}</td>
                        <td>${formatCurrency(salary.allowance || 0)}</td>
                        <td>${formatCurrency(salary.deduction || 0)}</td>
                        <td style="font-weight: 700; color: #0f172a; font-size: 0.95rem;">${formatCurrency(salary.netSalary || 0)}</td>
                        <td><span class="badge ${statusClass}">${statusText}</span></td>
                    </tr>
                `;
            }).join('');
        } catch (error) {
            console.error('Lỗi load lương:', error);
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 2rem; color: #dc2626;">
                        Lỗi tải dữ liệu lương
                    </td>
                </tr>
            `;
        }
    }

    loadAndRender();
}
//Cập nhật thông tin tiêu đề và các widget
function updateEmployeeHeader() {
    if (!currentUser) return;

    // Cập nhật Header nhỏ (Header-container từ components.js)
    // Cái này components.js đã lo

    // Cập nhật Greeting trên Dashboard
    const greeting = document.getElementById('greeting');
    if (greeting) {
        const hour = new Date().getHours();
        let welcome = 'Chào buổi sáng';
        if (hour >= 12 && hour < 18) welcome = 'Chào buổi chiều';
        if (hour >= 18) welcome = 'Chào buổi tối';
        greeting.textContent = `${welcome}, ${currentUser.name || 'Nhân viên'}!`;
    }

    // Cập nhật tab Profile (Cá nhân)
    const profileName = document.getElementById('profileNameBig');
    const profilePos = document.getElementById('profilePosBig');
    const profileAvatar = document.getElementById('profileAvatarBig');

    if (profileName) profileName.textContent = currentUser.name || 'Họ tên chưa cập nhật';
    if (profilePos) profilePos.textContent = currentUser.position || 'Nhân viên';
    if (profileAvatar) {
        profileAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name || 'User')}&background=6366f1&color=fff&size=200`;
    }

    // Cập nhật bảng thông tin truyền thống (Hồ sơ)
    renderProfileInfo();
}

// Cập nhật các chỉ số trên Dashboard (Bento Grid)
function updateDashboardStats() {
    if (!currentUser) return;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // 1. Lời chào Dashboard
    const greetingEl = document.getElementById('greeting');
    if (greetingEl) {
        const hour = now.getHours();
        let welcome = 'Chào buổi sáng';
        if (hour >= 12 && hour < 18) welcome = 'Chào buổi chiều';
        if (hour >= 18) welcome = 'Chào buổi tối';
        greetingEl.textContent = `${welcome}, ${currentUser.name || 'Nhân viên'}!`;
    }

    // 2. Chấm công hôm nay
    const currentInTime = document.getElementById('currentInTime');
    const attendanceCount = document.getElementById('attendanceCount');
    if (currentInTime || attendanceCount) {
        const today = now.toISOString().split('T')[0];
        const todayRecord = attendanceData.find(a => {
            const isSameUser = a.employeeId === currentUser._id || a.name === currentUser.name;
            return isSameUser && a.date === today;
        });

        if (currentInTime) currentInTime.textContent = todayRecord ? (todayRecord.checkIn || '--:--') : '--:--';

        // Tổng ngày công trong tháng
        const monthAttendance = attendanceData.filter(a => {
            const isSameUser = a.employeeId === currentUser._id || a.name === currentUser.name;
            const isCurrentMonth = new Date(a.date).getMonth() === currentMonth &&
                new Date(a.date).getFullYear() === currentYear;
            if (!isSameUser || !isCurrentMonth) return false;
            const dayOfWeek = new Date(a.date).getDay();
            return dayOfWeek !== 0; // Bỏ chủ nhật
        });
        if (attendanceCount) attendanceCount.textContent = monthAttendance.length;
    }

    // 3. Phép còn lại
    const remainingLeaveCount = document.getElementById('remainingLeaveCount');
    const remainingLeave = document.getElementById('remainingLeave');
    if (remainingLeaveCount || remainingLeave) {
        // Ưu tiên dùng field từ employee record, nếu không có tính từ list đơn
        let available = 12;
        if (currentUser.availableLeave !== undefined) {
            available = Number(currentUser.availableLeave) || 0;
        } else {
            const approvedLeaves = leaveData.filter(l =>
                (l.employeeId === currentUser._id || l.name === currentUser.name) &&
                l.status === 'approved'
            );
            const usedDays = approvedLeaves.reduce((sum, l) => sum + (l.days || l.numberOfDays || 0), 0);
            available = Math.max(0, 12 - usedDays);
        }

        if (remainingLeaveCount) remainingLeaveCount.textContent = available;
        if (remainingLeave) remainingLeave.textContent = available;
    }

    // 4. Lương dự tính
    const pendingSalary = document.getElementById('pendingSalary');
    if (pendingSalary) {
        pendingSalary.textContent = formatCurrency(currentUser.salary || 0);
    }

    // 5. Đơn chờ duyệt
    const pendingRequestsCount = document.getElementById('pendingRequestsCount');
    const pendingRequests = document.getElementById('pendingRequests');
    if (pendingRequestsCount || pendingRequests) {
        const pendingCount = leaveData.filter(l =>
            (l.employeeId === currentUser._id || l.name === currentUser.name) &&
            l.status === 'pending'
        ).length;
        if (pendingRequestsCount) pendingRequestsCount.textContent = pendingCount;
        if (pendingRequests) pendingRequests.textContent = pendingCount;
    }
}

// Hiển thị thông tin cá nhân
function renderProfileInfo() {
    if (!currentUser) return;

    const fields = {
        'displayId': currentUser._id || currentUser.id || 'N/A',
        'displayName': currentUser.name,
        'displayEmail': currentUser.email,
        'displayPhone': currentUser.phone,
        'displayPosition': currentUser.position,
        'displayDepartment': currentUser.department,
        'displayAddress': currentUser.address
    };

    for (const [id, value] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (el) el.textContent = value || '-';
    }

    const bdayEl = document.getElementById('displayBirthday');
    if (bdayEl) bdayEl.textContent = currentUser.birthday ? formatDate(currentUser.birthday) : '-';

    // Button dành cho Admin/HR
    const profileTab = document.getElementById('profile-tab');
    if (profileTab && (currentUser.role === 'admin' || currentUser.role === 'hr')) {
        if (!document.getElementById('viewAllDocumentsLink')) {
            const linkDiv = document.createElement('div');
            linkDiv.id = 'viewAllDocumentsLink';
            linkDiv.style.cssText = 'margin-top: 2rem; padding-top: 2rem; border-top: 1px solid #e5e7eb;';
            linkDiv.innerHTML = `
                <a href="./tailieu.html" target="_blank" class="btn-premium btn-premium-primary" style="text-decoration: none; display: inline-flex; align-items: center; gap: 0.5rem;">
                    <i class="fas fa-folder"></i> Quản lý hồ sơ nhân viên
                </a>
            `;
            profileTab.appendChild(linkDiv);
        }
    }
}

// Toggle form tùy chỉnh hồ sơ
function toggleEditProfileForm() {
    const formContainer = document.getElementById('editProfileFormContainer');

    if (!formContainer.style.display || formContainer.style.display === 'none') {
        if (!currentUser) return;
        document.getElementById('editPhone').value = currentUser.phone || '';
        document.getElementById('editBirthday').value = currentUser.birthday || '';
        document.getElementById('editAddress').value = currentUser.address || '';

        formContainer.style.display = 'flex';
    } else {
        formContainer.style.display = 'none';
    }
}

// Lưu thay đổi hồ sơ
async function saveProfileChanges() {
    const phone = document.getElementById('editPhone')?.value?.trim();
    const birthday = document.getElementById('editBirthday')?.value;
    const address = document.getElementById('editAddress')?.value?.trim();

    if (!phone) {
        showNotification('Vui lòng nhập số điện thoại', 'warning');
        return;
    }

    if (birthday && !ValidationHelper.validateDate(birthday)) {
        showNotification('Ngày sinh không hợp lệ', 'warning');
        return;
    }

    try {
        const updateData = {
            name: currentUser.name,
            email: currentUser.email,
            phone: phone,
            address: address,
            birthday: birthday || null,
            department: currentUser.department,
            position: currentUser.position,
            salary: currentUser.salary || 0,
            status: currentUser.status || 'active'
        };

        if (currentUser._id) {
            await EmployeeAPI.update(currentUser._id, updateData);
        }

        currentUser.phone = phone;
        currentUser.birthday = birthday;
        currentUser.address = address;

        localStorage.setItem('currentUserProfile', JSON.stringify(currentUser));

        renderProfileInfo();
        updateEmployeeHeader();
        showNotification('Cập nhật thành công!', 'success');
        if (document.getElementById('editProfileFormContainer')?.style.display !== 'none') {
            toggleEditProfileForm();
        }
    } catch (error) {
        console.error('Lỗi lưu hồ sơ:', error);
        showNotification('Không thể lưu hồ sơ: ' + error.message, 'error');
    }
}

// Toggle form tải tài liệu
function toggleUploadDocumentForm() {
    const formContainer = document.getElementById('uploadDocumentFormContainer');

    if (!formContainer.style.display || formContainer.style.display === 'none') {
        formContainer.style.display = 'flex';
    } else {
        formContainer.style.display = 'none';

        document.getElementById('docName').value = '';
        document.getElementById('docType').value = '';
        document.getElementById('docFileType').value = 'pdf';
        document.getElementById('docFile').value = '';
        document.getElementById('docFilePreview').innerHTML = '';
        if (typeof clearDocumentErrors === 'function') clearDocumentErrors();
    }
}
//xử lý chọn file tài liệu
function handleDocFileSelect(event) {
    const file = event.target.files[0];
    const preview = document.getElementById('docFilePreview');

    if (!file) {
        preview.innerHTML = '';
        return;
    }

    const fileType = document.getElementById('docFileType')?.value;

    if (!validateFileType(file, fileType)) {
        showNotification(`File không đúng định dạng. Vui lòng chọn file ${fileType.toUpperCase()}`, 'error');
        document.getElementById('docFile').value = '';
        preview.innerHTML = '';
        return;
    }

    preview.innerHTML = `
        <div style="padding: 1rem; background: #f0fdf4; border: 1px solid #86efac; border-radius: 0.375rem;">
            <div style="color: #166534; font-weight: 500;">✓ File hợp lệ</div>
            <div style="color: #4b5563; font-size: 0.875rem; margin-top: 0.25rem;">
                <div>Tên: ${escapeHtml(file.name)}</div>
                <div>Kích thước: ${(file.size / 1024 / 1024).toFixed(2)} MB</div>
            </div>
        </div>
    `;
}
//kiểm tra file hợp lệ
function validateFileType(file, selectedType) {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const mimeType = file.type;

    const typeMap = {
        'pdf': ['pdf'],
        'doc': ['doc', 'docx', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        'image': ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp']
    };

    const validExtensions = typeMap[selectedType] || [];
    return validExtensions.some(ext => fileExtension === ext || mimeType === ext);
}
async function saveDocument() {
    const docName = document.getElementById('docName')?.value?.trim();
    const docType = document.getElementById('docType')?.value?.trim();
    const fileInput = document.getElementById('docFile');
    const file = fileInput?.files?.[0];

    if (!docName || !docType || !file) {
        showNotification('Vui lòng điền đủ: Tên + Loại + Chọn file', 'error');
        return;
    }

    try {
        const formData = new FormData();
        formData.append('name', docName);
        formData.append('type', docType);
        formData.append('file', file);
        formData.append('description', docType);
        formData.append('employeeId', currentUser._id);
        const result = await DocumentAPI.create(formData);
        showNotification('Tải lên thành công!', 'success');

        if (document.getElementById('uploadDocumentFormContainer')?.style.display !== 'none') {
            toggleUploadDocumentForm();
        }

        // Tải lại documents ngay lập tức
        setTimeout(() => {
            loadProfileDocuments();
        }, 300);

    } catch (error) {
        showNotification(error.message || 'Lỗi upload', 'error');
    }
}
//upload tài liệu lên server và lưu
async function uploadDocument() {
    return saveDocument();
}

function showDocumentError(field, message) {
    const errorEl = document.getElementById(field + 'Error');
    const inputEl = document.getElementById(field);

    if (inputEl) {
        inputEl.classList.add('error');
        inputEl.style.borderColor = '#dc2626';
    }

    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.color = '#dc2626';
        errorEl.style.fontSize = '0.875rem';
        errorEl.style.marginTop = '0.25rem';
        errorEl.style.display = 'block';
    }
}

function clearDocumentErrors() {
    const errorFields = ['docName', 'docType', 'docFileType', 'docFile'];
    errorFields.forEach(field => {
        const errorEl = document.getElementById(field + 'Error');
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
        }
        const inputEl = document.getElementById(field);
        if (inputEl) {
            inputEl.classList.remove('error');
            inputEl.style.borderColor = '';
        }
    });
}

function resetDocumentForm() {
    document.getElementById('docName').value = '';
    document.getElementById('docType').value = '';
    document.getElementById('docFileType').value = 'pdf';
    document.getElementById('docFile').value = '';
    document.getElementById('docFilePreview').innerHTML = '';
}

async function viewProfileDocument(docId) {
    try {
        const doc = profileDocuments.find(d => d._id === docId);
        if (!doc) {
            showNotification('Không tìm thấy tài liệu', 'error');
            return;
        }

        // "Xem" = Download luôn, không phân biệt loại file
        downloadProfileDocument(docId);

    } catch (error) {
        console.error('Error viewing document:', error);
        showNotification('Lỗi: ' + error.message, 'error');
    }
}

function openImageViewer(imageUrl, imageName) {
    const modal = document.createElement('div');
    modal.id = 'imageViewerModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;

    modal.innerHTML = `
        <div style="
            position: relative;
            max-width: 90%;
            max-height: 90%;
        ">
            <img src="${imageUrl}" alt="${imageName}" style="
                max-width: 100%;
                max-height: 90vh;
                object-fit: contain;
                border-radius: 0.5rem;
            ">
            
            <button onclick="closeImageViewer()" style="
                position: absolute;
                top: -50px;
                right: 0;
                background: white;
                border: none;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                font-size: 24px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #333;
            " title="Đóng">
                ✕
            </button>

            <div style="
                position: absolute;
                bottom: -50px;
                left: 50%;
                transform: translateX(-50%);
                color: white;
                font-size: 14px;
                text-align: center;
                width: 300px;
            ">
                <p>${imageName}</p>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}


function closeImageViewer() {
    const modal = document.getElementById('imageViewerModal');
    if (modal) {
        modal.remove();
    }
}

//tải xuống tài liệu
async function downloadProfileDocument(docId) {
    try {
        const doc = profileDocuments.find(d => d._id === docId);
        if (!doc) {
            showNotification('Không tìm thấy tài liệu', 'error');
            return;
        }
        //tạo link download
        const fileUrl = doc.filePath || `/api/documents/${docId}/content`;
        let fullUrl = fileUrl;
        if (fileUrl.startsWith('/')) {
            fullUrl = window.location.origin + fileUrl;
        }

        //tạo phần tử <a> để download
        const link = document.createElement('a');
        link.href = fullUrl;
        link.download = doc.name || 'document';
        link.style.display = 'none';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showNotification('Đang tải xuống...', 'success');

    } catch (error) {
        showNotification('Lỗi: ' + error.message, 'error');
    }
}

// xóa tài liệu
async function deleteProfileDocument(docId) {
    if (!confirm('Bạn có chắc chắn muốn xóa tài liệu này?')) {
        return;
    }
    try {
        await DocumentAPI.delete(docId);
        showNotification('Đã xóa tài liệu thành công', 'success');
        await loadProfileDocuments();
    } catch (error) {
        showNotification('Lỗi: ' + error.message, 'error');
    }
}
// Toggle form chấm công
function toggleCheckInForm() {
    const formContainer = document.getElementById('checkInFormContainer');

    if (!formContainer.style.display || formContainer.style.display === 'none') {
        if (!currentUser) {
            showNotification('Vui lòng đợi trang load xong', 'warning');
            return;
        }

        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        document.getElementById('checkInTime').value = currentTime;
        document.getElementById('checkOutTime').value = '';
        document.getElementById('checkInNote').value = '';

        clearCheckInErrors();

        formContainer.style.display = 'flex';
    } else {
        formContainer.style.display = 'none';
    }
}
//lưu
async function submitCheckIn() {
    const checkInTime = document.getElementById('checkInTime')?.value;
    const checkOutTime = document.getElementById('checkOutTime')?.value;
    const note = document.getElementById('checkInNote')?.value;

    clearCheckInErrors();

    if (!checkInTime || !TIME_REGEX.test(checkInTime)) {
        showCheckInError('checkInTime', 'Giờ vào không hợp lệ (HH:MM)');
        return;
    }

    const today = new Date().toISOString().split('T')[0];

    const todayRecord = attendanceData.find(r => {
        if (!r.date) return false;
        const recordDate = new Date(r.date).toISOString().split('T')[0];
        return recordDate === today && (r.employeeId === currentUser._id || r.name === currentUser.name);
    });

    let totalHours = '-';
    if (checkOutTime) {
        if (!TIME_REGEX.test(checkOutTime)) {
            showCheckInError('checkOutTime', 'Giờ ra không hợp lệ (HH:MM)');
            return;
        }

        const [inH, inM] = checkInTime.split(':').map(Number);
        const [outH, outM] = checkOutTime.split(':').map(Number);
        const inMin = inH * 60 + inM;
        const outMin = outH * 60 + outM;

        if (outMin <= inMin) {
            showCheckInError('checkOutTime', 'Giờ ra phải sau giờ vào');
            return;
        }

        const diff = outMin - inMin;
        totalHours = `${Math.floor(diff / 60)}h ${diff % 60}m`;
    }

    const newRecord = {
        employeeId: currentUser._id,
        name: currentUser.name,
        email: currentUser.email,
        department: currentUser.department,
        position: currentUser.position,
        date: today,
        checkIn: checkInTime,
        checkOut: checkOutTime || '-',
        totalHours: totalHours,
        status: checkInTime > '08:00' ? 'late' : 'present',
        note: note || '',
        approvalStatus: 'pending'
    };

    try {
        if (todayRecord) {
            await AttendanceAPI.update(todayRecord._id, newRecord);
            const index = attendanceData.findIndex(r => r._id === todayRecord._id);
            if (index !== -1) {
                attendanceData[index] = { ...attendanceData[index], ...newRecord };
            }
        } else {
            const response = await AttendanceAPI.create(newRecord);
            attendanceData.unshift({
                ...newRecord,
                _id: response._id,
                createdAt: new Date().toISOString()
            });
        }
        showNotification('Chấm công thành công!', 'success');
        renderEmployeeAttendance();
        updateDashboardStats();
        if (document.getElementById('checkInFormContainer')?.style.display !== 'none') {
            toggleCheckInForm();
        }
    } catch (error) {
        console.error('Lỗi chấm công:', error);
        showNotification('Lỗi: ' + error.message, 'error');
    }
}
//xóa lỗi chấm công
function clearCheckInErrors() {
    const errorFields = ['checkInTime', 'checkOutTime'];
    errorFields.forEach(field => {
        const errorEl = document.getElementById(field + 'Error');
        if (errorEl) errorEl.textContent = '';
    });
}

function showCheckInError(field, message) {
    const errorEl = document.getElementById(field + 'Error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.color = '#dc2626';
        errorEl.style.fontSize = '0.875rem';
        errorEl.style.marginTop = '0.25rem';
    }
}

function toggleLeaveForm() {
    const formContainer = document.getElementById('leaveFormContainer');

    if (!formContainer.style.display || formContainer.style.display === 'none') {
        document.getElementById('leaveStartDate').value = '';
        document.getElementById('leaveEndDate').value = '';
        document.getElementById('leaveType').value = 'annual';
        document.getElementById('leaveReason').value = '';

        clearLeaveErrors();

        formContainer.style.display = 'flex';
    } else {
        formContainer.style.display = 'none';
    }
}

async function submitLeave() {
    const startDate = document.getElementById('leaveStartDate')?.value;
    const endDate = document.getElementById('leaveEndDate')?.value;
    const type = document.getElementById('leaveType')?.value;
    const reason = document.getElementById('leaveReason')?.value;

    clearLeaveErrors();

    if (!startDate) {
        showLeaveError('leaveStartDate', 'Vui lòng chọn ngày bắt đầu');
        return;
    }
    if (!endDate) {
        showLeaveError('leaveEndDate', 'Vui lòng chọn ngày kết thúc');
        return;
    }
    if (!type) {
        showLeaveError('leaveType', 'Vui lòng chọn loại nghỉ');
        return;
    }
    if (!reason || reason.trim() === '') {
        showLeaveError('leaveReason', 'Vui lòng nhập lý do nghỉ');
        return;
    }

    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    if (endDateObj < startDateObj) {
        showLeaveError('leaveEndDate', 'Ngày kết thúc phải sau ngày bắt đầu');
        return;
    }

    const days = Math.ceil((endDateObj - startDateObj) / (1000 * 60 * 60 * 24)) + 1;

    if (days > 30) {
        showNotification('Không thể đăng ký nghỉ quá 30 ngày một lần', 'warning');
        return;
    }

    try {
        const leavePayload = {
            employeeId: currentUser._id,
            name: currentUser.name,
            department: currentUser.department,
            type: type,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            days: days,
            reason: reason.trim(),
            status: 'pending'
        };

        const response = await LeaveAPI.create(leavePayload);

        leaveData.unshift({
            ...leavePayload,
            _id: response._id,
            createdAt: new Date().toISOString()
        });
        renderEmployeeLeave();
        updateDashboardStats();
        showNotification('Gửi đơn thành công!', 'success');
        if (document.getElementById('leaveFormContainer')?.style.display !== 'none') {
            toggleLeaveForm();
        }
    } catch (error) {
        console.error('Lỗi gửi đơn:', error);
        showNotification('Lỗi: ' + error.message, 'error');
    }
}

function clearLeaveErrors() {
    const errorFields = ['leaveStartDate', 'leaveEndDate', 'leaveType', 'leaveReason'];
    errorFields.forEach(field => {
        const errorEl = document.getElementById(field + 'Error');
        if (errorEl) errorEl.textContent = '';
    });
}

function showLeaveError(field, message) {
    const errorEl = document.getElementById(field + 'Error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.color = '#dc2626';
        errorEl.style.fontSize = '0.875rem';
        errorEl.style.marginTop = '0.25rem';
    }
}

function formatTimeAgo(date) {
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Vừa xong';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} phút trước`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ trước`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} ngày trước`;

    return date.toLocaleDateString('vi-VN');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(date) {
    if (!date) return '-';
    try {
        const d = new Date(date);
        return d.toLocaleDateString('vi-VN');
    } catch {
        return '-';
    }
}

function formatCurrency(amount) {
    if (typeof amount !== 'number') return '0 ₫';
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(amount);
}

function calculateTotalHours(checkIn, checkOut) {
    if (!checkIn || !checkOut || checkOut === '-') return '-';

    try {
        const [inH, inM] = checkIn.split(':').map(Number);
        const [outH, outM] = checkOut.split(':').map(Number);
        const inMin = inH * 60 + inM;
        const outMin = outH * 60 + outM;

        if (outMin <= inMin) return '-';

        const diff = outMin - inMin;
        return `${Math.floor(diff / 60)}h ${diff % 60}m`;
    } catch {
        return '-';
    }
}

function getLeaveTypeBadge(type) {
    const typeMap = {
        'annual': { text: 'Phép năm', class: 'badge-blue' },
        'sick': { text: 'Nghỉ ốm', class: 'badge-red' },
        'personal': { text: 'Cá nhân', class: 'badge-yellow' },
        'unpaid': { text: 'Không lương', class: 'badge-gray' }
    };

    const info = typeMap[type] || { text: type, class: 'badge-gray' };
    return `<span class="badge ${info.class}">${info.text}</span>`;
}

function getFileIcon(fileType) {
    const type = fileType?.toLowerCase();

    const iconMap = {
        'pdf': '<i class="fas fa-file-pdf" style="color: #dc2626;"></i>',
        'doc': '<i class="fas fa-file-word" style="color: #2563eb;"></i>',
        'docx': '<i class="fas fa-file-word" style="color: #2563eb;"></i>',
        'xls': '<i class="fas fa-file-excel" style="color: #16a34a;"></i>',
        'xlsx': '<i class="fas fa-file-excel" style="color: #16a34a;"></i>',
        'jpg': '<i class="fas fa-file-image" style="color: #f59e0b;"></i>',
        'jpeg': '<i class="fas fa-file-image" style="color: #f59e0b;"></i>',
        'png': '<i class="fas fa-file-image" style="color: #f59e0b;"></i>',
        'gif': '<i class="fas fa-file-image" style="color: #f59e0b;"></i>',
        'txt': '<i class="fas fa-file-alt" style="color: #6b7280;"></i>',
        'zip': '<i class="fas fa-file-archive" style="color: #8b5cf6;"></i>',
        'default': '<i class="fas fa-file" style="color: #9ca3af;"></i>'
    };

    return iconMap[type] || iconMap['default'];
}

function getDocTypeLabel(type) {
    const labels = {
        'certificate': 'Chứng chỉ/Bằng cấp',
        'contract': 'Hợp đồng',
        'insurance': 'Bảo hiểm',
        'identification': 'Giấy tờ tùy thân',
        'report': 'Báo cáo',
        'other': 'Khác'
    };
    return labels[type] || type;
}

function logout() {
    if (confirm('Bạn có chắc chắn muốn đăng xuất?')) {
        AuthManager.logout();
        window.location.href = './dangnhap.html';
    }
}

// ==================== OUTSIDE CLICK LISTENER REMOVED FOR INLINE FORMS ====================

// ==================== NOTIFICATION TAB LOGIC ====================
let currentNotifFilter = 'all';

function renderNotificationTab() {
    const container = document.getElementById('notifListPortal');
    if (!container) return;

    let filtered = [...notificationData];
    if (currentNotifFilter === 'unread') {
        filtered = filtered.filter(n => !n.isRead);
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state-container">
                <div class="empty-state-icon"><i class="fas fa-bell-slash"></i></div>
                <p class="empty-state-text">Không có thông báo nào ${currentNotifFilter === 'unread' ? 'chưa đọc' : ''}.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(n => {
        const typeClass = n.type || 'info';
        const isRead = n.isRead;
        const hasAttachment = !!(n.attachment || n.fileUrl);

        return `
            <div id="notice-row-${n._id}">
                <div class="notice-item ${isRead ? '' : 'unread'}" onclick="viewNoticeDetail('${n._id}')" style="cursor: pointer; transition: all 0.2s;">
                    <div class="notice-icon-circle ${typeClass}">
                        <i class="fas ${getIconForType(n.type)}"></i>
                    </div>
                    <div class="notice-content-preview">
                        <div class="notice-title" style="font-weight: 700; color: #1e293b;">${escapeHtml(n.title)}</div>
                        <div class="notice-snippet" style="color: #64748b; font-size: 0.9rem; margin: 0.25rem 0;">${escapeHtml(n.message)}</div>
                        <div class="notice-meta-tags" style="display: flex; gap: 1rem; font-size: 0.8rem; color: #94a3b8;">
                            <span><i class="far fa-user"></i> ${escapeHtml(n.senderName || 'Hệ thông')}</span>
                            <span><i class="far fa-clock"></i> ${formatDate(n.createdAt)}</span>
                            ${hasAttachment ? `<span class="notice-attachment-indicator" style="color: #6366f1;"><i class="fas fa-paperclip"></i> Có đính kèm</span>` : ''}
                        </div>
                    </div>
                </div>
                <div id="notice-expansion-${n._id}" class="notice-expansion" style="display: none; padding: 1.5rem; background: #f8fafc; border-radius: 0 0 1rem 1rem; margin-top: -0.5rem; border: 1px solid #e2e8f0; border-top: none; animation: slideDown 0.3s ease-out;">
                    <!-- Detail content will be injected here -->
                </div>
            </div>
        `;
    }).join('');
}

function filterPortalNotifications(filter) {
    currentNotifFilter = filter;

    // UI update for tabs
    document.getElementById('notif-filter-all').classList.toggle('active', filter === 'all');
    document.getElementById('notif-filter-unread').classList.toggle('active', filter === 'unread');

    renderNotificationTab();
}

function getIconForType(type) {
    switch (type) {
        case 'success': return 'fa-check-circle';
        case 'warning': return 'fa-exclamation-triangle';
        case 'error': return 'fa-exclamation-circle';
        default: return 'fa-bullhorn';
    }
}

async function viewNoticeDetail(noticeId) {
    const notice = notificationData.find(n => n._id === noticeId);
    if (!notice) return;

    const expansion = document.getElementById(`notice-expansion-${noticeId}`);
    if (!expansion) return;

    if (expansion.style.display === 'block') {
        expansion.style.display = 'none';
        return;
    }

    // Đóng các thông báo khác đang mở
    document.querySelectorAll('.notice-expansion').forEach(el => el.style.display = 'none');

    const attachmentHtml = (notice.fileUrl || notice.fileName) ? `
        <div style="margin-top: 1.5rem; padding: 1rem; background: #f1f5f9; border-radius: 0.75rem; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <i class="fas fa-file-alt" style="color: #64748b;"></i>
                <span style="font-weight: 500; font-size: 0.9rem; color: #334155;">${escapeHtml(notice.fileName || 'Tài liệu đính kèm')}</span>
            </div>
            <a href="${notice.fileUrl || '#'}" target="_blank" class="btn-premium btn-premium-secondary" style="padding: 0.4rem 1rem; font-size: 0.8rem; text-decoration: none;">Tải về</a>
        </div>
    ` : '';

    expansion.innerHTML = `
        <div style="color: #334155; line-height: 1.6; font-size: 0.95rem; white-space: pre-wrap;">${escapeHtml(notice.message)}</div>
        ${attachmentHtml}
        <div style="margin-top: 1rem; text-align: right;">
            <button class="btn-premium btn-premium-secondary" style="padding: 0.4rem 1rem; font-size: 0.8rem;" onclick="document.getElementById('notice-expansion-${noticeId}').style.display = 'none'">Đóng lại</button>
        </div>
    `;

    expansion.style.display = 'block';

    if (!notice.isRead) {
        try {
            await NotificationAPI.markAsRead(noticeId);
            notice.isRead = true;
            // Cập nhật UI badge và trạng thái item (đánh dấu là đã đọc mà không render lại toàn bộ tab để tránh mất focus)
            const row = document.getElementById(`notice-row-${noticeId}`);
            if (row) {
                const item = row.querySelector('.notice-item');
                if (item) item.classList.remove('unread');
            }
            updateNotificationBadge();
        } catch (err) {
            console.error('Mark read failed:', err);
        }
    }
}


// ==================== PAGE LOAD ====================
document.addEventListener('DOMContentLoaded', function () {
    if (!AuthManager.checkAuth()) {
        window.location.href = './dangnhap.html';
        return;
    }

    initializePage();
});
// Đã gộp logic vào hàm renderProfileInfo chính ở trên
