let allCandidates = [];
let allJobs = [];

document.addEventListener('DOMContentLoaded', async () => {
    if (!AuthManager.checkAuth()) return;

    loadInitialData();
});

async function loadInitialData() {
    try {
        await Promise.all([
            loadCandidates(),
            loadJobs()
        ]);
        initKanban();
    } catch (error) {
        console.error('Error loading initial recruitment data:', error);
    }
}

async function loadCandidates() {
    try {
        allCandidates = await CandidateAPI.getAll();
        renderKanban();
    } catch (error) {
        showNotification('Lỗi tải danh sách ứng viên', 'error');
    }
}

async function loadJobs() {
    try {
        allJobs = await JobAPI.getAll();
        renderJobs();
    } catch (error) {
        // Jobs might not be implemented yet on backend, fail gracefully
        console.warn('Jobs API may not be available yet');
        renderJobsPlaceholder();
    }
}

function initKanban() {
    const listIds = ['list-applied', 'list-interview', 'list-offer', 'list-hired'];

    listIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            Sortable.create(el, {
                group: 'recruitment',
                animation: 150,
                ghostClass: 'kanban-ghost',
                onEnd: async (evt) => {
                    const candidateId = evt.item.dataset.id;
                    const newStatus = evt.to.id.replace('list-', '');
                    await updateCandidateStatus(candidateId, newStatus);
                }
            });
        }
    });
}

function renderKanban() {
    const lists = {
        applied: document.getElementById('list-applied'),
        interview: document.getElementById('list-interview'),
        offer: document.getElementById('list-offer'),
        hired: document.getElementById('list-hired')
    };

    // Clear lists
    Object.values(lists).forEach(l => { if (l) l.innerHTML = ''; });

    const statusCounts = { applied: 0, interview: 0, offer: 0, hired: 0 };

    allCandidates.forEach(cand => {
        const status = cand.status || 'applied';
        const listEl = lists[status];
        if (listEl) {
            statusCounts[status]++;
            const card = document.createElement('div');
            card.className = 'kanban-card';
            card.dataset.id = cand._id;

            const sourceLabel = getSourceLabel(cand.source);

            card.innerHTML = `
                <div class="card-header-cand">
                    <span class="cand-name">${escapeHtml(cand.name)}</span>
                    <button class="btn-delete-cand" onclick="deleteCandidate('${cand._id}')" title="Xóa ứng viên">&times;</button>
                </div>
                <div class="cand-info">
                    <div class="cand-pos"><i class="fas fa-briefcase"></i> ${escapeHtml(cand.candPosition || 'Chưa rõ')}</div>
                    <div class="cand-contact"><i class="fas fa-phone"></i> ${cand.phone || '-'}</div>
                    ${cand.source ? `<div class="cand-meta"><span class="badge-source">${sourceLabel}</span></div>` : ''}
                </div>
            `;
            listEl.appendChild(card);
        }
    });

    // Update counts
    Object.keys(statusCounts).forEach(s => {
        const countEl = document.getElementById(`count-${s}`);
        if (countEl) countEl.textContent = statusCounts[s];
    });
}

function renderJobs() {
    const container = document.getElementById('job-list');
    if (!container) return;

    if (!allJobs || allJobs.length === 0) {
        renderJobsPlaceholder();
        return;
    }

    container.innerHTML = allJobs.map(job => `
        <div class="job-item-premium" style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid #f1f5f9;">
            <div>
                <h4 style="font-weight: 600; color: #1e293b;">${escapeHtml(job.title)}</h4>
                <p style="font-size: 0.8125rem; color: #64748b;">${escapeHtml(job.department)} • ${escapeHtml(job.type)}</p>
            </div>
            <div style="text-align: right;">
                <span class="badge-status-premium">${job.status === 'open' ? 'Đang tuyển' : 'Đã đóng'}</span>
                <p style="font-size: 0.75rem; color: #94a3b8; margin-top: 4px;">${job.candidateCount || 0} ứng viên</p>
            </div>
        </div>
    `).join('');
}

function renderJobsPlaceholder() {
    const container = document.getElementById('job-list');
    if (!container) return;
    container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: #94a3b8;">
            <i class="fas fa-briefcase" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i>
            <p>Chưa có thông tin tuyển dụng</p>
        </div>
    `;
}

function getSourceLabel(source) {
    const sources = {
        'fb': 'Facebook',
        'li': 'LinkedIn',
        'ref': 'Giới thiệu',
        'web': 'Website'
    };
    return sources[source] || source || 'Khác';
}

async function updateCandidateStatus(id, newStatus) {
    try {
        await CandidateAPI.update(id, { status: newStatus });

        // Update local data
        const cand = allCandidates.find(c => c._id === id);
        if (cand) cand.status = newStatus;
        updateCounts();
    } catch (error) {
        showNotification('Lỗi khi cập nhật trạng thái', 'error');
        loadCandidates(); // Reload to sync with server
    }
}

function updateCounts() {
    const statuses = ['applied', 'interview', 'offer', 'hired'];
    statuses.forEach(s => {
        const count = allCandidates.filter(c => (c.status || 'applied') === s).length;
        const countEl = document.getElementById(`count-${s}`);
        if (countEl) countEl.textContent = count;
    });
}

function toggleCandidateForm() {
    const container = document.getElementById('inlineCandidateFormContainer');
    const btn = document.querySelector('.page-title-section .btn-primary');

    if (container.style.display === 'none') {
        container.innerHTML = `
            <div class="bg-card shadow-card" style="margin-bottom: 2rem; padding: 2rem; border-radius: 1rem; border: 1px solid #e2e8f0; animation: slideDown 0.3s ease-out;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                    <h3 style="font-weight: 700; color: #1e293b; margin: 0;">
                        <i class="fas fa-user-plus" style="color: #3b82f6; margin-right: 0.5rem;"></i> Thêm ứng viên mới
                    </h3>
                    <button onclick="toggleCandidateForm()" style="background:none; border:none; cursor:pointer; color:#64748b; font-size: 1.25rem;">&times;</button>
                </div>
                <form id="inlineCandidateForm">
                    <div class="form-grid" style="margin-bottom: 1.5rem;">
                        <div class="portal-form-group" style="grid-column: 1 / -1;">
                            <label>Họ và tên ứng viên *</label>
                            <input type="text" id="candName" class="portal-input" required placeholder="Nhập họ và tên đầy đủ">
                        </div>
                    </div>
                    <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
                        <div class="portal-form-group">
                            <label>Vị trí ứng tuyển *</label>
                            <input type="text" id="candPosition" class="portal-input" placeholder="Ví dụ: Dev, Design..." required>
                        </div>
                        <div class="portal-form-group">
                            <label>Nguồn ứng tuyển</label>
                            <select id="candSource" class="portal-select">
                                <option value="fb">Facebook</option>
                                <option value="li">LinkedIn</option>
                                <option value="ref">Giới thiệu</option>
                                <option value="web">Website công ty</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                        <div class="portal-form-group">
                            <label>Email liên hệ *</label>
                            <input type="email" id="candEmail" class="portal-input" required placeholder="example@email.com">
                        </div>
                        <div class="portal-form-group">
                            <label>Số điện thoại *</label>
                            <input type="tel" id="candPhone" class="portal-input" required placeholder="090 123 4567">
                        </div>
                    </div>
                    <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
                        <button type="button" class="btn-secondary" onclick="toggleCandidateForm()" style="min-width: 100px;">Hủy bỏ</button>
                        <button type="button" class="btn-primary" onclick="saveCandidate()" style="min-width: 150px;">
                            <i class="fas fa-check"></i> Lưu ứng viên
                        </button>
                    </div>
                </form>
            </div>
        `;
        container.style.display = 'block';
        if (btn) btn.innerHTML = '<i class="fas fa-times"></i> Đóng form';
    } else {
        container.style.display = 'none';
        if (btn) btn.innerHTML = '<i class="fas fa-plus"></i> Đăng ký ứng viên';
    }
}

async function saveCandidate() {
    const name = document.getElementById('candName')?.value;
    const candPosition = document.getElementById('candPosition')?.value;
    const email = document.getElementById('candEmail')?.value;
    const phone = document.getElementById('candPhone')?.value;
    const source = document.getElementById('candSource')?.value;

    if (!name || !candPosition || !email || !phone) {
        showNotification('Vui lòng điền đầy đủ thông tin bắt buộc', 'warning');
        return;
    }

    const data = {
        name,
        candPosition,
        email,
        phone,
        source,
        status: 'applied'
    };

    try {
        const result = await CandidateAPI.create(data);
        if (result) {
            allCandidates.push(result);
            renderKanban();
            toggleCandidateForm();
            showNotification('Thêm ứng viên thành công', 'success');
        }
    } catch (error) {
        showNotification('Lỗi khi lưu ứng viên: ' + error.message, 'error');
    }
}

async function deleteCandidate(id) {
    if (!await showCustomConfirm('Bạn có chắc muốn xóa ứng viên này?')) return;
    try {
        await CandidateAPI.delete(id);
        allCandidates = allCandidates.filter(c => c._id !== id);
        renderKanban();
        showNotification('Đã xóa ứng viên', 'success');
    } catch (error) {
        showNotification('Lỗi khi xóa: ' + error.message, 'error');
    }
}
