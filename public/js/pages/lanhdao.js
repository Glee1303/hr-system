(function () {
    const publicPages = ['dangnhap.html', 'index.html', ''];
    const currentPath = window.location.pathname.split('/').pop();
    if (!publicPages.includes(currentPath)) {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token) window.location.replace('dangnhap.html');
    }
})();

let dashboardData = null;
let deptChartInstance = null; // Store chart instance

document.addEventListener('DOMContentLoaded', () => {
    if (!AuthManager.checkAuth()) return;

    const adminNameEl = document.getElementById('adminName');
    if (adminNameEl) adminNameEl.textContent = AuthManager.getUserName();

    // Sidebar Toggle Logic
    const toggleBtn = document.getElementById('toggleSidebar');
    const sidebar = document.getElementById('sidebar');
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }

    // User Menu Toggle
    const userMenuBtn = document.getElementById('userMenuBtn');
    if (userMenuBtn) {
        userMenuBtn.addEventListener('click', () => {
            window.location.href = 'taikhoan.html';
        });
    }

    initDashboard();
    setupDataSyncListeners();

    smartRefresh.schedule('dashboard', loadDashboardData, 5 * 60 * 1000, true);

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    const quickSendBtn = document.getElementById('quickSendBtn');
    if (quickSendBtn) {
        quickSendBtn.addEventListener('click', sendQuickNotification);
    }
});

async function initDashboard() {
    await loadDashboardData();
}

async function loadDashboardData() {
    try {
        const loadingState = document.getElementById('loadingState');
        if (loadingState) loadingState.style.display = 'flex';

        if (!AuthManager.getToken()) {
            window.location.href = 'dangnhap.html';
            return;
        }

        const [employees, attendance, leaves, salaries, candidates, logs] = await Promise.all([
            EmployeeAPI.getAll().catch(() => []),
            AttendanceAPI.getAll().catch(() => []),
            LeaveAPI.getAll().catch(() => []),
            SalaryAPI.getAll().catch(() => []),
            CandidateAPI.getAll().catch(() => []),
            ActivityLogAPI.getAll().catch(() => [])
        ]);

        const validEmp = Array.isArray(employees) ? employees : [];
        const validAtt = Array.isArray(attendance) ? attendance : [];
        const validLeave = Array.isArray(leaves) ? leaves : [];
        const validSal = Array.isArray(salaries) ? salaries : [];
        const validCand = Array.isArray(candidates) ? candidates : [];
        const validLogs = Array.isArray(logs) ? logs : [];

        dashboardData = {
            stats: calculateStats(validEmp, validAtt, validLeave, validSal),
            charts: generateChartData(validEmp, validAtt, validLeave, validSal),
            newEmployees: getNewEmployees(validEmp),
            recentActivity: validLogs.length > 0 ? validLogs.slice(0, 10) : []
        };

        displayDashboardContent(dashboardData);
        loadActivityHistory(validAtt, validLeave, validEmp, validCand, validLogs);

        if (loadingState) loadingState.style.display = 'none';

    } catch (error) {
        console.error('Dashboard Error:', error);
        const loadingState = document.getElementById('loadingState');
        if (loadingState) loadingState.style.display = 'none';
        showNotification('Lỗi tải dữ liệu: ' + error.message, 'error');
    }
}

function calculateStats(employees, attendance, leaves, salaries) {
    const today = new Date().toISOString().split('T')[0];

    const totalEmployees = employees.length;

    const attendanceToday = attendance.filter(a => {
        if (!a.date) return false;
        const recordDate = new Date(a.date).toISOString().split('T')[0];
        return recordDate === today && a.checkIn;
    }).length;

    const absentToday = attendance.filter(a => {
        if (!a.date) return false;
        const recordDate = new Date(a.date).toISOString().split('T')[0];
        return recordDate === today && (!a.checkIn || a.status === 'absent');
    }).length;

    const attendanceRate = totalEmployees > 0
        ? Math.round((attendanceToday / totalEmployees) * 100)
        : 0;

    const onLeaveToday = leaves.filter(l => {
        if (!l.startDate || !l.endDate || l.status !== 'approved') return false;
        const start = new Date(l.startDate).toISOString().split('T')[0];
        const end = new Date(l.endDate).toISOString().split('T')[0];
        return today >= start && today <= end;
    }).length;

    const departments = new Set(employees.map(e => e.department).filter(val => val && val !== 'Chưa xác định' && val !== 'N/A'));

    const newHiresThisMonth = employees.filter(e => {
        const joinDateStr = e.startDate || e.createdAt;
        if (!joinDateStr) return false;
        const joinDate = new Date(joinDateStr);
        const now = new Date();
        return joinDate.getMonth() === now.getMonth() && joinDate.getFullYear() === now.getFullYear();
    }).length;

    return {
        totalEmployees,
        totalDepartments: departments.size || 0,
        attendanceToday,
        onLeaveToday,
        newHiresThisMonth,
        absentToday,
        attendanceRate: attendanceRate + '%'
    };
}

function displayDashboardContent(data) {
    if (!data) return;

    const stats = data.stats;
    setText('totalEmployees', stats.totalEmployees);
    setText('totalDepartments', stats.totalDepartments);
    setText('attendanceToday', stats.attendanceToday);
    setText('attendanceRate', stats.attendanceRate);
    setText('absentToday', stats.absentToday);
    setText('onLeaveToday', stats.onLeaveToday);
    setText('newHiresThisMonth', stats.newHiresThisMonth);

    renderNewEmployeesTable(data.newEmployees);
    renderDepartmentChart(data.charts.departmentData);
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function renderNewEmployeesTable(employees) {
    const tbody = document.getElementById('newEmployeesTable');
    if (!tbody) return;

    if (!employees || employees.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Không có nhân viên mới</td></tr>';
        return;
    }

    const statusMap = {
        'active': { label: 'Đang làm việc', class: 'badge-success' },
        'leave': { label: 'Nghỉ phép', class: 'badge-warning' },
        'resigned': { label: 'Đã nghỉ việc', class: 'badge-danger' }
    };

    tbody.innerHTML = employees.map(emp => {
        const initial = emp.name.charAt(0).toUpperCase();
        return `
            <tr>
                <td>
                    <div style="display:flex; align-items:center; gap:0.75rem;">
                        <div style="width:32px; height:32px; background:#e0e7ff; color:#3730a3; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold;">
                            ${initial}
                        </div>
                        <div>
                            <div style="font-weight:500;">${escapeHtml(emp.name)}</div>
                            <div style="font-size:12px; color:#6b7280;">${escapeHtml(emp.email || '')}</div>
                        </div>
                    </div>
                </td>
                <td>${escapeHtml(emp.department || 'Chưa xác định')}</td>
                <td>${escapeHtml(emp.position || 'Nhân viên')}</td>
                <td>
                   <span style="font-size:12px; padding:2px 8px; border-radius:99px; background:#dcfce7; color:#166534;">
                        ${statusMap[emp.status]?.label || emp.status || 'Active'}
                   </span>
                </td>
                <td>
                    <button class="icon-btn" style="width:28px; height:28px; font-size:14px;">
                        <i class="fas fa-ellipsis-h"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderDepartmentChart(deptData) {
    const ctx = document.getElementById('departmentChart');
    if (!ctx) return;

    const labels = Object.keys(deptData);
    const data = Object.values(deptData);

    if (deptChartInstance) {
        deptChartInstance.destroy();
    }

    const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#64748b'];

    deptChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 20,
                        font: {
                            family: "'Inter', sans-serif",
                            size: 12
                        }
                    }
                }
            },
            layout: {
                padding: 10
            }
        }
    });
}

async function sendQuickNotification() {
    const titleObj = document.getElementById('quickNotifTitle');
    const typeObj = document.getElementById('quickNotifType');

    if (!titleObj || !titleObj.value.trim()) {
        showNotification('Vui lòng nhập tiêu đề thông báo', 'warning');
        return;
    }

    const title = titleObj.value.trim();
    const type = typeObj.value;

    try {
        await NotificationAPI.create({
            userId: 'ALL', // Special keyword for broad notifications
            title: title,
            message: title,
            type: type
        });
        showNotification('Gửi thông báo thành công', 'success');
        titleObj.value = '';
    } catch (error) {
        console.error(error);
        showNotification('Gửi thất bại', 'error');
    }
}

function getNewEmployees(employees) {
    if (!employees || employees.length === 0) return [];
    return [...employees]
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 5);
}

function generateChartData(employees, attendance, leaves, salaries) {
    const departmentData = {};
    if (employees && employees.length > 0) {
        employees.forEach(emp => {
            const dept = emp.department || 'Chưa xác định';
            if (dept !== 'N/A') {
                departmentData[dept] = (departmentData[dept] || 0) + 1;
            }
        });
    }
    return { departmentData };
}

async function loadActivityHistory(attData, leaveData, empData, candData, logData) {
    try {
        let activities = [];

        // 1. Prioritize Real Activity Logs from Backend
        if (Array.isArray(logData) && logData.length > 0) {
            logData.forEach(log => {
                let icon = 'fa-info-circle';
                let color = '#64748b';

                if (log.action === 'LOGIN') { icon = 'fa-sign-in-alt'; color = '#3b82f6'; }
                else if (log.action.includes('CREATE')) { icon = 'fa-plus-circle'; color = '#10b981'; }
                else if (log.action.includes('UPDATE')) { icon = 'fa-edit'; color = '#f59e0b'; }
                else if (log.action.includes('DELETE')) { icon = 'fa-trash-alt'; color = '#ef4444'; }
                else if (log.action.includes('UPLOAD')) { icon = 'fa-upload'; color = '#8b5cf6'; }

                activities.push({
                    timeObj: new Date(log.createdAt),
                    title: log.action.replace(/_/g, ' '),
                    detail: log.details || '',
                    icon: icon,
                    color: color
                });
            });
        }

        // 2. Fallback to derived events if no logs
        if (activities.length === 0) {
            if (Array.isArray(empData)) {
                empData.slice(0, 10).forEach(emp => {
                    const time = emp.createdAt || emp.startDate;
                    if (time) {
                        activities.push({
                            timeObj: new Date(time),
                            title: 'Nhân viên mới',
                            detail: `${emp.name} đã tham gia hệ thống.`,
                            icon: 'fa-user-plus',
                            color: '#10b981'
                        });
                    }
                });
            }
            // ... (rest of derivation logic could go here)
        }

        activities.sort((a, b) => b.timeObj - a.timeObj);
        activities = activities.slice(0, 10);

        const formatRelativeTime = (time) => {
            const diff = Math.floor((new Date() - new Date(time)) / 1000);
            if (diff < 0) return 'Vừa xong';
            if (diff < 60) return 'Vừa xong';
            if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
            if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
            return `${Math.floor(diff / 86400)} ngày trước`;
        };

        const container = document.querySelector('.activity-feed');
        if (container) {
            if (activities.length === 0) {
                container.innerHTML = '<div class="empty-state">Chưa có hoạt động nào.</div>';
                return;
            }

            container.innerHTML = activities.map(act => `
                <div class="activity-item">
                    <div class="activity-icon-box" style="background: ${act.color}20; color: ${act.color};">
                        <i class="fas ${act.icon}"></i>
                    </div>
                    <div class="activity-content">
                        <h4>${act.title}</h4>
                        <p>${act.detail}</p>
                        <div class="activity-time">${formatRelativeTime(act.timeObj)}</div>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Activity load error:', error);
    }
}

function setupDataSyncListeners() {
    if (typeof DataSync === 'undefined') return;

    const events = [
        'employee:created', 'employee:updated', 'employee:deleted',
        'attendance:created', 'attendance:updated', 'attendance:deleted',
        'leave:created', 'leave:updated', 'leave:deleted',
        'salary:created', 'salary:updated',
        'department:created', 'department:updated', 'department:deleted',
        'notification:created', 'activity:created'
    ];

    events.forEach(event => {
        DataSync.on(event, () => {
            console.log(`📢 Dashboard Sync: ${event}`);

            // Clear caches
            if (event.startsWith('employee')) EmployeeAPI.clearCache();
            if (event.startsWith('attendance')) AttendanceAPI.clearCache();
            if (event.startsWith('leave')) LeaveAPI.clearCache();
            if (event.startsWith('salary')) SalaryAPI.clearCache();
            if (event.startsWith('department')) DepartmentAPI.clearCache();

            loadDashboardData();
        });
    });
}
