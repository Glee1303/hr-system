document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    if (!AuthManager.isAuthenticated()) {
        window.location.href = 'dangnhap.html';
        return;
    }

    // Initialize UI
    UIComponents.init();

    // Load data
    await loadActivityLogs();
});

async function loadActivityLogs() {
    const tbody = document.getElementById('logTable');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Đang tải...</td></tr>';

    try {
        const response = await fetch(`${API_BASE_URL}/activity-logs`, {
            headers: {
                'Authorization': `Bearer ${AuthManager.getToken()}`
            }
        });
        const result = await response.json();

        if (result.success) {
            renderLogs(result.data);
        } else {
            showNotification(result.message, 'error');
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #dc2626;">Lỗi tải dữ liệu</td></tr>';
        }
    } catch (error) {
        console.error('Error fetching logs:', error);
        showNotification('Lỗi kết nối máy chủ', 'error');
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #dc2626;">Không thể kết nối máy chủ</td></tr>';
    }
}

function renderLogs(logs) {
    const tbody = document.getElementById('logTable');
    if (!tbody) return;

    if (!logs || logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Chưa có hoạt động nào</td></tr>';
        return;
    }

    tbody.innerHTML = logs.map(log => {
        const date = new Date(log.createdAt).toLocaleString('vi-VN');
        const user = escapeHtml(log.userName || 'Hệ thống');
        const action = getActionLabel(log.action);
        const details = formatDetails(log.details);

        return `
            <tr>
                <td style="white-space: nowrap; color: #64748b;">${date}</td>
                <td><span style="font-weight: 600;">${user}</span></td>
                <td>${action}</td>
                <td style="font-size: 0.875rem; color: #475569;">${details}</td>
            </tr>
        `;
    }).join('');
}

function getActionLabel(action) {
    const config = {
        'CREATE_ACCOUNT': { text: 'Tạo tài khoản', color: '#059669', bg: '#ecfdf5' },
        'UPDATE_ACCOUNT': { text: 'Cập nhật tài khoản', color: '#2563eb', bg: '#eff6ff' },
        'DELETE_ACCOUNT': { text: 'Xóa tài khoản', color: '#dc2626', bg: '#fef2f2' },
        'CREATE_EMPLOYEE': { text: 'Thêm nhân viên', color: '#059669', bg: '#ecfdf5' },
        'UPDATE_EMPLOYEE': { text: 'Sửa nhân viên', color: '#d97706', bg: '#fff7ed' },
        'DELETE_EMPLOYEE': { text: 'Xóa nhân viên', color: '#dc2626', bg: '#fef2f2' },
        'APPROVE_LEAVE': { text: 'Duyệt nghỉ phép', color: '#059669', bg: '#ecfdf5' },
        'REJECT_LEAVE': { text: 'Từ chối nghỉ phép', color: '#dc2626', bg: '#fef2f2' }
    };

    const item = config[action] || { text: action, color: '#64748b', bg: '#f1f5f9' };
    return `<span style="padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 500; color: ${item.color}; background: ${item.bg}; text-transform: uppercase;">${item.text}</span>`;
}

function formatDetails(details) {
    if (!details) return '-';
    // Highlight change arrows
    return escapeHtml(details).replace(/->/g, '<i class="fas fa-long-arrow-alt-right" style="margin: 0 0.5rem; color: #94a3b8;"></i>');
}
