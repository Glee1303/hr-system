const API_BASE_URL = (window.location.origin.startsWith('http') ? window.location.origin : 'http://localhost:5000') + '/api';
const API_TIMEOUT = 10000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// api-Cache
class APICache {
    constructor() {
        this.cache = new Map();
        this.ttls = new Map();
    }

    set(key, value, ttl = 5 * 60 * 1000) {
        this.cache.set(key, value);
        if (this.ttls.has(key)) clearTimeout(this.ttls.get(key));

        const timer = setTimeout(() => {
            this.cache.delete(key);
            this.ttls.delete(key);
        }, ttl);

        this.ttls.set(key, timer);
    }

    get(key) {
        return this.cache.get(key) || null;
    }

    has(key) {
        return this.cache.has(key);
    }

    clear(key) {
        if (key) {
            if (this.ttls.has(key)) clearTimeout(this.ttls.get(key));
            this.cache.delete(key);
        } else {
            this.cache.clear();
            this.ttls.forEach(timer => clearTimeout(timer));
            this.ttls.clear();
        }
    }
}

const apiCache = new APICache();

const CACHE_TTL = {
    ATTENDANCE: 3 * 60 * 1000,
    LEAVE: 3 * 60 * 1000,
    EMPLOYEES: 5 * 60 * 1000,
    ACCOUNTS: 10 * 60 * 1000,
    SALARIES: 10 * 60 * 1000,
    DOCUMENTS: 15 * 60 * 1000
};

const StorageManager = {
    storage: null,
    inMemoryData: {},

    init() {
        try {
            localStorage.setItem('__test__', '1');
            localStorage.removeItem('__test__');
            this.storage = localStorage;
            return;
        } catch (e) {
            console.warn('⚠️ localStorage failed');
        }

        try {
            sessionStorage.setItem('__test__', '1');
            sessionStorage.removeItem('__test__');
            this.storage = sessionStorage;
            return;
        } catch (e) {
            console.warn('sessionStorage failed');
        }

        this.storage = {
            setItem: (k, v) => { this.inMemoryData[k] = v; },
            getItem: (k) => this.inMemoryData[k] || null,
            removeItem: (k) => { delete this.inMemoryData[k]; },
            clear: () => { this.inMemoryData = {}; }
        };
    },

    // For "logout on close" feature, we need to access sessionStorage specifically
    session: window.sessionStorage,

    setItem(k, v) {
        if (!this.storage) this.init();
        this.storage.setItem(k, v);
    },

    getItem(k) {
        if (!this.storage) this.init();
        return this.storage.getItem(k);
    },

    removeItem(k) {
        if (!this.storage) this.init();
        this.storage.removeItem(k);
    },

    clear() {
        if (!this.storage) this.init();
        this.storage.clear();
    },

    setSession(k, v) {
        if (this.session) this.session.setItem(k, v);
    },

    getSession(k) {
        return this.session ? this.session.getItem(k) : null;
    }
};

StorageManager.init();

const AuthManager = {
    setAuth(token, user) {
        try {
            // Sử dụng sessionStorage cho token để tự động đăng xuất khi tắt ứng dụng
            StorageManager.setSession('token', token);

            StorageManager.setItem('userName', user.name || user.username);
            StorageManager.setItem('userId', user._id);
            StorageManager.setItem('userRole', user.role);
            StorageManager.setItem('userEmail', user.email || '');
            StorageManager.setItem('loginTime', new Date().toISOString());
            return true;
        } catch (err) {
            console.error('Auth save failed:', err);
            return false;
        }
    },

    getToken() {
        return StorageManager.getSession('token');
    },

    getUserName() {
        return StorageManager.getItem('userName') || 'User';
    },

    getUserEmail() {
        return StorageManager.getItem('userEmail') || 'user@example.com';
    },

    getUserId() {
        return StorageManager.getItem('userId');
    },

    getUserRole() {
        return StorageManager.getItem('userRole');
    },

    isLoggedIn() {
        return !!this.getToken();
    },

    checkAuth() {
        const token = this.getToken();
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        const publicPages = ['dangnhap.html', 'login.html', 'index.html', ''];

        console.log(`[AuthCheck] Page: ${currentPage}, HasToken: ${!!token}`);

        if (publicPages.includes(currentPage)) {
            return true;
        }

        if (!token) {
            console.warn('[AuthCheck] No token found, redirecting to login...');
            window.location.href = 'dangnhap.html';
            return false;
        }

        return true;
    },

    logout() {
        try {
            StorageManager.removeItem('token');
            StorageManager.removeItem('userName');
            StorageManager.removeItem('userId');
            StorageManager.removeItem('userRole');
            StorageManager.removeItem('userEmail');
            StorageManager.removeItem('currentUserProfile');
            apiCache.clear();
        } catch (e) {
            console.error('Logout error:', e);
        }
        window.location.href = 'dangnhap.html';
    }
};

(function () {
    'use strict';
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const publicPages = ['dangnhap.html', 'login.html', 'index.html', ''];

    if (!publicPages.includes(currentPage)) {
        const token = StorageManager.getItem('token');
        if (!token) {
            window.location.href = 'dangnhap.html';
        }
    }
})();

// ==================== API CALL FUNCTIONS ====================
async function apiCallWithRetry(method, endpoint, data = null, maxRetries = MAX_RETRIES) {
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await apiCallRaw(method, endpoint, data);
        } catch (error) {
            lastError = error;

            if (error.status >= 400 && error.status < 500 && error.status !== 429) {
                throw error;
            }

            if (attempt === maxRetries) {
                throw error;
            }

            const delay = RETRY_DELAY * Math.pow(2, attempt);
            console.warn(`Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

async function apiCallRaw(method, endpoint, data = null) {
    const token = AuthManager.getToken();
    if (!token) {
        throw new Error('Token not found - Please login');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    try {
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            signal: controller.signal
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

        if (response.status === 401) {
            AuthManager.logout();
            throw new Error('Session expired');
        }

        const result = await response.json();

        if (!response.ok) {
            const error = new Error(result.message || `HTTP ${response.status}`);
            error.status = response.status;
            throw error;
        }

        return result;

    } finally {
        clearTimeout(timeoutId);
    }
}

async function apiCallFormData(method, endpoint, formData) {
    const token = AuthManager.getToken();
    if (!token) {
        throw new Error('Token not found - Please login');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    try {
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData,
            signal: controller.signal
        };

        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

        if (response.status === 401) {
            AuthManager.logout();
            throw new Error('Session expired');
        }

        const result = await response.json();

        if (!response.ok) {
            const error = new Error(result.message || `HTTP ${response.status}`);
            error.status = response.status;
            throw error;
        }

        return result;

    } finally {
        clearTimeout(timeoutId);
    }
}

// ==================== HELPER ====================
const normalizeResponse = (result) => {
    if (Array.isArray(result)) return result;
    if (result.data && Array.isArray(result.data)) return result.data;
    if (result.records && Array.isArray(result.records)) return result.records;
    if (result.items && Array.isArray(result.items)) return result.items;
    if (result._id) return result;
    return [];
};

// ==================== AUTH API ====================
const AuthAPI = {
    async login(username, password) {
        const result = await apiCallWithRetry('POST', '/auth/login', { username, password });
        return result.data || result;
    },

    async logout() {
        try {
            const result = await apiCallWithRetry('POST', '/auth/logout');
            return result;
        } catch (error) {
            console.warn('Logout API failed:', error);
            return true;
        }
    },

    async getCurrentUser() {
        try {
            const result = await apiCallWithRetry('GET', '/auth/me');
            return result.data || result;
        } catch (error) {
            console.warn('Get current user failed:', error);
            throw error;
        }
    },

    async changePassword(currentPassword, newPassword) {
        const result = await apiCallWithRetry('PUT', '/auth/change-password', {
            currentPassword,
            newPassword
        });
        return result;
    },

    async verifyPassword(password) {
        const result = await apiCallWithRetry('POST', '/auth/verify-password', { password });
        return result;
    },

    async refreshToken() {
        try {
            const result = await apiCallWithRetry('POST', '/auth/refresh-token');
            if (result.token) {
                StorageManager.setItem('token', result.token);
            }
            return result;
        } catch (error) {
            console.warn('Token refresh failed:', error);
            AuthManager.logout();
            throw error;
        }
    }
};

// ==================== EMPLOYEE API ====================
const EmployeeAPI = {
    async getAll() {
        const cacheKey = 'employees_all';
        if (apiCache.has(cacheKey)) {
            console.log('✓ Cache hit: employees');
            return apiCache.get(cacheKey);
        }

        const result = await apiCallWithRetry('GET', '/employees');
        const employees = normalizeResponse(result);
        apiCache.set(cacheKey, employees, CACHE_TTL.EMPLOYEES);//lưu dữ liệu vào cache
        return employees;
    },

    async getById(id) {
        const cacheKey = `employee_${id}`;
        if (apiCache.has(cacheKey)) {
            return apiCache.get(cacheKey);
        }

        const result = await apiCallWithRetry('GET', `/employees/${id}`);
        const employee = result.data || result;
        apiCache.set(cacheKey, employee);
        return employee;
    },

    async create(data) {
        const result = await apiCallWithRetry('POST', '/employees', data);
        this.clearCache();
        return result.data || result;
    },

    async update(id, data) {
        const result = await apiCallWithRetry('PUT', `/employees/${id}`, data);
        this.clearCache();
        return result.data || result;
    },

    async delete(id) {
        const result = await apiCallWithRetry('DELETE', `/employees/${id}`);
        this.clearCache();
        return result;
    },

    clearCache() {
        apiCache.clear('employees_all');
        // Clear individual employee caches if needed
        for (let [key] of apiCache.cache) {
            if (key.startsWith('employee_')) apiCache.clear(key);
        }
    }
};

const AccountAPI = {
    async getAll() {
        const cacheKey = 'account_all';
        if (apiCache.has(cacheKey)) {
            console.log('✓ Cache hit: accounts');
            return apiCache.get(cacheKey);
        }

        console.log('📡 Fetching accounts from API...');

        const result = await apiCallWithRetry('GET', '/accounts');
        console.log('📥 Raw API response:', result);

        const accounts = normalizeResponse(result);

        console.log(`\n📋 Parsed ${accounts.length} accounts from response:`);
        accounts.forEach((acc, idx) => {
            console.log(`\n   [${idx + 1}] ${acc.fullName} (${acc.username})`);
            console.log(`       - Email: ${acc.email}`);
            console.log(`       - Department field: "${acc.department}"`);
            console.log(`       - Has department: ${!!acc.department}`);
            console.log(`       - Department empty: ${!acc.department || acc.department.trim() === ''}`);
            console.log(`       - Role: ${acc.role}`);
        });

        apiCache.set(cacheKey, accounts, CACHE_TTL.ACCOUNTS);
        return accounts;
    },

    async getById(id) {
        const result = await apiCallWithRetry('GET', `/accounts/${id}`);
        return result.data || result;
    },

    async create(data) {
        const result = await apiCallWithRetry('POST', '/accounts', data);
        apiCache.clear('account_all');
        return result.data || result;
    },

    async update(id, data) {
        const result = await apiCallWithRetry('PUT', `/accounts/${id}`, data);
        apiCache.clear('account_all');
        return result;
    },

    async resetPassword(id, newPassword) {
        return await apiCallWithRetry('PUT', `/accounts/${id}/reset-password`, { newPassword });
    },

    async delete(id) {
        const result = await apiCallWithRetry('DELETE', `/accounts/${id}`);
        this.clearCache();
        return result;
    },

    clearCache() {
        apiCache.clear('account_all');
    }
};

const AttendanceAPI = {
    async getAll() {
        const cacheKey = 'attendance_all';
        if (apiCache.has(cacheKey)) {
            return apiCache.get(cacheKey);
        }

        const result = await apiCallWithRetry('GET', '/attendance');
        const data = normalizeResponse(result);
        apiCache.set(cacheKey, data, CACHE_TTL.ATTENDANCE);
        return data;
    },

    async create(data) {
        const result = await apiCallWithRetry('POST', '/attendance', data);
        apiCache.clear('attendance_all');
        return result.data || result;
    },

    async update(id, data) {
        const result = await apiCallWithRetry('PUT', `/attendance/${id}`, data);
        apiCache.clear('attendance_all');
        return result.data || result;
    },

    async delete(id) {
        const result = await apiCallWithRetry('DELETE', `/attendance/${id}`);
        this.clearCache();
        return result;
    },

    clearCache() {
        apiCache.clear('attendance_all');
    }
};

const LeaveAPI = {
    async getAll() {
        const cacheKey = 'leave_all';
        if (apiCache.has(cacheKey)) {
            return apiCache.get(cacheKey);
        }

        const result = await apiCallWithRetry('GET', '/leaves');
        const data = normalizeResponse(result);
        apiCache.set(cacheKey, data, CACHE_TTL.LEAVE);
        return data;
    },

    async create(data) {
        const result = await apiCallWithRetry('POST', '/leaves', data);
        apiCache.clear('leave_all');
        return result.data || result;
    },

    async update(id, data) {
        const result = await apiCallWithRetry('PUT', `/leaves/${id}`, data);
        apiCache.clear('leave_all');
        return result.data || result;
    },

    async delete(id) {
        const result = await apiCallWithRetry('DELETE', `/leaves/${id}`);
        this.clearCache();
        return result;
    },

    clearCache() {
        apiCache.clear('leave_all');
    }
};

const SalaryAPI = {
    async getAll() {
        const cacheKey = 'salary_all';
        if (apiCache.has(cacheKey)) {
            return apiCache.get(cacheKey);
        }

        const result = await apiCallWithRetry('GET', '/salaries');
        const data = normalizeResponse(result);
        apiCache.set(cacheKey, data, CACHE_TTL.SALARIES);
        return data;
    },

    async create(data) {
        const result = await apiCallWithRetry('POST', '/salaries', data);
        apiCache.clear('salary_all');
        return result.data || result;
    },

    async update(id, data) {
        const result = await apiCallWithRetry('PUT', `/salaries/${id}`, data);
        apiCache.clear('salary_all');
        return result.data || result;
    },

    async delete(id) {
        const result = await apiCallWithRetry('DELETE', `/salaries/${id}`);
        this.clearCache();
        return result;
    },

    clearCache() {
        apiCache.clear('salary_all');
    }
};

const DocumentAPI = {
    async getAll() {
        const cacheKey = 'document_all';
        if (apiCache.has(cacheKey)) {
            return apiCache.get(cacheKey);
        }

        const result = await apiCallWithRetry('GET', '/documents');
        const data = normalizeResponse(result);
        apiCache.set(cacheKey, data, CACHE_TTL.DOCUMENTS);
        return data;
    },

    async create(data) {
        const result = await apiCallWithRetry('POST', '/documents', data);
        apiCache.clear('document_all');
        return result.data || result;
    },

    async delete(id) {
        const result = await apiCallWithRetry('DELETE', `/documents/${id}`);
        apiCache.clear('document_all');
        return result;
    }
};

const NotificationAPI = {
    async getAll() {
        try {
            const result = await apiCallWithRetry('GET', '/notifications');
            return normalizeResponse(result);
        } catch (error) {
            console.error('Error loading notifications:', error);
            return [];
        }
    },

    async create(data) {
        const result = await apiCallWithRetry('POST', '/notifications', data);
        return result.data || result;
    },

    async markAsRead(id) {
        return await apiCallWithRetry('PUT', `/notifications/${id}/read`, {});
    },

    async delete(id) {
        return await apiCallWithRetry('DELETE', `/notifications/${id}`);
    }
};

const CandidateAPI = {
    async getAll() {
        const result = await apiCallWithRetry('GET', '/candidates');
        return normalizeResponse(result);
    },

    async getById(id) {
        const result = await apiCallWithRetry('GET', `/candidates/${id}`);
        return result.data || result;
    },

    async create(data) {
        const result = await apiCallWithRetry('POST', '/candidates', data);
        return result.data || result;
    },

    async update(id, data) {
        const result = await apiCallWithRetry('PUT', `/candidates/${id}`, data);
        return result.data || result;
    },

    async delete(id) {
        return await apiCallWithRetry('DELETE', `/candidates/${id}`);
    }
};

const JobAPI = {
    async getAll() {
        const result = await apiCallWithRetry('GET', '/jobs');
        return normalizeResponse(result);
    },

    async create(data) {
        const result = await apiCallWithRetry('POST', '/jobs', data);
        return result.data || result;
    },

    async delete(id) {
        return await apiCallWithRetry('DELETE', `/jobs/${id}`);
    }
};

const DepartmentAPI = {
    async getAll() {
        const cacheKey = 'department_all';
        if (apiCache.has(cacheKey)) {
            return apiCache.get(cacheKey);
        }

        const result = await apiCallWithRetry('GET', '/departments');
        const departments = normalizeResponse(result);
        apiCache.set(cacheKey, departments, CACHE_TTL.EMPLOYEES);
        return departments;
    },

    async getById(id) {
        const cacheKey = `department_${id}`;
        if (apiCache.has(cacheKey)) {
            return apiCache.get(cacheKey);
        }

        const result = await apiCallWithRetry('GET', `/departments/${id}`);
        const department = result.data || result;
        apiCache.set(cacheKey, department);
        return department;
    },

    async create(data) {
        const result = await apiCallWithRetry('POST', '/departments', data);
        apiCache.clear('department_all');
        return result.data || result;
    },

    async update(id, data) {
        const result = await apiCallWithRetry('PUT', `/departments/${id}`, data);
        apiCache.clear(`department_${id}`);
        apiCache.clear('department_all');
        return result.data || result;
    },

    async delete(id) {
        const result = await apiCallWithRetry('DELETE', `/departments/${id}`);
        this.clearCache();
        return result;
    },

    clearCache() {
        apiCache.clear('department_all');
        for (let [key] of apiCache.cache) {
            if (key.startsWith('department_')) apiCache.clear(key);
        }
    }
};

const KpiAPI = {
    async getAll() {
        const cacheKey = 'kpi_all';
        if (apiCache.has(cacheKey)) {
            return apiCache.get(cacheKey);
        }

        const result = await apiCallWithRetry('GET', '/kpis');
        const data = normalizeResponse(result);
        apiCache.set(cacheKey, data, CACHE_TTL.EMPLOYEES);
        return data;
    },

    async create(data) {
        const result = await apiCallWithRetry('POST', '/kpis', data);
        apiCache.clear('kpi_all');
        return result.data || result;
    },

    async update(id, data) {
        const result = await apiCallWithRetry('PUT', `/kpis/${id}`, data);
        apiCache.clear('kpi_all');
        return result.data || result;
    },

    async delete(id) {
        const result = await apiCallWithRetry('DELETE', `/kpis/${id}`);
        apiCache.clear('kpi_all');
        return result;
    }
};

const ActivityLogAPI = {
    async getAll() {
        const result = await apiCallWithRetry('GET', '/activity-logs');
        return normalizeResponse(result);
    },

    async getByUser(userId) {
        const result = await apiCallWithRetry('GET', `/activity-logs/user/${userId}`);
        return normalizeResponse(result);
    },

    async getStats() {
        const result = await apiCallWithRetry('GET', '/activity-logs/stats');
        return result.data || result;
    }
};

const StatsAPI = {
    async getDashboardStats() {
        const result = await apiCallWithRetry('GET', '/stats/dashboard');
        return result.data || result;
    },

    async getAttendanceStats() {
        const result = await apiCallWithRetry('GET', '/stats/attendance');
        return result.data || result;
    }
};