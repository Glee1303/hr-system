document.addEventListener('DOMContentLoaded', function () {
    // Check Auth
    if (!AuthManager.checkAuth()) {
        window.location.href = './dangnhap.html';
        return;
    }

    // Role-based visibility
    const userRole = AuthManager.getUserRole();
    if (userRole !== 'admin') {
        const adminOnlyTabs = document.querySelectorAll('.admin-only');
        adminOnlyTabs.forEach(tab => tab.style.display = 'none');
    }

    // Initialize UI
    initTabs();
    loadProfileData();
    initThemePicker();
    initColorPicker();

    // Form Listeners
    setupFormListeners();
});

/**
 * Tab Navigation Logic
 */
function initTabs() {
    const tabs = document.querySelectorAll('.settings-tab');
    const sections = document.querySelectorAll('.settings-section');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const sectionId = tab.getAttribute('data-section');

            // Update Tab Active State
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update Section Visibility
            sections.forEach(section => {
                section.classList.remove('active');
                if (section.id === `section-${sectionId}`) {
                    section.classList.add('active');
                }
            });
        });
    });
}

/**
 * Profile Logic
 */
async function loadProfileData() {
    const userName = AuthManager.getUserName();
    const userRole = AuthManager.getUserRole();

    // Set static info
    document.getElementById('prof-fullName').value = userName;
    document.getElementById('prof-email').value = localStorage.getItem('userEmail') || 'user@example.com';
    document.getElementById('prof-dept').value = localStorage.getItem('userDept') || 'Phòng Nhân sự';
    document.getElementById('prof-phone').value = '0901 234 567';
    document.getElementById('profile-avatar').src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=2563eb&color=fff`;
}

function setupFormListeners() {
    // Profile Form
    document.getElementById('profile-form').addEventListener('submit', (e) => {
        e.preventDefault();
        showNotification('Đã cập nhật thông tin hồ sơ!', 'success');
    });

    // Password Form
    document.getElementById('password-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const newPass = document.getElementById('new-pass').value;
        const confPass = document.getElementById('conf-pass').value;

        if (newPass !== confPass) {
            showNotification('Mật khẩu xác nhận không khớp!', 'error');
            return;
        }

        if (newPass.length < 6) {
            showNotification('Mật khẩu phải từ 6 ký tự trở lên!', 'warning');
            return;
        }

        showNotification('Đã thay đổi mật khẩu thành công!', 'success');
        e.target.reset();
    });

    // Company Form
    document.getElementById('company-form').addEventListener('submit', (e) => {
        e.preventDefault();
        showNotification('Đã lưu cấu hình công ty!', 'success');
    });
}

/**
 * Interface Settings
 */
function initThemePicker() {
    const themeCards = document.querySelectorAll('.theme-card');
    const currentTheme = localStorage.getItem('hrm-theme') || 'light';

    themeCards.forEach(card => {
        if (card.getAttribute('data-theme') === currentTheme) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }

        card.addEventListener('click', () => {
            const theme = card.getAttribute('data-theme');
            themeCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            localStorage.setItem('hrm-theme', theme);
            showNotification(`Đã chuyển sang chế độ ${theme === 'dark' ? 'tối' : 'sáng'}`, 'info');
        });
    });
}

function initColorPicker() {
    const swatches = document.querySelectorAll('.color-swatch');
    const currentColor = localStorage.getItem('hrm-primary-color') || 'blue';

    swatches.forEach(swatch => {
        if (swatch.getAttribute('data-color') === currentColor) {
            swatch.classList.add('active');
        }

        swatch.addEventListener('click', () => {
            const color = swatch.getAttribute('data-color');
            swatches.forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            localStorage.setItem('hrm-primary-color', color);
            showNotification('Đã cập nhật màu sắc chủ đạo!', 'info');
        });
    });
}
