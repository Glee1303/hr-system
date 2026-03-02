function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
        '/': '&#x2F;'
    };
    return String(text).replace(/[&<>"'\/]/g, m => map[m]);
}

function sanitizeHtml(html) {
    const allowedTags = ['b', 'i', 'u', 'strong', 'em', 'br', 'p'];
    const temp = document.createElement('div');
    temp.innerHTML = html;

    const walk = (node) => {
        for (let i = node.childNodes.length - 1; i >= 0; i--) {
            const child = node.childNodes[i];
            if (child.nodeType === 1) {
                if (!allowedTags.includes(child.tagName.toLowerCase())) {
                    node.removeChild(child);
                } else {
                    walk(child);
                }
            }
        }
    };

    walk(temp);
    return temp.innerHTML;
}

function isValidId(id) {
    if (!id) return false;
    return /^[0-9a-f]{24}$/i.test(String(id));
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function throttle(func, limit) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// ==================== NOTIFICATIONS ====================
function showNotification(message, type = 'info') {
    try {
        if (typeof ToastManager !== 'undefined' && ToastManager?.show) {
            ToastManager.show(message, type, 3000);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    } catch (e) {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

function logout() {
    if (confirm('Bạn có chắc chắn muốn đăng xuất?')) {
        AuthManager.logout();
    }
}

function formatCurrency(amount) {
    if (typeof amount !== 'number') {
        amount = parseFloat(amount) || 0;
    }
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        minimumFractionDigits: 0
    }).format(amount);
}

function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    } catch (e) {
        return '-';
    }
}

function getTimeAgo(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);

        if (seconds < 60) return 'Vừa xong';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes} phút trước`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} giờ trước`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days} ngày trước`;

        return formatDate(dateString);
    } catch (e) {
        return '';
    }
}

function formatDateTime(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch {
        return '-';
    }
}

function isSameDay(date1, date2) {
    try {
        return new Date(date1).toDateString() === new Date(date2).toDateString();
    } catch {
        return false;
    }
}

function formatTimeAgo(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';

        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Vừa xong';
        if (minutes < 60) return `${minutes} phút trước`;
        if (hours < 24) return `${hours} giờ trước`;
        if (days < 7) return `${days} ngày trước`;
        return formatDate(dateString);
    } catch {
        return '-';
    }
}

function getTimeAgo(dateString) {
    return formatTimeAgo(dateString);
}

function getInitials(name) {
    if (!name) return 'U';
    const parts = name.split(' ').filter(p => p.length > 0);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

function formatNumber(num) {
    if (typeof num !== 'number') {
        num = parseInt(num) || 0;
    }
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ==================== BADGE GENERATORS ====================
function getAttendanceStatusBadge(status) {
    const statusMap = {
        'present': { bg: '#d1fae5', color: '#065f46', text: 'Có mặt' },
        'absent': { bg: '#fee2e2', color: '#7f1d1d', text: 'Vắng mặt' },
        'late': { bg: '#fef3c7', color: '#92400e', text: 'Đi muộn' }
    };
    const config = statusMap[status] || { bg: '#f3f4f6', color: '#6b7280', text: 'N/A' };
    return `<span class="status-badge" style="background: ${config.bg}; color: ${config.color}; padding: 0.375rem 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; font-weight: 500;">${escapeHtml(config.text)}</span>`;
}

function getApprovalStatusBadge(status) {
    const statusMap = {
        'pending': { bg: '#fef3c7', color: '#92400e', text: 'Chờ duyệt' },
        'approved': { bg: '#d1fae5', color: '#065f46', text: 'Đã duyệt' },
        'rejected': { bg: '#fee2e2', color: '#7f1d1d', text: 'Từ chối' }
    };
    const config = statusMap[status] || { bg: '#f3f4f6', color: '#6b7280', text: 'N/A' };
    return `<span class="status-badge" style="background: ${config.bg}; color: ${config.color}; padding: 0.375rem 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; font-weight: 500;">${escapeHtml(config.text)}</span>`;
}

function getSalaryStatusBadge(status) {
    if (status === 'paid') {
        return '<span class="status-badge" style="background: #d1fae5; color: #065f46; padding: 0.375rem 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; font-weight: 500;">Đã thanh toán</span>';
    }
    return '<span class="status-badge" style="background: #fef3c7; color: #92400e; padding: 0.375rem 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; font-weight: 500;">Chờ thanh toán</span>';
}

function getLeaveTypeBadge(type) {
    const typeMap = {
        'annual': 'Phép năm',
        'sick': 'Nghỉ ốm',
        'personal': 'Việc cá nhân',
        'unpaid': 'Không lương'
    };
    return escapeHtml(typeMap[type] || type);
}

function getStatusBadge(status) {
    const isActive = status === 'active' || status === 'Hoạt động';
    if (isActive) {
        return '<span class="status-badge active" style="background: #d1fae5; color: #065f46; padding: 0.375rem 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; font-weight: 500;">Hoạt động</span>';
    }
    return '<span class="status-badge inactive" style="background: #fee2e2; color: #7f1d1d; padding: 0.375rem 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; font-weight: 500;">Ngừng làm việc</span>';
}

function getDocTypeLabel(type) {
    const labels = {
        'contract': 'Hợp đồng',
        'insurance': 'Bảo hiểm',
        'certificate': 'Chứng chỉ',
        'other': 'Khác'
    };
    return escapeHtml(labels[type] || type);
}

function getDocIconClass(fileType) {
    const classes = {
        'pdf': 'fas fa-file-pdf',
        'doc': 'fas fa-file-word',
        'excel': 'fas fa-file-excel',
        'image': 'fas fa-image'
    };
    return classes[fileType] || 'fas fa-file';
}

// ==================== VALIDATORS ====================
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
}

function validatePhone(phone) {
    if (!phone) return true;
    const digits = String(phone).replace(/\D/g, '');
    return digits.length >= 10;
}

function validatePassword(password) {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
}

function validateName(name) {
    return name && name.trim().length >= 3;
}

function getPasswordStrength(password) {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/@$!%*?&/.test(password)) strength++;
    return strength;
}
function showCustomConfirm(message, options = {}) {
    return new Promise((resolve) => {
        const defaultOptions = {
            title: 'Xác nhận',
            okText: 'Xác nhận',
            cancelText: 'Hủy',
            type: 'warning'
        };

        const config = { ...defaultOptions, ...options };

        // Xác định icon dựa trên type
        const iconMap = {
            'warning': 'fa-exclamation-triangle',
            'danger': 'fa-trash-alt',
            'info': 'fa-info-circle',
            'success': 'fa-check-circle'
        };
        const icon = iconMap[config.type] || 'fa-question-circle';

        // Tạo dialog HTML
        const dialogId = `confirm-dialog-${Date.now()}`;
        const dialogHTML = `
            <div id="${dialogId}" class="confirm-dialog-overlay">
                <div class="confirm-dialog-container">
                    <div class="confirm-dialog-header confirm-dialog-header-${config.type}">
                        <i class="fas ${icon}"></i>
                        <h2>${escapeHtml(config.title)}</h2>
                    </div>
                    <div class="confirm-dialog-body">
                        <p>${escapeHtml(message)}</p>
                    </div>
                    <div class="confirm-dialog-footer">
                        <button class="confirm-btn-cancel" data-dialog-id="${dialogId}">
                            <i class="fas fa-times"></i> ${escapeHtml(config.cancelText)}
                        </button>
                        <button class="confirm-btn-ok" data-dialog-id="${dialogId}" data-type="${config.type}">
                            <i class="fas fa-check"></i> ${escapeHtml(config.okText)}
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Thêm vào DOM
        document.body.insertAdjacentHTML('beforeend', dialogHTML);
        const dialogElement = document.getElementById(dialogId);

        // Thiết lập event listeners
        const okBtn = dialogElement.querySelector('.confirm-btn-ok');
        const cancelBtn = dialogElement.querySelector('.confirm-btn-cancel');
        const overlay = dialogElement;

        function cleanup() {
            if (dialogElement && dialogElement.parentElement) {
                dialogElement.remove();
            }
        }

        function handleOk() {
            cleanup();
            resolve(true);
        }

        function handleCancel() {
            cleanup();
            resolve(false);
        }

        // Sự kiện nút OK
        okBtn.addEventListener('click', handleOk);

        // Sự kiện nút Cancel
        cancelBtn.addEventListener('click', handleCancel);

        // Sự kiện nhấp vào overlay (ngoài dialog)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                handleCancel();
            }
        });

        // Sự kiện phím Escape
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', handleEscape);
                handleCancel();
            }
        };
        document.addEventListener('keydown', handleEscape);

        // Focus trên nút Cancel mặc định
        cancelBtn.focus();

        // Thêm animation
        setTimeout(() => {
            dialogElement.classList.add('confirm-dialog-show');
        }, 10);
    });
}
function confirmDelete(itemName = 'mục này') {
    return showCustomConfirm(
        `Bạn có chắc chắn muốn xóa ${escapeHtml(itemName)}? Hành động này không thể hoàn tác.`,
        {
            title: 'Xác nhận xóa',
            okText: 'Xóa',
            cancelText: 'Hủy',
            type: 'danger'
        }
    );
}

function confirmSave(actionName = 'lưu thay đổi') {
    return showCustomConfirm(
        `Bạn có chắc chắn muốn ${escapeHtml(actionName)}?`,
        {
            title: 'Xác nhận',
            okText: 'Lưu',
            cancelText: 'Hủy',
            type: 'info'
        }
    );
}

function confirmLogout() {
    return showCustomConfirm(
        'Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?',
        {
            title: 'Xác nhận đăng xuất',
            okText: 'Đăng xuất',
            cancelText: 'Hủy',
            type: 'warning'
        }
    );
}

function confirmAction(action = 'thực hiện hành động này') {
    return showCustomConfirm(
        `Bạn có chắc chắn muốn ${escapeHtml(action)}?`,
        {
            title: 'Xác nhận',
            okText: 'Xác nhận',
            cancelText: 'Hủy',
            type: 'warning'
        }
    );
}
// ==================== PAGINATION HELPER ====================

class PaginationHelper {
    constructor(pageSize = 50) {
        this.currentPage = 1;
        this.pageSize = pageSize;
        this.totalItems = 0;
        this.totalPages = 0;
        this.allData = [];
    }

    paginate(data) {
        this.allData = data;
        this.totalItems = data.length;
        this.totalPages = Math.ceil(this.totalItems / this.pageSize);
        this.currentPage = 1;

        return this.getPage(1);
    }

    getPage(pageNum) {
        if (pageNum < 1 || pageNum > this.totalPages) {
            return this.allData;
        }

        this.currentPage = pageNum;
        const startIdx = (pageNum - 1) * this.pageSize;
        const endIdx = startIdx + this.pageSize;

        return this.allData.slice(startIdx, endIdx);
    }

    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            return this.getPage(this.currentPage);
        }
        return this.getPage(this.currentPage);
    }

    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            return this.getPage(this.currentPage);
        }
        return this.getPage(this.currentPage);
    }

    getInfo() {
        const startIdx = (this.currentPage - 1) * this.pageSize + 1;
        const endIdx = Math.min(this.currentPage * this.pageSize, this.totalItems);

        return {
            currentPage: this.currentPage,
            pageSize: this.pageSize,
            totalItems: this.totalItems,
            totalPages: this.totalPages,
            startIdx,
            endIdx,
            hasNext: this.currentPage < this.totalPages,
            hasPrev: this.currentPage > 1,
            isFirst: this.currentPage === 1,
            isLast: this.currentPage === this.totalPages
        };
    }

    renderHTML(onPageChange) {
        if (this.totalPages <= 1) return '';

        const pageButtons = [];
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(this.totalPages, this.currentPage + 2);

        pageButtons.push(`
            <button class="pagination-btn" 
                    onclick="goPaginationPage(${this.currentPage - 1})"
                    ${this.currentPage === 1 ? 'disabled' : ''}>
                ← Trước
            </button>
        `);

        for (let i = startPage; i <= endPage; i++) {
            pageButtons.push(`
                <button class="pagination-btn ${i === this.currentPage ? 'active' : ''}"
                        onclick="goPaginationPage(${i})">
                    ${i}
                </button>
            `);
        }

        pageButtons.push(`
            <button class="pagination-btn"
                    onclick="goPaginationPage(${this.currentPage + 1})"
                    ${this.currentPage === this.totalPages ? 'disabled' : ''}>
                Tiếp →
            </button>
        `);

        const startIdx = (this.currentPage - 1) * this.pageSize + 1;
        const endIdx = Math.min(this.currentPage * this.pageSize, this.totalItems);

        return `
            <div style="display: flex; align-items: center; gap: 0.5rem; justify-content: center; padding: 1rem; flex-wrap: wrap;">
                ${pageButtons.join('')}
                <span style="margin-left: 1rem; color: #6b7280; font-size: 0.875rem; white-space: nowrap;">
                    Trang ${this.currentPage}/${this.totalPages} 
                    (${startIdx}-${endIdx} trên ${this.totalItems} mục)
                </span>
            </div>
        `;
    }

    reset() {
        this.currentPage = 1;
        this.allData = [];
        this.totalItems = 0;
        this.totalPages = 0;
    }
}

// ==================== SMART AUTO-REFRESH ====================

class SmartRefresh {
    constructor() {
        this.intervals = new Map();
        this.isOnline = navigator.onLine;
        this.setupNetworkListener();
    }

    setupNetworkListener() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            console.log('🟢 Online - resuming refresh');
            this.resumeAll();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.log('🔴 Offline - pausing refresh');
            this.pauseAll();
        });
    }

    schedule(key, callback, interval = 5 * 60 * 1000, immediate = true) {
        if (this.intervals.has(key)) {
            clearInterval(this.intervals.get(key));
        }

        if (immediate && this.isOnline) {
            callback();
        }

        if (this.isOnline) {
            const id = setInterval(() => {
                if (this.isOnline) {
                    callback();
                }
            }, interval);

            this.intervals.set(key, id);
            console.log(`✅ Scheduled refresh: ${key} (${interval}ms)`);
        }
    }

    pauseAll() {
        this.intervals.forEach((id) => clearInterval(id));
    }

    resumeAll() {
        this.intervals.clear();
        if (typeof loadDashboardData === 'function') {
            loadDashboardData();
        }
    }

    stop(key) {
        if (this.intervals.has(key)) {
            clearInterval(this.intervals.get(key));
            this.intervals.delete(key);
        }
    }

    stopAll() {
        this.intervals.forEach((id) => clearInterval(id));
        this.intervals.clear();
    }
}

// ==================== FILTER & SORT HELPERS ====================

function filterData(data, filterObject) {
    return data.filter(item => {
        for (let key in filterObject) {
            if (filterObject[key] && item[key] !== filterObject[key]) {
                return false;
            }
        }
        return true;
    });
}

function searchData(data, searchTerm, searchFields = []) {
    if (!searchTerm) return data;

    const term = searchTerm.toLowerCase();
    return data.filter(item => {
        if (searchFields.length === 0) {
            return JSON.stringify(item).toLowerCase().includes(term);
        }

        return searchFields.some(field => {
            const value = item[field];
            return value && String(value).toLowerCase().includes(term);
        });
    });
}

function sortData(data, sortBy = '_id', sortOrder = -1) {
    return [...data].sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];

        if (typeof aVal === 'string') {
            return sortOrder === 1
                ? aVal.localeCompare(bVal)
                : bVal.localeCompare(aVal);
        }

        return sortOrder === 1 ? aVal - bVal : bVal - aVal;
    });
}

// ==================== DEBOUNCE SEARCH V2 (IMPROVED) ====================
// FIX: Loại bỏ dependency global, hàm pure hơn

function debounceSearchV2(func, delay = 300) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func(...args);
        }, delay);
    };
}

// Alias cho backward compatibility
const debounceSearch = debounceSearchV2;

// ==================== RENDER PAGINATION UI ====================

function renderPaginationUI(containerId, info) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const pageButtons = [];
    const startPage = Math.max(1, info.currentPage - 2);
    const endPage = Math.min(info.totalPages, info.currentPage + 2);

    pageButtons.push(`
        <button class="pagination-btn" 
                onclick="goPaginationPage(${info.currentPage - 1})"
                ${!info.hasPrev ? 'disabled' : ''}>
            ← Trước
        </button>
    `);

    for (let i = startPage; i <= endPage; i++) {
        pageButtons.push(`
            <button class="pagination-btn ${i === info.currentPage ? 'active' : ''}"
                    onclick="goPaginationPage(${i})">
                ${i}
            </button>
        `);
    }

    pageButtons.push(`
        <button class="pagination-btn"
                onclick="goPaginationPage(${info.currentPage + 1})"
                ${!info.hasNext ? 'disabled' : ''}>
            Tiếp →
        </button>
    `);

    container.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem; justify-content: center; padding: 1rem; flex-wrap: wrap;">
            ${pageButtons.join('')}
            <span style="margin-left: 1rem; color: #6b7280; font-size: 0.875rem; white-space: nowrap;">
                Trang ${info.currentPage}/${info.totalPages} 
                (${info.startIdx}-${info.endIdx} trên ${info.totalItems} mục)
            </span>
        </div>
    `;
}

// Global pagination navigation function
function goPaginationPage(pageNum) {
    const data = paginationHelper.getPage(pageNum);

    if (typeof renderCurrentPage === 'function') {
        renderCurrentPage(data);
    }

    const info = paginationHelper.getInfo();
    renderPaginationUI('pagination-container', info);

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==================== PERFORMANCE MONITORING ====================

const performanceMetrics = {
    apiCalls: 0,
    cacheHits: 0,
    cacheMisses: 0,
    startTime: Date.now(),

    recordApiCall(cached = false) {
        this.apiCalls++;
        if (cached) {
            this.cacheHits++;
        } else {
            this.cacheMisses++;
        }
    },

    getCacheHitRate() {
        if (this.apiCalls === 0) return 0;
        return ((this.cacheHits / this.apiCalls) * 100).toFixed(2);
    },

    getReport() {
        const uptime = ((Date.now() - this.startTime) / 1000 / 60).toFixed(1);
        return {
            apiCalls: this.apiCalls,
            cacheHits: this.cacheHits,
            cacheMisses: this.cacheMisses,
            hitRate: `${this.getCacheHitRate()}%`,
            uptime: `${uptime} min`
        };
    },

    logReport() {
        console.log('📊 Performance:', this.getReport());
    }
};

// ==================== ENHANCED DATA SYNC MANAGER ====================

class DataSyncManager {
    constructor() {
        this.syncChannel = null;
        this.handlers = {
            'employee:created': [],
            'employee:updated': [],
            'employee:deleted': [],
            'account:created': [],
            'account:updated': [],
            'account:deleted': [],
            'attendance:created': [],
            'attendance:updated': [],
            'attendance:deleted': [],
            'leave:created': [],
            'leave:updated': [],
            'leave:deleted': [],
            'salary:created': [],
            'salary:updated': [],
            'salary:deleted': [],
            'document:created': [],
            'document:deleted': [],
            'dashboard:refresh': [],
            'notification:sent': [],
            'profile-update:requested': []
        };
        this.lastMessageTime = 0;
        this.messageThrottle = 100;
        this.initChannels();
    }

    initChannels() {
        console.log('🔄 Initializing DataSync Manager...');

        // SSE (Server-Sent Events) - Direct connection to Server
        this.connectToServer();

        // BroadcastChannel - Sync between tabs on Same Browser
        if (typeof BroadcastChannel !== 'undefined') {
            try {
                this.syncChannel = new BroadcastChannel('hrms-data-sync');
                this.syncChannel.onmessage = (event) => this.handleMessage(event.data);
                console.log('✅ BroadcastChannel initialized');
            } catch (e) {
                console.warn('⚠️ BroadcastChannel failed:', e.message);
            }
        }

        // Fallback: Storage events
        window.addEventListener('storage', (event) => {
            if (event.key?.startsWith('sync_')) {
                try {
                    const data = JSON.parse(event.newValue);
                    this.handleMessage(data);
                } catch (e) {
                    console.error('❌ Error parsing sync data:', e);
                }
            }
        });

        // Fallback: Custom events
        window.addEventListener('hrmsDataSync', (event) => {
            this.handleMessage(event.detail);
        });

        console.log('✅ DataSync Manager ready with 4 sync channels (SSE, Broadcast, Storage, Custom)');
    }

    connectToServer() {
        if (typeof EventSource === 'undefined') return;

        try {
            if (this.eventSource) {
                this.eventSource.close();
            }

            const sseOrigin = (window.location.origin.startsWith('http') ? window.location.origin : 'http://localhost:5000');
            this.eventSource = new EventSource(`${sseOrigin}/api/sync/stream`);

            this.eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    // SSE messages don't have source id usually, or we can trust them
                    this.handleMessage({
                        ...data,
                        source: 'server_sse'
                    });
                } catch (e) {
                    console.error('❌ SSE Parse Error:', e);
                }
            };

            this.eventSource.onerror = (err) => {
                console.warn('⚠️ SSE Connection lost, retrying in 5s...');
                this.eventSource.close();
                setTimeout(() => this.connectToServer(), 5000);
            };

            console.log('✅ SSE Connection established');
        } catch (e) {
            console.error('❌ SSE Setup Error:', e);
        }
    }


    handleMessage(data) {
        if (!data || !data.type) return;

        const now = Date.now();
        if (now - this.lastMessageTime < this.messageThrottle) {
            return;
        }
        this.lastMessageTime = now;

        // Avoid self-messaging
        if (data.source === this.getSourceId()) {
            return;
        }

        console.log(`📨 Sync received: ${data.type}`, data.payload);

        const handlers = this.handlers[data.type] || [];
        handlers.forEach(handler => {
            try {
                handler(data.payload);
            } catch (e) {
                console.error(`❌ Handler error for ${data.type}:`, e);
            }
        });
    }

    broadcast(type, payload) {
        const syncData = {
            type,
            payload,
            source: this.getSourceId(),
            timestamp: Date.now()
        };

        console.log(`📢 Broadcasting: ${type}`, payload);

        // Try all channels
        try {
            const key = `sync_${type}_${Date.now()}`;
            sessionStorage.setItem(key, JSON.stringify(syncData));
            setTimeout(() => {
                try { sessionStorage.removeItem(key); } catch (e) { }
            }, 5000);
        } catch (e) {
            console.warn('⚠️ SessionStorage write failed:', e.message);
        }

        if (this.syncChannel) {
            try {
                this.syncChannel.postMessage(syncData);
            } catch (e) {
                console.warn('⚠️ BroadcastChannel send failed:', e.message);
            }
        }

        try {
            window.dispatchEvent(
                new CustomEvent('hrmsDataSync', { detail: syncData })
            );
        } catch (e) {
            console.warn('⚠️ CustomEvent dispatch failed:', e.message);
        }
    }

    on(type, handler) {
        if (!this.handlers[type]) {
            this.handlers[type] = [];
        }
        this.handlers[type].push(handler);
        return () => {
            this.handlers[type] = this.handlers[type].filter(h => h !== handler);
        };
    }

    off(type, handler) {
        if (this.handlers[type]) {
            this.handlers[type] = this.handlers[type].filter(h => h !== handler);
        }
    }

    getSourceId() {
        const userId = typeof AuthManager !== 'undefined' ? AuthManager.getUserId() : 'unknown';
        const timestamp = typeof performance !== 'undefined' ? Math.floor(performance.now()) : Date.now() % 10000;
        return `${userId}_${timestamp}`;
    }

    disconnect() {
        if (this.syncChannel) {
            try {
                this.syncChannel.close();
                console.log('✅ BroadcastChannel closed');
            } catch (e) {
                console.warn('⚠️ Error closing BroadcastChannel:', e.message);
            }
        }
    }
}

// ==================== GLOBAL INSTANCES ====================
// Khởi tạo sau khi tất cả class đã được định nghĩa

const paginationHelper = new PaginationHelper(50);
const smartRefresh = new SmartRefresh();
const DataSync = new DataSyncManager();

// ==================== GLOBAL STYLES ====================

const globalStyle = document.createElement('style');
globalStyle.setAttribute('data-global', 'true');
globalStyle.textContent = `
    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    .pagination-btn {
        padding: 0.5rem 0.75rem;
        margin: 0 0.25rem;
        border: 1px solid #d1d5db;
        background: white;
        color: #374151;
        border-radius: 0.375rem;
        cursor: pointer;
        font-size: 0.875rem;
        font-weight: 500;
        transition: all 0.2s;
    }

    .pagination-btn:hover:not(:disabled) {
        background: #f3f4f6;
        border-color: #9ca3af;
    }

    .pagination-btn.active {
        background: #2563eb;
        color: white;
        border-color: #2563eb;
    }

    .pagination-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .pagination-container {
        margin-top: 1.5rem;
        padding-top: 1rem;
        border-top: 1px solid #e5e7eb;
    }
`;

if (!document.head.querySelector('style[data-global="true"]')) {
    document.head.appendChild(globalStyle);
}

// ==================== CLEANUP ====================

window.addEventListener('beforeunload', () => {
    if (typeof DataSync !== 'undefined' && DataSync.disconnect) {
        DataSync.disconnect();
    }
});


// ==================== HELPER FUNCTION ====================
async function sendNotificationAsAdmin(title, message, type = 'info', recipientId = null) {
    if (typeof API === 'undefined') {
        console.warn('API module not loaded, cannot send notification');
        return;
    }

    try {
        await API.createNotification({
            title,
            message,
            type,
            recipientId
        });
        console.log('🔔 Notification sent:', title);
    } catch (error) {
        console.error('Failed to send notification:', error);
    }
}

// ==================== AUTH GUARD ====================
(function () {
    const publicPages = ['dangnhap.html', 'index.html', ''];
    const currentPath = window.location.pathname.split('/').pop();
    if (!publicPages.includes(currentPath)) {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token) window.location.replace('dangnhap.html');
    }
})();

// ==================== TOAST MANAGER ====================
class ToastManager {
    static show(message, type = 'info', duration = 3000) {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                gap: 10px;
            `;
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        const bgColor = {
            'success': '#dcfce7',
            'error': '#fecaca',
            'warning': '#fef3c7',
            'info': '#dbeafe'
        }[type] || '#dbeafe';

        const textColor = {
            'success': '#166534',
            'error': '#991b1b',
            'warning': '#92400e',
            'info': '#1e40af'
        }[type] || '#1e40af';

        const icon = {
            'success': 'fa-check-circle',
            'error': 'fa-exclamation-circle',
            'warning': 'fa-exclamation-triangle',
            'info': 'fa-info-circle'
        }[type] || 'fa-info-circle';

        toast.style.cssText = `
            background: ${bgColor};
            color: ${textColor};
            padding: 1rem 1.5rem;
            border-radius: 0.5rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            display: flex;
            align-items: center;
            gap: 0.75rem;
            min-width: 300px;
            animation: slideIn 0.3s ease-out;
        `;

        toast.innerHTML = `
            <i class="fas ${icon}"></i>
            <span>${message}</span>
            <button onclick="this.parentElement.remove()" style="background: none; border: none; cursor: pointer; color: inherit; font-size: 1.25rem;">×</button>
        `;

        container.appendChild(toast);

        if (duration > 0) {
            setTimeout(() => toast.remove(), duration);
        }
    }

    static success(message, duration = 3000) {
        this.show(message, 'success', duration);
    }

    static error(message, duration = 4000) {
        this.show(message, 'error', duration);
    }

    static warning(message, duration = 3000) {
        this.show(message, 'warning', duration);
    }

    static info(message, duration = 3000) {
        this.show(message, 'info', duration);
    }
}

// Add animation CSS for Toast
if (!document.querySelector('style[data-toast]')) {
    const style = document.createElement('style');
    style.setAttribute('data-toast', 'true');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
}

// ==================== VALIDATION HELPER ====================
class ValidationHelper {
    static validateEmail(email) {
        if (!email) return false;
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(String(email).toLowerCase());
    }

    static validatePhone(phone) {
        if (!phone) return true;
        const digits = String(phone).replace(/\D/g, '');
        return digits.length >= 10;
    }

    static validatePassword(password) {
        if (!password) return false;
        return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
    }

    static validateUsername(username) {
        if (!username) return false;
        return /^[a-zA-Z0-9_-]{3,}$/.test(username);
    }

    static validateName(name) {
        if (!name) return false;
        return name.trim().length >= 3;
    }

    static validateUrl(url) {
        if (!url) return false;
        try {
            new URL(url);
            return true;
        } catch (e) {
            return false;
        }
    }

    static validateDate(date) {
        if (!date) return false;
        const d = new Date(date);
        return d instanceof Date && !isNaN(d.getTime());
    }

    static validateDateRange(fromDate, toDate) {
        if (!fromDate || !toDate) return false;
        const from = new Date(fromDate);
        const to = new Date(toDate);
        if (isNaN(from.getTime()) || isNaN(to.getTime())) return false;
        return from <= to;
    }

    static validateRequired(value) {
        if (typeof value === 'string') return value.trim().length > 0;
        return value !== null && value !== undefined;
    }

    static validateMinLength(value, minLength) {
        return String(value).length >= minLength;
    }

    static validateMaxLength(value, maxLength) {
        return String(value).length <= maxLength;
    }

    static validateRegex(value, regex) {
        if (!regex || !(regex instanceof RegExp)) return false;
        return regex.test(String(value));
    }

    static validateNumber(value) {
        const num = Number(value);
        return !isNaN(num) && isFinite(num);
    }

    static validatePositiveNumber(value) {
        const num = Number(value);
        return !isNaN(num) && isFinite(num) && num > 0;
    }

    static showError(fieldId, message) {
        const el = document.getElementById(fieldId);
        if (el) {
            el.textContent = message;
            el.classList.add('show');
            el.style.display = 'block';
            el.style.color = '#dc2626';
            el.style.fontSize = '0.875rem';
            el.style.marginTop = '0.25rem';
        }
    }

    static clearError(fieldId) {
        const el = document.getElementById(fieldId);
        if (el) {
            el.textContent = '';
            el.classList.remove('show');
            el.style.display = 'none';
        }
    }

    static showFieldError(fieldId, errorId, message) {
        const field = document.getElementById(fieldId);
        const errorEl = document.getElementById(errorId);
        if (field) {
            field.classList.add('error');
            field.style.borderColor = '#dc2626';
        }
        if (errorEl) this.showError(errorId, message);
    }

    static clearFieldError(fieldId, errorId) {
        const field = document.getElementById(fieldId);
        const errorEl = document.getElementById(errorId);
        if (field) {
            field.classList.remove('error');
            field.style.borderColor = '';
        }
        if (errorEl) this.clearError(errorId);
    }

    static validateForm(formId, rules) {
        const form = document.getElementById(formId);
        if (!form) return false;
        let isValid = true;
        for (const [fieldId, validators] of Object.entries(rules)) {
            const field = document.getElementById(fieldId);
            if (!field) continue;
            const value = field.value || field.textContent || '';
            let fieldValid = true;
            let errorMessage = '';
            const validatorList = Array.isArray(validators) ? validators : [validators];
            for (const validator of validatorList) {
                if (typeof validator === 'function') {
                    const result = validator(value);
                    if (!result.valid) {
                        fieldValid = false;
                        errorMessage = result.message || 'Giá trị không hợp lệ';
                        break;
                    }
                }
            }
            if (!fieldValid) {
                isValid = false;
                const errorId = `${fieldId}Error`;
                this.showFieldError(fieldId, errorId, errorMessage);
            } else {
                const errorId = `${fieldId}Error`;
                this.clearFieldError(fieldId, errorId);
            }
        }
        return isValid;
    }

    static validateFieldsMatch(field1Id, field2Id, errorId) {
        const field1 = document.getElementById(field1Id);
        const field2 = document.getElementById(field2Id);
        if (!field1 || !field2) return false;
        if (field1.value === field2.value) {
            this.clearError(errorId);
            return true;
        } else {
            this.showError(errorId, 'Các trường không khớp');
            return false;
        }
    }

    static validateEmailList(emailString) {
        const emails = emailString.split(',').map(e => e.trim());
        return emails.every(email => this.validateEmail(email));
    }

    static getPasswordStrength(password) {
        let strength = 0;
        if (!password) return strength;
        if (password.length >= 8) strength++;
        if (password.length >= 12) strength++;
        if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
        if (/\d/.test(password)) strength++;
        if (/@$!%*?&/.test(password)) strength++;
        return Math.min(strength, 5);
    }

    static getPasswordStrengthLabel(password) {
        const strength = this.getPasswordStrength(password);
        const labels = ['Rất yếu', 'Yếu', 'Trung bình', 'Khỏe', 'Rất khỏe'];
        return labels[strength - 1] || 'Rất yếu';
    }

    static validateAge(birthDate, minAge = 18) {
        if (!this.validateDate(birthDate)) return false;
        const today = new Date();
        const birth = new Date(birthDate);
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
        return age >= minAge;
    }

    static validateCardNumber(cardNumber) {
        const cleaned = String(cardNumber).replace(/\D/g, '');
        if (cleaned.length < 13 || cleaned.length > 19) return false;
        let sum = 0;
        let isEven = false;
        for (let i = cleaned.length - 1; i >= 0; i--) {
            let digit = parseInt(cleaned[i], 10);
            if (isEven) {
                digit *= 2;
                if (digit > 9) digit -= 9;
            }
            sum += digit;
            isEven = !isEven;
        }
        return sum % 10 === 0;
    }

    static validateCheckbox(checkboxId) {
        const checkbox = document.getElementById(checkboxId);
        return checkbox ? checkbox.checked : false;
    }

    static validateCheckboxGroup(groupName, minRequired = 1) {
        const checkboxes = document.querySelectorAll(`input[name="${groupName}"]:checked`);
        return checkboxes.length >= minRequired;
    }

    static validateRadio(radioName) {
        const ratio = document.querySelector(`input[name="${radioName}"]:checked`);
        return !!ratio;
    }

    static validateSelect(selectId) {
        const select = document.getElementById(selectId);
        return select ? select.value !== '' : false;
    }

    static validateFile(fileInputId, allowedTypes = [], maxSize = null) {
        const input = document.getElementById(fileInputId);
        if (!input || !input.files.length) return false;
        const file = input.files[0];
        if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) return false;
        if (maxSize && file.size > maxSize) return false;
        return true;
    }

    static validateBatch(validations) {
        const results = {};
        for (const [key, validator] of Object.entries(validations)) {
            if (typeof validator === 'function') results[key] = validator();
        }
        return {
            isValid: Object.values(results).every(v => v),
            results
        };
    }
}

// ==================== INITIALIZATION ====================
// Bridge for attendance machine (Web version)
window.DeviceBridge = {
    connect: async (ip, port) => {
        if (typeof DeviceAPI !== 'undefined') {
            return await DeviceAPI.connect(ip, port);
        }
        console.error('DeviceAPI not found');
        return { success: false, message: 'Hệ thống chưa sẵn sàng' };
    },
    getAttendance: async (ip, port) => {
        if (typeof DeviceAPI !== 'undefined') {
            return await DeviceAPI.getAttendance(ip, port);
        }
        return { success: false, message: 'Hệ thống chưa sẵn sàng' };
    }
};

// Legacy support (to avoid breaking other scripts)
window.electronAPI = {
    connectToDevice: (ip, port) => window.DeviceBridge.connect(ip, port)
};
