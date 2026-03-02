(function () {
    const publicPages = ['dangnhap.html', 'index.html', ''];
    const currentPath = window.location.pathname.split('/').pop();
    if (!publicPages.includes(currentPath)) {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token) window.location.replace('dangnhap.html');
    }
})();

let dataSyncUnsubscribes = [];
let allDepartments = [];
let filteredDepartments = [];
let allAccounts = [];
let currentEditId = null;
let currentMembersModalDeptId = null;
const pagination = new PaginationHelper(50);

const ROLE_TYPES = {
    employee: 'Nhân Viên',
    department_head: 'Trưởng Phòng',
    vice_head: 'Phó Phòng',
    auditor: 'Kiểm Toán'
};

document.addEventListener('DOMContentLoaded', function () {
    if (!AuthManager.checkAuth()) return;

    document.getElementById('adminName').textContent = AuthManager.getUserName();
    loadDashboardData();
    setupDataSyncListeners();
    setupFilterListeners();

    smartRefresh.schedule('departments', loadDashboardData, 5 * 60 * 1000, true);
});

window.addEventListener('beforeunload', () => {
    smartRefresh.stop('departments');
    cleanupDataSyncListeners();
});

function cleanupDataSyncListeners() {
    dataSyncUnsubscribes.forEach(unsub => {
        if (typeof unsub === 'function') unsub();
    });
    dataSyncUnsubscribes = [];
}

function setupDataSyncListeners() {
    if (typeof DataSync === 'undefined') return;
    cleanupDataSyncListeners();

    dataSyncUnsubscribes.push(DataSync.on('department:created', () => {
        loadDashboardData();
        showNotification('Thêm phòng ban thành công', 'success');
    }));

    dataSyncUnsubscribes.push(DataSync.on('department:updated', () => {
        loadDashboardData();
    }));

    dataSyncUnsubscribes.push(DataSync.on('department:deleted', () => {
        loadDashboardData();
    }));

    dataSyncUnsubscribes.push(DataSync.on('account:created', () => {
        loadDashboardData();
    }));

    dataSyncUnsubscribes.push(DataSync.on('account:updated', () => {
        loadDashboardData();
    }));

    dataSyncUnsubscribes.push(DataSync.on('account:deleted', () => {
        loadDashboardData();
    }));
}
//lọc theo tên/trạng thái
function setupFilterListeners() {
    const searchEl = document.getElementById('searchDept');
    const statusEl = document.getElementById('filterStatus');

    if (searchEl) {
        searchEl.addEventListener('keyup', debounce(applyFilters, 300));
    }
    if (statusEl) {
        statusEl.addEventListener('change', applyFilters);
    }
}

// Tải danh sách phòng ban và tài khoản
async function loadDashboardData() {
    try {
        const [deptData, accountData] = await Promise.all([
            DepartmentAPI.getAll(),
            AccountAPI.getAll()
        ]);

        allDepartments = Array.isArray(deptData) ? deptData : [];
        allAccounts = Array.isArray(accountData) ? accountData : [];

        allDepartments = allDepartments.map(dept => {
            const deptName = dept.name?.trim();

            const deptMembers = allAccounts.filter(acc => {
                const accDept = acc.department?.trim();
                if (!accDept) return false;
                return accDept === deptName;
            });

            const deptHead = deptMembers.find(m => m.role === 'department_head');

            return {
                ...dept,
                employeeCount: deptMembers.length,
                members: deptMembers,
                manager: deptHead?.fullName || dept.manager || '-',
                managerId: deptHead?._id || dept.managerId || ''
            };
        });

        pagination.reset();
        applyFilters();
    } catch (error) {
        showNotification('Lỗi: ' + error.message, 'error');
    }
}
//lọc dữ liệu
function applyFilters() {
    const searchValue = document.getElementById('searchDept')?.value?.toLowerCase() || '';
    const statusFilter = document.getElementById('filterStatus')?.value || '';

    let filtered = allDepartments;

    if (searchValue) {
        filtered = filtered.filter(dept =>
            (dept.name && dept.name.toLowerCase().includes(searchValue)) ||
            (dept.description && dept.description.toLowerCase().includes(searchValue))
        );
    }

    if (statusFilter) {
        filtered = filtered.filter(dept => dept.status === statusFilter);
    }

    filteredDepartments = filtered;
    pagination.reset();
    renderDepartmentTable();
}
//vẽ bảng phòng ban
function renderDepartmentTable() {
    const tbody = document.getElementById('departmentTable');

    if (!tbody) return;

    if (filteredDepartments.length === 0) {
        tbody.innerHTML = `<tr>
            <td colspan="7" style="text-align: center; padding: 2rem;">
                <i class="fas fa-inbox" style="font-size: 2rem; opacity: 0.3;"></i>
                <p style="color: #9ca3af; margin-top: 0.5rem;">Không có dữ liệu</p>
            </td>
        </tr>`;
        return;
    }

    const paginatedData = pagination.paginate(filteredDepartments);

    tbody.innerHTML = paginatedData.map(dept => {
        const id = escapeHtml(dept._id || '');
        const name = escapeHtml(dept.name || '-');
        const description = escapeHtml((dept.description || '-').substring(0, 50));
        const manager = escapeHtml(dept.manager || '-');
        const empCount = dept.employeeCount || 0;
        const budget = dept.budget ? formatCurrency(dept.budget) : '-';
        const status = dept.status || 'active';

        return `<tr id="row-${id}">
            <td style="font-weight: 600; color: #111827;">${name}</td>
            <td>${description}${(dept.description?.length || 0) > 50 ? '...' : ''}</td>
            <td>${manager}</td>
            <td>
                <button onclick="toggleMembersInline('${id}')" class="members-count">
                    ${empCount}
                </button>
            </td>
            <td style="text-align: right; font-weight: 500;">${budget}</td>
            <td>${getStatusBadge(status)}</td>
            <td>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn-icon" onclick="toggleViewDeptInline('${id}')" style="background: #dbeafe; color: #1e40af; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer;">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-icon" onclick="toggleEditDeptInline('${id}')" style="background: #fef3c7; color: #92400e; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon" onclick="deleteDepartment('${id}')" style="background: #fee2e2; color: #7f1d1d; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
        <tr id="expansion-${id}" style="display: none;">
            <td colspan="7" style="padding: 0; border: none;">
                <div id="expansion-content-${id}" class="expansion-content" style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 1.5rem;">
                </div>
            </td>
        </tr>`;
    }).join('');

    renderPagination();
}
//vẽ phân trang
function renderPagination() {
    const info = pagination.getInfo();
    renderPaginationUI('paginationContainer', info);
}

// ==================== INLINE EXPANSION UTILS ====================
function closeAllExpansions() {
    document.querySelectorAll('[id^="expansion-"]').forEach(el => el.style.display = 'none');
}

function toggleExpansion(deptId, contentHtml) {
    const expansionRow = document.getElementById(`expansion-${deptId}`);
    const contentDiv = document.getElementById(`expansion-content-${deptId}`);

    if (expansionRow && expansionRow.style.display === 'table-row' && contentDiv.innerHTML.includes(contentHtml.substring(0, 50))) {
        expansionRow.style.display = 'none';
    } else if (expansionRow) {
        closeAllExpansions();
        contentDiv.innerHTML = contentHtml;
        expansionRow.style.display = 'table-row';
    }
}

//mở modal danh sách thành viên
function toggleMembersInline(deptId) {
    const dept = allDepartments.find(d => d._id === deptId);
    if (!dept) {
        showNotification('Không tìm thấy phòng ban', 'error');
        return;
    }

    currentMembersModalDeptId = deptId;

    const membersHtml = (dept.members || []).map(member => {
        const roleDisplay = ROLE_TYPES[member.role] || member.role;
        const roleColors = {
            department_head: { bg: '#dcfce7', color: '#15803d' },
            vice_head: { bg: '#fef3c7', color: '#92400e' },
            auditor: { bg: '#dbeafe', color: '#0284c7' },
            employee: { bg: '#f3f4f6', color: '#374151' }
        };
        const roleColor = roleColors[member.role] || roleColors.employee;

        return `
            <tr>
                <td style="font-weight: 600; color: #111827;">${escapeHtml(member.fullName || '-')}</td>
                <td>${escapeHtml(member.username || '-')}</td>
                <td>${escapeHtml(member.email || '-')}</td>
                <td>${escapeHtml(member.phone || '-')}</td>
                <td>
                    <span style="background: ${roleColor.bg}; color: ${roleColor.color}; padding: 0.375rem 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; font-weight: 500;">
                        ${roleDisplay}
                    </span>
                </td>
                <td>
                    <div style="display: flex; gap: 0.5rem;">
                        <button onclick="toggleAssignRoleInline('${member._id}', '${escapeHtml(member.fullName)}', '${escapeHtml(dept.name)}', '${deptId}')" 
                                style="background: #2563eb; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.375rem; cursor: pointer; font-size: 0.875rem; font-weight: 500;">
                            <i class="fas fa-edit"></i> Chỉnh Sửa
                        </button>
                        <button onclick="removeEmployeeFromDept('${member._id}', '${escapeHtml(member.fullName)}', '${deptId}')"
                                style="background: #fee2e2; color: #7f1d1d; border: none; padding: 0.5rem 1rem; border-radius: 0.375rem; cursor: pointer; font-size: 0.875rem; font-weight: 500;">
                            <i class="fas fa-trash"></i> Xóa
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    const html = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;">
            <div>
                <h3 style="font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 0.5rem;">
                    <i class="fas fa-users" style="color: #4338ca;"></i> Danh sách thành viên - ${escapeHtml(dept.name)}
                </h3>
            </div>
            <div style="display: flex; gap: 0.5rem;">
                <button onclick="toggleAddEmployeeToDeptInline('${deptId}')" class="btn-primary" style="padding: 0.5rem 1rem; font-size: 0.875rem;">
                    <i class="fas fa-user-plus"></i> Thêm thành viên
                </button>
                <button onclick="closeAllExpansions()" style="background:none; border:none; cursor:pointer; color:#64748b; font-size: 1.25rem;">
                    &times;
                </button>
            </div>
        </div>

        <div id="inlineAddEmpContainer-${deptId}" style="display: none; margin-bottom: 1.5rem;"></div>
        <div id="inlineAssignRoleContainer-${deptId}" style="display: none; margin-bottom: 1.5rem;"></div>
        
        <div class="table-responsive bg-card shadow-card" style="margin-bottom: 1rem;">
            <table class="modern-table">
                <thead>
                    <tr>
                        <th>Họ tên</th>
                        <th>Tên đăng nhập</th>
                        <th>Email</th>
                        <th>SĐT</th>
                        <th>Vai trò</th>
                    </tr>
                </thead>
                <tbody>
                    ${membersHtml || `<tr><td colspan="5" style="text-align: center; padding: 2rem;">Không có thành viên</td></tr>`}
                </tbody>
            </table>
        </div>
    `;

    toggleExpansion(deptId, html);
}

function closeMembersModal() {
    const modal = document.getElementById('membersModal');
    if (modal) modal.classList.remove('show');
    currentMembersModalDeptId = null;
}

// mở modal thêm nhân viên 
function toggleAddEmployeeToDeptInline(deptId) {
    const container = document.getElementById(`inlineAddEmpContainer-${deptId}`);
    if (!container) return;

    if (container.style.display === 'block') {
        container.style.display = 'none';
        return;
    }

    const dept = allDepartments.find(d => d._id === deptId);
    if (!dept) return;

    const deptMembers = dept.members || [];
    const deptMemberIds = new Set(deptMembers.map(m => m._id));
    const availableEmployees = allAccounts.filter(acc => !deptMemberIds.has(acc._id));

    if (availableEmployees.length === 0) {
        showNotification('Không có nhân viên nào để thêm vào phòng ban này', 'info');
        return;
    }

    const optionsHtml = availableEmployees.map(emp => `
        <option value="${emp._id}">${escapeHtml(emp.fullName)} (${emp.username})</option>
    `).join('');

    container.innerHTML = `
        <div class="form-section" style="border: 1px solid #e2e8f0; padding: 1.5rem; border-radius: 0.75rem; background: white;">
            <div class="form-section-title" style="margin-bottom: 1rem; font-weight: 600;">
                <i class="fas fa-user-plus"></i> Thêm nhân viên vào phòng
            </div>
            <div class="form-grid">
                <div class="portal-form-group">
                    <label>Tìm nhân viên</label>
                    <input type="text" id="inlineAddEmpSearch-${deptId}" class="portal-input" placeholder="Tên hoặc email..." oninput="filterInlineAvailableEmployees('${deptId}')">
                </div>
                <div class="portal-form-group">
                    <label>Chọn nhân viên *</label>
                    <select id="inlineAddEmpSelect-${deptId}" class="portal-select">
                        <option value="">-- Chọn nhân viên --</option>
                        ${optionsHtml}
                    </select>
                </div>
                <div class="portal-form-group">
                    <label>Vai trò *</label>
                    <select id="inlineAddEmpRole-${deptId}" class="portal-select">
                        <option value="employee">Nhân viên</option>
                        <option value="vice_head">Phó phòng</option>
                        <option value="department_head">Trưởng phòng</option>
                    </select>
                </div>
            </div>
            <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1.5rem;">
                <button class="btn-secondary" onclick="document.getElementById('inlineAddEmpContainer-${deptId}').style.display='none'">Hủy</button>
                <button class="btn-primary" onclick="saveAddEmployeeToDeptInline('${deptId}')">Xác nhận</button>
            </div>
        </div>
    `;
    container.style.display = 'block';
    document.getElementById(`inlineAssignRoleContainer-${deptId}`).style.display = 'none';
}
// liệt danh sách nhân viên khả dụng
function renderAvailableEmployeesList(employees) {
    const select = document.getElementById('addEmpEmployeeSelect');
    select.innerHTML = '<option value="">-- Chọn nhân viên --</option>';

    if (employees.length === 0) {
        select.innerHTML += '<option disabled>Không có nhân viên khả dụng</option>';
        return;
    }

    employees.forEach(emp => {
        const option = document.createElement('option');
        option.value = emp._id;
        option.textContent = escapeHtml(`${emp.fullName} (${emp.username})`);
        select.appendChild(option);
    });
}
//lọc nhân viên khả dụng
function filterInlineAvailableEmployees(deptId) {
    const searchValue = document.getElementById(`inlineAddEmpSearch-${deptId}`).value.toLowerCase();
    const dept = allDepartments.find(d => d._id === deptId);
    if (!dept) return;

    const deptMembers = dept.members || [];
    const deptMemberIds = new Set(deptMembers.map(m => m._id));

    const availableEmployees = allAccounts.filter(acc =>
        !deptMemberIds.has(acc._id) &&
        ((acc.fullName && acc.fullName.toLowerCase().includes(searchValue)) ||
            (acc.username && acc.username.toLowerCase().includes(searchValue)) ||
            (acc.email && acc.email.toLowerCase().includes(searchValue)))
    );

    const select = document.getElementById(`inlineAddEmpSelect-${deptId}`);
    select.innerHTML = '<option value="">-- Chọn nhân viên --</option>';
    availableEmployees.forEach(emp => {
        const option = document.createElement('option');
        option.value = emp._id;
        option.textContent = escapeHtml(`${emp.fullName} (${emp.username})`);
        select.appendChild(option);
    });
}

function toggleAssignRoleInline(accountId, employeeName, deptName, deptId) {
    const container = document.getElementById(`inlineAssignRoleContainer-${deptId}`);
    if (!container) return;

    if (container.style.display === 'block' && container.dataset.accId === accountId) {
        container.style.display = 'none';
        return;
    }

    const account = allAccounts.find(a => a._id === accountId);
    if (!account) return;

    container.dataset.accId = accountId;
    container.innerHTML = `
        <div class="form-section" style="border: 1px solid #e2e8f0; padding: 1.5rem; border-radius: 0.75rem; background: #f1f5f9;">
            <div class="form-section-title" style="margin-bottom: 1rem; font-weight: 600;">
                <i class="fas fa-user-shield"></i> Gán vai trò cho: ${escapeHtml(employeeName)}
            </div>
            <div class="form-grid" style="grid-template-columns: 1fr 1fr;">
                <div class="portal-form-group">
                    <label>Phòng ban</label>
                    <div style="font-weight: 600;">${escapeHtml(deptName)}</div>
                </div>
                <div class="portal-form-group">
                    <label>Chọn vai trò *</label>
                    <select id="inlineAssignRoleSelect-${deptId}" class="portal-select">
                        <option value="employee" ${account.role === 'employee' ? 'selected' : ''}>Nhân viên</option>
                        <option value="vice_head" ${account.role === 'vice_head' ? 'selected' : ''}>Phó phòng</option>
                        <option value="department_head" ${account.role === 'department_head' ? 'selected' : ''}>Trưởng phòng</option>
                    </select>
                </div>
            </div>
            <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1.5rem;">
                <button class="btn-secondary" onclick="document.getElementById('inlineAssignRoleContainer-${deptId}').style.display='none'">Hủy</button>
                <button class="btn-primary" onclick="saveAssignRoleInline('${accountId}', '${deptId}', '${escapeHtml(deptName)}', '${escapeHtml(employeeName)}')">Cập nhật vai trò</button>
            </div>
        </div>
    `;
    container.style.display = 'block';
    document.getElementById(`inlineAddEmpContainer-${deptId}`).style.display = 'none';
}
//lưu thêm nhân viên vào phòng ban
async function saveAddEmployeeToDeptInline(deptId) {
    try {
        const accountId = document.getElementById(`inlineAddEmpSelect-${deptId}`).value;
        const role = document.getElementById(`inlineAddEmpRole-${deptId}`).value;
        const dept = allDepartments.find(d => d._id === deptId);

        if (!accountId) {
            showNotification('Vui lòng chọn nhân viên', 'warning');
            return;
        }

        const account = allAccounts.find(a => a._id === accountId);
        const updatePayload = {
            ...account,
            department: dept.name,
            role: role,
            status: 'active'
        };

        await AccountAPI.update(accountId, updatePayload);
        showNotification(`✅ Thêm ${account.fullName} vào phòng ${dept.name} thành công`, 'success');
        await loadDashboardData();
        setTimeout(() => toggleMembersInline(deptId), 300);
    } catch (error) {
        showNotification('Lỗi: ' + error.message, 'error');
    }
}
//xóa nhân viên khỏi phòng ban
async function removeEmployeeFromDept(accountId, employeeName, deptId) {
    const account = allAccounts.find(a => a._id === accountId);
    if (!account) {
        showNotification('Không tìm thấy tài khoản', 'error');
        return;
    }

    const dept = allDepartments.find(d => d._id === deptId);
    if (!dept) {
        showNotification('Không tìm thấy phòng ban', 'error');
        return;
    }

    if (!await showCustomConfirm(`Bạn có chắc chắn muốn xóa "${escapeHtml(employeeName)}" khỏi phòng ban "${escapeHtml(dept.name)}"?\n\nNhân viên sẽ quay lại "Chưa phân phòng ban".`)) {
        return;
    }

    try {
        // ✅ FIX: LUÔN GIỮ status = 'active' khi xóa khỏi phòng ban
        const updatePayload = {
            username: account.username,
            fullName: account.fullName,
            email: account.email,
            phone: account.phone || '',
            address: account.address || '',
            department: 'Chưa phân phòng ban',
            role: 'employee',
            status: 'active'  // ✅ QUAN TRỌNG
        };

        await AccountAPI.update(accountId, updatePayload);

        showNotification(
            `✅ Xóa ${employeeName} khỏi phòng ban ${dept.name} thành công`,
            'success'
        );

        await loadDashboardData();

        setTimeout(() => {
            openMembersModal(deptId);
        }, 300);

    } catch (error) {
        console.error('❌ Error:', error);
        showNotification('Lỗi: ' + error.message, 'error');
    }
}
//mở modal gán vai trò 
async function saveAssignRoleInline(accountId, deptId, deptName, employeeName) {
    try {
        const newRole = document.getElementById(`inlineAssignRoleSelect-${deptId}`).value;
        const account = allAccounts.find(a => a._id === accountId);

        // Xử lý chuyển đổi vai trò trưởng phòng nếu cần
        if (newRole === 'department_head') {
            const dept = allDepartments.find(d => d._id === deptId);
            if (dept?.managerId && dept.managerId !== accountId) {
                const oldManager = allAccounts.find(a => a._id === dept.managerId);
                if (oldManager) {
                    await AccountAPI.update(dept.managerId, {
                        ...oldManager,
                        role: 'employee',
                        status: 'active'
                    });
                }
            }
        }

        await AccountAPI.update(accountId, {
            ...account,
            role: newRole,
            status: 'active'
        });

        showNotification(`✅ Cập nhật vai trò cho ${employeeName} thành công`, 'success');
        await loadDashboardData();
        setTimeout(() => toggleMembersInline(deptId), 300);
    } catch (error) {
        showNotification('Lỗi: ' + error.message, 'error');
    }
}
async function saveAssignRole() {
    try {
        const accountId = document.getElementById('assignRoleAccountId')?.value;
        const deptName = document.getElementById('assignRoleDeptName')?.value;
        const deptId = document.getElementById('assignRoleDeptId')?.value;
        const newRole = document.getElementById('assignRoleSelect')?.value;
        const employeeName = document.getElementById('assignRoleEmployeeName')?.textContent;

        if (!accountId || !newRole) {
            showNotification('Vui lòng chọn vai trò', 'warning');
            return;
        }

        const account = allAccounts.find(a => a._id === accountId);
        if (!account) {
            showNotification('Không tìm thấy tài khoản', 'error');
            return;
        }

        console.log(`\n📝 Assigning role to ${account.username}`);
        console.log(`   Current role: ${account.role} → New role: ${newRole}`);
        console.log(`   Current status: ${account.status}`);

        // ✅ Nếu là trưởng phòng, xử lý cái cũ
        if (newRole === 'department_head') {
            const dept = allDepartments.find(d => d.name === deptName);

            if (dept?.managerId && dept.managerId !== accountId) {
                const oldManager = allAccounts.find(a => a._id === dept.managerId);

                if (oldManager) {
                    try {
                        console.log(`   Resetting old manager: ${oldManager.username}`);
                        await AccountAPI.update(dept.managerId, {
                            username: oldManager.username,
                            fullName: oldManager.fullName,
                            email: oldManager.email,
                            phone: oldManager.phone || '',
                            address: oldManager.address || '',
                            department: oldManager.department || deptName,
                            role: 'employee',
                            status: 'active'  // ✅ QUAN TRỌNG: Giữ active
                        });
                    } catch (error) {
                        console.error('Error resetting old manager:', error);
                    }
                }
            }
        }

        // ✅ FIX: CẬP NHẬT ROLE, LUÔN GIỮ status = 'active'
        const updatePayload = {
            username: account.username,
            fullName: account.fullName,
            email: account.email,
            phone: account.phone || '',
            address: account.address || '',
            department: account.department || deptName,
            role: newRole,
            status: 'active'  // ✅ QUAN TRỌNG: Đảm bảo luôn active
        };

        console.log(`   Final payload:`, updatePayload);

        await AccountAPI.update(accountId, updatePayload);

        console.log(`   ✅ Role updated successfully`);

        showNotification(
            `✅ Cập nhật vai trò cho ${employeeName} thành công`,
            'success'
        );

        closeAssignRoleModal();
        await loadDashboardData();

        if (deptId) {
            setTimeout(() => {
                openMembersModal(deptId);
            }, 300);
        }

    } catch (error) {
        console.error('❌ Error:', error);
        showNotification('Lỗi: ' + error.message, 'error');
    }
}
function closeAssignRoleModal() {
    // Left as stub or you can remove entirely if moving Assign Role to inline completely, but given the time constraint, leaving original modal stub logic if any
}
//Xem chi tiết phòng ban
function toggleViewDeptInline(deptId) {
    const dept = allDepartments.find(d => d._id === deptId);
    if (!dept) {
        showNotification('Không tìm thấy phòng ban', 'error');
        return;
    }

    const html = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;">
            <h3 style="font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 0.5rem;">
                <i class="fas fa-building" style="color: #3b82f6;"></i> Thông Tin Phòng Ban
            </h3>
            <button onclick="closeAllExpansions()" style="background:none; border:none; cursor:pointer; color:#64748b; font-size: 1.25rem;">
                &times;
            </button>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
            <div><span style="color:#64748b; font-size:0.875rem;">Tên phòng:</span> <div style="font-weight:600;">${escapeHtml(dept.name || '-')}</div></div>
            <div><span style="color:#64748b; font-size:0.875rem;">Trưởng phòng:</span> <div style="font-weight:600;">${escapeHtml(dept.manager || '-')}</div></div>
            <div><span style="color:#64748b; font-size:0.875rem;">Số nhân viên:</span> <div style="font-weight:600;">${dept.employeeCount || 0}</div></div>
            <div><span style="color:#64748b; font-size:0.875rem;">Ngân sách:</span> <div style="font-weight:600;">${dept.budget ? formatCurrency(dept.budget) : '-'}</div></div>
            <div><span style="color:#64748b; font-size:0.875rem;">Email liên hệ:</span> <div style="font-weight:600;">${escapeHtml(dept.email || '-')}</div></div>
            <div><span style="color:#64748b; font-size:0.875rem;">Trạng thái:</span> <div style="font-weight:600;">${getStatusBadge(dept.status || 'active')}</div></div>
            <div style="grid-column: 1 / -1;"><span style="color:#64748b; font-size:0.875rem;">Mô tả:</span> <div style="font-weight:600;">${escapeHtml(dept.description || '-')}</div></div>
        </div>
    `;

    toggleExpansion(deptId, html);
}
//mở tạo phòng ban (INLINE FORM)
function toggleAddDeptForm() {
    const formContainer = document.getElementById('addDeptFormContainer');
    const toggleBtnText = document.getElementById('toggleAddDeptBtnText');
    const toggleBtnIcon = document.querySelector('#toggleAddDeptBtn i');

    if (formContainer.style.display === 'none') {
        formContainer.style.display = 'block';
        if (toggleBtnText) toggleBtnText.textContent = 'Đóng Form';
        if (toggleBtnIcon) toggleBtnIcon.className = 'fas fa-times';

        document.getElementById('addDeptName').value = '';
        document.getElementById('addDeptDesc').value = '';
        document.getElementById('addDeptBudget').value = '';
        document.getElementById('addDeptEmail').value = '';

        const selectBox = document.getElementById('addDeptManager');
        if (selectBox) {
            selectBox.innerHTML = '<option value="">-- Chọn trưởng phòng --</option>';
            if (allAccounts.length > 0) {
                allAccounts.forEach(emp => {
                    const option = document.createElement('option');
                    option.value = emp._id || '';
                    const deptStr = emp.department ? ` (${emp.department})` : '';
                    option.textContent = escapeHtml(`${emp.fullName}${deptStr}`);
                    selectBox.appendChild(option);
                });
            }
        }
    } else {
        formContainer.style.display = 'none';
        if (toggleBtnText) toggleBtnText.textContent = 'Thêm phòng ban';
        if (toggleBtnIcon) toggleBtnIcon.className = 'fas fa-plus';
    }
}
async function submitAddDept() {
    currentEditId = null; // Tương đương tạo mới
    const name = document.getElementById('addDeptName')?.value?.trim();
    const description = document.getElementById('addDeptDesc')?.value?.trim();
    const managerId = document.getElementById('addDeptManager')?.value;
    const email = document.getElementById('addDeptEmail')?.value?.trim();
    const budget = document.getElementById('addDeptBudget')?.value;
    const status = 'active';

    if (!name) {
        showNotification('Vui lòng nhập tên phòng ban', 'warning');
        return;
    }

    try {
        let managerName = '';
        if (managerId) {
            const manager = allAccounts.find(e => e._id === managerId);
            managerName = manager ? manager.fullName : '';
            // update account API would go here, mimicking saveDepartment
        }

        const deptData = {
            name, description, managerId, manager: managerName, email: email || '', budget: budget ? parseInt(budget) : 0, status
        };
        await DepartmentAPI.create(deptData);

        // ✅ NEW: Update manager account if selected
        if (managerId) {
            try {
                const manager = allAccounts.find(e => e._id === managerId);
                if (manager) {
                    await AccountAPI.update(managerId, {
                        username: manager.username,
                        fullName: manager.fullName,
                        email: manager.email,
                        phone: manager.phone,
                        address: manager.address,
                        department: name, // Sync new department
                        role: 'department_head',
                        status: 'active'
                    });
                }
            } catch (err) {
                console.warn('Could not update new manager role', err);
            }
        }

        showNotification('✅ Thêm phòng ban thành công', 'success');

        toggleAddDeptForm();
        await loadDashboardData();
    } catch (e) {
        showNotification('Lỗi: ' + e.message, 'error');
    }
}
//mở tùy chỉnh phòng ban
function toggleEditDeptInline(deptId) {
    const dept = allDepartments.find(d => d._id === deptId);
    if (!dept) {
        showNotification('Không tìm thấy phòng ban', 'error');
        return;
    }

    currentEditId = deptId;

    // Nạp sẵn list accounts
    const deptMembers = allAccounts.filter(acc => {
        const accDept = acc.department?.trim();
        return accDept === dept.name.trim();
    });

    let managerOptions = '<option value="">-- Chọn trưởng phòng --</option>';
    if (deptMembers.length > 0) {
        managerOptions += deptMembers.map(emp => {
            const roleDisplay = ROLE_TYPES[emp.role] || emp.role;
            const selected = emp._id === dept.managerId ? 'selected' : '';
            return `<option value="${emp._id}" ${selected}>${escapeHtml(`${emp.fullName} (${roleDisplay})`)}</option>`;
        }).join('');
    }

    const html = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;">
            <h3 style="font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 0.5rem;">
                <i class="fas fa-edit" style="color: #92400e;"></i> Chỉnh Sửa Phòng Ban
            </h3>
            <button onclick="closeAllExpansions()" style="background:none; border:none; cursor:pointer; color:#64748b; font-size: 1.25rem;">
                &times;
            </button>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
            <div class="portal-form-group">
                <label>Tên phòng ban</label>
                <input type="text" id="editDeptName-${deptId}" class="portal-input" value="${escapeHtml(dept.name || '')}">
            </div>
            <div class="portal-form-group">
                <label>Trưởng phòng</label>
                <select id="editDeptManager-${deptId}" class="portal-select">
                    ${managerOptions}
                </select>
            </div>
            <div class="portal-form-group">
                <label>Ngân sách (VNĐ)</label>
                <input type="number" id="editDeptBudget-${deptId}" class="portal-input" value="${dept.budget || ''}">
            </div>
            <div class="portal-form-group">
                <label>Email liên hệ</label>
                <input type="email" id="editDeptEmail-${deptId}" class="portal-input" value="${escapeHtml(dept.email || '')}">
            </div>
            <div class="portal-form-group">
                <label>Trạng thái</label>
                <select id="editDeptStatus-${deptId}" class="portal-select">
                    <option value="active" ${dept.status === 'active' || !dept.status ? 'selected' : ''}>Hoạt động</option>
                    <option value="inactive" ${dept.status === 'inactive' ? 'selected' : ''}>Tạm ngưng</option>
                </select>
            </div>
            <div class="portal-form-group" style="grid-column: 1 / -1;">
                <label>Mô tả phòng ban</label>
                <textarea id="editDeptDesc-${deptId}" class="portal-textarea" rows="2">${escapeHtml(dept.description || '')}</textarea>
            </div>
        </div>

        <div style="display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.5rem;">
            <button class="btn-premium btn-premium-secondary" onclick="closeAllExpansions()">Hủy</button>
            <button class="btn-premium btn-premium-primary" onclick="saveEditDeptInline('${deptId}')">Lưu Thay Đổi</button>
        </div>
    `;

    toggleExpansion(deptId, html);
}
//tải toàn bộ danh sách manager
function loadAllAccountsAsManager() {
    const select = document.getElementById('deptManager');
    select.innerHTML = '<option value="">-- Chọn trưởng phòng --</option>';

    if (allAccounts.length > 0) {
        allAccounts.forEach(emp => {
            const option = document.createElement('option');
            option.value = emp._id || '';
            const dept = emp.department ? ` (${emp.department})` : '';
            option.textContent = escapeHtml(`${emp.fullName}${dept}`);
            select.appendChild(option);
        });
    }
}
//tải toàn bộ danh sách thành viên
function loadAccountsForDeptAsManager(deptName) {
    const select = document.getElementById('deptManager');
    select.innerHTML = '<option value="">-- Chọn trưởng phòng --</option>';

    const deptMembers = allAccounts.filter(acc => {
        const accDept = acc.department?.trim();
        return accDept === deptName;
    });

    if (deptMembers.length > 0) {
        deptMembers.forEach(emp => {
            const option = document.createElement('option');
            option.value = emp._id || '';
            const roleDisplay = ROLE_TYPES[emp.role] || emp.role;
            option.textContent = escapeHtml(`${emp.fullName} (${roleDisplay})`);
            select.appendChild(option);
        });
    }
}
async function saveEditDeptInline(deptId) {
    try {
        currentEditId = deptId;
        const name = document.getElementById(`editDeptName-${deptId}`)?.value?.trim();
        const description = document.getElementById(`editDeptDesc-${deptId}`)?.value?.trim();
        const managerId = document.getElementById(`editDeptManager-${deptId}`)?.value;
        const email = document.getElementById(`editDeptEmail-${deptId}`)?.value?.trim();
        const budget = document.getElementById(`editDeptBudget-${deptId}`)?.value;
        const status = document.getElementById(`editDeptStatus-${deptId}`)?.value;

        if (!name) {
            showNotification('Vui lòng nhập tên phòng ban', 'warning');
            return;
        }

        if (email && !validateEmail(email)) {
            showNotification('Email không hợp lệ', 'warning');
            return;
        }

        let managerName = '';
        let previousManagerId = null;
        let oldDeptName = null;

        if (currentEditId) {
            const dept = allDepartments.find(d => d._id === currentEditId);
            if (dept) {
                oldDeptName = dept.name;
                previousManagerId = dept.managerId;
            }
        }

        if (managerId) {
            const manager = allAccounts.find(e => e._id === managerId);
            managerName = manager ? manager.fullName : '';

            try {
                await AccountAPI.update(managerId, {
                    username: manager?.username,
                    fullName: manager?.fullName,
                    email: manager?.email,
                    phone: manager?.phone,
                    address: manager?.address,
                    department: name,
                    role: 'department_head',
                    status: 'active'  // ✅ QUAN TRỌNG
                });
                showNotification(`✅ Cập nhật vai trò cho ${managerName} thành Trưởng Phòng`, 'success');
            } catch (error) {
                console.error('❌ Error updating manager:', error);
                showNotification('Lỗi cập nhật manager: ' + error.message, 'error');
                return;
            }

            if (previousManagerId && previousManagerId !== managerId) {
                const previousManager = allAccounts.find(e => e._id === previousManagerId);
                if (previousManager) {
                    try {
                        await AccountAPI.update(previousManagerId, {
                            username: previousManager.username,
                            fullName: previousManager.fullName,
                            email: previousManager.email,
                            phone: previousManager.phone,
                            address: previousManager.address,
                            department: previousManager.department,
                            role: 'employee',
                            status: 'active'  // ✅ QUAN TRỌNG
                        });
                    } catch (error) {
                        console.error('❌ Error resetting old manager:', error);
                    }
                }
            }
        }

        if (currentEditId && oldDeptName && oldDeptName !== name) {
            const accountsToUpdate = allAccounts.filter(acc => {
                const accDept = acc.department?.trim();
                return accDept === oldDeptName;
            });

            let updateSuccess = 0;

            for (const account of accountsToUpdate) {
                try {
                    await AccountAPI.update(account._id, {
                        username: account.username,
                        fullName: account.fullName,
                        email: account.email,
                        phone: account.phone,
                        address: account.address,
                        department: name,
                        role: account.role,
                        status: 'active'  // ✅ QUAN TRỌNG
                    });
                    updateSuccess++;
                } catch (error) {
                    console.error('Error updating account:', error);
                }
            }

            if (updateSuccess > 0) {
                showNotification(`✅ Cập nhật ${updateSuccess} tài khoản`, 'success');
            }
        }

        const deptData = {
            name,
            description,
            managerId,
            manager: managerName,
            email: email || '',
            budget: budget ? parseInt(budget) : 0,
            status
        };

        await DepartmentAPI.update(currentEditId, deptData);
        showNotification('✅ Cập nhật phòng ban thành công', 'success');

        closeAllExpansions();
        await loadDashboardData();

    } catch (error) {
        console.error('❌ Error:', error);
        showNotification('Lỗi: ' + error.message, 'error');
    }
}
//xóa phòng ban 
async function deleteDepartment(deptId) {
    const dept = allDepartments.find(d => d._id === deptId);
    if (!dept) {
        showNotification('Không tìm thấy phòng ban', 'error');
        return;
    }

    if (!await showCustomConfirm(`Bạn có chắc chắn muốn xóa "${escapeHtml(dept.name)}"?`)) {
        return;
    }

    try {
        await DepartmentAPI.delete(deptId);
        showNotification('✅ Xóa phòng ban thành công', 'success');
        await loadDashboardData();
    } catch (error) {
        console.error('❌ Error:', error);
        showNotification('Lỗi: ' + error.message, 'error');
    }
}
window.addEventListener('click', function (e) {
    const viewModal = document.getElementById('viewDeptModal');
    const deptModal = document.getElementById('deptModal');
    const membersModal = document.getElementById('membersModal');
    const assignRoleModal = document.getElementById('assignRoleModal');
    const addEmpModal = document.getElementById('addEmployeeToDeptModal');

    if (e.target === viewModal) closeViewDeptModal();
    if (e.target === deptModal) closeDeptModal();
    if (e.target === membersModal) closeMembersModal();
    if (e.target === assignRoleModal) closeAssignRoleModal();
    if (e.target === addEmpModal) closeAddEmployeeToDeptModal();
});