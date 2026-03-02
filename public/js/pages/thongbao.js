/**
 * HRM Pro - Notification System Logic
 */

let allNotifications = [];
let filteredNotifications = [];
let currentFilter = 'all';
let allEmployees = [];
let allDepartments = [];

document.addEventListener('DOMContentLoaded', async function () {
    if (!AuthManager.checkAuth()) return;

    // Phân quyền: Chỉ Admin/Manager mới thấy nút tạo
    const role = AuthManager.getUserRole();
    if (role !== 'admin' && role !== 'manager') {
        const adminElements = document.querySelectorAll('.admin-only');
        adminElements.forEach(el => el.style.display = 'none');
    }

    // Load initial data
    await loadInitialData();
    setupFilters();

    // Auto refresh every 5 mins
    smartRefresh.schedule('notifications', loadNotifications, 5 * 60 * 1000, true);
});

async function loadInitialData() {
    try {
        const role = AuthManager.getUserRole();
        if (role === 'admin' || role === 'manager') {
            const [emps, depts] = await Promise.all([
                EmployeeAPI.getAll(),
                DepartmentAPI.getAll()
            ]);
            allEmployees = emps;
            allDepartments = depts;
        }

        await loadNotifications();
    } catch (error) {
        console.error('Error loading initial data:', error);
    }
}

async function loadNotifications() {
    const listContainer = document.getElementById('noticeList');
    if (!listContainer) return;

    try {
        const data = await NotificationAPI.getAll();
        allNotifications = data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        updateStats();
        applyFilters();
    } catch (error) {
        console.error('Error loading notifications:', error);
        listContainer.innerHTML = '<div class="notice-loading">Có lỗi xảy ra khi tải thông báo.</div>';
    }
}

function updateStats() {
    const unreadCount = allNotifications.filter(n => !n.isRead).length;
    document.querySelector('.unread-count').textContent = unreadCount;
    document.querySelector('.total-count').textContent = allNotifications.length;
}

function setupFilters() {
    const tabs = document.querySelectorAll('.filter-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentFilter = tab.dataset.filter;
            applyFilters();
        });
    });

    const searchInput = document.getElementById('searchNotice');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            applyFilters(val);
        });
    }
}

function applyFilters(searchQuery = '') {
    let filtered = [...allNotifications];

    // Status Filter
    if (currentFilter === 'unread') {
        filtered = filtered.filter(n => !n.isRead);
    } else if (currentFilter === 'sent') {
        const userId = AuthManager.getUserId();
        filtered = filtered.filter(n => n.senderId === userId);
    }

    // Search Filter
    if (searchQuery) {
        filtered = filtered.filter(n =>
            n.title.toLowerCase().includes(searchQuery) ||
            n.message.toLowerCase().includes(searchQuery)
        );
    }

    renderNoticeList(filtered);
}

function renderNoticeList(notices) {
    const container = document.getElementById('noticeList');
    if (!container) return;

    if (notices.length === 0) {
        container.innerHTML = `
            <div class="notice-loading">
                <i class="fas fa-bell-slash"></i>
                <span>Không có thông báo nào được tìm thấy.</span>
            </div>
        `;
        return;
    }

    container.innerHTML = notices.map(n => {
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
                            <span><i class="far fa-user"></i> ${escapeHtml(n.senderName || 'Hệ thống')}</span>
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

function getIconForType(type) {
    switch (type) {
        case 'success': return 'fa-check-circle';
        case 'warning': return 'fa-exclamation-triangle';
        case 'error': return 'fa-exclamation-circle';
        default: return 'fa-bullhorn';
    }
}

function toggleNoticeForm() {
    const form = document.getElementById('noticeFormContainer');
    if (!form) return;

    if (form.style.display === 'none') {
        form.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        form.style.display = 'none';
        resetNoticeForm();
    }
}

function handleTargetChange() {
    const target = document.getElementById('noticeTarget').value;
    const detailGroup = document.getElementById('targetDetailGroup');
    const label = document.getElementById('targetDetailLabel');
    const select = document.getElementById('noticeTargetId');

    if (target === 'all') {
        detailGroup.style.display = 'none';
    } else {
        detailGroup.style.display = 'block';
        select.innerHTML = '<option value="">-- Chọn --</option>';

        if (target === 'department') {
            label.textContent = 'Chọn phòng ban';
            allDepartments.forEach(d => {
                select.innerHTML += `<option value="${d._id}">${escapeHtml(d.name)}</option>`;
            });
        } else if (target === 'individual') {
            label.textContent = 'Chọn nhân viên';
            allEmployees.forEach(e => {
                select.innerHTML += `<option value="${e._id}">${escapeHtml(e.name)}</option>`;
            });
        }
    }
}

function resetNoticeForm() {
    document.getElementById('noticeTitle').value = '';
    document.getElementById('noticeContent').value = '';
    document.getElementById('noticeTarget').value = 'all';
    document.getElementById('noticeType').value = 'info';
    document.getElementById('noticeAttachment').value = '';
    document.getElementById('filePreview').innerHTML = '';
    handleTargetChange();
}

async function sendNotification() {
    const title = document.getElementById('noticeTitle').value.trim();
    const message = document.getElementById('noticeContent').value.trim();
    const target = document.getElementById('noticeTarget').value;
    const targetId = document.getElementById('noticeTargetId').value;
    const type = document.getElementById('noticeType').value;
    const fileInput = document.getElementById('noticeAttachment');
    const file = fileInput.files[0];

    if (!title || !message) {
        showNotification('Vui lòng nhập nội dung và tiêu đề', 'warning');
        return;
    }

    if (target !== 'all' && !targetId) {
        showNotification('Vui lòng chọn đối tượng nhận', 'warning');
        return;
    }

    try {
        const payload = {
            title,
            message,
            type,
            target,
            targetId: target !== 'all' ? targetId : null,
            senderId: AuthManager.getUserId(),
            senderName: AuthManager.getUserName()
        };

        const result = await NotificationAPI.create(payload);

        // Handle attachment if exists
        if (file && result._id) {
            const formData = new FormData();
            formData.append('file', file);

            // Assuming there's an upload endpoint for notifications, if not, we use document API
            // Reusing document logic for now as a fallback
            try {
                // For demonstration, we'll just log this. In a real system, we'd have a specific endpoint.
                console.log('Attaching file to notification:', file.name);
            } catch (err) {
                console.warn('Attachment failed:', err);
            }
        }

        showNotification('Đã phát hành thông báo thành công!', 'success');
        toggleNoticeForm();
        loadNotifications();
    } catch (error) {
        showNotification('Lỗi: ' + error.message, 'error');
    }
}

async function viewNoticeDetail(noticeId) {
    const notice = allNotifications.find(n => n._id === noticeId);
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
            updateStats();

            // Cập nhật UI item mà không render lại toàn bộ list
            const row = document.getElementById(`notice-row-${noticeId}`);
            if (row) {
                const item = row.querySelector('.notice-item');
                if (item) item.classList.remove('unread');
            }
        } catch (err) {
            console.error('Mark read failed:', err);
        }
    }
}

function closeNoticeModal() {
    document.getElementById('noticeDetailModal').style.display = 'none';
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    const preview = document.getElementById('filePreview');
    if (file) {
        preview.innerHTML = `<div style="padding:0.5rem; background:#f0fdf4; border-radius:0.5rem; font-size:0.8rem; color:#166534;">
            <i class="fas fa-file"></i> ${escapeHtml(file.name)} (${(file.size / 1024).toFixed(1)} KB)
        </div>`;
    } else {
        preview.innerHTML = '';
    }
}
