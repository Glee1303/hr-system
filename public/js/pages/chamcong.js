(function () {
    const publicPages = ['dangnhap.html', 'index.html', ''];
    const currentPath = window.location.pathname.split('/').pop();
    if (!publicPages.includes(currentPath)) {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token) window.location.replace('dangnhap.html');
    }
})();

let dataSyncUnsubscribes = [];//mảng lưu trữ các hàm dừng theo dõi
let allAttendance = [];// mảng chứa dữ liệu chấm công (chứa toàn bộ bản ghi)
let filteredAttendance = [];// Mảng chứa các bản ghi phù hợp với tiêu chí tìm kiếm
let allEmployees = [];// Mảng lưu toàn bộ danh sách nhân viên
let allAccounts = [];//Mảng lưu dánh sách tất cả taikhoan
const pagination = new PaginationHelper(50);//hỗ trợ việc phân trang

document.addEventListener('DOMContentLoaded', function () {
    if (!AuthManager.checkAuth()) return; // kiểm tra đăng nhập

    document.getElementById('adminName').textContent = AuthManager.getUserName();
    loadDashboardData();// tải dữ liệu 
    setupDataSyncListeners();// Theo dõi thay đổi dữ liệu
    setupFilterListeners();// Bộ lọc dữ liệu
    // setupModalCloseListeners(); // Removed for inline forms

    smartRefresh.schedule('attendance', loadDashboardData, 5 * 60 * 1000, true);
});
//Xóa listener cũ trước khi thêm mới
function cleanupDataSyncListeners() {
    dataSyncUnsubscribes.forEach(unsub => {
        if (typeof unsub === 'function') unsub();
    });
    dataSyncUnsubscribes = [];
}

window.addEventListener('beforeunload', () => {
    smartRefresh.stop('attendance');
    cleanupDataSyncListeners();
});

// Theo dõi cập nhật dữ liệu (tạo,cập nhật xóa chấm công)
function setupDataSyncListeners() {
    if (typeof DataSync === 'undefined') return;

    cleanupDataSyncListeners();

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
        DataSync.on('attendance:deleted', (payload) => {
            loadDashboardData();
        })
    );

    dataSyncUnsubscribes.push(
        DataSync.on('employee:created', (payload) => {
            showNotification(`${payload.employeeName} thêm vào hệ thống`, 'info');
        })
    );
}
//Thiết lập sự kiện lọc theo ngày, phòng ban, trạng thái
function setupFilterListeners() {
    const filterDate = document.getElementById('filterDate');
    const filterDept = document.getElementById('filterDepartment');
    const filterStatus = document.getElementById('filterStatus');

    if (filterDate) {
        filterDate.value = new Date().toISOString().split('T')[0];
        filterDate.addEventListener('change', applyFilters);
    }
    if (filterDept) filterDept.addEventListener('change', applyFilters);
    if (filterStatus) filterStatus.addEventListener('change', applyFilters);
}
//Kiểm tra ngày có phải chủ nhật không
function isSunday(date) {
    const d = new Date(date);
    return d.getDay() === 0;
}
// Lấy dãy ngày làm việc (trừ chủ nhật)
function getWorkdayRange(startDate, endDate) {
    const workdays = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
        if (!isSunday(current)) {
            workdays.push(new Date(current).toISOString().split('T')[0]);
        }
        current.setDate(current.getDate() + 1);
    }

    return workdays;
}
// Tự động tạo bản ghi vắng mặt cho những ngày không chấm công
async function autoFillAbsentRecords(allEmployees) {
    try {
        const today = new Date();
        const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        const workdays = getWorkdayRange(thirtyDaysAgo, today);

        for (const employee of allEmployees) {
            for (const workday of workdays) {
                // Kiểm tra đã có bản ghi chấm công hay chưa
                const existingRecord = allAttendance.find(r =>
                    (r.employeeId === employee._id ||
                        (r.name && r.name.toLowerCase() === employee.name.toLowerCase())) &&
                    r.date && new Date(r.date).toISOString().split('T')[0] === workday
                );

                if (!existingRecord) {
                    // Tạo bản ghi vắng mặt tự động
                    try {
                        await AttendanceAPI.create({
                            employeeId: employee._id,
                            name: employee.name,
                            department: employee.department,
                            date: new Date(workday),
                            checkIn: null,
                            checkOut: null,
                            totalHours: 0,
                            attendanceStatus: 'absent',
                            approvalStatus: 'auto_absent',
                            note: 'Tự động đánh dấu vắng mặt',
                            createdAt: new Date().toISOString()
                        });
                    } catch (error) { }
                }
            }
        }
    } catch (error) { }
}
//Tải dữ liệu chấm công, nhân viên, tài khoản
async function loadDashboardData() {
    try {
        const [attendanceData, employeeData, accountData] = await Promise.all([
            AttendanceAPI.getAll(),
            EmployeeAPI.getAll(),
            AccountAPI.getAll()
        ]);

        allAttendance = Array.isArray(attendanceData) ? attendanceData : [];
        allEmployees = Array.isArray(employeeData) ? employeeData : [];
        allAccounts = Array.isArray(accountData) ? accountData : [];

        // Tự điền vắng mặt
        await autoFillAbsentRecords(allEmployees);

        // Tải lại dữ liệu sau khi tự động điền
        const updatedAttendanceData = await AttendanceAPI.getAll();
        allAttendance = Array.isArray(updatedAttendanceData) ? updatedAttendanceData : [];

        allAttendance = allAttendance.map(attendance => {
            // Bỏ qua các bản ghi của chủ nhật
            if (isSunday(attendance.date)) {
                return null;
            }

            let account = allAccounts.find(a =>
                (attendance.employeeId && a._id === attendance.employeeId) ||
                (attendance.name && a.fullName && a.fullName.toLowerCase() === attendance.name.toLowerCase()) ||
                (attendance.email && a.email && a.email.toLowerCase() === attendance.email.toLowerCase())
            );

            let employee = allEmployees.find(e =>
                (attendance.employeeId && e._id === attendance.employeeId) ||
                (attendance.name && e.name && e.name.toLowerCase() === attendance.name.toLowerCase())
            );

            const department = account?.department || employee?.department || attendance.department || 'Chưa cập nhật';

            return {
                ...attendance,
                accountId: account?._id,
                department: department,
                fullName: account?.fullName || attendance.name || '-'
            };
        }).filter(r => r !== null); // Loại bỏ các bản ghi chủ nhật

        const filterDate = document.getElementById('filterDate');
        if (filterDate && !filterDate.value) {
            filterDate.value = new Date().toISOString().split('T')[0];
        }

        applyFilters();
    } catch (error) {
        showNotification('Lỗi: ' + error.message, 'error');
    }
}
//Lọc dữ liệu theo ngày, phòng ban, trạng thái
function applyFilters() {
    const dateFilter = document.getElementById('filterDate')?.value || '';
    const deptFilter = document.getElementById('filterDepartment')?.value || '';
    const statusFilter = document.getElementById('filterStatus')?.value || '';

    let filtered = allAttendance;

    if (dateFilter) {
        // Không lọc nếu ngày đó là chủ nhật
        if (!isSunday(dateFilter)) {
            filtered = filtered.filter(r => {
                if (!r.date) return false;
                const recordDate = new Date(r.date).toISOString().split('T')[0];
                return recordDate === dateFilter;
            });
        } else {
            filtered = [];
        }
    }

    if (deptFilter) {
        filtered = filtered.filter(r => r.department === deptFilter);
    }

    if (statusFilter) {
        filtered = filtered.filter(r => {
            let attendanceStatus = r.attendanceStatus || 'absent';
            if (r.checkIn && !r.attendanceStatus) {
                attendanceStatus = r.checkIn <= '08:00' ? 'present' : 'late';
            }

            return attendanceStatus === statusFilter || r.approvalStatus === statusFilter;
        });
    }

    const page = pagination.paginate(filtered);
    renderAttendanceTable(page);

    const info = pagination.getInfo();
    renderPaginationUI('pagination-container', info);
}
//Vẽ bảng chấm công
function renderCurrentPage(data) {
    renderAttendanceTable(data);
}
//Mở modal xem chi tiết chấm công
function renderAttendanceTable(data) {
    const tbody = document.getElementById('attendanceTable');

    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr>
            <td colspan="9" style="text-align: center; padding: 2rem;">
                <i class="fas fa-inbox" style="font-size: 2rem; opacity: 0.3;"></i>
                <p style="color: #9ca3af; margin-top: 0.5rem;">Không có dữ liệu</p>
            </td>
        </tr>`;
        return;
    }

    tbody.innerHTML = data.map(record => {
        const id = escapeHtml(record._id || '');
        const name = escapeHtml(record.fullName || record.name || '-');
        const dept = escapeHtml(record.department || 'Chưa cập nhật');
        const date = formatDate(record.date);
        const checkIn = escapeHtml(record.checkIn || '-');
        const checkOut = escapeHtml(record.checkOut || '-');
        const hours = escapeHtml(record.totalHours || '-');

        let attendanceStatus = record.attendanceStatus || 'absent';
        if (record.checkIn && !record.attendanceStatus) {
            attendanceStatus = record.checkIn <= '08:00' ? 'present' : 'late';
        }

        const approvalStatus = record.approvalStatus || 'pending';
        const isPending = approvalStatus === 'pending' || approvalStatus === 'auto_absent';

        return `<tr id="row-${id}">
            <td style="font-weight: 600; color: #111827;">${name}</td>
            <td>${dept}</td>
            <td>${date}</td>
            <td>${checkIn}</td>
            <td>${checkOut}</td>
            <td>${hours}</td>
            <td>
                <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                    ${getAttendanceStatusBadge(attendanceStatus)}
                    ${getApprovalStatusBadge(approvalStatus)}
                </div>
            </td>
            <td style="text-align: right;">
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn-icon" onclick="toggleViewAttendanceInline('${id}')" style="background: #dbeafe; color: #1e40af; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer;" title="Xem chi tiết">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${isPending ? `
                    <button class="btn-icon" onclick="toggleApprovalAttendanceInline('${id}')" style="background: #fef3c7; color: #92400e; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer;" title="Duyệt">
                        <i class="fas fa-check"></i>
                    </button>
                    ` : ''}
                    <button class="btn-icon" onclick="toggleEditAttendanceInline('${id}')" style="background: #e0e7ff; color: #4338ca; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer;" title="Chỉnh sửa">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon" onclick="deleteAttendance('${id}')" style="background: #fee2e2; color: #7f1d1d; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer;" title="Xóa">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
        <tr id="expansion-${id}" style="display: none;">
            <td colspan="8" style="padding: 0; border: none;">
                <div id="expansion-content-${id}" class="expansion-content" style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 1.5rem;">
                </div>
            </td>
        </tr>`;
    }).join('');
}
// ================= INLINE FORMS HELPERS ======================
function closeAllExpansions() {
    document.querySelectorAll('[id^="expansion-"]').forEach(el => el.style.display = 'none');
}

function toggleExpansion(id, contentHtml) {
    const expansionRow = document.getElementById(`expansion-${id}`);
    const contentDiv = document.getElementById(`expansion-content-${id}`);

    if (expansionRow && expansionRow.style.display === 'table-row' && contentDiv.innerHTML.includes(contentHtml.substring(0, 50))) {
        expansionRow.style.display = 'none';
    } else if (expansionRow) {
        closeAllExpansions();
        contentDiv.innerHTML = contentHtml;
        expansionRow.style.display = 'table-row';
    }
}

//Mở Modal Xem
function toggleViewAttendanceInline(attendanceId) {
    const record = allAttendance.find(r => r._id === attendanceId);
    if (!record) {
        showNotification('Không tìm thấy bản ghi', 'error');
        return;
    }

    let attendanceStatus = record.attendanceStatus || 'absent';
    if (record.checkIn && !record.attendanceStatus) {
        attendanceStatus = record.checkIn <= '08:00' ? 'present' : 'late';
    }

    const html = `
        <div class="form-section">
            <div class="form-section-title">
                <i class="fas fa-info-circle"></i>
                <span>Chi Tiết Chấm Công</span>
                <button onclick="closeAllExpansions()" style="margin-left: auto; background: none; border: none; color: #94a3b8; cursor: pointer;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="form-grid">
                <div class="portal-form-group">
                    <label>Nhân viên</label>
                    <div style="font-weight:600; font-size: 1.1rem; color: #1e293b;">${escapeHtml(record.fullName || record.name || '-')}</div>
                </div>
                <div class="portal-form-group">
                    <label>Phòng ban</label>
                    <div style="font-weight:500;">${escapeHtml(record.department || '-')}</div>
                </div>
                <div class="portal-form-group">
                    <label>Ngày làm việc</label>
                    <div style="font-weight:500;">${formatDate(record.date)}</div>
                </div>
            </div>
        </div>

        <div class="form-section" style="background: #f8fafc; padding: 1.5rem; border-radius: 1rem; border: 1px solid #e2e8f0;">
            <div class="form-grid">
                <div class="portal-form-group">
                    <label>Giờ vào</label>
                    <div style="font-weight:700; color: #059669; font-size: 1.25rem;">${escapeHtml(record.checkIn || '-')}</div>
                </div>
                <div class="portal-form-group">
                    <label>Giờ ra</label>
                    <div style="font-weight:700; color: #059669; font-size: 1.25rem;">${escapeHtml(record.checkOut || '-')}</div>
                </div>
                <div class="portal-form-group">
                    <label>Tổng giờ công</label>
                    <div style="font-weight:700; color: #2563eb; font-size: 1.25rem;">${escapeHtml(record.totalHours || '-')}</div>
                </div>
                <div class="portal-form-group">
                    <label>Trạng thái</label>
                    <div style="margin-top: 0.25rem;">${getAttendanceStatusBadge(attendanceStatus)}</div>
                </div>
            </div>
            <div class="portal-form-group" style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px dashed #cbd5e1;">
                <label>Ghi chú từ nhân viên</label>
                <div style="font-style: italic; color: #475569;">${escapeHtml(record.note || 'Không có ghi chú')}</div>
            </div>
        </div>
    `;

    toggleExpansion(attendanceId, html);
}

//Duyệt chấm công Inline
function toggleApprovalAttendanceInline(attendanceId) {
    const record = allAttendance.find(r => r._id === attendanceId);
    if (!record) {
        showNotification('Không tìm thấy bản ghi', 'error');
        return;
    }

    const html = `
        <div class="form-section">
            <div class="form-section-title">
                <i class="fas fa-check-double"></i>
                <span>Phê Duyệt Chấm Công</span>
                <button onclick="closeAllExpansions()" style="margin-left: auto; background: none; border: none; color: #94a3b8; cursor: pointer;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="form-grid">
                <div class="portal-form-group">
                    <label>Nhân viên</label>
                    <div style="font-weight:600;">${escapeHtml(record.fullName || record.name || '-')}</div>
                </div>
                <div class="portal-form-group">
                    <label>Phòng ban</label>
                    <div>${escapeHtml(record.department || '-')}</div>
                </div>
                <div class="portal-form-group">
                    <label>Ngày / Thời gian</label>
                    <div style="font-weight:600;">${formatDate(record.date)} (${escapeHtml(record.checkIn || '-')} - ${escapeHtml(record.checkOut || '-')})</div>
                </div>
            </div>
        </div>

        <div class="form-section">
            <div class="portal-form-group">
                <label>Ghi chú phản hồi / Lý do (Nếu có)</label>
                <textarea id="inlineApprovalNote-${attendanceId}" class="portal-textarea" rows="2" placeholder="Nhập tin nhắn phản hồi cho nhân viên..."></textarea>
            </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 1rem; padding-top: 1.5rem; border-top: 1px solid #e2e8f0;">
            <button class="btn-secondary" onclick="closeAllExpansions()" style="min-width: 100px;">Hủy</button>
            <button class="btn-danger" style="background: #ef4444; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: var(--radius-md); font-weight: 600; cursor: pointer;" 
                onclick="submitAttendanceApprovalInline('${attendanceId}', 'rejected')">
                <i class="fas fa-times"></i> Từ Chối
            </button>
            <button class="btn-primary" onclick="submitAttendanceApprovalInline('${attendanceId}', 'approved')" style="min-width: 150px;">
                <i class="fas fa-check"></i> Duyệt Chấp Thuận
            </button>
        </div>
    `;

    toggleExpansion(attendanceId, html);
}

async function submitAttendanceApprovalInline(attendanceId, decision) {
    try {
        const note = document.getElementById(`inlineApprovalNote-${attendanceId}`)?.value;

        await AttendanceAPI.update(attendanceId, {
            approvalStatus: decision,
            approvalNote: note || '',
            approvedBy: AuthManager.getUserName(),
            approvedAt: new Date().toISOString()
        });

        showNotification('Đã lưu phản hồi duyệt chấm công', 'success');
        closeAllExpansions();
        loadDashboardData();
    } catch (error) {
        showNotification('Lỗi: ' + error.message, 'error');
    }
}

//Chỉnh sửa chấm công Inline
function toggleEditAttendanceInline(attendanceId) {
    const record = allAttendance.find(r => r._id === attendanceId);
    if (!record) {
        showNotification('Không tìm thấy bản ghi', 'error');
        return;
    }

    const isoDate = record.date ? new Date(record.date).toISOString().split('T')[0] : '';

    const html = `
        <div class="form-section">
            <div class="form-section-title">
                <i class="fas fa-edit"></i>
                <span>Chỉnh Sửa Chấm Công</span>
                <button onclick="closeAllExpansions()" style="margin-left: auto; background: none; border: none; color: #94a3b8; cursor: pointer;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="portal-form-group" style="margin-bottom: 1.5rem;">
                <label>Nhân viên</label>
                <div style="font-weight:700; color: #1e293b;">${escapeHtml(record.fullName || record.name || '-')}</div>
            </div>
            <div class="form-grid">
                <div class="portal-form-group">
                    <label>Ngày</label>
                    <input type="date" id="inlineEditDate-${attendanceId}" class="portal-input" value="${isoDate}">
                </div>
                <div class="portal-form-group">
                    <label>Giờ vào</label>
                    <input type="time" id="inlineEditCheckIn-${attendanceId}" class="portal-input" value="${record.checkIn || ''}">
                </div>
                <div class="portal-form-group">
                    <label>Giờ ra</label>
                    <input type="time" id="inlineEditCheckOut-${attendanceId}" class="portal-input" value="${record.checkOut || ''}">
                </div>
            </div>
            <div class="portal-form-group" style="margin-top: 1.5rem;">
                <label>Lý do thay đổi / Ghi chú</label>
                <textarea id="inlineEditNote-${attendanceId}" class="portal-textarea" rows="2" placeholder="Nhập lý do điều chỉnh dữ liệu...">${record.note || ''}</textarea>
            </div>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 1rem; padding-top: 1.5rem; border-top: 1px solid #e2e8f0;">
            <button class="btn-secondary" onclick="closeAllExpansions()" style="min-width: 120px;">Hủy bỏ</button>
            <button class="btn-primary" onclick="saveEditAttendanceInline('${attendanceId}')" style="min-width: 160px;">
                <i class="fas fa-save"></i> Cập nhật dữ liệu
            </button>
        </div>
    `;

    toggleExpansion(attendanceId, html);
}

async function saveEditAttendanceInline(attendanceId) {
    try {
        const date = document.getElementById(`inlineEditDate-${attendanceId}`)?.value;
        const checkIn = document.getElementById(`inlineEditCheckIn-${attendanceId}`)?.value;
        const checkOut = document.getElementById(`inlineEditCheckOut-${attendanceId}`)?.value;
        const note = document.getElementById(`inlineEditNote-${attendanceId}`)?.value;

        if (!date || !checkIn) {
            showNotification('Vui lòng nhập ngày và giờ vào', 'warning');
            return;
        }

        let attendanceStatus = 'absent';
        if (checkIn) {
            attendanceStatus = checkIn <= '08:00' ? 'present' : 'late';
        }

        await AttendanceAPI.update(attendanceId, {
            date: new Date(date),
            checkIn,
            checkOut: checkOut || '',
            attendanceStatus: attendanceStatus,
            note: note || ''
        });

        showNotification('Cập nhật chấm công thành công', 'success');
        closeAllExpansions();
        loadDashboardData();
    } catch (error) {
        showNotification('Lỗi: ' + error.message, 'error');
    }
}
//Xóa bảng ghi chấm công
async function deleteAttendance(attendanceId) {
    if (!await showCustomConfirm('Bạn có chắc chắn muốn xóa bản ghi chấm công này?')) return;
    try {
        await AttendanceAPI.delete(attendanceId);
        showNotification('Đã xóa chấm công thành công', 'success');
        loadDashboardData();
    } catch (error) {
        showNotification('Lỗi: ' + error.message, 'error');
    }
}

// old event handlers for modals removed