(function () {
    const publicPages = ['dangnhap.html', 'index.html', ''];
    const currentPath = window.location.pathname.split('/').pop();
    if (!publicPages.includes(currentPath)) {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token) window.location.replace('dangnhap.html');
    }
})();

let allAccounts = [];
let filteredAccounts = [];
let currentEditId = null;
const pagination = new PaginationHelper(20);

document.addEventListener('DOMContentLoaded', function() {
    const userRole = AuthManager.getUserRole();
    const allowedRoles = ['admin', 'employee', 'department_head', 'vice_head', 'auditor'];
    if (!AuthManager.checkAuth()) {
        window.location.href = './dangnhap.html';
        return;
    }
    if (!allowedRoles.includes(userRole)) {
        showNotification('Bạn không có quyền truy cập trang này', 'error');
        setTimeout(() => {
            window.location.href = './dangnhap.html';
        }, 2000);
        return;
    }
    document.getElementById('adminName').textContent = AuthManager.getUserName();
    loadAccountsData();
    setupDataSyncListeners();
    setupFilterListeners();

    smartRefresh.schedule('accounts', loadAccountsData, 5 * 60 * 1000, true);
});

window.addEventListener('beforeunload', () => {
    smartRefresh.stop('accounts');
});
//Xóa listener cũ
function setupDataSyncListeners() {
    if (typeof DataSync === 'undefined') return;

    DataSync.on('account:created', () => {
        loadAccountsData();
        showNotification('Tài khoản mới đã được tạo', 'success');
    });

    DataSync.on('account:updated', () => {
        loadAccountsData();
    });

    DataSync.on('account:deleted', () => {
        loadAccountsData();
    });
}
//Theo dõi sự kiện nhân viên, tài khoản
function setupFilterListeners() {
    const searchEl = document.getElementById('searchAccount');
    const statusEl = document.getElementById('filterStatus');

    if (searchEl) {
        searchEl.addEventListener('keyup', debounce(applyFilters, 300));
    }
    if (statusEl) {
        statusEl.addEventListener('change', applyFilters);
    }
}
//tải danh sách nhân viên, phòng ban, tài khoản 
async function loadAccountsData() {
    try {
        const accountData = await AccountAPI.getAll();
        
        allAccounts = Array.isArray(accountData) ? accountData : [];
        pagination.reset();
        applyFilters();
    } catch (error) {
        showNotification('Lỗi: ' + error.message, 'error');
    }
}
//lọc nhân viên
function applyFilters() {
    const searchValue = document.getElementById('searchAccount')?.value?.toLowerCase() || '';
    const statusFilter = document.getElementById('filterStatus')?.value || '';

    let filtered = allAccounts;

    if (searchValue) {
        filtered = filtered.filter(acc => 
            (acc.username && acc.username.toLowerCase().includes(searchValue)) ||
            (acc.fullName && acc.fullName.toLowerCase().includes(searchValue)) ||
            (acc.email && acc.email.toLowerCase().includes(searchValue))
        );
    }

    if (statusFilter) {
        filtered = filtered.filter(acc => acc.status === statusFilter);
    }

    filteredAccounts = filtered;
    pagination.reset();
    renderAccountTable();
}
// vẽ bảng nhân viên
function renderAccountTable() {
    const tbody = document.getElementById('accountTable');
    
    if (!tbody) return;

    if (filteredAccounts.length === 0) {
        tbody.innerHTML = `<tr>
            <td colspan="9" style="text-align: center; padding: 2rem;">
                <i class="fas fa-inbox" style="font-size: 2rem; opacity: 0.3;"></i>
                <p style="color: #9ca3af; margin-top: 0.5rem;">Không có dữ liệu</p>
            </td>
        </tr>`;
        return;
    }

    const paginatedData = pagination.paginate(filteredAccounts);
    
    tbody.innerHTML = paginatedData.map(acc => {
        const id = escapeHtml(acc._id || '');
        const username = escapeHtml(acc.username || '-');
        const fullName = escapeHtml(acc.fullName || '-');
        const email = escapeHtml(acc.email || '-');
        const phone = escapeHtml(acc.phone || '-');
        const department = escapeHtml(acc.department || '-');
        const roleDisplay = getRoleDisplay(acc.role);
        const createdDate = acc.createdAt ? new Date(acc.createdAt).toLocaleDateString('vi-VN') : '-';
        const status = acc.status || 'active';

        return `<tr>
            <td style="font-weight: 600; color: #111827;">${username}</td>
            <td>${fullName}</td>
            <td>${email}</td>
            <td>${phone}</td>
            <td>${department}</td>
            <td>${roleDisplay}</td>
            <td>${createdDate}</td>
            <td>${getStatusBadge(status)}</td>
            <td>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn-icon" onclick="openEditModal('${id}')" style="background: #fef3c7; color: #92400e; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer;" title="Sửa">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon" onclick="openResetPasswordModal('${id}')" style="background: #dbeafe; color: #0284c7; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer;" title="Reset mật khẩu">
                        <i class="fas fa-key"></i>
                    </button>
                    <button class="btn-icon" onclick="deleteAccount('${id}')" style="background: #fee2e2; color: #7f1d1d; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer;" title="Xóa">
                        <i class="fas fa-trash"></i>
                    </button>
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

// lấy vai trò
function getRoleDisplay(role) {
    const ROLE_TYPES = {
        employee: 'Nhân Viên',
        department_head: 'Trưởng Phòng',
        vice_head: 'Phó Phòng',
        auditor: 'Kiểm Toán',
        admin: 'Admin'
    };

    const roleText = ROLE_TYPES[role] || role || 'Chưa xác định';
    
    const roleColors = {
        department_head: { bg: '#dcfce7', color: '#15803d' },
        vice_head: { bg: '#fef3c7', color: '#92400e' },
        auditor: { bg: '#dbeafe', color: '#0284c7' },
        employee: { bg: '#f3f4f6', color: '#374151' },
        admin: { bg: '#e0e7ff', color: '#4338ca' }
    };
    
    const roleColor = roleColors[role] || roleColors.employee;

    return `<span style="background: ${roleColor.bg}; color: ${roleColor.color}; padding: 0.375rem 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; font-weight: 500;">${roleText}</span>`;
}

// mở modal chỉnh sửa
function openEditModal(accountId) {
    const account = allAccounts.find(a => a._id === accountId);
    if (!account) {
        showNotification('Không tìm thấy tài khoản', 'error');
        return;
    }

    currentEditId = accountId;
    
    document.getElementById('editAccountId').value = account._id;
    document.getElementById('editUsername').value = account.username || '';
    document.getElementById('editFullName').value = account.fullName || '';
    document.getElementById('editEmail').value = account.email || '';
    document.getElementById('editPhone').value = account.phone || '';
    document.getElementById('editAddress').value = account.address || '';
    document.getElementById('editDepartment').value = account.department || '';
    document.getElementById('editStatus').value = account.status || 'active';

    const modal = document.getElementById('editAccountModal');
    if (modal) modal.classList.add('show');
}
function closeEditModal() {
    const modal = document.getElementById('editAccountModal');
    if (modal) modal.classList.remove('show');
    currentEditId = null;
}
async function saveEditAccount() {
    try {
        const accountId = document.getElementById('editAccountId')?.value;
        const fullName = document.getElementById('editFullName')?.value?.trim();
        const email = document.getElementById('editEmail')?.value?.trim();
        const phone = document.getElementById('editPhone')?.value?.trim();
        const address = document.getElementById('editAddress')?.value?.trim();
        const department = document.getElementById('editDepartment')?.value?.trim();
        const status = document.getElementById('editStatus')?.value;

        if (!fullName || !email) {
            showNotification('Vui lòng điền tất cả các trường bắt buộc', 'warning');
            return;
        }

        if (!validateEmail(email)) {
            showNotification('Email không hợp lệ', 'warning');
            return;
        }

        const currentAccount = allAccounts.find(a => a._id === accountId);
        const oldDepartment = currentAccount?.department;

        if (department !== oldDepartment) {
            showNotification(
                'Cảnh báo: Department chỉ được cập nhật từ quản lý Phòng Ban!\nThay đổi department đã bị hủy.',
                'warning'
            );
            document.getElementById('editDepartment').value = oldDepartment || '';
            return;
        }

        // ✅ FIX: Đảm bảo role và status được giữ
        const accountData = {
            username: currentAccount.username,
            fullName,
            email,
            phone,
            address,
            department: oldDepartment,
            role: currentAccount.role || 'employee',
            status: status || 'active'
        };

        await AccountAPI.update(accountId, accountData);
        
        showNotification('Cập nhật tài khoản thành công', 'success');
        closeEditModal();
        await loadAccountsData();
    } catch (error) {
        console.error('Lỗi lưu:', error);
        showNotification('Lỗi: ' + error.message, 'error');
    }
}
//mở modal tài khoản
function openAccountModal() {
    currentEditId = null;
    
    document.getElementById('modalUsername').value = '';
    document.getElementById('modalPassword').value = '';
    document.getElementById('modalConfirmPassword').value = '';
    document.getElementById('modalFullName').value = '';
    document.getElementById('modalEmail').value = '';
    document.getElementById('modalPhone').value = '';
    document.getElementById('modalAddress').value = '';

    const modal = document.getElementById('accountModal');
    if (modal) modal.classList.add('show');
}
function closeAccountModal() {
    const modal = document.getElementById('accountModal');
    if (modal) modal.classList.remove('show');
    currentEditId = null;
}
//lưu tài khoản
async function saveAccount() {
    try {
        const username = document.getElementById('modalUsername')?.value?.trim();
        const password = document.getElementById('modalPassword')?.value;
        const confirmPassword = document.getElementById('modalConfirmPassword')?.value;
        const fullName = document.getElementById('modalFullName')?.value?.trim();
        const email = document.getElementById('modalEmail')?.value?.trim();
        const phone = document.getElementById('modalPhone')?.value?.trim();
        const address = document.getElementById('modalAddress')?.value?.trim();

        if (!username || !password || !confirmPassword || !fullName || !email || !phone || !address) {
            showNotification('Vui lòng điền tất cả các trường bắt buộc', 'warning');
            return;
        }

        if (password !== confirmPassword) {
            showNotification('Mật khẩu không khớp', 'warning');
            return;
        }

        if (password.length < 8) {
            showNotification('Mật khẩu phải có ít nhất 8 ký tự', 'warning');
            return;
        }

        if (!validateEmail(email)) {
            showNotification('Email không hợp lệ', 'warning');
            return;
        }

        const existingUser = allAccounts.find(a => a.username === username);
        if (existingUser) {
            showNotification('Tên đăng nhập đã tồn tại', 'warning');
            return;
        }

        // ✅ FIX: LUÔN Tạo Với status = 'active'
        const accountData = {
            username,
            password,
            fullName,
            email,
            phone,
            address,
            role: 'employee',
            status: 'active',
            department: 'Chưa phân phòng ban'
        };

        await AccountAPI.create(accountData);
        
        showNotification('Tạo tài khoản thành công', 'success');
        closeAccountModal();
        await loadAccountsData();
    } catch (error) {
        console.error('❌ Error saving account:', error);
        showNotification('Lỗi: ' + error.message, 'error');
    }
}
//mở modal đổi mật khẩu
function openResetPasswordModal(accountId) {
    const account = allAccounts.find(a => a._id === accountId);
    if (!account) {
        showNotification('Không tìm thấy tài khoản', 'error');
        return;
    }

    document.getElementById('resetAccountId').value = accountId;
    document.getElementById('resetFullName').value = account.fullName || '';
    document.getElementById('resetNewPassword').value = '';
    document.getElementById('resetConfirmPassword').value = '';

    const modal = document.getElementById('resetPasswordModal');
    if (modal) modal.classList.add('show');
}
function closeResetPasswordModal() {
    const modal = document.getElementById('resetPasswordModal');
    if (modal) modal.classList.remove('show');
}
//Gửi mật khẩu mới
async function submitResetPassword() {
    try {
        const accountId = document.getElementById('resetAccountId')?.value;
        const newPassword = document.getElementById('resetNewPassword')?.value;
        const confirmPassword = document.getElementById('resetConfirmPassword')?.value;

        if (!newPassword || !confirmPassword) {
            showNotification('Vui lòng nhập mật khẩu', 'warning');
            return;
        }

        if (newPassword !== confirmPassword) {
            showNotification('Mật khẩu không khớp', 'warning');
            return;
        }

        if (newPassword.length < 8) {
            showNotification('Mật khẩu phải có ít nhất 8 ký tự', 'warning');
            return;
        }

        const account = allAccounts.find(a => a._id === accountId);
        if (!account) {
            showNotification('Không tìm thấy tài khoản', 'error');
            return;
        }

        // ✅ FIX: Đảm bảo status = 'active' khi reset password
        const updatePayload = {
            username: account.username,
            fullName: account.fullName,
            email: account.email,
            phone: account.phone || '',
            address: account.address || '',
            department: account.department || '',
            role: account.role || 'employee',
            password: newPassword,
            status: 'active'
        };

        await AccountAPI.update(accountId, updatePayload);
        
        showNotification('Reset mật khẩu thành công', 'success');
        closeResetPasswordModal();
        await loadAccountsData();
    } catch (error) {
        console.error('❌ Error resetting password:', error);
        showNotification('Lỗi: ' + error.message, 'error');
    }
}
//xóa tài khoản
async function deleteAccount(accountId) {
    const account = allAccounts.find(a => a._id === accountId);
    if (!account) {
        showNotification('Không tìm thấy tài khoản', 'error');
        return;
    }

    if (!await showCustomConfirm(`Bạn có chắc chắn muốn xóa tài khoản "${escapeHtml(account.username)}"?`)) {
        return;
    }

    try {
        await AccountAPI.delete(accountId);
        showNotification('Xóa tài khoản thành công', 'success');
        await loadAccountsData();
    } catch (error) {
        console.error('❌ Error deleting account:', error);
        showNotification('Lỗi: ' + error.message, 'error');
    }
}

window.addEventListener('click', function(e) {
    const accountModal = document.getElementById('accountModal');
    const editModal = document.getElementById('editAccountModal');
    const resetModal = document.getElementById('resetPasswordModal');
    
    if (e.target === accountModal) {
        closeAccountModal();
    }
    if (e.target === editModal) {
        closeEditModal();
    }
    if (e.target === resetModal) {
        closeResetPasswordModal();
    }
});