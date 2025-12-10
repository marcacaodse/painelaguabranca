// ============================================
// CONFIGURAÇÃO
// ============================================

const CONFIG = {
    // Google Sheets ID da URL da sua planilha
    SPREADSHEET_ID: '1G-h1FTeWBtDzAny7rpre7gT2UtRAqAGRi8eDzHNhtB0',
    
    // Sheet GID da URL (número após gid=)
    SHEET_GID: '847209957',
    
    // Intervalo de atualização automática (5 minutos)
    AUTO_REFRESH_INTERVAL: 300000,
    
    // Limites de cota por unidade (agendamentos por dia)
    QUOTA_LIMITS: {
        'AGUA BRANCA': 11,
        'CSU ELDORADO': 13,
        'JARDIM BANDEIRANTES': 13,
        'JARDIM ELDORADO': 9,
        'NOVO ELDORADO': 10,
        'PARQUE SÃO JOÃO': 13,
        'PEROBAS': 6,
        'SANTA CRUZ': 6,
        'UNIDADE XV': 13
    },
    
    // Horários disponíveis
    TIME_SLOTS: ['07:00', '08:00', '09:00'],
    
    // Paginação da tabela
    ROWS_PER_PAGE: 20,
    
    // Mapeamento das colunas da planilha (índice começa em 0)
    COLUMNS: {
        PRONTUARIO: 0,
        PACIENTE: 1,
        DATA_NASCIMENTO: 2,
        NUM_SOLICITACAO: 3,
        TIPO_AGENDA: 4,
        HORA_AGENDA: 5,
        DATA_AGENDA: 6,
        QUANTIDADE: 7,
        UNIDADE: 8,
        LABORATORIO_COLETA: 9,
        STATUS: 10
    }
};

// Gerar URL para exportação CSV do Google Sheets
function getGoogleSheetsCSVUrl() {
    return `https://docs.google.com/spreadsheets/d/${CONFIG.SPREADSHEET_ID}/export?format=csv&gid=${CONFIG.SHEET_GID}`;
}

// Normalizar nome da unidade
function normalizeUnitName(name) {
    if (!name) return '';
    return name.toString().toUpperCase().trim();
}

// Obter limite de cota para uma unidade
function getQuotaLimit(unitName) {
    const normalized = normalizeUnitName(unitName);
    return CONFIG.QUOTA_LIMITS[normalized] || 10;
}

// ============================================
// SERVIÇO DE DADOS
// ============================================

class DataService {
    constructor() {
        this.rawData = [];
        this.processedData = [];
        this.isLoading = false;
        this.lastUpdate = null;
        this.autoRefreshTimer = null;
    }

    async fetchData() {
        this.isLoading = true;
        this.showLoading(true);

        try {
            const url = getGoogleSheetsCSVUrl();
            
            // Usar proxy CORS se necessário
            const proxyUrl = 'https://api.allorigins.win/raw?url=';
            const finalUrl = proxyUrl + encodeURIComponent(url);
            
            const response = await fetch(finalUrl);
            
            if (!response.ok) {
                throw new Error('Erro ao carregar dados da planilha');
            }

            const csvText = await response.text();
            this.rawData = this.parseCSV(csvText);
            this.processedData = this.processData(this.rawData);
            this.lastUpdate = new Date();
            
            console.log('✅ Dados carregados:', this.processedData.length, 'registros');
            return this.processedData;

        } catch (error) {
            console.error('❌ Erro ao buscar dados:', error);
            
            // Mostrar mensagem mais específica
            let errorMsg = 'Erro ao carregar dados. Verifique:\n\n';
            errorMsg += '1. A planilha está compartilhada publicamente?\n';
            errorMsg += '2. O ID da planilha está correto?\n';
            errorMsg += '3. O GID da aba está correto?\n\n';
            errorMsg += 'Erro: ' + error.message;
            
            alert(errorMsg);
            return [];
        } finally {
            this.isLoading = false;
            this.showLoading(false);
        }
    }

    parseCSV(csvText) {
        const lines = csvText.split('\n');
        const data = [];

        // Pular linha de cabeçalho
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const row = this.parseCSVLine(line);
            if (row.length > 0) {
                data.push(row);
            }
        }

        return data;
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current.trim());
        return result;
    }

    processData(rawData) {
        return rawData.map((row, index) => {
            return {
                id: index,
                prontuario: row[CONFIG.COLUMNS.PRONTUARIO] || '',
                paciente: row[CONFIG.COLUMNS.PACIENTE] || '',
                dataNascimento: row[CONFIG.COLUMNS.DATA_NASCIMENTO] || '',
                numSolicitacao: row[CONFIG.COLUMNS.NUM_SOLICITACAO] || '',
                tipoAgenda: row[CONFIG.COLUMNS.TIPO_AGENDA] || '',
                horaAgenda: row[CONFIG.COLUMNS.HORA_AGENDA] || '',
                dataAgenda: row[CONFIG.COLUMNS.DATA_AGENDA] || '',
                quantidade: row[CONFIG.COLUMNS.QUANTIDADE] || '',
                unidade: row[CONFIG.COLUMNS.UNIDADE] || '',
                laboratorioColeta: row[CONFIG.COLUMNS.LABORATORIO_COLETA] || '',
                status: row[CONFIG.COLUMNS.STATUS] || ''
            };
        });
    }

    getFilteredData(filters = {}) {
        let filtered = [...this.processedData];

        if (filters.month) {
            filtered = filtered.filter(item => {
                const date = this.parseDate(item.dataAgenda);
                if (!date) return false;
                const month = String(date.getMonth() + 1).padStart(2, '0');
                return month === filters.month;
            });
        }

        if (filters.year) {
            filtered = filtered.filter(item => {
                const date = this.parseDate(item.dataAgenda);
                if (!date) return false;
                return date.getFullYear() === parseInt(filters.year);
            });
        }

        if (filters.date) {
            filtered = filtered.filter(item => {
                const itemDate = this.parseDate(item.dataAgenda);
                const filterDate = new Date(filters.date);
                if (!itemDate) return false;
                return itemDate.toDateString() === filterDate.toDateString();
            });
        }

        if (filters.times && filters.times.length > 0) {
            filtered = filtered.filter(item => {
                const time = item.horaAgenda.trim();
                return filters.times.includes(time);
            });
        }

        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            filtered = filtered.filter(item => {
                return Object.values(item).some(value => 
                    String(value).toLowerCase().includes(searchLower)
                );
            });
        }

        return filtered;
    }

    parseDate(dateString) {
        if (!dateString) return null;

        // Tentar formato DD/MM/YYYY
        const parts = dateString.split('/');
        if (parts.length === 3) {
            const day = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1;
            const year = parseInt(parts[2]);
            const date = new Date(year, month, day);
            if (!isNaN(date.getTime())) return date;
        }

        // Tentar parsing padrão
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) return date;

        return null;
    }

    getAvailableYears() {
        const years = new Set();
        this.processedData.forEach(item => {
            const date = this.parseDate(item.dataAgenda);
            if (date) {
                years.add(date.getFullYear());
            }
        });
        return Array.from(years).sort((a, b) => b - a);
    }

    getDaysToNextAppointment(data = null) {
        const dataToUse = data || this.processedData;
        if (dataToUse.length === 0) return null;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let lastAppointmentDate = null;

        dataToUse.forEach(item => {
            const date = this.parseDate(item.dataAgenda);
            if (date) {
                if (!lastAppointmentDate || date > lastAppointmentDate) {
                    lastAppointmentDate = date;
                }
            }
        });

        if (!lastAppointmentDate) return null;

        const diffTime = lastAppointmentDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return {
            days: diffDays,
            lastDate: lastAppointmentDate
        };
    }

    checkQuotaViolations(data = null) {
        const dataToUse = data || this.processedData;
        const violations = [];
        const groupedData = {};

        dataToUse.forEach(item => {
            const unit = normalizeUnitName(item.unidade);
            const date = this.parseDate(item.dataAgenda);
            
            if (!unit || !date) return;

            const dateKey = date.toISOString().split('T')[0];
            const key = `${unit}_${dateKey}`;

            if (!groupedData[key]) {
                groupedData[key] = {
                    unit: item.unidade,
                    date: date,
                    count: 0
                };
            }

            groupedData[key].count++;
        });

        Object.values(groupedData).forEach(group => {
            const limit = getQuotaLimit(group.unit);
            if (group.count > limit) {
                violations.push({
                    unit: group.unit,
                    date: group.date,
                    count: group.count,
                    limit: limit,
                    excess: group.count - limit
                });
            }
        });

        return violations.sort((a, b) => b.excess - a.excess);
    }

    showLoading(show) {
        const indicator = document.getElementById('loadingIndicator');
        if (indicator) {
            indicator.style.display = show ? 'block' : 'none';
        }
    }

    startAutoRefresh() {
        if (this.autoRefreshTimer) {
            clearInterval(this.autoRefreshTimer);
        }

        this.autoRefreshTimer = setInterval(() => {
            console.log('🔄 Auto-refresh: Atualizando dados...');
            this.fetchData().then(() => {
                if (window.app) {
                    window.app.refresh();
                }
            });
        }, CONFIG.AUTO_REFRESH_INTERVAL);
    }

    stopAutoRefresh() {
        if (this.autoRefreshTimer) {
            clearInterval(this.autoRefreshTimer);
            this.autoRefreshTimer = null;
        }
    }

    formatDate(date) {
        if (!date) return '';
        if (typeof date === 'string') {
            date = this.parseDate(date);
        }
        if (!date) return '';

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();

        return `${day}/${month}/${year}`;
    }
}

const dataService = new DataService();

// ============================================
// GERENCIADOR DE GRÁFICOS
// ============================================

class ChartsManager {
    constructor() {
        this.patientsChart = null;
    }

    initPatientsChart() {
        const ctx = document.getElementById('patientsChart');
        if (!ctx) return;

        if (this.patientsChart) {
            this.patientsChart.destroy();
        }

        this.patientsChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Total de Pacientes',
                    data: [],
                    backgroundColor: '#2196F3',
                    borderColor: '#1976D2',
                    borderWidth: 2,
                    borderRadius: 8,
                    barThickness: 50
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(13, 45, 94, 0.95)',
                        padding: 12,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return `Total: ${context.parsed.y} pacientes`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }

    updatePatientsChart(data) {
        if (!this.patientsChart) {
            this.initPatientsChart();
        }

        const groupedByDate = {};
        
        data.forEach(item => {
            const date = dataService.parseDate(item.dataAgenda);
            if (!date) return;

            const dateKey = dataService.formatDate(date);
            groupedByDate[dateKey] = (groupedByDate[dateKey] || 0) + 1;
        });

        const sortedDates = Object.keys(groupedByDate).sort((a, b) => {
            const dateA = dataService.parseDate(a);
            const dateB = dataService.parseDate(b);
            return dateA - dateB;
        });

        const displayDates = sortedDates.slice(-10);
        const counts = displayDates.map(date => groupedByDate[date]);

        this.patientsChart.data.labels = displayDates;
        this.patientsChart.data.datasets[0].data = counts;
        this.patientsChart.update('none');
    }

    updateDaysMetric(data) {
        const result = dataService.getDaysToNextAppointment(data);
        const valueElement = document.getElementById('daysToNext');
        const infoElement = document.getElementById('nextDateInfo');

        if (!valueElement || !infoElement) return;

        if (result && result.days !== null) {
            valueElement.textContent = result.days;
            
            if (result.days < 0) {
                valueElement.style.color = '#F44336';
                infoElement.textContent = 'A data de agendamento já passou';
            } else if (result.days === 0) {
                valueElement.style.color = '#FF9800';
                infoElement.textContent = 'Último agendamento é hoje';
            } else {
                valueElement.style.color = '#2196F3';
                infoElement.textContent = `Último agendamento: ${dataService.formatDate(result.lastDate)}`;
            }
        } else {
            valueElement.textContent = '-';
            valueElement.style.color = '#666';
            infoElement.textContent = 'Nenhum agendamento encontrado';
        }
    }

    updateQuotaAlerts(data) {
        const violations = dataService.checkQuotaViolations(data);
        const container = document.getElementById('quotaAlerts');

        if (!container) return;

        if (violations.length === 0) {
            container.innerHTML = '<p class="no-alerts">✓ Todas as unidades dentro da cota</p>';
            return;
        }

        let html = '';
        violations.forEach(violation => {
            html += `
                <div class="alert-item">
                    <i class="fas fa-exclamation-circle"></i>
                    <div class="alert-content">
                        <div class="alert-unit">${violation.unit}</div>
                        <div class="alert-details">
                            Data: ${dataService.formatDate(violation.date)} - 
                            ${violation.count} agendamentos (Limite: ${violation.limit}) - 
                            <strong>Excesso: ${violation.excess}</strong>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    updateAll(data) {
        this.updatePatientsChart(data);
        this.updateDaysMetric(data);
        this.updateQuotaAlerts(data);
    }
}

const chartsManager = new ChartsManager();

// ============================================
// GERENCIADOR DE FILTROS
// ============================================

class FiltersManager {
    constructor() {
        this.activeFilters = {
            month: '',
            year: '',
            date: '',
            times: [],
            search: ''
        };
    }

    init() {
        this.initYearOptions();
        this.attachEventListeners();
    }

    initYearOptions() {
        const yearSelect = document.getElementById('filterYear');
        if (!yearSelect) return;

        const years = dataService.getAvailableYears();
        yearSelect.innerHTML = '<option value="">Todos os Anos</option>';

        years.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
        });

        const currentYear = new Date().getFullYear();
        if (years.includes(currentYear)) {
            yearSelect.value = currentYear;
            this.activeFilters.year = String(currentYear);
        }
    }

    attachEventListeners() {
        const monthSelect = document.getElementById('filterMonth');
        if (monthSelect) {
            monthSelect.addEventListener('change', (e) => {
                this.activeFilters.month = e.target.value;
                this.applyFilters();
            });
        }

        const yearSelect = document.getElementById('filterYear');
        if (yearSelect) {
            yearSelect.addEventListener('change', (e) => {
                this.activeFilters.year = e.target.value;
                this.applyFilters();
            });
        }

        const dateInput = document.getElementById('filterDate');
        if (dateInput) {
            dateInput.addEventListener('change', (e) => {
                this.activeFilters.date = e.target.value;
                this.applyFilters();
            });
        }

        const timeCheckboxes = document.querySelectorAll('.time-checkbox');
        timeCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateTimeFilters();
                this.applyFilters();
            });
        });

        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.activeFilters.search = e.target.value;
                    this.applyFilters();
                }, 300);
            });
        }
    }

    updateTimeFilters() {
        const timeCheckboxes = document.querySelectorAll('.time-checkbox');
        this.activeFilters.times = Array.from(timeCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);
    }

    applyFilters() {
        const filteredData = dataService.getFilteredData(this.activeFilters);
        chartsManager.updateAll(filteredData);
        tableManager.updateTable(filteredData);
        console.log('🔍 Filtros aplicados:', filteredData.length, 'registros');
    }

    clearFilters() {
        this.activeFilters = {
            month: '',
            year: '',
            date: '',
            times: [],
            search: ''
        };

        const monthSelect = document.getElementById('filterMonth');
        if (monthSelect) monthSelect.value = '';

        const yearSelect = document.getElementById('filterYear');
        if (yearSelect) yearSelect.value = '';

        const dateInput = document.getElementById('filterDate');
        if (dateInput) dateInput.value = '';

        const timeCheckboxes = document.querySelectorAll('.time-checkbox');
        timeCheckboxes.forEach(cb => cb.checked = false);

        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';

        this.applyFilters();
        console.log('🧹 Filtros limpos');
    }
}

const filtersManager = new FiltersManager();

// ============================================
// GERENCIADOR DE TABELA
// ============================================

class TableManager {
    constructor() {
        this.currentData = [];
        this.currentPage = 1;
        this.rowsPerPage = CONFIG.ROWS_PER_PAGE;
    }

    init() {
        this.attachPaginationListeners();
    }

    attachPaginationListeners() {
        const prevButton = document.getElementById('btnPrevPage');
        const nextButton = document.getElementById('btnNextPage');

        if (prevButton) {
            prevButton.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.renderTable();
                }
            });
        }

        if (nextButton) {
            nextButton.addEventListener('click', () => {
                const totalPages = Math.ceil(this.currentData.length / this.rowsPerPage);
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.renderTable();
                }
            });
        }
    }

    updateTable(data) {
        this.currentData = data;
        this.currentPage = 1;
        this.renderTable();
    }

    renderTable() {
        const tbody = document.getElementById('tableBody');
        if (!tbody) return;

        if (this.currentData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="no-data">Nenhum registro encontrado</td></tr>';
            this.updatePagination(0, 0);
            return;
        }

        const startIndex = (this.currentPage - 1) * this.rowsPerPage;
        const endIndex = Math.min(startIndex + this.rowsPerPage, this.currentData.length);
        const pageData = this.currentData.slice(startIndex, endIndex);

        let html = '';
        pageData.forEach(item => {
            html += `
                <tr>
                    <td>${this.escapeHtml(item.prontuario)}</td>
                    <td>${this.escapeHtml(item.paciente)}</td>
                    <td>${this.escapeHtml(item.dataNascimento)}</td>
                    <td>${this.escapeHtml(item.numSolicitacao)}</td>
                    <td>${this.escapeHtml(item.tipoAgenda)}</td>
                    <td>${this.escapeHtml(item.horaAgenda)}</td>
                    <td>${this.escapeHtml(item.dataAgenda)}</td>
                    <td>${this.escapeHtml(item.quantidade)}</td>
                    <td>${this.escapeHtml(item.unidade)}</td>
                    <td>${this.escapeHtml(item.laboratorioColeta)}</td>
                    <td>${this.renderStatus(item.status)}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        this.updatePagination(this.currentData.length, Math.ceil(this.currentData.length / this.rowsPerPage));
    }

    renderStatus(status) {
        if (!status) return '';

        const statusLower = status.toLowerCase();
        let badgeClass = 'status-default';

        if (statusLower.includes('confirmado') || statusLower.includes('realizado')) {
            badgeClass = 'status-success';
        } else if (statusLower.includes('cancelado')) {
            badgeClass = 'status-danger';
        } else if (statusLower.includes('pendente') || statusLower.includes('aguardando')) {
            badgeClass = 'status-warning';
        }

        return `<span class="status-badge ${badgeClass}">${this.escapeHtml(status)}</span>`;
    }

    updatePagination(totalRecords, totalPages) {
        const pageInfo = document.getElementById('pageInfo');
        const prevButton = document.getElementById('btnPrevPage');
        const nextButton = document.getElementById('btnNextPage');

        if (pageInfo) {
            if (totalRecords === 0) {
                pageInfo.textContent = 'Nenhum registro';
            } else {
                pageInfo.textContent = `Página ${this.currentPage} de ${totalPages} (${totalRecords} registros)`;
            }
        }

        if (prevButton) {
            prevButton.disabled = this.currentPage <= 1;
        }

        if (nextButton) {
            nextButton.disabled = this.currentPage >= totalPages;
        }
    }

    exportToExcel() {
        if (this.currentData.length === 0) {
            alert('Não há dados para exportar.');
            return;
        }

        try {
            const exportData = this.currentData.map(item => ({
                'Prontuário': item.prontuario,
                'Paciente': item.paciente,
                'Data Nascimento': item.dataNascimento,
                'Nº Solicitação': item.numSolicitacao,
                'Tipo Agenda': item.tipoAgenda,
                'Hora Agenda': item.horaAgenda,
                'Data Agenda': item.dataAgenda,
                'Quantidade': item.quantidade,
                'Unidade': item.unidade,
                'Laboratório Coleta': item.laboratorioColeta,
                'Status': item.status
            }));

            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Agendamentos');

            const maxWidth = 50;
            const colWidths = [];
            
            Object.keys(exportData[0]).forEach((key) => {
                const maxLength = Math.max(
                    key.length,
                    ...exportData.map(row => String(row[key] || '').length)
                );
                colWidths.push({ wch: Math.min(maxLength + 2, maxWidth) });
            });
            
            ws['!cols'] = colWidths;

            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            const filename = `Agendamentos_${timestamp}.xlsx`;

            XLSX.writeFile(wb, filename);

            console.log('📥 Exportação concluída:', filename);
            alert(`Exportado com sucesso: ${this.currentData.length} registros`);

        } catch (error) {
            console.error('❌ Erro ao exportar:', error);
            alert('Erro ao exportar dados. Por favor, tente novamente.');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

const tableManager = new TableManager();

// ============================================
// APLICAÇÃO PRINCIPAL
// ============================================

class Application {
    constructor() {
        this.initialized = false;
    }

    async init() {
        console.log('🚀 Inicializando aplicação...');

        try {
            filtersManager.init();
            tableManager.init();
            chartsManager.initPatientsChart();
            this.attachControlButtons();

            await this.loadData();
            dataService.startAutoRefresh();

            this.initialized = true;
            console.log('✅ Aplicação inicializada com sucesso!');

        } catch (error) {
            console.error('❌ Erro ao inicializar aplicação:', error);
            alert('Erro ao inicializar o painel. Por favor, recarregue a página.');
        }
    }

    async loadData() {
        console.log('📊 Carregando dados da planilha...');
        
        const data = await dataService.fetchData();
        
        if (data.length > 0) {
            filtersManager.initYearOptions();
            filtersManager.applyFilters();
            console.log(`✅ Dados carregados: ${data.length} registros`);
        } else {
            console.warn('⚠️ Nenhum dado foi carregado da planilha');
        }
    }

    async refresh() {
        console.log('🔄 Atualizando dados...');
        await this.loadData();
    }

    attachControlButtons() {
        const btnUpdate = document.getElementById('btnUpdate');
        if (btnUpdate) {
            btnUpdate.addEventListener('click', async () => {
                btnUpdate.disabled = true;
                btnUpdate.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';
                
                try {
                    await this.refresh();
                    this.showNotification('Dados atualizados com sucesso!', 'success');
                } catch (error) {
                    this.showNotification('Erro ao atualizar dados', 'error');
                } finally {
                    btnUpdate.disabled = false;
                    btnUpdate.innerHTML = '<i class="fas fa-sync-alt"></i> Atualização';
                }
            });
        }

        const btnClearFilters = document.getElementById('btnClearFilters');
        if (btnClearFilters) {
            btnClearFilters.addEventListener('click', () => {
                filtersManager.clearFilters();
                this.showNotification('Filtros limpos', 'success');
            });
        }

        const btnExport = document.getElementById('btnExport');
        if (btnExport) {
            btnExport.addEventListener('click', () => {
                tableManager.exportToExcel();
            });
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '15px 25px',
            borderRadius: '8px',
            backgroundColor: type === 'success' ? '#4CAF50' : type === 'error' ? '#F44336' : '#2196F3',
            color: '#ffffff',
            fontWeight: '600',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            zIndex: '10000',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            animation: 'slideInRight 0.3s ease',
            fontSize: '0.95rem'
        });

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);

        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

const app = new Application();
window.app = app;

// Inicializar quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        app.init();
    });
} else {
    app.init();
}

// Gerenciar visibilidade da página
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        dataService.stopAutoRefresh();
        console.log('⏸️ Auto-refresh pausado');
    } else {
        dataService.startAutoRefresh();
        console.log('▶️ Auto-refresh reiniciado');
    }
});

console.log('%c🏥 Distrito Sanitário Eldorado', 'color: #0d2d5e; font-size: 16px; font-weight: bold;');
console.log('%cVersão 1.0.0 | Desenvolvido por Ana P. A. Silva', 'color: #2196F3; font-size: 12px;');
