(function () {
    const publicPages = ['dangnhap.html', 'index.html', ''];
    const currentPath = window.location.pathname.split('/').pop();
    if (!publicPages.includes(currentPath)) {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token) window.location.replace('dangnhap.html');
    }
})();

let allLeaves = [];
let dataSyncUnsubscribes = [];
let filteredLeaves = [];
let allEmployees = [];
let allAccounts = [];
const pagination = new PaginationHelper(50);

document.addEventListener('DOMContentLoaded', function () {
    if (!AuthManager.checkAuth()) return;

    document.getElementById('adminName').textContent = AuthManager.getUserName();
    loadDashboardData();
    setupDataSyncListeners();
    setupFilterListeners();
    smartRefresh.schedule('leave', loadDashboardData, 5 * 60 * 1000, true);

    console.log('nghiphep.js loaded');
});

window.addEventListener('beforeunload', () => {
    smartRefresh.stop('leave');
});
//theo dõi nghỉ phép của nhân viên
function setupDataSyncListeners() {
    if (typeof DataSync === 'undefined') return;
    cleanupDataSyncListeners();
    dataSyncUnsubscribes.push(
        DataSync.on('leave:created', (payload) => {
            console.log('Leave created:', payload);
            loadDashboardData();
        })
    );

    dataSyncUnsubscribes.push(
        DataSync.on('leave:updated', (payload) => {
            console.log('Leave updated:', payload);
            loadDashboardData();
        })
    );

    dataSyncUnsubscribes.push(
        DataSync.on('leave:deleted', (payload) => {
            console.log('Leave deleted:', payload);
            loadDashboardData();
        })
    );

    dataSyncUnsubscribes.push(
        DataSync.on('employee:created', (payload) => {
            console.log('New employee:', payload);
            showNotification(`${payload.employeeName} thêm vào hệ thống`, 'info');
        })
    );
}
//Xóa listener cũ
function cleanupDataSyncListeners() {
    dataSyncUnsubscribes.forEach(unsub => {
        if (typeof unsub === 'function') unsub();
    });
    dataSyncUnsubscribes = [];
}
//lọc nghỉ (trạng thái, loại nghỉ,tìm kiếm)
function setupFilterListeners() {
    const filterStatus = document.getElementById('filterStatus');
    const filterType = document.getElementById('filterType');
    const searchLeave = document.getElementById('searchLeave');

    if (filterStatus) filterStatus.addEventListener('change', applyFilters);
    if (filterType) filterType.addEventListener('change', applyFilters);
    if (searchLeave) searchLeave.addEventListener('keyup', debounceSearch(applyFilters, 300));
}
//Tải dữ liệu nghỉ phép
async function loadDashboardData() {
    try {
        const [leaveData, employeeData, accountData] = await Promise.all([
            LeaveAPI.getAll(),
            EmployeeAPI.getAll(),
            AccountAPI.getAll()
        ]);

        allLeaves = Array.isArray(leaveData) ? leaveData : [];
        allEmployees = Array.isArray(employeeData) ? employeeData : [];
        allAccounts = Array.isArray(accountData) ? accountData : [];

        // Enriched leave data with account & employee info
        allLeaves = allLeaves.map(leave => {
            // Find matching account by name, email, or employeeId
            let account = allAccounts.find(a =>
                (leave.employeeId && a._id === leave.employeeId) ||
                (leave.name && a.fullName && a.fullName.toLowerCase() === leave.name.toLowerCase()) ||
                (leave.email && a.email && a.email.toLowerCase() === leave.email.toLowerCase())
            );

            // Find matching employee
            let employee = allEmployees.find(e =>
                (leave.employeeId && e._id === leave.employeeId) ||
                (leave.name && e.name && e.name.toLowerCase() === leave.name.toLowerCase())
            );

            // Get department from account first, then employee
            const department = account?.department || employee?.department || leave.department || 'Chưa cập nhật';

            return {
                ...leave,
                accountId: account?._id,
                department: department,
                fullName: account?.fullName || leave.name || '-',
                availableLeave: employee?.availableLeave || 0
            };
        });

        applyFilters();
    } catch (error) {
        console.error('Error:', error);
        showNotification('Lỗi: ' + error.message, 'error');
    }
}
//lọc và phân trang dữ liệu
function applyFilters() {
    const statusFilter = document.getElementById('filterStatus')?.value || '';
    const typeFilter = document.getElementById('filterType')?.value || '';
    const searchValue = document.getElementById('searchLeave')?.value?.toLowerCase() || '';

    // lọc
    let result = allLeaves.filter(leave => {
        const matchStatus = !statusFilter || leave.status === statusFilter;
        const matchType = !typeFilter || leave.type === typeFilter;
        const matchSearch = !searchValue ||
            (leave.fullName && leave.fullName.toLowerCase().includes(searchValue)) ||
            (leave.name && leave.name.toLowerCase().includes(searchValue)) ||
            (leave.reason && leave.reason.toLowerCase().includes(searchValue));

        return matchStatus && matchType && matchSearch;
    });

    // Paginate
    const page = pagination.paginate(result);

    renderLeaveTable(page);

    // Show pagination UI
    const info = pagination.getInfo();
    renderPaginationUI('pagination-container', info);
}

// Wrapper function for pagination
function renderCurrentPage(data) {
    renderLeaveTable(data);
}
//vẽ bảng nghỉ phép
function renderLeaveTable(data) {
    const tbody = document.getElementById('leaveTable');

    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr>
            <td colspan="9" style="text-align: center; padding: 2rem;">
                <i class="fas fa-inbox" style="font-size: 2rem; opacity: 0.3;"></i>
                <p style="color: #9ca3af;">Không có dữ liệu</p>
            </td>
        </tr>`;
        return;
    }

    tbody.innerHTML = data.map(leave => {
        const id = escapeHtml(leave._id || '');
        const name = escapeHtml(leave.fullName || leave.name || '-');
        const dept = escapeHtml(leave.department || 'Chưa cập nhật');
        const type = getLeaveTypeBadge(leave.type);
        const fromDate = formatDate(leave.fromDate || leave.startDate);
        const toDate = formatDate(leave.toDate || leave.endDate);
        const days = leave.numberOfDays || leave.days || 0;
        const available = leave.availableLeave || 0;
        const status = leave.status || 'pending';
        const isPending = status === 'pending';

        return `<tr id="row-${id}">
            <td style="font-weight: 600; color: #111827;">
                <div style="display: flex; flex-direction: column;">
                    <span>${name}</span>
                    <span style="font-size: 0.75rem; color: #64748b; font-weight: normal;">${dept}</span>
                </div>
            </td>
            <td>${type}</td>
            <td>
                <div style="display: flex; flex-direction: column;">
                    <span>${fromDate}</span>
                    <span style="font-size: 0.75rem; color: #64748b;">đến ${toDate}</span>
                </div>
            </td>
            <td>
                <div style="display: flex; flex-direction: column;">
                    <span>${days} ngày</span>
                    <span style="font-size: 0.75rem; color: #64748b;">(Còn: ${available})</span>
                </div>
            </td>
            <td>${getApprovalStatusBadge(status)}</td>
            <td>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn-icon" onclick="toggleViewLeaveInline('${id}')" style="background: #dbeafe; color: #1e40af; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer;">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${isPending ? `
                    <button class="btn-icon" onclick="toggleApprovalInline('${id}')" style="background: #fef3c7; color: #92400e; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer;">
                        <i class="fas fa-check"></i>
                    </button>
                    ` : ''}
                    <button class="btn-icon" onclick="deleteLeave('${id}')" style="background: #fee2e2; color: #7f1d1d; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
        <tr id="expansion-${id}" style="display: none;">
            <td colspan="6" style="padding: 0; border: none;">
                <div id="expansion-content-${id}" class="expansion-content" style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 1.5rem;">
                </div>
            </td>
        </tr>`;
    }).join('');
}
// ==================== INLINE EXPANSION UTILS ====================
function closeAllExpansions() {
    document.querySelectorAll('[id^="expansion-"]').forEach(el => el.style.display = 'none');
}

function toggleExpansion(leaveId, contentHtml) {
    const expansionRow = document.getElementById(`expansion-${leaveId}`);
    const contentDiv = document.getElementById(`expansion-content-${leaveId}`);

    if (expansionRow && expansionRow.style.display === 'table-row' && contentDiv.innerHTML.includes(contentHtml.substring(0, 50))) {
        expansionRow.style.display = 'none';
    } else if (expansionRow) {
        closeAllExpansions();
        contentDiv.innerHTML = contentHtml;
        expansionRow.style.display = 'table-row';
    }
}

//xem chi tiết
function toggleViewLeaveInline(leaveId) {
    const leave = allLeaves.find(l => l._id === leaveId);
    if (!leave) {
        showNotification('Không tìm thấy', 'error');
        return;
    }

    const html = `
        <div class="form-section">
            <div class="form-section-title">
                <i class="fas fa-info-circle"></i>
                <span>Chi Tiết Đơn Nghỉ Phép</span>
                <button onclick="closeAllExpansions()" style="margin-left: auto; background: none; border: none; color: #94a3b8; cursor: pointer;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="form-grid">
                <div class="portal-form-group">
                    <label>Nhân viên</label>
                    <div style="font-weight:600; font-size: 1.1rem; color: #1e293b;">${escapeHtml(leave.fullName || leave.name || '-')}</div>
                </div>
                <div class="portal-form-group">
                    <label>Phòng ban</label>
                    <div style="font-weight:500;">${escapeHtml(leave.department || '-')}</div>
                </div>
                <div class="portal-form-group">
                    <label>Loại nghỉ phép</label>
                    <div style="margin-top: 0.25rem;">${getLeaveTypeBadge(leave.type)}</div>
                </div>
            </div>
        </div>

        <div class="form-section" style="background: #f8fafc; padding: 1.5rem; border-radius: 1rem; border: 1px solid #e2e8f0;">
            <div class="form-grid">
                <div class="portal-form-group">
                    <label>Từ ngày</label>
                    <div style="font-weight:600;">${formatDate(leave.fromDate || leave.startDate)}</div>
                </div>
                <div class="portal-form-group">
                    <label>Đến ngày</label>
                    <div style="font-weight:600;">${formatDate(leave.toDate || leave.endDate)}</div>
                </div>
                <div class="portal-form-group">
                    <label>Tổng số ngày nghỉ</label>
                    <div style="font-weight:700; color: #2563eb; font-size: 1.25rem;">${leave.numberOfDays || leave.days || 0} ngày</div>
                </div>
                <div class="portal-form-group">
                    <label>Trạng thái duyệt</label>
                    <div style="margin-top: 0.25rem;">${getApprovalStatusBadge(leave.status)}</div>
                </div>
            </div>
            <div class="portal-form-group" style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px dashed #cbd5e1;">
                <label>Lý do nghỉ phép</label>
                <div style="font-style: italic; color: #475569; padding: 0.75rem; background: white; border-radius: 0.5rem; border: 1px solid #f1f5f9;">
                    ${escapeHtml(leave.reason || 'Không có lý do chi tiết')}
                </div>
            </div>
            ${leave.note ? `
            <div class="portal-form-group" style="margin-top: 1rem;">
                <label>Phản hồi từ quản lý</label>
                <div style="color: #92400e; font-weight: 500;">${escapeHtml(leave.note)}</div>
            </div>` : ''}
        </div>
    `;

    toggleExpansion(leaveId, html);
}

//xem màn duyệt
function toggleApprovalInline(leaveId) {
    const leave = allLeaves.find(l => l._id === leaveId);
    if (!leave) {
        showNotification('Không tìm thấy', 'error');
        return;
    }

    const html = `
        <div class="form-section">
            <div class="form-section-title">
                <i class="fas fa-check-circle"></i>
                <span>Phê Duyệt Đơn Nghỉ Phép</span>
                <button onclick="closeAllExpansions()" style="margin-left: auto; background: none; border: none; color: #94a3b8; cursor: pointer;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="form-grid">
                <div class="portal-form-group">
                    <label>Nhân viên</label>
                    <div style="font-weight:600;">${escapeHtml(leave.fullName || leave.name || '-')}</div>
                </div>
                <div class="portal-form-group">
                    <label>Loại nghỉ</label>
                    <div style="margin-top:0.25rem;">${getLeaveTypeBadge(leave.type)}</div>
                </div>
                <div class="portal-form-group">
                    <label>Thời gian</label>
                    <div style="font-weight:600;">${formatDate(leave.fromDate || leave.startDate)} - ${formatDate(leave.toDate || leave.endDate)} (${leave.numberOfDays || leave.days || 0} ngày)</div>
                </div>
            </div>
            <div class="portal-form-group" style="margin-top: 1rem;">
                <label>Lý do nghỉ</label>
                <div style="font-style: italic; color: #475569;">${escapeHtml(leave.reason || '-')}</div>
            </div>
        </div>
        
        <div class="form-grid">
            <div class="portal-form-group">
                <label>Quyết định phê duyệt *</label>
                <select id="inlineApprovalDecision-${leaveId}" class="portal-select">
                    <option value="">-- Chọn trạng thái --</option>
                    <option value="approved">Đồng ý phê duyệt</option>
                    <option value="rejected">Từ chối đơn này</option>
                </select>
            </div>
            <div class="portal-form-group">
                <label>Ghi chú phản hồi (Nếu có)</label>
                <textarea id="inlineApprovalNote-${leaveId}" class="portal-textarea" rows="2" placeholder="Nhập lý do hoặc lời nhắn..."></textarea>
            </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 1rem; margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid #e2e8f0;">
            <button class="btn-secondary" onclick="closeAllExpansions()" style="min-width: 120px;">Hủy bỏ</button>
            <button class="btn-primary" onclick="submitLeaveApprovalInline('${leaveId}')" style="min-width: 160px;">
                <i class="fas fa-check"></i> Xác Nhận Kết Quả
            </button>
        </div>
    `;

    toggleExpansion(leaveId, html);
}
//Lưu quyết định
async function submitLeaveApprovalInline(leaveId) {
    try {
        const decision = document.getElementById(`inlineApprovalDecision-${leaveId}`)?.value;
        const note = document.getElementById(`inlineApprovalNote-${leaveId}`)?.value;

        if (!decision) {
            showNotification('Vui lòng chọn quyết định', 'warning');
            return;
        }

        await LeaveAPI.update(leaveId, {
            status: decision,
            note: note || ''
        });

        showNotification(`${decision === 'approved' ? 'Đã duyệt' : 'Đã từ chối'} đơn nghỉ phép`, 'success');
        closeAllExpansions();
        loadDashboardData();
    } catch (error) {
        console.error('Error:', error);
        showNotification('Lỗi: ' + error.message, 'error');
    }
}

async function deleteLeave(leaveId) {
    if (!confirm('Bạn có chắc chắn?')) return;

    try {
        await LeaveAPI.delete(leaveId);
        showNotification('Đã xóa', 'success');
        loadDashboardData();
    } catch (error) {
        console.error('Error:', error);
        showNotification('Lỗi: ' + error.message, 'error');
    }
}

// removed window.addEventListener for modals
window.addEventListener('beforeunload', () => {
    smartRefresh.stop('leave');
    cleanupDataSyncListeners();
});