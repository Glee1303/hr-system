(function () {
    const publicPages = ['dangnhap.html', 'index.html', ''];
    const currentPath = window.location.pathname.split('/').pop();
    if (!publicPages.includes(currentPath)) {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token) window.location.replace('dangnhap.html');
    }
})();

// ==================== quanlynhanvien.js - HOÀN CHỈNH ====================

let allEmployees = [];
let filteredEmployees = [];
let allDepartments = [];
let allAccounts = [];
let currentEditId = null;
let dataSyncUnsubscribes = [];
let activityHistory = [];
let currentActivityFilter = 'all';
const pagination = new PaginationHelper(50);

document.addEventListener('DOMContentLoaded', () => {
    if (!AuthManager.checkAuth()) return;

    const adminNameEl = document.getElementById('adminName');
    if (adminNameEl) {
        adminNameEl.textContent = AuthManager.getUserName();
    }

    loadDashboardData();
    loadActivityHistory();
    setupDataSyncListeners();
    setupFilterListeners();
    setupFormListeners();

    smartRefresh.schedule('employees', loadDashboardData, 5 * 60 * 1000, true);

    console.log('quanlynhanvien.js initialized');
});

window.addEventListener('beforeunload', () => {
    smartRefresh.stop('employees');
    cleanupDataSyncListeners();
});

function cleanupDataSyncListeners() {
    dataSyncUnsubscribes.forEach(unsub => {
        if (typeof unsub === 'function') unsub();
    });
    dataSyncUnsubscribes = [];
    console.log('✅ Cleaned up employee DataSync listeners');
}

function setupDataSyncListeners() {
    console.log('🔧 Setting up DataSync listeners');

    if (typeof DataSync === 'undefined') {
        console.warn('DataSync not available');
        return;
    }

    cleanupDataSyncListeners();

    dataSyncUnsubscribes.push(
        DataSync.on('employee:created', (payload) => {
            console.log('📢 New employee event:', payload);
            loadDashboardData();
            showNotification(`${payload.employeeName} thêm vào hệ thống`, 'success');
        })
    );

    dataSyncUnsubscribes.push(
        DataSync.on('employee:updated', (payload) => {
            console.log('📢 Employee updated:', payload);
            loadDashboardData();
        })
    );

    dataSyncUnsubscribes.push(
        DataSync.on('employee:deleted', (payload) => {
            console.log('📢 Employee deleted:', payload);
            loadDashboardData();
        })
    );

    dataSyncUnsubscribes.push(
        DataSync.on('account:updated', (payload) => {
            console.log('📢 Account updated - reloading');
            loadDashboardData();
        })
    );
}

function setupFilterListeners() {
    const searchEl = document.getElementById('searchEmployee');
    const deptEl = document.getElementById('filterDept');
    const statusEl = document.getElementById('filterStatus');

    if (searchEl) {
        searchEl.addEventListener('keyup', debounce(applyFilters, 300));
    }
    if (deptEl) deptEl.addEventListener('change', applyFilters);
    if (statusEl) statusEl.addEventListener('change', applyFilters);
}

function setupFormListeners() {
    const editForm = document.getElementById('editEmployeeForm');
    if (editForm) {
        editForm.addEventListener('submit', handleEditSubmit);
    }
}

// ==================== LOAD DATA ====================
async function loadDashboardData() {
    try {
        console.log('📂 Loading employees, departments, and accounts...');

        const [empData, deptData, accData] = await Promise.all([
            EmployeeAPI.getAll(),
            DepartmentAPI.getAll(),
            AccountAPI.getAll()
        ]);

        allEmployees = Array.isArray(empData) ? empData : [];
        allDepartments = Array.isArray(deptData) ? deptData : [];
        allAccounts = Array.isArray(accData) ? accData : [];

        console.log(`✅ Loaded: ${allEmployees.length} employees, ${allDepartments.length} departments`);

        filteredEmployees = [...allEmployees];
        pagination.reset();

        renderEmployeeTable();
    } catch (error) {
        console.error('Error loading employees:', error);
        showNotification('Lỗi tải dữ liệu: ' + error.message, 'error');
    }
}

// ==================== RENDER TABLE ====================
function renderEmployeeTable() {
    const tbody = document.getElementById('profileTable');

    if (!tbody) {
        console.error('profileTable element not found');
        return;
    }

    // 1. Cập nhật thẻ Select "Add Dept" trong Add Form (Luôn thực hiện)
    const addDeptSelect = document.getElementById('addDept');
    if (addDeptSelect) {
        addDeptSelect.innerHTML = '<option value="">-- Chọn phòng ban --</option>';
        allDepartments.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.name;
            opt.textContent = d.name;
            addDeptSelect.appendChild(opt);
        });
    }

    // 2. Kiểm tra nếu không có dữ liệu để hiển thị bảng
    if (filteredEmployees.length === 0) {
        tbody.innerHTML = `<tr>
            <td colspan="6" style="text-align: center; padding: 2rem;">
                <i class="fas fa-inbox" style="font-size: 2rem; opacity: 0.3;"></i>
                <p style="color: #9ca3af; margin-top: 0.5rem;">Không có dữ liệu</p>
            </td>
        </tr>`;
        return;
    }

    const paginatedData = pagination.paginate(filteredEmployees);
    tbody.innerHTML = paginatedData.map(employee => {
        const id = escapeHtml(employee._id || '');
        const name = escapeHtml(employee.name || '-');
        const email = escapeHtml(employee.email || '-');
        const position = escapeHtml(employee.position || '-');
        const department = escapeHtml(employee.department || '-');
        const status = employee.status || 'active';

        return `<tr id="row-${id}">
            <td style="font-weight: 600; color: #111827;">${name}</td>
            <td>${position}</td>
            <td>${email}</td>
            <td>${department}</td>
            <td>
                <div class="action-buttons" style="display: flex; gap: 0.5rem;">
                    <button class="btn-icon" onclick="toggleViewInline('${id}')" title="Xem chi tiết" style="background: #dbeafe; color: #1e40af; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer;">
                        <i class="fas fa-eye"></i>
                    </button>
                    <!-- ✅ NÚT PHÂN CÔNG PHÒNG BAN + CHỨC VỤ -->
                    <button class="btn-icon" onclick="toggleAssignDepartmentInline('${id}')" title="Phân công phòng ban & chức vụ" style="background: #e0e7ff; color: #4338ca; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer;">
                        <i class="fas fa-building"></i>
                    </button>
                    <button class="btn-icon" onclick="toggleEditInline('${id}')" title="Chỉnh sửa" style="background: #fef3c7; color: #92400e; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon btn-delete" onclick="deleteEmployee('${id}')" title="Xóa" style="background: #fee2e2; color: #7f1d1d; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
            <td>${getStatusBadge(status)}</td>
        </tr>
        <tr id="expansion-${id}" style="display: none;">
            <td colspan="6" style="padding: 0; border: none;">
                <div id="expansion-content-${id}" class="expansion-content" style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 1.5rem;">
                </div>
            </td>
        </tr>`;
    }).join('');

    renderPagination();
}

function renderPagination() {
    const container = document.getElementById('paginationContainer');
    if (!container) return;

    const html = pagination.renderHTML(applyFilters);
    if (html) {
        container.innerHTML = html;
    }
}

// ==================== APPLY FILTERS ====================
function applyFilters() {
    const searchEl = document.getElementById('searchEmployee');
    const deptEl = document.getElementById('filterDept');
    const statusEl = document.getElementById('filterStatus');

    const searchValue = searchEl?.value?.toLowerCase() || '';
    const deptFilter = deptEl?.value || '';
    const statusFilter = statusEl?.value || '';

    filteredEmployees = allEmployees.filter(employee => {
        const matchSearch = !searchValue ||
            (employee.name && employee.name.toLowerCase().includes(searchValue)) ||
            (employee.email && employee.email.toLowerCase().includes(searchValue));

        const matchDept = !deptFilter || employee.department === deptFilter;

        const empStatus = employee.status || 'active';
        const matchStatus = !statusFilter || empStatus === statusFilter;

        return matchSearch && matchDept && matchStatus;
    });

    pagination.reset();
    renderEmployeeTable();
}

// ==================== ADD EMPLOYEE INLINE FORM ====================
function toggleAddEmployeeForm() {
    const formContainer = document.getElementById('addEmployeeFormContainer');
    const toggleBtnText = document.getElementById('toggleAddEmpBtnText');
    const toggleBtnIcon = document.querySelector('#toggleAddEmpBtn i');

    if (formContainer.style.display === 'none') {
        formContainer.style.display = 'block';
        if (toggleBtnText) toggleBtnText.textContent = 'Đóng Form';
        if (toggleBtnIcon) toggleBtnIcon.className = 'fas fa-times';

        // Xóa data cũ
        document.getElementById('addName').value = '';
        document.getElementById('addEmail').value = '';
        document.getElementById('addPhone').value = '';
        document.getElementById('addPosition').value = 'Nhân viên'; // Add this line
        document.getElementById('addDept').value = '';
        document.getElementById('addStartDate').value = '';
        document.getElementById('addAddress').value = '';
        document.getElementById('addUsername').value = '';
        document.getElementById('addPassword').value = '';
    } else {
        formContainer.style.display = 'none';
        if (toggleBtnText) toggleBtnText.textContent = 'Thêm nhân viên';
        if (toggleBtnIcon) toggleBtnIcon.className = 'fas fa-plus';
    }
}

async function submitAddEmployee() {
    try {
        const name = document.getElementById('addName').value.trim();
        const email = document.getElementById('addEmail').value.trim();
        const phone = document.getElementById('addPhone').value.trim();
        const position = 'Nhân viên'; // Cố định
        const dept = document.getElementById('addDept').value;
        const startDate = document.getElementById('addStartDate').value;
        const address = document.getElementById('addAddress').value.trim();
        const username = document.getElementById('addUsername').value.trim();
        const password = document.getElementById('addPassword').value.trim();

        if (!name || !email) {
            showNotification('Vui lòng nhập họ tên và email', 'warning');
            return;
        }

        if (!validateEmail(email)) {
            showNotification('Email không hợp lệ', 'warning');
            return;
        }

        if (username && !password) {
            showNotification('Vui lòng nhập mật khẩu cho tài khoản mới', 'warning');
            return;
        }

        const newEmployee = {
            name, email, phone, position, department: dept, startDate, address, status: 'active',
            username, password
        };

        await EmployeeAPI.create(newEmployee);
        addActivityLog('create', `Thêm nhân viên mới: ${name}`, 'success');
        showNotification('Thêm nhân viên thành công!', 'success');

        toggleAddEmployeeForm();
        await loadDashboardData();
    } catch (error) {
        showNotification('Lỗi khi thêm: ' + error.message, 'error');
    }
}

// ==================== INLINE ROW EXPANSION UTILS ====================
function closeAllExpansions() {
    document.querySelectorAll('[id^="expansion-"]').forEach(el => el.style.display = 'none');
}

function toggleExpansion(employeeId, contentHtml) {
    const expansionRow = document.getElementById(`expansion-${employeeId}`);
    const contentDiv = document.getElementById(`expansion-content-${employeeId}`);

    if (expansionRow.style.display === 'table-row' && contentDiv.innerHTML.includes(contentHtml.substring(0, 50))) {
        // Đóng nếu đang mở cùng nội dung
        expansionRow.style.display = 'none';
    } else {
        closeAllExpansions();
        contentDiv.innerHTML = contentHtml;
        expansionRow.style.display = 'table-row';
    }
}

// ==================== VIEW MODAL (NOW INLINE) ====================
function toggleViewInline(employeeId) {
    if (!employeeId) {
        showNotification('ID không hợp lệ', 'error');
        return;
    }

    const employee = allEmployees.find(e => e._id === employeeId);
    if (!employee) {
        showNotification('Không tìm thấy nhân viên', 'error');
        return;
    }

    const html = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;">
            <h3 style="font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 0.5rem;">
                <i class="fas fa-id-card" style="color: #3b82f6;"></i> Chi Tiết Hồ Sơ
            </h3>
            <button onclick="closeAllExpansions()" style="background:none; border:none; cursor:pointer; color:#64748b; font-size: 1.25rem;">
                &times;
            </button>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
            <div><span style="color:#64748b; font-size:0.875rem;">Họ và tên:</span> <div style="font-weight:600;">${escapeHtml(employee.name || '-')}</div></div>
            <div><span style="color:#64748b; font-size:0.875rem;">Email:</span> <div style="font-weight:600;">${escapeHtml(employee.email || '-')}</div></div>
            <div><span style="color:#64748b; font-size:0.875rem;">Số điện thoại:</span> <div style="font-weight:600;">${escapeHtml(employee.phone || '-')}</div></div>
            <div><span style="color:#64748b; font-size:0.875rem;">Phòng ban:</span> <div style="font-weight:600;">${escapeHtml(employee.department || '-')}</div></div>
            <div><span style="color:#64748b; font-size:0.875rem;">Chức vụ:</span> <div style="font-weight:600;">${escapeHtml(employee.position || '-')}</div></div>
            <div><span style="color:#64748b; font-size:0.875rem;">Ngày vào làm:</span> <div style="font-weight:600;">${formatDate(employee.startDate)}</div></div>
            <div><span style="color:#64748b; font-size:0.875rem;">Trạng thái:</span> <div style="font-weight:600;">${getStatusBadge(employee.status || 'active')}</div></div>
            <div style="grid-column: 1 / -1;"><span style="color:#64748b; font-size:0.875rem;">Địa chỉ:</span> <div style="font-weight:600;">${escapeHtml(employee.address || '-')}</div></div>
        </div>
    `;

    toggleExpansion(employeeId, html);
}

// ==================== ASSIGN DEPARTMENT (NOW INLINE) ====================
function toggleAssignDepartmentInline(employeeId) {
    const employee = allEmployees.find(e => e._id === employeeId);
    if (!employee) {
        showNotification('Không tìm thấy nhân viên', 'error');
        return;
    }

    let deptOptions = '<option value="">-- Chọn phòng ban --</option>';
    allDepartments.forEach(dept => {
        const selected = (dept.name === employee.department) ? 'selected' : '';
        deptOptions += `<option value="${escapeHtml(dept.name)}" ${selected}>${escapeHtml(dept.name)}</option>`;
    });

    const html = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;">
            <h3 style="font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 0.5rem;">
                <i class="fas fa-building" style="color: #4338ca;"></i> Phân Công Phòng Ban
            </h3>
            <button onclick="closeAllExpansions()" style="background:none; border:none; cursor:pointer; color:#64748b; font-size: 1.25rem;">
                &times;
            </button>
        </div>
        
        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 0.5rem; padding: 1rem; margin-bottom: 1.5rem; display: flex; gap: 2rem;">
            <div><span style="color:#64748b; font-size:0.875rem;">Nhân viên:</span> <strong style="color:#111827; margin-left:0.5rem;">${escapeHtml(employee.name)}</strong></div>
            <div><span style="color:#64748b; font-size:0.875rem;">Phòng ban hiện tại:</span> <strong style="color:#111827; margin-left:0.5rem;">${escapeHtml(employee.department || 'Chưa có')}</strong></div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
            <div class="portal-form-group">
                <label>Phòng ban mới</label>
                <select id="assignDeptSelect-${employeeId}" class="portal-select">
                    ${deptOptions}
                </select>
            </div>
            <div class="portal-form-group">
                <label>Chức vụ mới</label>
                <input type="text" id="assignDeptNewPosition-${employeeId}" class="portal-input" value="${escapeHtml(employee.position || '')}">
            </div>
        </div>

        <div style="display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.5rem;">
            <button class="btn-premium btn-premium-secondary" onclick="closeAllExpansions()">Hủy</button>
            <button class="btn-premium btn-premium-primary" onclick="submitAssignDepartment('${employeeId}')">Xác Nhận</button>
        </div>
    `;

    toggleExpansion(employeeId, html);
}

async function submitAssignDepartment(employeeId) {
    try {
        const deptName = document.getElementById(`assignDeptSelect-${employeeId}`)?.value;
        const newPosition = document.getElementById(`assignDeptNewPosition-${employeeId}`)?.value?.trim();

        if (!employeeId || !deptName) {
            showNotification('Vui lòng chọn phòng ban', 'warning');
            return;
        }

        if (!newPosition) {
            showNotification('Vui lòng nhập chức vụ', 'warning');
            return;
        }

        const employee = allEmployees.find(e => e._id === employeeId);
        if (!employee) {
            showNotification('Không tìm thấy nhân viên', 'error');
            return;
        }

        console.log(`📝 Assigning ${employee.name}:`);
        console.log(`   Department: ${deptName}`);
        console.log(`   Position: ${newPosition}`);

        // ✅ Step 1: Cập nhật Employee
        const updatedEmployee = await EmployeeAPI.update(employeeId, {
            name: employee.name,
            email: employee.email,
            phone: employee.phone || '',
            address: employee.address || '',
            department: deptName,
            position: newPosition,
            salary: employee.salary || 0,
            startDate: employee.startDate,
            status: employee.status || 'active'
        });

        console.log('✅ Employee updated:', updatedEmployee);

        // ✅ Step 2: Cập nhật Account nếu có
        const account = allAccounts?.find(a =>
            a.fullName === employee.name ||
            a.email === employee.email
        );

        if (account) {
            console.log(`📝 Updating account ${account.username}:`);
            console.log(`   Department: ${deptName}`);
            console.log(`   Position: ${newPosition}`);

            try {
                await AccountAPI.update(account._id, {
                    username: account.username,
                    fullName: account.fullName,
                    email: account.email,
                    phone: account.phone || '',
                    address: account.address || '',
                    department: deptName,
                    position: newPosition,
                    role: account.role || 'employee',
                    status: account.status || 'active'
                });
                console.log('✅ Account updated with department & position');
            } catch (error) {
                console.warn('⚠️ Could not update account:', error);
            }
        }

        showNotification(
            `✅ Cập nhật ${employee.name}\n   Phòng ban: ${deptName}\n   Chức vụ: ${newPosition}`,
            'success'
        );

        closeAllExpansions();

        console.log('🔄 Reloading employee data...');
        await loadDashboardData();

    } catch (error) {
        console.error('❌ Error:', error);
        showNotification('Lỗi: ' + error.message, 'error');
    }
}

// ==================== EDIT INLINE FORM ====================
function toggleEditInline(employeeId) {
    if (!employeeId) {
        showNotification('ID không hợp lệ', 'error');
        return;
    }

    const employee = allEmployees.find(e => e._id === employeeId);
    if (!employee) {
        showNotification('Không tìm thấy nhân viên', 'error');
        return;
    }

    const deptOptions = allDepartments.map(dept => {
        const selected = (dept.name === employee.department) ? 'selected' : '';
        return `<option value="${escapeHtml(dept.name)}" ${selected}>${escapeHtml(dept.name)}</option>`;
    }).join('');

    const html = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;">
            <h3 style="font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 0.5rem;">
                <i class="fas fa-edit" style="color: #92400e;"></i> Chỉnh Sửa Hồ Sơ
            </h3>
            <button onclick="closeAllExpansions()" style="background:none; border:none; cursor:pointer; color:#64748b; font-size: 1.25rem;">
                &times;
            </button>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
            <div class="portal-form-group">
                <label>Họ và tên</label>
                <input type="text" id="editName-${employeeId}" class="portal-input" value="${escapeHtml(employee.name || '')}">
            </div>
            <div class="portal-form-group">
                <label>Email</label>
                <input type="email" id="editEmail-${employeeId}" class="portal-input" value="${escapeHtml(employee.email || '')}">
            </div>
            <div class="portal-form-group">
                <label>Số điện thoại</label>
                <input type="tel" id="editPhone-${employeeId}" class="portal-input" value="${escapeHtml(employee.phone || '')}">
            </div>
            <div class="portal-form-group">
                <label>Chức vụ</label>
                <input type="text" id="editPosition-${employeeId}" class="portal-input" value="${escapeHtml(employee.position || '')}">
            </div>
            <div class="portal-form-group" style="opacity: 0.7;" title="Chỉ thay đổi qua menu Phân Tác">
                <label>Phòng ban (Khóa)</label>
                <select id="editDept-${employeeId}" class="portal-select" disabled>
                    <option value="">-- Chọn phòng ban --</option>
                    ${deptOptions}
                    <!-- In case the dept isn't logically grouped but user has it stored -->
                    <option value="${escapeHtml(employee.department || '')}" selected>${escapeHtml(employee.department || '')}</option>
                </select>
                <input type="hidden" id="editDeptHidden-${employeeId}" value="${escapeHtml(employee.department || '')}">
            </div>
            <div class="portal-form-group">
                <label>Trạng thái</label>
                <select id="editStatus-${employeeId}" class="portal-select">
                    <option value="active" ${employee.status === 'active' || !employee.status ? 'selected' : ''}>Đang làm việc</option>
                    <option value="inactive" ${employee.status === 'inactive' ? 'selected' : ''}>Đã nghỉ việc</option>
                </select>
            </div>
            <div class="portal-form-group" style="grid-column: 1 / -1;">
                <label>Địa chỉ</label>
                <textarea id="editAddress-${employeeId}" class="portal-textarea" rows="2">${escapeHtml(employee.address || '')}</textarea>
            </div>
        </div>

        <div style="display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.5rem;">
            <button class="btn-premium btn-premium-secondary" onclick="closeAllExpansions()">Hủy</button>
            <button class="btn-premium btn-premium-primary" onclick="saveEditEmployee('${employeeId}')">Lưu Thay Đổi</button>
        </div>
    `;

    toggleExpansion(employeeId, html);

    // Auto attach listener if an edit form exists inside there, but inline button handles it here
}

async function saveEditEmployee(employeeId) {
    try {
        const id = employeeId;
        const name = document.getElementById(`editName-${id}`)?.value?.trim();
        const email = document.getElementById(`editEmail-${id}`)?.value?.trim();
        const phone = document.getElementById(`editPhone-${id}`)?.value?.trim();
        const position = document.getElementById(`editPosition-${id}`)?.value?.trim();
        const dept = document.getElementById(`editDeptHidden-${id}`)?.value;
        const address = document.getElementById(`editAddress-${id}`)?.value?.trim();
        const status = document.getElementById(`editStatus-${id}`)?.value;

        if (!id || !name || !email) {
            showNotification('Vui lòng điền đầy đủ thông tin bắt buộc', 'warning');
            return;
        }

        if (!validateEmail(email)) {
            showNotification('Email không hợp lệ', 'warning');
            return;
        }

        if (phone && !validatePhone(phone)) {
            showNotification('Số điện thoại không hợp lệ', 'warning');
            return;
        }

        const currentEmployee = allEmployees.find(e => e._id === id);
        const oldDepartment = currentEmployee?.department;

        if (dept !== oldDepartment && dept) {
            showNotification(
                'Cảnh báo: Department chỉ được cập nhật từ menu Phân Công!',
                'warning'
            );
        }

        const updateData = {
            name,
            email,
            phone: phone || '',
            position: position || '',
            department: oldDepartment,
            address: address || '',
            status: status || 'active'
        };

        console.log('📝 Updating employee:', updateData);

        await EmployeeAPI.update(id, updateData);

        addActivityLog('update', `Cập nhật nhân viên: ${name}`, 'info');

        showNotification('Cập nhật nhân viên thành công', 'success');
        closeAllExpansions();
        await loadDashboardData();
    } catch (error) {
        console.error('Error saving employee:', error);
        showNotification('Lỗi: ' + error.message, 'error');
    }
}

// ==================== DELETE EMPLOYEE ====================
async function deleteEmployee(employeeId) {
    const employee = allEmployees.find(e => e._id === employeeId);
    if (!employee) {
        showNotification('Không tìm thấy nhân viên', 'error');
        return;
    }

    if (!await showCustomConfirm(`Bạn có chắc chắn muốn xóa nhân viên ${employee.name}?`)) {
        return;
    }

    try {
        await EmployeeAPI.delete(employeeId);

        addActivityLog('delete', `Xóa nhân viên: ${employee.name}`, 'error');

        showNotification('Đã xóa nhân viên thành công', 'success');
        await loadDashboardData();
    } catch (error) {
        showNotification('Lỗi: ' + error.message, 'error');
    }
}

// ==================== ACTIVITY LOG ====================
function addActivityLog(type, action, severity = 'info') {
    const activityItem = {
        id: Date.now(),
        type,
        action,
        severity,
        timestamp: new Date(),
        details: `${new Date().toLocaleString('vi-VN')}`
    };

    try {
        let history = JSON.parse(localStorage.getItem('activityHistory') || '[]');
        history.unshift(activityItem);

        if (history.length > 100) {
            history.pop();
        }

        localStorage.setItem('activityHistory', JSON.stringify(history));
        console.log('✅ Activity logged:', activityItem);
    } catch (e) {
        console.warn('Could not save activity log:', e);
    }

    renderActivityTimeline();
}

function loadActivityHistory() {
    try {
        const stored = JSON.parse(localStorage.getItem('activityHistory') || '[]');
        activityHistory = Array.isArray(stored) ? stored : [];
        console.log('📂 Loaded activity history:', activityHistory.length, 'items');
    } catch (e) {
        console.warn('Failed to load activity history:', e);
        activityHistory = [];
    }

    renderActivityTimeline();
}

function filterActivityByType(type) {
    currentActivityFilter = type;
    renderActivityTimeline();
}

function renderActivityTimeline() {
    const timeline = document.getElementById('activityTimeline');
    if (!timeline) return;

    let allActivityHistory = [];
    try {
        allActivityHistory = JSON.parse(localStorage.getItem('activityHistory') || '[]');
    } catch (e) {
        console.warn('Could not load activity history:', e);
    }

    let filtered = allActivityHistory;
    if (currentActivityFilter !== 'all') {
        filtered = allActivityHistory.filter(item => item.type === currentActivityFilter);
    }

    if (filtered.length === 0) {
        timeline.innerHTML = '<div class="activity-empty"><i class="fas fa-inbox"></i><p>Chưa có hoạt động</p></div>';
        return;
    }

    timeline.innerHTML = filtered.map(item => {
        const typeIcon = getActivityIcon(item.type);
        const severityClass = item.severity || 'info';
        const timeStr = formatTimeAgo(new Date(item.timestamp));

        return `<div class="activity-item ${severityClass}">
            <div class="activity-dot"></div>
            <div class="activity-time">${timeStr}</div>
            <div class="activity-action">
                <i class="fas ${typeIcon}"></i> ${escapeHtml(item.action)}
            </div>
            <div class="activity-details">${escapeHtml(item.details)}</div>
        </div>`;
    }).join('');
}

function getActivityIcon(type) {
    const icons = {
        'create': 'fa-plus-circle',
        'update': 'fa-edit',
        'delete': 'fa-trash-alt',
        'warning': 'fa-exclamation-circle',
        'default': 'fa-info-circle'
    };
    return icons[type] || icons['default'];
}

function getStatusBadge(status) {
    if (status === 'active') {
        return '<span style="background: #dcfce7; color: #166534; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.875rem; font-weight: 500;">Hoạt Động</span>';
    }
    return '<span style="background: #fee2e2; color: #991b1b; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.875rem; font-weight: 500;">Ngừng Làm Việc</span>';
}

// Window listener removed - Using inline expansisons and toggles now