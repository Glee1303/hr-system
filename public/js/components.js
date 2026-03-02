/**
 * HRM Pro - Shared Components Manager
 * Tự động hóa việc chèn Sidebar và Header để đồng nhất giao diện
 */

const UIComponents = {
    // Cấu hình Menu cho Admin
    adminMenu: [
        { href: 'lanhdao.html', icon: 'fas fa-th-large', text: 'Tổng quan' },
        { href: 'quanlynhanvien.html', icon: 'fas fa-users', text: 'Nhân viên' },
        { href: 'phongban.html', icon: 'fas fa-building', text: 'Phòng ban' },
        { href: 'chamcong.html', icon: 'fas fa-calendar-check', text: 'Chấm công' },
        { href: 'tuyendung.html', icon: 'fas fa-user-plus', text: 'Tuyển dụng' },
        { href: 'nghiphep.html', icon: 'fas fa-clock', text: 'Nghỉ phép' },
        { href: 'luong.html', icon: 'fas fa-chart-bar', text: 'Báo cáo' },
        { href: 'kpi.html', icon: 'fas fa-bullseye', text: 'Hiệu suất' },
        { href: 'tailieu.html', icon: 'fas fa-file-alt', text: 'Tài liệu' },
        { href: 'lichsu.html', icon: 'fas fa-history', text: 'Lịch sử' }
    ],

    // Cấu hình Menu cho Lãnh đạo (Tương đương Admin nhưng vào lanhdao.html)
    lanhdaoMenu: [
        { href: 'lanhdao.html', icon: 'fas fa-th-large', text: 'Tổng quan' },
        { href: 'quanlynhanvien.html', icon: 'fas fa-users', text: 'Nhân sự' },
        { href: 'phongban.html', icon: 'fas fa-building', text: 'Phòng ban' },
        { href: 'chamcong.html', icon: 'fas fa-calendar-check', text: 'Chấm công' },
        { href: 'tuyendung.html', icon: 'fas fa-user-plus', text: 'Tuyển dụng' },
        { href: 'nghiphep.html', icon: 'fas fa-clock', text: 'Duyệt phép' },
        { href: 'luong.html', icon: 'fas fa-chart-bar', text: 'Báo cáo' },
        { href: 'kpi.html', icon: 'fas fa-bullseye', text: 'Hiệu suất' },
        { href: 'tailieu.html', icon: 'fas fa-file-alt', text: 'Tài liệu' },
        { href: 'lichsu.html', icon: 'fas fa-history', text: 'Lịch sử' }
    ],

    // Cấu hình Menu cho Trưởng phòng
    truongphongMenu: [
        { href: 'truongphong.html', icon: 'fas fa-briefcase', text: 'Phòng ban của tôi' },
        { href: 'truongphong.html#attendance', icon: 'fas fa-clock', text: 'Chấm công' },
        { href: 'truongphong.html#leave', icon: 'fas fa-calendar-alt', text: 'Duyệt phép' },
        { href: 'truongphong.html#salary', icon: 'fas fa-wallet', text: 'Lương' },
        { href: 'truongphong.html#profile', icon: 'fas fa-user', text: 'Hồ sơ cá nhân' }
    ],

    // Cấu hình Menu cho Nhân viên
    userMenu: [
        { href: 'nhanvien.html', icon: 'fas fa-home', text: 'Dashboard' },
        { href: 'nhanvien.html#attendance', icon: 'fas fa-clock', text: 'Chấm công' },
        { href: 'nhanvien.html#leave', icon: 'fas fa-calendar', text: 'Nghỉ phép' },
        { href: 'nhanvien.html#salary', icon: 'fas fa-dollar-sign', text: 'Lương' },
        { href: 'nhanvien.html#notification', icon: 'fas fa-bullhorn', text: 'Thông báo' },
        { href: 'nhanvien.html#profile', icon: 'fas fa-user', text: 'Hồ sơ' }
    ],

    init() {
        document.addEventListener('DOMContentLoaded', () => {
            const currentPath = window.location.pathname.split('/').pop() || 'lanhdao.html';
            const isEmployeePage = currentPath === 'nhanvien.html' || currentPath === 'truongphong.html';

            if (isEmployeePage) {
                this.renderEmployeeLayout();
            } else {
                this.renderAdminLayout();
            }

            this.applyPageTransition();
            this.handleHashNavigation();
        });

        window.addEventListener('hashchange', () => {
            this.handleHashNavigation();
            const currentPath = window.location.pathname.split('/').pop() || 'lanhdao.html';
            if (currentPath === 'nhanvien.html' || currentPath === 'truongphong.html') {
                this.renderEmployeeLayout();
            } else {
                this.renderSidebar();
            }
        });
    },

    renderAdminLayout() {
        this.renderSidebar();
        this.renderHeader();
        this.setupSidebarToggle();
    },

    renderEmployeeLayout() {
        const sidebarContainer = document.getElementById('sidebar-container');
        const headerContainer = document.getElementById('header-container');
        const mainContent = document.querySelector('.main-content');

        if (sidebarContainer) sidebarContainer.innerHTML = ''; // Clear sidebar for employee
        if (mainContent) mainContent.style.marginLeft = '0'; // Center content

        this.renderTopNav();
    },

    renderTopNav() {
        const container = document.getElementById('header-container');
        if (!container) return;

        const userName = AuthManager.getUserName() || 'Người dùng';
        const role = AuthManager.getUserRole();
        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=6366f1&color=fff`;

        // Define correct menu based on role
        let targetMenu = this.userMenu;
        if (role === 'department_head' || role === 'vice_head') {
            targetMenu = this.truongphongMenu;
        }

        container.innerHTML = `
            <nav class="side-nav-portal">
                <div class="nav-brand-vertical">
                    <div class="logo-container sm">
                        <i class="fas fa-users"></i>
                    </div>
                </div>
                
                <div class="nav-menu-vertical">
                    ${targetMenu.map(item => {
            const currentHash = window.location.hash || '#dashboard';
            const itemTarget = item.href.includes('#') ? '#' + item.href.split('#')[1] : '#dashboard';
            const isActive = currentHash === itemTarget;

            // Ẩn tab "Thông báo" khi ở Dashboard theo yêu cầu người dùng
            if (currentHash === '#dashboard' && item.text === 'Thông báo') {
                return '';
            }

            return `
                            <a href="${item.href}" class="nav-link-item-v ${isActive ? 'active' : ''}" title="${item.text}">
                                <i class="${item.icon}"></i>
                                <span class="nav-text">${item.text}</span>
                            </a>
                        `;
        }).join('')}
                </div>

                <div class="nav-user-actions-vertical">
                    <div class="user-profile-v ${window.location.hash === '#profile' ? 'active' : ''}" onclick="window.location.hash='#profile'" title="Hồ sơ">
                        <img src="${avatarUrl}" alt="Avatar">
                    </div>
                    <button class="logout-minimal-btn-v" onclick="logout()" title="Đăng xuất">
                        <i class="fas fa-sign-out-alt"></i>
                    </button>
                </div>
            </nav>
        `;
    },

    handleHashNavigation() {
        const hash = window.location.hash.replace('#', '') || 'dashboard';
        if (typeof showTab === 'function') {
            showTab(hash);
        }
    },

    renderSidebar() {
        const container = document.getElementById('sidebar-container');
        if (!container) return;

        const role = AuthManager.getUserRole();
        let menuItems = this.userMenu;
        if (role === 'admin' || role === 'manager') {
            menuItems = this.lanhdaoMenu; // Or adminMenu if we prefer
        } else if (role === 'department_head' || role === 'vice_head') {
            menuItems = this.truongphongMenu;
        }

        const currentPath = window.location.pathname.split('/').pop() || 'tongquan.html';

        container.innerHTML = `
            <aside class="sidebar" id="sidebar">
                <div class="sidebar-header">
                    <div class="logo-container">
                        <i class="fas fa-users"></i>
                    </div>
                    <span class="logo-text">HRM Pro</span>
                    <button class="toggle-sidebar-btn" id="toggleSidebar" style="background:none; border:none; color:#64748b; margin-left:auto; cursor:pointer;">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                </div>
                <nav class="sidebar-nav">
                    ${menuItems.map(item => {
            const isEmployeeLikePage = currentPath === 'nhanvien.html' || currentPath === 'truongphong.html';
            let isActive = false;

            if (isEmployeeLikePage) {
                const hash = window.location.hash || '#dashboard';
                const itemHash = item.href.includes('#') ? '#' + item.href.split('#')[1] : '#dashboard';
                isActive = hash === itemHash;
            } else {
                isActive = currentPath === item.href;
            }

            return `
                            <a href="${item.href}" class="nav-item ${isActive ? 'active' : ''}">
                                <i class="${item.icon}"></i>
                                <span>${item.text}</span>
                            </a>
                        `;
        }).join('')}
                </nav>
                <div class="sidebar-footer">
                    <a href="taikhoan.html" class="nav-item ${currentPath === 'taikhoan.html' ? 'active' : ''}">
                        <i class="fas fa-cog"></i>
                        <span>Cài đặt</span>
                    </a>
                </div>
            </aside>
        `;
    },

    renderHeader() {
        const container = document.getElementById('header-container');
        if (!container) return;

        const userName = AuthManager.getUserName() || 'Người dùng';
        let userRole = 'Nhân viên';
        const role = AuthManager.getUserRole();
        if (role === 'admin' || role === 'manager') userRole = 'Ban Lãnh Đạo';
        if (role === 'department_head') userRole = 'Trưởng Phòng';
        if (role === 'vice_head') userRole = 'Phó Phòng';
        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=0D8ABC&color=fff`;

        container.innerHTML = `
            <header class="top-header">
                <div class="search-bar">
                    <i class="fas fa-search"></i>
                    <input type="text" placeholder="Tìm kiếm...">
                </div>
                <div class="header-actions">
                    <div class="notification-wrapper">
                        <button class="icon-btn" id="notificationBtn">
                            <i class="fas fa-bell"></i>
                            <span id="notificationBadge"></span>
                        </button>
                        <div class="notification-dropdown" id="notificationDropdown">
                            <div class="notification-header">
                                <h4>Thông báo</h4>
                                <button class="btn-link" onclick="UIComponents.clearAllNotifications()" style="font-size: 0.8rem;">Xóa tất cả</button>
                            </div>
                            <div class="notification-list" id="notificationList">
                                <div class="no-notifications">
                                    <i class="fas fa-bell-slash"></i>
                                    <p>Không có thông báo mới</p>
                                </div>
                            </div>
                            <div class="notification-footer">
                                <a href="#">Xem tất cả</a>
                            </div>
                        </div>
                    </div>
                    <div class="user-menu" onclick="window.location.href='taikhoan.html'">
                        <div class="avatar">
                            <img src="${avatarUrl}" alt="Avatar" style="width:100%; height:100%; border-radius:50%;">
                        </div>
                        <div class="user-info">
                            <p class="user-name">${userName}</p>
                            <p class="user-role">${userRole}</p>
                        </div>
                        <i class="fas fa-chevron-down text-muted" style="font-size: 0.8rem;"></i>
                    </div>
                    <button class="icon-btn" onclick="logout()" title="Đăng xuất">
                        <i class="fas fa-sign-out-alt"></i>
                    </button>
                </div>
            </header>
        `;

        this.setupNotificationListeners();
        this.loadNotifications();
    },

    setupNotificationListeners() {
        const btn = document.getElementById('notificationBtn');
        const dropdown = document.getElementById('notificationDropdown');

        if (btn && dropdown) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('show');
            });

            document.addEventListener('click', (e) => {
                if (!dropdown.contains(e.target) && e.target !== btn) {
                    dropdown.classList.remove('show');
                }
            });
        }

        // Listen for real-time notifications
        if (typeof DataSync !== 'undefined') {
            DataSync.on('notification:created', () => {
                this.loadNotifications();
            });
        }
    },

    async loadNotifications() {
        if (typeof NotificationAPI === 'undefined') return;

        try {
            const notifications = await NotificationAPI.getAll();
            this.renderNotifications(notifications);
            this.updateNotificationBadge(notifications);
        } catch (error) {
            console.error('Failed to load notifications:', error);
        }
    },

    updateNotificationBadge(notifications) {
        const badge = document.getElementById('notificationBadge');
        if (!badge) return;

        const unreadCount = notifications.filter(n => !n.isRead).length;
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    },

    renderNotifications(notifications) {
        const list = document.getElementById('notificationList');
        if (!list) return;

        if (notifications.length === 0) {
            list.innerHTML = `
                <div class="no-notifications">
                    <i class="fas fa-bell-slash"></i>
                    <p>Không có thông báo mới</p>
                </div>
            `;
            return;
        }

        list.innerHTML = notifications.map(n => `
            <div class="notification-item ${n.isRead ? '' : 'unread'}" onclick="UIComponents.handleNotificationClick('${n._id}')">
                <div class="notification-icon ${n.type || 'info'}">
                    <i class="fas ${this.getNotificationIcon(n.type)}"></i>
                </div>
                <div class="notification-content">
                    <div class="notification-title">${escapeHtml(n.title)}</div>
                    <div class="notification-message">${escapeHtml(n.message)}</div>
                    <div class="notification-time">${getTimeAgo(n.createdAt)}</div>
                </div>
            </div>
        `).join('');
    },

    getNotificationIcon(type) {
        switch (type) {
            case 'success': return 'fa-check';
            case 'warning': return 'fa-exclamation-triangle';
            case 'error': return 'fa-times-circle';
            default: return 'fa-info-circle';
        }
    },

    async handleNotificationClick(id) {
        try {
            await NotificationAPI.markAsRead(id);
            this.loadNotifications();
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    },

    async clearAllNotifications() {
        if (!confirm('Bạn có muốn xóa tất cả thông báo?')) return;
        try {
            const notifications = await NotificationAPI.getAll();
            for (const n of notifications) {
                await NotificationAPI.delete(n._id);
            }
            this.loadNotifications();
        } catch (error) {
            console.error('Failed to clear notifications:', error);
        }
    },

    setupSidebarToggle() {
        const toggleBtn = document.getElementById('toggleSidebar');
        const sidebar = document.getElementById('sidebar');
        if (toggleBtn && sidebar) {
            toggleBtn.addEventListener('click', () => {
                sidebar.classList.toggle('collapsed');
                const icon = toggleBtn.querySelector('i');
                if (sidebar.classList.contains('collapsed')) {
                    icon.className = 'fas fa-chevron-right';
                } else {
                    icon.className = 'fas fa-chevron-left';
                }
            });
        }
    },

    applyPageTransition() {
        // Thêm class để kích hoạt animation khi trang load
        const content = document.querySelector('.main-content');
        if (content) {
            content.classList.add('page-fade-in');
        }
    }
};

UIComponents.init();
