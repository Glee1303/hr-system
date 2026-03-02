//Kiểm tra user, chuyển hướng theo vai trò
(function checkExistingLogin() {
    const token = AuthManager.getToken();
    const role = AuthManager.getUserRole();

    if (token && role) {
        if (['admin', 'manager'].includes(role)) {
            window.location.href = 'lanhdao.html';
        } else if (['department_head', 'vice_head'].includes(role)) {
            window.location.href = 'truongphong.html';
        } else if (['employee', 'auditor'].includes(role)) {
            window.location.href = 'nhanvien.html';
        } else {
            window.location.href = 'dangnhap.html';
        }

        return;
    }
})();

const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');

if (usernameInput && passwordInput) {
    [usernameInput, passwordInput].forEach(input => {
        input.addEventListener('input', function () {
            this.classList.remove('error');
        });
    });
}

if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const username = usernameInput?.value?.trim() || '';
        const password = passwordInput?.value || '';

        //Xóa cache cũ trước khi đăng nhập
        try {
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
            localStorage.removeItem('userRole');
            localStorage.removeItem('userId');
            sessionStorage.clear();
        } catch (e) { }

        //Validation
        if (!username || !password) {
            showNotification('Vui lòng nhập tài khoản và mật khẩu', 'error');
            return;
        }

        //Min length validation
        if (username.length < 3) {
            showNotification('Tài khoản tối thiểu 3 ký tự', 'error');
            return;
        }

        if (password.length < 6) {
            showNotification('Mật khẩu tối thiểu 6 ký tự', 'error');
            return;
        }

        const role = username === 'admin' ? 'admin' : 'employee';
        await performLogin(username, password, role);
    });
}
//Xác thực đăng nhập, lưu token và thông tin
async function performLogin(username, password, role) {
    if (!loginBtn) return;
    try {
        localStorage.removeItem('token');
        localStorage.removeItem('userName');
        localStorage.removeItem('userId');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('loginTime');
        sessionStorage.clear();
    } catch (e) { }

    loginBtn.disabled = true;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang đăng nhập...';

    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if (!result.success) {
            alert('Đăng nhập thất bại: ' + (result.message || 'Lỗi không xác định'));
            showNotification(result.message || 'Đăng nhập thất bại', 'error');
            resetLoginButton();
            if (passwordInput) passwordInput.value = '';
            return;
        }

        // Lấy vai trò thực tế từ phản hồi của CSDL
        const userRole = result.user.role;
        // Lưu dữ liệu sau khi xác thực
        const authSuccess = AuthManager.setAuth(result.token, result.user);

        // Xóa cache profile nhân viên để đảm bảo tải dữ liệu mới nhất từ DB
        localStorage.removeItem('currentUserProfile');

        if (!authSuccess) {
            showNotification('Lỗi: Không thể lưu dữ liệu đăng nhập', 'error');
            resetLoginButton();
            return;
        }

        showNotification('Đăng nhập thành công!', 'success');
        loginBtn.innerHTML = '<i class="fas fa-check"></i> Thành công!';
        loginBtn.style.background = 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)';

        // Chuyển hướng vai trò thực tế dựa vào database
        setTimeout(() => {
            console.log('Redirecting based on role:', userRole);
            console.log('Current path:', window.location.pathname);

            if (['admin', 'manager'].includes(userRole)) {
                console.log('Redirecting to lanhdao.html');
                window.location.href = 'lanhdao.html';
            } else if (['department_head', 'vice_head'].includes(userRole)) {
                console.log('Redirecting to truongphong.html');
                window.location.href = 'truongphong.html';
            } else {
                console.log('Redirecting to nhanvien.html');
                window.location.href = 'nhanvien.html';
            }
        }, 1000);

    } catch (error) {
        console.error('Login error:', error);
        alert('Lỗi kết nối đến server: ' + error.message);
        showNotification('Lỗi kết nối! Kiểm tra backend', 'error');
        resetLoginButton();
    }
}

//Reset trang thái nút đăng nhập
function resetLoginButton() {
    if (!loginBtn) return;
    loginBtn.disabled = false;
    loginBtn.innerHTML = '<span>Đăng nhập</span>';
    loginBtn.style.background = '';
}

document.addEventListener('DOMContentLoaded', () => {
});