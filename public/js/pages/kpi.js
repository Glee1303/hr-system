let allKpis = [];
let allEmployees = [];

document.addEventListener('DOMContentLoaded', async () => {
    if (!AuthManager.checkAuth()) return;

    UIComponents.init();
    await initializeData();
    setupDataSyncListeners();
});

async function initializeData() {
    try {
        const [kpis, employees] = await Promise.all([
            KpiAPI.getAll(),
            EmployeeAPI.getAll()
        ]);

        allKpis = kpis;
        allEmployees = employees;

        populateEmployeeSelect();
        renderKpiTable();
        updateStats();
    } catch (error) {
        console.error('Error loading KPI data:', error);
        showNotification('Lỗi tải dữ liệu', 'error');
    }
}

function setupDataSyncListeners() {
    if (typeof DataSync === 'undefined') return;

    DataSync.on('kpi:created', initializeData);
    DataSync.on('kpi:updated', initializeData);
    DataSync.on('kpi:deleted', initializeData);
    DataSync.on('employee:created', initializeData);
    DataSync.on('employee:updated', initializeData);
}

function populateEmployeeSelect() {
    const select = document.getElementById('kpiEmployeeId');
    if (!select) return;

    select.innerHTML = '<option value="">-- Chọn nhân viên --</option>' +
        allEmployees.map(emp => `<option value="${emp._id}">${emp.name} (${emp.department})</option>`).join('');
}

function renderKpiTable() {
    const tbody = document.getElementById('kpiTable');
    if (!tbody) return;

    if (allKpis.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Chưa có chỉ tiêu nào được thiết lập</td></tr>';
        return;
    }

    tbody.innerHTML = allKpis.map(kpi => {
        const progress = kpi.currentProgress || 0;
        const target = kpi.target || 100;
        const percent = Math.min(100, Math.round((progress / target) * 100));

        return `
            <tr>
                <td style="font-weight: 600;">${escapeHtml(kpi.employeeName)}</td>
                <td>${kpi.month}</td>
                <td>${target}%</td>
                <td>
                    <div style="width: 100%; background: #e2e8f0; border-radius: 9999px; height: 8px; margin-top: 5px;">
                        <div style="width: ${percent}%; background: ${getProgressColor(percent)}; height: 100%; border-radius: 9999px;"></div>
                    </div>
                    <span style="font-size: 0.75rem; color: #64748b;">${percent}% hoàn thành</span>
                </td>
                <td>${getStatusBadge(percent)}</td>
                <td>
                    <button class="btn-icon-o" onclick="openUpdateProgressModal('${kpi._id}', ${progress})" title="Cập nhật tiến độ">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon-o danger" onclick="deleteKpi('${kpi._id}')" title="Xóa KPI">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function getProgressColor(percent) {
    if (percent >= 100) return '#059669';
    if (percent >= 70) return '#2563eb';
    if (percent >= 40) return '#d97706';
    return '#dc2626';
}

function getStatusBadge(percent) {
    let text = 'Đang thực hiện';
    let color = '#2563eb';
    let bg = '#eff6ff';

    if (percent >= 100) {
        text = 'Hoàn thành';
        color = '#059669';
        bg = '#ecfdf5';
    } else if (percent < 50) {
        text = 'Chậm tiến độ';
        color = '#dc2626';
        bg = '#fef2f2';
    }

    return `<span style="padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 500; color: ${color}; background: ${bg};">${text}</span>`;
}

function openCreateKpiModal() {
    document.getElementById('modalTitle').textContent = 'Thiết lập KPI mới';
    document.getElementById('kpiId').value = '';
    document.getElementById('kpiForm').reset();
    document.getElementById('kpiModal').style.display = 'flex';
}

function closeKpiModal() {
    document.getElementById('kpiModal').style.display = 'none';
}

async function saveKpis() {
    const empId = document.getElementById('kpiEmployeeId').value;
    const employee = allEmployees.find(e => e._id === empId);

    if (!empId) {
        showNotification('Vui lòng chọn nhân viên', 'warning');
        return;
    }

    const data = {
        employeeId: empId,
        employeeName: employee ? employee.name : '',
        month: document.getElementById('kpiMonth').value,
        target: Number(document.getElementById('kpiTarget').value),
        description: document.getElementById('kpiDescription').value,
        currentProgress: 0
    };

    try {
        const result = await KpiAPI.create(data);
        if (result) {
            showNotification('Thiết lập KPI thành công', 'success');
            closeKpiModal();
            await initializeData();
        }
    } catch (error) {
        showNotification(error.message || 'Lỗi lưu dữ liệu', 'error');
    }
}

function openUpdateProgressModal(id, current) {
    const newProgress = prompt('Nhập tiến độ mới (%):', current);
    if (newProgress !== null) {
        updateKpiProgress(id, Number(newProgress));
    }
}

async function updateKpiProgress(id, value) {
    try {
        const result = await KpiAPI.update(id, { currentProgress: value });
        if (result) {
            showNotification('Cập nhật tiến độ thành công', 'success');
            await initializeData();
        }
    } catch (error) {
        showNotification('Lỗi khi cập nhật', 'error');
    }
}

async function deleteKpi(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa KPI này?')) return;

    try {
        await KpiAPI.delete(id);
        showNotification('Xóa KPI thành công', 'success');
        await initializeData();
    } catch (error) {
        showNotification('Lỗi khi xóa: ' + error.message, 'error');
    }
}

function updateStats() {
    if (allKpis.length === 0) {
        document.getElementById('avgKpi').textContent = '0%';
        return;
    }
    const totalPercent = allKpis.reduce((acc, k) => {
        const p = Math.min(100, Math.round(((k.currentProgress || 0) / (k.target || 100)) * 100));
        return acc + p;
    }, 0);
    document.getElementById('avgKpi').textContent = Math.round(totalPercent / allKpis.length) + '%';
}
