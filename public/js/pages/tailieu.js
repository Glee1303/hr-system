(function () {
    const publicPages = ['dangnhap.html', 'index.html', ''];
    const currentPath = window.location.pathname.split('/').pop();
    if (!publicPages.includes(currentPath)) {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token) window.location.replace('dangnhap.html');
    }
})();

let dataSyncUnsubscribes = [];
let allDocuments = [];
let filteredDocuments = [];
let currentSelectedEmployee = null;
let allEmployees = [];
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', function () {
    if (!AuthManager.checkAuth()) return;

    document.getElementById('adminName').textContent = AuthManager.getUserName();
    loadInitialData();
    setupDataSyncListeners();

    smartRefresh.schedule('employeeDocuments', loadInitialData, 15 * 60 * 1000, true);
});

window.addEventListener('beforeunload', () => {
    smartRefresh.stop('employeeDocuments');
    cleanupDataSyncListeners();
});
//XÓA listeners cũ TRƯỚC khi thêm mới
function cleanupDataSyncListeners() {
    dataSyncUnsubscribes.forEach(unsub => {
        if (typeof unsub === 'function') unsub();
    });
    dataSyncUnsubscribes = [];
    console.log('✅ Cleaned up document DataSync listeners');
}

// Theo dõi tài liệu , nhân viên
function setupDataSyncListeners() {
    if (typeof DataSync === 'undefined') return;

    cleanupDataSyncListeners();

    dataSyncUnsubscribes.push(
        DataSync.on('document:created', () => {
            loadEmployeeDocuments();
        })
    );

    dataSyncUnsubscribes.push(
        DataSync.on('document:deleted', () => {
            loadEmployeeDocuments();
        })
    );

    dataSyncUnsubscribes.push(
        DataSync.on('employee:created', () => {
            loadEmployeeList();
        })
    );

    dataSyncUnsubscribes.push(
        DataSync.on('employee:updated', () => {
            loadEmployeeList();
        })
    );

    dataSyncUnsubscribes.push(
        DataSync.on('employee:deleted', () => {
            loadEmployeeList();
        })
    );
}
//tải danh sách nhân viên và tài liệu
async function loadInitialData() {
    try {
        await loadEmployeeList();
        await loadEmployeeDocuments();

        const params = new URLSearchParams(window.location.search);
        const employeeId = params.get('employeeId');
        if (employeeId && allEmployees.length > 0) {
            selectEmployee(employeeId);
        }
    } catch (error) {
        console.error('Error loading initial data:', error);
        showNotification('Lỗi: ' + error.message, 'error');
    }
}
//Tải danh sách nhân viên
async function loadEmployeeList() {
    try {
        const data = await EmployeeAPI.getAll();
        allEmployees = Array.isArray(data) ? data : [];
        renderEmployeeList();
    } catch (error) {
        showNotification('Lỗi tải danh sách nhân viên: ' + error.message, 'error');
        allEmployees = [];
    }
}
//tải tài liệu nhân viên
async function loadEmployeeDocuments() {
    try {
        const data = await DocumentAPI.getAll();
        allDocuments = Array.isArray(data) ? data : [];

        if (currentSelectedEmployee) {
            filterDocumentsByEmployee(currentSelectedEmployee._id);
        } else {
            filteredDocuments = [];
            renderDocuments();
        }
    } catch (error) {
        showNotification('Lỗi tải tài liệu: ' + error.message, 'error');
        allDocuments = [];
    }
}
//Vẽ danh sách nhân viên
function renderEmployeeList() {
    const container = document.getElementById('employeeListContainer');
    if (!container) {
        return;
    }

    if (allEmployees.length === 0) {
        container.innerHTML = '<div style="padding: 2rem; text-align: center; color: #9ca3af;">Không có nhân viên</div>';
        return;
    }

    container.innerHTML = allEmployees.map(emp => {
        const docCount = allDocuments.filter(doc => doc.employeeId === emp._id).length;
        const isActive = currentSelectedEmployee?._id === emp._id;

        return `
            <div 
                class="employee-card ${isActive ? 'active' : ''}"
                onclick="selectEmployee('${escapeHtml(emp._id)}')"
                style="
                    padding: 1rem;
                    margin-bottom: 0.75rem;
                    border: 2px solid ${isActive ? '#3b82f6' : '#e5e7eb'};
                    border-radius: 0.5rem;
                    cursor: pointer;
                    background: ${isActive ? '#eff6ff' : '#ffffff'};
                    transition: all 0.3s ease;
                "
                onmouseover="this.style.borderColor='#3b82f6'; this.style.background='#f0f9ff';"
                onmouseout="this.style.borderColor='${isActive ? '#3b82f6' : '#e5e7eb'}'; this.style.background='${isActive ? '#eff6ff' : '#ffffff'}';"
            >
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <div style="
                        width: 3rem;
                        height: 3rem;
                        border-radius: 50%;
                        background: linear-gradient(135deg, #3b82f6, #1e40af);
                        color: white;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: 600;
                        font-size: 1.25rem;
                    ">
                        ${emp.name.charAt(0).toUpperCase()}
                    </div>
                    <div style="flex: 1;">
                        <div style="font-weight: 600; color: #111827;">${escapeHtml(emp.name)}</div>
                        <div style="font-size: 0.875rem; color: #6b7280;">${escapeHtml(emp.position || '-')}</div>
                        <div style="font-size: 0.75rem; color: #9ca3af;">${escapeHtml(emp.department || 'N/A')}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 600; color: #3b82f6; font-size: 1.25rem;">
                            ${docCount}
                        </div>
                        <div style="font-size: 0.75rem; color: #6b7280;">tài liệu</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}
//Chọn nhân viên để xem tài liệu 
function selectEmployee(employeeId) {
    const selected = allEmployees.find(e => e._id === employeeId);
    if (selected) {
        currentSelectedEmployee = selected;
        currentFilter = 'all';
        filterDocumentsByEmployee(employeeId);
        renderEmployeeList();
        renderFilterButtons();
        renderDocumentStats();
    }
}
//lọc tài liệu của nhân viên
function filterDocumentsByEmployee(employeeId) {
    filteredDocuments = allDocuments.filter(doc => doc.employeeId === employeeId);
    renderDocuments();
}
//lọc theo loại tài liệu
function filterDocuments(e, type) {
    if (!currentSelectedEmployee) {
        showNotification('Vui lòng chọn một nhân viên trước', 'warning');
        return;
    }

    if (e) {
        document.querySelectorAll('#filterButtonsContainer .btn-filter').forEach(btn => btn.classList.remove('active'));
        e.target.closest('.btn-filter').classList.add('active');
    }

    currentFilter = type;

    const employeeDocsOfType = type === 'all'
        ? allDocuments.filter(doc => doc.employeeId === currentSelectedEmployee._id)
        : allDocuments.filter(doc =>
            doc.employeeId === currentSelectedEmployee._id && doc.type === type
        );
    filteredDocuments = employeeDocsOfType;

    renderDocuments();
}
//Vẽ nút lọc 
function renderFilterButtons() {
    const filterContainer = document.getElementById('filterButtonsContainer');
    if (!filterContainer || !currentSelectedEmployee) return;

    filterContainer.innerHTML = `
        <button class="btn-filter ${currentFilter === 'all' ? 'active' : ''}" onclick="filterDocuments(event, 'all')">
            Tất cả
        </button>
        <button class="btn-filter ${currentFilter === 'contract' ? 'active' : ''}" onclick="filterDocuments(event, 'contract')">
            Hợp Đồng
        </button>
        <button class="btn-filter ${currentFilter === 'insurance' ? 'active' : ''}" onclick="filterDocuments(event, 'insurance')">
            Bảo hiểm
        </button>
        <button class="btn-filter ${currentFilter === 'certificate' ? 'active' : ''}" onclick="filterDocuments(event, 'certificate')">
            Chứng chỉ
        </button>
        <button class="btn-filter ${currentFilter === 'other' ? 'active' : ''}" onclick="filterDocuments(event, 'other')">
            Khác
        </button>
    `;
}
//vẽ thống kê tài liệu
function renderDocumentStats() {
    const statsContainer = document.getElementById('documentStatsContainer');
    if (!statsContainer || !currentSelectedEmployee) return;

    const allDocsOfEmp = allDocuments.filter(d => d.employeeId === currentSelectedEmployee._id);
    const total = allDocsOfEmp.length;
    const byType = {};
    allDocsOfEmp.forEach(doc => {
        byType[doc.type] = (byType[doc.type] || 0) + 1;
    });

    const typeLabels = {
        'contract': 'Hợp Đồng',
        'insurance': 'Bảo hiểm',
        'certificate': 'Chứng chỉ',
        'report': 'Báo cáo',
        'other': 'Khác'
    };

    statsContainer.innerHTML = `
        <div style="background: #f9fafb; border-radius: 0.5rem; padding: 1.5rem;">
            <div style="margin-bottom: 1rem;">
                <div style="font-weight: 600; color: #111827; margin-bottom: 0.5rem;">
                    Tài liệu của: <span style="color: #3b82f6;">${escapeHtml(currentSelectedEmployee.name)}</span>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-top: 1rem;">
                    <div style="background: white; padding: 1rem; border-radius: 0.375rem; border: 1px solid #e5e7eb;">
                        <div style="font-size: 1.875rem; font-weight: 700; color: #3b82f6;">${total}</div>
                        <div style="font-size: 0.875rem; color: #6b7280;">Tổng tài liệu</div>
                    </div>
                    ${Object.entries(byType).map(([type, count]) => `
                        <div style="background: white; padding: 1rem; border-radius: 0.375rem; border: 1px solid #e5e7eb;">
                            <div style="font-size: 1.5rem; font-weight: 700; color: #10b981;">${count}</div>
                            <div style="font-size: 0.75rem; color: #6b7280;">${typeLabels[type] || type}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}
function renderDocuments() {
    const grid = document.getElementById('documentsGrid');
    if (!grid) return;

    if (!currentSelectedEmployee) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: #9ca3af;">
            <i class="fas fa-folder-open" style="font-size: 2rem; margin-bottom: 1rem;"></i>
            <p>Vui lòng chọn một nhân viên để xem tài liệu</p>
        </div>`;
        return;
    }

    if (filteredDocuments.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: #9ca3af;">
            <i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 1rem;"></i>
            <p>Nhân viên này chưa có tài liệu nào</p>
        </div>`;
        return;
    }

    grid.innerHTML = filteredDocuments.map(doc => {
        const fileType = doc.fileType || getFileExtension(doc.fileName || doc.name || 'file');
        const fileSize = doc.size || doc.fileSize || 0;

        return `
            <div id="doc-card-${escapeHtml(doc._id)}" style="border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1.5rem; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="display: flex; align-items: start; gap: 1rem; margin-bottom: 1rem;">
                    <div style="
                        width: 3rem;
                        height: 3rem;
                        border-radius: 0.375rem;
                        background: linear-gradient(135deg, #dbeafe, #bfdbfe);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #1e40af;
                        font-size: 1.5rem;
                        font-weight: 600;
                    ">
                        ${getFileIcon(fileType)}
                    </div>
                    <div style="flex: 1;">
                        <div style="font-weight: 600; color: #111827; word-break: break-word;">
                            ${escapeHtml(doc.name)}
                        </div>
                        <div style="font-size: 0.875rem; color: #6b7280; margin-top: 0.25rem;">
                            ${getDocTypeLabel(doc.type)}
                        </div>
                    </div>
                </div>

                <div style="border-top: 1px solid #e5e7eb; padding-top: 1rem; margin-bottom: 1rem;">
                    <div style="font-size: 0.875rem; color: #6b7280; margin-bottom: 0.5rem;">
                        <div>📄 ${(fileType || 'FILE').toUpperCase()} - ${fileSize}MB</div>
                        <div>📅 ${formatDate(doc.createdAt)}</div>
                    </div>
                </div>

                <div style="display: flex; gap: 0.5rem;">
                    <button onclick="toggleViewDocumentInline('${escapeHtml(doc._id)}')" style="flex: 1; background: #dbeafe; color: #1e40af; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer; font-weight: 500;">
                        <i class="fas fa-eye"></i> Xem
                    </button>
                    <button onclick="downloadDocument('${escapeHtml(doc._id)}')" style="flex: 1; background: #d1fae5; color: #065f46; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer; font-weight: 500;">
                        <i class="fas fa-download"></i> Tải
                    </button>
                    <button onclick="deleteDocument('${escapeHtml(doc._id)}')" style="flex: 1; background: #fee2e2; color: #7f1d1d; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer; font-weight: 500;">
                        <i class="fas fa-trash"></i> Xóa
                    </button>
                </div>
                
                <div id="expansion-content-${escapeHtml(doc._id)}" style="display: none; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e5e7eb;"></div>
            </div>
        `;
    }).join('');
}
//mở rộng file
function getFileExtension(filename) {
    if (!filename) return 'file';
    const ext = filename.split('.').pop()?.toLowerCase();
    return ext || 'file';
}

function getFileIcon(fileType) {
    const type = fileType?.toLowerCase();

    const iconMap = {
        'pdf': '<i class="fas fa-file-pdf" style="color: #dc2626;"></i>',
        'doc': '<i class="fas fa-file-word" style="color: #2563eb;"></i>',
        'docx': '<i class="fas fa-file-word" style="color: #2563eb;"></i>',
        'xls': '<i class="fas fa-file-excel" style="color: #16a34a;"></i>',
        'xlsx': '<i class="fas fa-file-excel" style="color: #16a34a;"></i>',
        'jpg': '<i class="fas fa-file-image" style="color: #f59e0b;"></i>',
        'jpeg': '<i class="fas fa-file-image" style="color: #f59e0b;"></i>',
        'png': '<i class="fas fa-file-image" style="color: #f59e0b;"></i>',
        'gif': '<i class="fas fa-file-image" style="color: #f59e0b;"></i>',
        'txt': '<i class="fas fa-file-alt" style="color: #6b7280;"></i>',
        'zip': '<i class="fas fa-file-archive" style="color: #8b5cf6;"></i>',
        'default': '<i class="fas fa-file" style="color: #9ca3af;"></i>'
    };

    return iconMap[type] || iconMap['default'];
}
//Phân loại tài liệu
function getDocTypeLabel(type) {
    const labels = {
        'contract': 'Hợp Đồng',
        'insurance': 'Bảo hiểm',
        'certificate': 'Chứng chỉ',
        'other': 'Khác'
    };
    return labels[type] || type;
}
function toggleUploadForm(employeeId = null) {
    const formContainer = document.getElementById('uploadFormContainer');
    const toggleBtnText = document.getElementById('toggleUploadBtnText');
    const toggleBtnIcon = document.querySelector('#toggleUploadBtn i');

    if (formContainer.style.display === 'none') {
        if (!employeeId && !currentSelectedEmployee) {
            showNotification('Vui lòng chọn nhân viên ở danh sách bên trái trước khi tải tài liệu lên', 'warning');
            return;
        }

        const selectedEmpId = employeeId || currentSelectedEmployee._id;
        const selectedEmp = allEmployees.find(e => e._id === selectedEmpId);

        if (!selectedEmp) {
            showNotification('Không tìm thấy nhân viên', 'error');
            return;
        }

        formContainer.style.display = 'block';
        if (toggleBtnText) toggleBtnText.textContent = 'Đóng Form';
        if (toggleBtnIcon) toggleBtnIcon.className = 'fas fa-times';

        document.getElementById('uploadEmployeeName').textContent = `Tải lên tài liệu cho: ${escapeHtml(selectedEmp.name)}`;
        document.getElementById('uploadEmployeeId').value = selectedEmpId;
        document.getElementById('docName').value = '';
        document.getElementById('docType').value = 'contract';
        document.getElementById('docFileType').value = 'pdf';
        document.getElementById('docFile').value = '';
        document.getElementById('filePreview').innerHTML = '';
    } else {
        formContainer.style.display = 'none';
        if (toggleBtnText) toggleBtnText.textContent = 'Tải lên tài liệu';
        if (toggleBtnIcon) toggleBtnIcon.className = 'fas fa-cloud-upload-alt';
    }
}
//xử lý chọn file
function handleFileSelect(event) {
    const file = event.target.files[0];

    if (!file) {
        document.getElementById('filePreview').innerHTML = '';
        return;
    }

    const fileType = document.getElementById('docFileType')?.value;

    if (!validateFileType(file, fileType)) {
        showNotification(`File không đúng định dạng. Vui lòng chọn file ${fileType.toUpperCase()}`, 'error');
        document.getElementById('docFile').value = '';
        document.getElementById('filePreview').innerHTML = '';
        return;
    }

    const preview = document.getElementById('filePreview');
    preview.innerHTML = `
        <div style="padding: 1rem; background: #f0fdf4; border: 1px solid #86efac; border-radius: 0.375rem; margin-top: 0.5rem;">
            <div style="color: #166534; font-weight: 500;">✓ File hợp lệ</div>
            <div style="color: #4b5563; font-size: 0.875rem; margin-top: 0.25rem;">
                <div>Tên: ${escapeHtml(file.name)}</div>
                <div>Kích thước: ${(file.size / 1024 / 1024).toFixed(2)} MB</div>
            </div>
        </div>
    `;
}
//Kiểm tra loại file
function validateFileType(file, selectedType) {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const mimeType = file.type;

    const typeMap = {
        'pdf': ['pdf'],
        'doc': ['doc', 'docx'],
        'excel': ['xls', 'xlsx'],
        'image': ['jpg', 'jpeg', 'png', 'gif']
    };

    const validExtensions = typeMap[selectedType] || [];
    return validExtensions.some(ext => fileExtension === ext);
}
async function saveDocumentInline() {
    const employeeId = document.getElementById('uploadEmployeeId')?.value;
    const name = document.getElementById('docName')?.value?.trim();
    const type = document.getElementById('docType')?.value;
    const fileType = document.getElementById('docFileType')?.value;
    const fileInput = document.getElementById('docFile');
    const selectedFile = fileInput?.files[0];

    if (!employeeId || !name || !type || !fileType) {
        showNotification('Vui lòng điền đầy đủ thông tin', 'warning');
        return;
    }

    if (!selectedFile) {
        showNotification('Vui lòng chọn file để tải lên', 'warning');
        return;
    }

    const maxSizeInBytes = 50 * 1024 * 1024;
    if (selectedFile.size > maxSizeInBytes) {
        showNotification('File quá lớn. Tối đa 50MB', 'error');
        return;
    }

    try {
        const size = parseFloat((selectedFile.size / 1024 / 1024).toFixed(2));

        const createResult = await DocumentAPI.create({
            name,
            type,
            fileType,
            size,
            employeeId
        });

        if (!createResult || !createResult._id) {
            throw new Error('Không thể tạo bản ghi tài liệu');
        }

        const newDocId = createResult._id;

        const formData = new FormData();
        formData.append('file', selectedFile);

        const uploadResponse = await fetch(`${API_BASE_URL}/documents/${newDocId}/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AuthManager.getToken()}`
            },
            body: formData
        });

        if (!uploadResponse.ok) {
            await DocumentAPI.delete(newDocId);
            throw new Error('Không thể tải file lên');
        }

        showNotification('Tải tài liệu lên thành công', 'success');
        toggleUploadForm();
        await loadEmployeeDocuments();

    } catch (error) {
        console.error('Lỗi:', error);
        showNotification('Lỗi: ' + error.message, 'error');
    }
}
async function toggleViewDocumentInline(docId) {
    try {
        const expansionContainer = document.getElementById(`expansion-content-${docId}`);

        if (expansionContainer.style.display === 'block') {
            expansionContainer.style.display = 'none';
            return;
        }

        // Đóng các expansion khác
        document.querySelectorAll('[id^="expansion-content-"]').forEach(el => el.style.display = 'none');

        const doc = allDocuments.find(d => d._id === docId);
        if (!doc) {
            showNotification('Không tìm thấy tài liệu', 'error');
            return;
        }

        expansionContainer.innerHTML = '<div style="text-align: center; color: #6b7280; padding: 1rem;"><i class="fas fa-spinner fa-spin"></i> Đang tải nội dung...</div>';
        expansionContainer.style.display = 'block';

        try {
            const response = await fetch(`${API_BASE_URL}/documents/${docId}/content`, {
                headers: {
                    'Authorization': `Bearer ${AuthManager.getToken()}`
                }
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);

                let previewHtml = '';
                if (doc.fileType === 'pdf') {
                    previewHtml = `<iframe src="${url}" style="width: 100%; height: 400px; border: 1px solid #e5e7eb; border-radius: 0.375rem;"></iframe>`;
                } else if (['jpg', 'jpeg', 'png', 'gif'].includes(doc.fileType)) {
                    previewHtml = `<div style="text-align: center;"><img src="${url}" style="max-width: 100%; max-height: 400px; border-radius: 0.375rem; border: 1px solid #e5e7eb;"></div>`;
                } else {
                    previewHtml = `<div style="padding: 1rem; background: #f3f4f6; border-radius: 0.375rem; text-align: center; color: #4b5563;"><i class="fas fa-file" style="margin-right: 0.5rem;"></i> Không thể xem trước định dạng này. Vui lòng tải xuống.</div>`;
                }

                expansionContainer.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <span style="font-weight: 600; color: #1e293b;">Bản xem trước</span>
                        <button onclick="document.getElementById('expansion-content-${docId}').style.display='none'" style="background: none; border: none; font-size: 1.25rem; color: #64748b; cursor: pointer;">&times;</button>
                    </div>
                    ${previewHtml}
                `;
            } else {
                expansionContainer.innerHTML = `<div style="padding: 1rem; text-align: center; color: #ef4444;"><i class="fas fa-exclamation-circle"></i> Không tải được nội dung (Lỗi mạng hoặc xác thực)</div>`;
            }
        } catch (err) {
            expansionContainer.innerHTML = `<div style="padding: 1rem; text-align: center; color: #ef4444;"><i class="fas fa-exclamation-circle"></i> Có lỗi xảy ra khi tải nội dung</div>`;
        }
    } catch (error) {
        showNotification('Lỗi: ' + error.message, 'error');
    }
}
async function downloadDocument(docId) {
    try {
        const doc = allDocuments.find(d => d._id === docId);
        if (!doc) return;

        const response = await fetch(`${API_BASE_URL}/documents/${docId}/content`, {
            headers: {
                'Authorization': `Bearer ${AuthManager.getToken()}`
            }
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = doc.name || 'document';
            a.click();
            URL.revokeObjectURL(url);
        }
    } catch (error) {
        showNotification('Lỗi tải xuống: ' + error.message, 'error');
    }
}
async function deleteDocument(docId) {
    const doc = allDocuments.find(d => d._id === docId);
    if (!doc) {
        showNotification('Không tìm thấy tài liệu', 'error');
        return;
    }

    if (!await showCustomConfirm(`Bạn có chắc chắn muốn xóa?`)) {
        return;
    }

    try {
        await DocumentAPI.delete(docId);
        showNotification('Đã xóa tài liệu', 'success');
        await loadEmployeeDocuments();
    } catch (error) {
        showNotification('Lỗi: ' + error.message, 'error');
    }
}
// removed window.addEventListener that binds to modals