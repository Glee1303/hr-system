(function () {
    const publicPages = ['dangnhap.html', 'index.html', ''];
    const currentPath = window.location.pathname.split('/').pop();
    if (!publicPages.includes(currentPath)) {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token) window.location.replace('dangnhap.html');
    }
})();

let allSalaries = [];
let filteredSalaries = [];
let allEmployees = [];
let allAttendance = [];
let createSalaryList = [];
const pagination = new PaginationHelper(50);

// Cách tính lương
const SALARY_CONFIG = {
    dailyRate: 0.043, // 1 tháng = 23 ngày làm việc, 1 ngày = 8 giờ
    lateDeduction: 0.05, // Khấu 5% lương khi đi muộn
    absentDeduction: 1.0, // Khấu 100% lương khi vắng mặt
    hourlyRate: 0 // Sẽ tính từ lương cơ bản ÷ 184 giờ/tháng
};

document.addEventListener('DOMContentLoaded', function () {
    if (!AuthManager.checkAuth()) return;

    document.getElementById('adminName').textContent = AuthManager.getUserName();
    loadDashboardData();
    setupDataSyncListeners();
    setupFilterListeners();

    smartRefresh.schedule('salary', loadDashboardData, 5 * 60 * 1000, true);
});

function renderCurrentPage(data) {
    if (data && data.length > 0) {
        const paginatedData = pagination.paginate(data);
        renderSalaryTable();
    }
}

window.addEventListener('beforeunload', () => {
    smartRefresh.stop('salary');
    cleanupDataSyncListeners();
});
//Xóa listener cũ
function cleanupDataSyncListeners() {
    dataSyncUnsubscribes.forEach(unsub => {
        if (typeof unsub === 'function') unsub();
    });
    dataSyncUnsubscribes = [];
}
// Theo dõi sự kiện lương, chấm công, nhân viên
function setupDataSyncListeners() {
    if (typeof DataSync === 'undefined') return;

    cleanupDataSyncListeners();

    dataSyncUnsubscribes.push(
        DataSync.on('salary:created', (payload) => {
            loadDashboardData();
        })
    );

    dataSyncUnsubscribes.push(
        DataSync.on('salary:updated', (payload) => {
            loadDashboardData();
        })
    );

    dataSyncUnsubscribes.push(
        DataSync.on('salary:deleted', (payload) => {
            loadDashboardData();
        })
    );

    dataSyncUnsubscribes.push(
        DataSync.on('attendance:created', (payload) => {
            loadDashboardData();
        })
    );

    dataSyncUnsubscribes.push(
        DataSync.on('attendance:updated', (payload) => {
            loadDashboardData();
        })
    );

    dataSyncUnsubscribes.push(
        DataSync.on('employee:created', (payload) => {
            loadActiveEmployees();
        })
    );
}
//lọc theo tháng, phòng ban, trạng thái
function setupFilterListeners() {
    const filterMonth = document.getElementById('filterMonth');
    const filterDept = document.getElementById('filterDepartment');
    const filterStatus = document.getElementById('filterStatus');

    if (filterMonth) {
        const now = new Date();
        filterMonth.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        filterMonth.addEventListener('change', applyFilters);
    }
    if (filterDept) filterDept.addEventListener('change', applyFilters);
    if (filterStatus) filterStatus.addEventListener('change', applyFilters);
}
//Tải dữ liệu lương, nhân viên chấm công
async function loadDashboardData() {
    try {
        console.log('Loading salary data with attendance...');
        const [salaries, employees, attendance] = await Promise.all([
            SalaryAPI.getAll(),
            EmployeeAPI.getAll(),
            AttendanceAPI.getAll()
        ]);

        allSalaries = Array.isArray(salaries) ? salaries : [];
        allEmployees = Array.isArray(employees) ? employees.filter(e => e.status === 'active') : [];
        allAttendance = Array.isArray(attendance) ? attendance : [];

        console.log('Loaded salaries:', allSalaries.length);
        console.log('Loaded active employees:', allEmployees.length);
        console.log('Loaded attendance records:', allAttendance.length);

        pagination.reset();
        applyFilters();
    } catch (error) {
        console.error('Error loading data:', error);
        showNotification('Lỗi: ' + error.message, 'error');
    }
}
//Tải danh sách nhân viên đang hoạt động
async function loadActiveEmployees() {
    try {
        const data = await EmployeeAPI.getAll();
        allEmployees = Array.isArray(data) ? data.filter(e => e.status === 'active') : [];
        return allEmployees;
    } catch (error) {
        showNotification('Lỗi tải danh sách nhân viên', 'error');
        return [];
    }
}
// Tính lương dựa theo chấm công
function calculateSalaryFromAttendance(employeeId, month, year, baseSalary) {
    const startDate = new Date(year, parseInt(month) - 1, 1);
    const endDate = new Date(year, parseInt(month), 0);

    // Lọc chấm công của nhân viên trong tháng
    const monthlyAttendance = allAttendance.filter(record => {
        if (!record.date || record.employeeId !== employeeId) return false;

        const recordDate = new Date(record.date);
        return recordDate >= startDate && recordDate <= endDate;
    });

    let absentDays = 0;
    let lateDays = 0;
    let presentDays = 0;

    monthlyAttendance.forEach(record => {
        const status = record.attendanceStatus || 'absent';

        if (status === 'absent' || record.approvalStatus === 'auto_absent') {
            absentDays++;
        } else if (status === 'late') {
            lateDays++;
        } else if (status === 'present') {
            presentDays++;
        }
    });

    // Tính khấu trừ
    const absentDeduction = (absentDays * baseSalary * SALARY_CONFIG.absentDeduction) / 23;
    const lateDeduction = (lateDays * baseSalary * SALARY_CONFIG.lateDeduction) / 23;
    const totalDeduction = absentDeduction + lateDeduction;

    console.log(`Salary calc for employee ${employeeId} (${month}/${year}):`, {
        baseSalary,
        presentDays,
        lateDays,
        absentDays,
        absentDeduction: Math.round(absentDeduction),
        lateDeduction: Math.round(lateDeduction),
        totalDeduction: Math.round(totalDeduction)
    });

    return {
        presentDays,
        lateDays,
        absentDays,
        attendanceDeduction: Math.round(totalDeduction),
        adjustedBaseSalary: Math.round(baseSalary - totalDeduction)
    };
}
// lọc dữ liệu lương
function applyFilters() {
    const monthFilter = document.getElementById('filterMonth')?.value || '';
    const deptFilter = document.getElementById('filterDepartment')?.value || '';
    const statusFilter = document.getElementById('filterStatus')?.value || '';

    filteredSalaries = allSalaries.filter(salary => {
        const salaryDate = new Date(salary.month);
        const salaryYYYYMM = `${salaryDate.getFullYear()}-${String(salaryDate.getMonth() + 1).padStart(2, '0')}`;

        const matchMonth = !monthFilter || salaryYYYYMM === monthFilter;
        const matchDept = !deptFilter || salary.department === deptFilter;
        const matchStatus = !statusFilter || salary.status === statusFilter;
        return matchMonth && matchDept && matchStatus;
    });

    pagination.reset();
    renderSalaryTable();
}
//Vẽ bảng lương
function renderSalaryTable() {
    const tbody = document.getElementById('salaryTable');

    if (!tbody) {
        return;
    }

    if (filteredSalaries.length === 0) {
        tbody.innerHTML = `<tr>
            <td colspan="8" style="text-align: center; padding: 2rem;">
                <i class="fas fa-inbox" style="font-size: 2rem; opacity: 0.3;"></i>
                <p>Không có dữ liệu</p>
            </td>
        </tr>`;
        return;
    }

    const paginatedData = pagination.paginate(filteredSalaries);

    tbody.innerHTML = paginatedData.map(salary => {
        const id = escapeHtml(salary._id || '');
        const name = escapeHtml(salary.name || salary.employeeName || '-');
        const dept = escapeHtml(salary.department || '-');
        const baseSalary = formatCurrency(salary.baseSalary || 0);
        const allowance = formatCurrency(salary.allowances || 0);
        const bonus = formatCurrency(salary.bonus || 0);
        const deduction = formatCurrency(salary.deductions || 0);
        const netSalary = formatCurrency(salary.netSalary || 0);
        const status = salary.status || 'pending';

        return `<tr>
            <td style="font-weight: 600; color: #111827;">
                <div>${name}</div>
                <div style="font-size: 0.875rem; color: #6b7280; font-weight: 400; margin-top: 0.25rem;">${dept}</div>
            </td>
            <td>${baseSalary}</td>
            <td>${allowance}</td>
            <td>${bonus}</td>
            <td>${deduction}</td>
            <td style="font-weight: 600; color: #065f46;">${netSalary}</td>
            <td>${getSalaryStatusBadge(status)}</td>
            <td>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn-icon" onclick="openViewSalaryModal('${id}')" style="background: #dbeafe; color: #1e40af; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer;">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-icon" onclick="openEditSalaryModal('${id}')" style="background: #fef3c7; color: #92400e; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon" onclick="deleteSalary('${id}')" style="background: #fee2e2; color: #7f1d1d; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    renderPagination();
}
//Vẽ bảng lương
function renderPagination() {
    const container = document.getElementById('paginationContainer');
    if (!container) return;

    const info = pagination.getInfo();
    const html = renderPaginationUI('', info);
    if (html) {
        container.innerHTML = html;
    }
}
// Tạo trạng thái lương
function getSalaryStatusBadge(status) {
    const statusConfig = {
        'paid': { bg: '#dcfce7', color: '#166534', text: 'Đã thanh toán' },
        'pending': { bg: '#fef3c7', color: '#92400e', text: 'Chờ thanh toán' }
    };

    const config = statusConfig[status] || statusConfig['pending'];
    return `<span style="background: ${config.bg}; color: ${config.color}; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.875rem; font-weight: 500;">${config.text}</span>`;
}
//định dạng tiền 
function formatCurrency(amount) {
    if (typeof amount !== 'number') return '0 ₫';
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(amount);
}

//xem chi tiết lương 
function openViewSalaryModal(salaryId) {
    const salary = allSalaries.find(s => s._id === salaryId);
    if (!salary) {
        showNotification('Không tìm thấy', 'error');
        return;
    }

    const salaryDate = new Date(salary.month);
    const monthYear = `${String(salaryDate.getMonth() + 1).padStart(2, '0')}/${salaryDate.getFullYear()}`;

    document.getElementById('viewSalaryEmployeeName').textContent = escapeHtml(salary.name || salary.employeeName || '-');
    document.getElementById('viewSalaryMonthYear').textContent = monthYear;
    document.getElementById('viewSalaryBase').textContent = formatCurrency(salary.baseSalary || 0);
    document.getElementById('viewSalaryAllowance').textContent = formatCurrency(salary.allowances || 0);
    document.getElementById('viewSalaryBonus').textContent = formatCurrency(salary.bonus || 0);
    document.getElementById('viewSalaryDeduction').textContent = formatCurrency(salary.deductions || 0);
    document.getElementById('viewSalaryNet').textContent = formatCurrency(salary.netSalary || 0);

    const statusBadge = document.getElementById('viewSalaryStatus');
    if (statusBadge) {
        statusBadge.innerHTML = getSalaryStatusBadge(salary.status);
    }

    const modal = document.getElementById('viewSalaryModal');
    if (modal) modal.classList.add('show');
}
//đóng xem chi tiết
function closeViewSalaryModal() {
    const modal = document.getElementById('viewSalaryModal');
    if (modal) modal.classList.remove('show');
}

// Chỉnh sửa lương
function openEditSalaryModal(salaryId) {
    const salary = allSalaries.find(s => s._id === salaryId);
    if (!salary) {
        showNotification('Không tìm thấy', 'error');
        return;
    }

    document.getElementById('editSalaryId').value = salaryId;
    document.getElementById('editSalaryBase').value = salary.baseSalary || 0;
    document.getElementById('editSalaryAllowance').value = salary.allowances || 0;
    document.getElementById('editSalaryBonus').value = salary.bonus || 0;
    document.getElementById('editSalaryDeduction').value = salary.deductions || 0;
    document.getElementById('editSalaryStatus').value = salary.status || 'pending';

    updateEditSalaryNet();

    const modal = document.getElementById('editSalaryModal');
    if (modal) modal.classList.add('show');
}
//đóng chỉnh sửa lương
function closeEditSalaryModal() {
    const modal = document.getElementById('editSalaryModal');
    if (modal) modal.classList.remove('show');
}

function updateEditSalaryNet() {
    const base = parseFloat(document.getElementById('editSalaryBase')?.value) || 0;
    const allowance = parseFloat(document.getElementById('editSalaryAllowance')?.value) || 0;
    const bonus = parseFloat(document.getElementById('editSalaryBonus')?.value) || 0;
    const deduction = parseFloat(document.getElementById('editSalaryDeduction')?.value) || 0;

    const net = base + allowance + bonus - deduction;
    const netDisplay = document.getElementById('editSalaryNet');
    if (netDisplay) {
        netDisplay.textContent = formatCurrency(net);
    }
}

async function saveEditSalary() {
    try {
        const id = document.getElementById('editSalaryId')?.value;
        const base = parseFloat(document.getElementById('editSalaryBase')?.value) || 0;
        const allowance = parseFloat(document.getElementById('editSalaryAllowance')?.value) || 0;
        const bonus = parseFloat(document.getElementById('editSalaryBonus')?.value) || 0;
        const deduction = parseFloat(document.getElementById('editSalaryDeduction')?.value) || 0;
        const status = document.getElementById('editSalaryStatus')?.value;

        if (base <= 0) {
            showNotification('Lương cơ bản phải > 0', 'warning');
            return;
        }

        const netSalary = base + allowance + bonus - deduction;

        await SalaryAPI.update(id, {
            baseSalary: base,
            allowances: allowance,
            bonus,
            deductions: deduction,
            netSalary,
            status
        });

        showNotification('Cập nhật lương thành công', 'success');
        closeEditSalaryModal();
        loadDashboardData();
    } catch (error) {
        console.error('Error:', error);
        showNotification('Lỗi: ' + error.message, 'error');
    }
}

async function deleteSalary(salaryId) {
    if (!confirm('Bạn có chắc chắn muốn xóa bảng lương này?')) return;

    try {
        await SalaryAPI.delete(salaryId);
        showNotification('Đã xóa bảng lương thành công', 'success');
        loadDashboardData();
    } catch (error) {
        showNotification('Lỗi: ' + error.message, 'error');
    }
}

async function openCreateSalaryModal() {
    console.log('Opening create salary modal...');

    const employees = await loadActiveEmployees();

    if (employees.length === 0) {
        showNotification('Không có nhân viên nào để tạo lương', 'warning');
        return;
    }

    const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
    const currentYear = new Date().getFullYear();

    document.getElementById('createSalaryMonth').value = currentMonth;
    document.getElementById('createSalaryYear').value = currentYear;

    renderEmployeeSalaryInputs(employees, currentMonth, currentYear);

    const modal = document.getElementById('createSalaryModal');
    if (modal) modal.classList.add('show');
}
//Vẽ form nhập lương
async function renderEmployeeSalaryInputs(employees, month, year) {
    const container = document.getElementById('employeeSalaryInputs');
    if (!container) return;

    const existingSalaries = allSalaries.filter(s => {
        const salaryDate = new Date(s.month);
        const salaryMonth = String(salaryDate.getMonth() + 1).padStart(2, '0');
        const salaryYear = salaryDate.getFullYear();
        return salaryMonth === month && salaryYear === parseInt(year);
    });

    createSalaryList = employees.map(emp => {
        const existing = existingSalaries.find(s => s.employeeId === emp._id);

        // ✅ TÍNH LƯƠNG DỰA TRÊN CHẤM CÔNG
        const attendanceData = calculateSalaryFromAttendance(
            emp._id,
            month,
            year,
            emp.salary || 0
        );

        const baseSalary = emp.salary || 0;
        const adjustedBase = existing ? existing.baseSalary : (baseSalary - attendanceData.attendanceDeduction);

        return {
            employeeId: emp._id,
            name: emp.name,
            department: emp.department || 'N/A',
            baseSalary: adjustedBase,
            allowances: existing ? existing.allowances : 0,
            bonus: existing ? existing.bonus : 0,
            deductions: existing ? existing.deductions : attendanceData.attendanceDeduction,
            isExisting: !!existing,
            attendanceData: attendanceData
        };
    });

    const html = `
        <div class="employee-salary-table">
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f3f4f6; border-bottom: 2px solid #d1d5db;">
                        <th style="padding: 0.75rem; text-align: left; border: 1px solid #e5e7eb; min-width: 150px;">Nhân Viên</th>
                        <th style="padding: 0.75rem; text-align: left; border: 1px solid #e5e7eb; min-width: 120px;">Phòng Ban</th>
                        <th style="padding: 0.75rem; text-align: center; border: 1px solid #e5e7eb; width: 80px; font-size: 0.875rem;">Công</th>
                        <th style="padding: 0.75rem; text-align: center; border: 1px solid #e5e7eb; width: 80px; font-size: 0.875rem;">Muộn</th>
                        <th style="padding: 0.75rem; text-align: center; border: 1px solid #e5e7eb; width: 80px; font-size: 0.875rem;">Vắng</th>
                        <th style="padding: 0.75rem; text-align: center; border: 1px solid #e5e7eb; width: 150px;">Lương Cơ Bản</th>
                        <th style="padding: 0.75rem; text-align: center; border: 1px solid #e5e7eb; width: 120px;">Phụ Cấp</th>
                        <th style="padding: 0.75rem; text-align: center; border: 1px solid #e5e7eb; width: 100px;">Thưởng</th>
                        <th style="padding: 0.75rem; text-align: center; border: 1px solid #e5e7eb; width: 100px;">Khấu Trừ</th>
                        <th style="padding: 0.75rem; text-align: center; border: 1px solid #e5e7eb; width: 120px; background: #f0fdf4;">Thực Lĩnh</th>
                    </tr>
                </thead>
                <tbody>
                    ${createSalaryList.map((emp, idx) => {
        const netSalary = (emp.baseSalary || 0) + (emp.allowances || 0) + (emp.bonus || 0) - (emp.deductions || 0);
        const rowBg = emp.isExisting ? '#fef3c7' : '#ffffff';

        return `
                        <tr style="background: ${rowBg}; border-bottom: 1px solid #e5e7eb;">
                            <td style="padding: 0.75rem; border: 1px solid #e5e7eb; font-weight: 500;">
                                ${escapeHtml(emp.name)}
                                ${emp.isExisting ? '<span style="color: #92400e; font-size: 0.75rem; margin-left: 0.5rem;">[Đã tồn tại]</span>' : ''}
                            </td>
                            <td style="padding: 0.75rem; border: 1px solid #e5e7eb; font-size: 0.875rem;">${escapeHtml(emp.department)}</td>
                            <td style="padding: 0.75rem; border: 1px solid #e5e7eb; text-align: center; font-size: 0.875rem; font-weight: 500;">${emp.attendanceData.presentDays}</td>
                            <td style="padding: 0.75rem; border: 1px solid #e5e7eb; text-align: center; font-size: 0.875rem; color: #f59e0b; font-weight: 500;">${emp.attendanceData.lateDays}</td>
                            <td style="padding: 0.75rem; border: 1px solid #e5e7eb; text-align: center; font-size: 0.875rem; color: #dc2626; font-weight: 500;">${emp.attendanceData.absentDays}</td>
                            <td style="padding: 0.5rem; border: 1px solid #e5e7eb;">
                                <input type="number" 
                                       id="base_${idx}" 
                                       value="${Math.round(emp.baseSalary)}" 
                                       min="0" 
                                       step="100000"
                                       onchange="updateSalaryRow(${idx})"
                                       style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;">
                            </td>
                            <td style="padding: 0.5rem; border: 1px solid #e5e7eb;">
                                <input type="number" 
                                       id="allow_${idx}" 
                                       value="${emp.allowances}" 
                                       min="0" 
                                       step="50000"
                                       onchange="updateSalaryRow(${idx})"
                                       style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;">
                            </td>
                            <td style="padding: 0.5rem; border: 1px solid #e5e7eb;">
                                <input type="number" 
                                       id="bonus_${idx}" 
                                       value="${emp.bonus}" 
                                       min="0" 
                                       step="50000"
                                       onchange="updateSalaryRow(${idx})"
                                       style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;">
                            </td>
                            <td style="padding: 0.5rem; border: 1px solid #e5e7eb;">
                                <input type="number" 
                                       id="deduct_${idx}" 
                                       value="${Math.round(emp.deductions)}" 
                                       min="0" 
                                       step="50000"
                                       onchange="updateSalaryRow(${idx})"
                                       style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;">
                            </td>
                            <td style="padding: 0.75rem; border: 1px solid #e5e7eb; text-align: center; font-weight: 600; color: #065f46; min-width: 120px; background: #f0fdf4;" id="net_${idx}">
                                ${formatCurrency(netSalary)}
                            </td>
                        </tr>
                        `;
    }).join('')}
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
}

function updateSalaryRow(idx) {
    const base = parseFloat(document.getElementById(`base_${idx}`)?.value) || 0;
    const allowance = parseFloat(document.getElementById(`allow_${idx}`)?.value) || 0;
    const bonus = parseFloat(document.getElementById(`bonus_${idx}`)?.value) || 0;
    const deduction = parseFloat(document.getElementById(`deduct_${idx}`)?.value) || 0;

    const netSalary = base + allowance + bonus - deduction;

    createSalaryList[idx].baseSalary = base;
    createSalaryList[idx].allowances = allowance;
    createSalaryList[idx].bonus = bonus;
    createSalaryList[idx].deductions = deduction;

    const netDisplay = document.getElementById(`net_${idx}`);
    if (netDisplay) {
        netDisplay.textContent = formatCurrency(netSalary);
        netDisplay.style.color = netSalary >= 0 ? '#065f46' : '#dc2626';
    }
}
//lưu danh sách lương mới
async function submitCreateSalaries() {
    try {
        const month = document.getElementById('createSalaryMonth')?.value;
        const year = document.getElementById('createSalaryYear')?.value;

        if (!month || !year) {
            showNotification('Vui lòng chọn tháng/năm', 'warning');
            return;
        }

        const validSalaries = createSalaryList.filter(s => s.baseSalary > 0);

        if (validSalaries.length === 0) {
            showNotification('Vui lòng nhập lương cơ bản cho ít nhất 1 nhân viên', 'warning');
            return;
        }

        const btn = event.target;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';

        let successCount = 0;
        let errorCount = 0;

        for (const salary of validSalaries) {
            try {
                const isoDateStr = `${year}-${String(month).padStart(2, '0')}-01`;

                const payload = {
                    employeeId: salary.employeeId,
                    name: salary.name,
                    department: salary.department,
                    month: isoDateStr,
                    baseSalary: Math.round(salary.baseSalary),
                    allowances: salary.allowances,
                    bonus: salary.bonus,
                    deductions: Math.round(salary.deductions),
                    netSalary: Math.round(salary.baseSalary + salary.allowances + salary.bonus - salary.deductions),
                    status: 'pending',
                    attendanceDeduction: salary.attendanceData.attendanceDeduction
                };

                console.log('Creating salary for:', salary.name, payload);

                const existing = allSalaries.find(s => {
                    const existingDate = new Date(s.month);
                    const existingMonth = String(existingDate.getMonth() + 1).padStart(2, '0');
                    const existingYear = existingDate.getFullYear();
                    return s.employeeId === salary.employeeId &&
                        existingMonth === month &&
                        existingYear === parseInt(year);
                });

                if (existing) {
                    await SalaryAPI.update(existing._id, payload);
                    console.log('Updated salary for:', salary.name);
                } else {
                    await SalaryAPI.create(payload);
                    console.log('Created salary for:', salary.name);
                }

                successCount++;
            } catch (error) {
                console.error('Error with', salary.name, ':', error.message);
                errorCount++;
            }
        }

        btn.disabled = false;
        btn.innerHTML = originalText;

        if (errorCount === 0) {
            showNotification(`Lưu ${successCount} bảng lương thành công!`, 'success');
            closeCreateSalaryModal();
            loadDashboardData();
        } else {
            showNotification(`Lưu ${successCount} thành công, ${errorCount} thất bại`, 'warning');
        }

    } catch (error) {
        showNotification('Lỗi: ' + error.message, 'error');
        event.target.disabled = false;
    }
}

function closeCreateSalaryModal() {
    const modal = document.getElementById('createSalaryModal');
    if (modal) modal.classList.remove('show');
    createSalaryList = [];
}

// Reset bộ lọc
function resetFilters() {
    const monthFilter = document.getElementById('filterMonth');
    const deptFilter = document.getElementById('filterDepartment');
    const statusFilter = document.getElementById('filterStatus');

    if (monthFilter) monthFilter.value = String(new Date().getMonth() + 1).padStart(2, '0');
    if (deptFilter) deptFilter.value = '';
    if (statusFilter) statusFilter.value = '';

    applyFilters();
}

// Tải phiếu lương PDF
async function downloadPayslipPDF() {
    const modalContent = document.querySelector('#viewSalaryModal .modal-body');
    if (!modalContent) return;

    const name = document.getElementById('viewSalaryEmployeeName').textContent;
    const monthYear = document.getElementById('viewSalaryMonthYear').textContent.replace('/', '_');

    const options = {
        margin: 1,
        filename: `PhieuLuong_${name}_${monthYear}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    // Tạo template đẹp cho PDF thay vì chỉ chụp modal
    const template = `
        <div style="font-family: Arial, sans-serif; padding: 40px; border: 1px solid #eee;">
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #6366f1; margin: 0;">PHIẾU LƯƠNG NHÂN VIÊN</h1>
                <p style="color: #64748b; margin-top: 5px;">Hệ thống HRM Pro</p>
            </div>
            
            <table style="width: 100%; margin-bottom: 30px;">
                <tr>
                    <td style="padding: 10px 0;"><strong>Nhân viên:</strong></td>
                    <td style="text-align: right;">${name}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0;"><strong>Kỳ lương:</strong></td>
                    <td style="text-align: right;">${document.getElementById('viewSalaryMonthYear').textContent}</td>
                </tr>
            </table>

            <div style="border-top: 2px solid #6366f1; padding-top: 20px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 12px 0;">Lương cơ bản</td>
                        <td style="text-align: right;">${document.getElementById('viewSalaryBase').textContent}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 12px 0;">Phụ cấp</td>
                        <td style="text-align: right;">+ ${document.getElementById('viewSalaryAllowance').textContent}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 12px 0;">Thưởng</td>
                        <td style="text-align: right;">+ ${document.getElementById('viewSalaryBonus').textContent}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 12px 0;">Khấu trừ (Chấm công)</td>
                        <td style="text-align: right; color: #dc2626;">- ${document.getElementById('viewSalaryDeduction').textContent}</td>
                    </tr>
                    <tr style="background: #f8fafc; font-weight: bold; font-size: 1.2rem;">
                        <td style="padding: 15px; color: #1e293b;">TỔNG THỰC NHẬN</td>
                        <td style="padding: 15px; text-align: right; color: #059669;">${document.getElementById('viewSalaryNet').textContent}</td>
                    </tr>
                </table>
            </div>

            <div style="margin-top: 50px; display: flex; justify-content: space-between;">
                <div style="text-align: center; width: 40%;">
                    <p><strong>Người lập phiếu</strong></p>
                    <p style="margin-top: 60px; color: #94a3b8;">(Ký và ghi rõ họ tên)</p>
                </div>
                <div style="text-align: center; width: 40%;">
                    <p><strong>Người nhận</strong></p>
                    <p style="margin-top: 60px; color: #94a3b8;">(Ký và ghi rõ họ tên)</p>
                </div>
            </div>
        </div>
    `;

    try {
        await html2pdf().from(template).set(options).save();
        showNotification('Đã tải phiếu lương PDF', 'success');
    } catch (error) {
        console.error('PDF Error:', error);
        showNotification('Lỗi khi tạo PDF', 'error');
    }
}

window.addEventListener('click', function (e) {
    const viewModal = document.getElementById('viewSalaryModal');
    const editModal = document.getElementById('editSalaryModal');
    const createModal = document.getElementById('createSalaryModal');

    if (e.target === viewModal) closeViewSalaryModal();
    if (e.target === editModal) closeEditSalaryModal();
    if (e.target === createModal) closeCreateSalaryModal();
});