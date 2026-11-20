/* Planejamento industrial: um único modelo alimenta tabela, Gantt, indicadores e Curva S. */
(() => {
  "use strict";

  // Constantes do armazenamento, listas editáveis e campos que podem vir do Excel.
  const STORAGE_KEY = "usina-maintenance-schedule-v1";
  const HIERARCHY_STATE_KEY = `${STORAGE_KEY}-hierarchy-state`;
  const WEEK_TABLE_KEY = `${STORAGE_KEY}-week-table`;
  const DEFAULT_WEEK_COUNT = 12;
  const MAX_WEEK = 999;
  const COST_PER_HOUR = 120;
  const OUTLINE_FIELDS = [
    { field: "setor", empty: "Setor não informado" },
    { field: "area", empty: "Área não informada" },
    { field: "conjunto", empty: "Conjunto não informado" },
    { field: "equipamento", empty: "Equipamento não informado" }
  ];
  const OUTLINE_ROLLUP_FIELDS = ["planIni", "planFim", "realIni", "realFim", "hhDisp", "hhPrev", "hhReal"];
  const DATE_FIELDS = { planIni: "planIniDate", planFim: "planFimDate", realIni: "realIniDate", realFim: "realFimDate" };
  const WEEK_ANCHOR = new Date("2026-11-02T00:00:00");
  const GANTT_WEEK_WIDTH = 100;
  const GANTT_BAR_HEIGHT = 14;
  const GANTT_MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const SECTORS = ["Laboratório Industrial", "Extração do Caldo", "Estação Tratamento de Água", "Suporte Industrial", "Geração de Energia", "Resíduos Industriais", "Fabricação de Açúcar", "Fabricação de Etanol", "Biomassa"];
  const RESPONSIBLES = ["Ct_Mecan", "Ct_Calde", "Ct_Utili", "Ct_Fetan", "Ct_Facuc", "Ct_Usin"];
  const TEAMS = Array.from({ length: 15 }, (_, index) => `Mec_${String(index + 1).padStart(2, "0")}`);
  const EQUIPMENT_STAGES = ["Desinstalação", "Manutenção", "Instalação"];
  const FILTER_FIELDS = [
    { field: "setor", label: "Setor", options: SECTORS },
    { field: "atividade", label: "Atividade", options: EQUIPMENT_STAGES },
    { field: "equipe", label: "Equipe", options: TEAMS },
    { field: "responsavel", label: "Responsável", options: RESPONSIBLES }
  ];
  const INDICATOR_FIELDS = [
    { field: "setor", label: "Setor" }, { field: "equipe", label: "Equipe" },
    { field: "familia", label: "Família" }, { field: "atividade", label: "Atividade" },
    { field: "prioridade", label: "Prioridade" }, { field: "tipoServico", label: "Tipo de Serviço" },
    { field: "programacao", label: "Programação" }, { field: "status", label: "Status" }
  ];
  const FIELDS = ["setor", "area", "conjunto", "equipamento", "atividade", "familia", "responsavel", "equipe", "os", "planIni", "planFim", "realIni", "realFim", "hhDisp", "hhPrev", "hhReal", "observacoes", "progresso", "prioridade", "tipoServico", "programacao", "desvio", "pd", "milestone", "baselineStart", "baselineFinish"];
  const FIELD_LABELS = { setor: "Setor", area: "Área", conjunto: "Conjunto", equipamento: "Equipamento", atividade: "Atividade", familia: "Família", responsavel: "Responsável", equipe: "Equipe", os: "OS", planIni: "Plan Ini (semana)", planFim: "Plan Fim (semana)", realIni: "Real Ini (semana)", realFim: "Real Fim (semana)", hhDisp: "HH Disp", hhPrev: "HH Prev", hhReal: "HH Real", observacoes: "Observações", progresso: "Progresso", prioridade: "Prioridade", tipoServico: "Tipo de Serviço", programacao: "Programação", milestone: "Marco", baselineStart: "Baseline Ini (semana)", baselineFinish: "Baseline Fim (semana)" };
  const ALIASES = { setor: ["setor", "departamento"], area: ["area", "área"], conjunto: ["conjunto", "sistema"], equipamento: ["equipamento", "ativo"], atividade: ["atividade", "etapa", "servico", "serviço"], familia: ["familia", "família"], responsavel: ["responsavel", "responsável", "encarregado"], equipe: ["equipe", "time"], os: ["os", "ordem de serviço", "ordem de servico"], planIni: ["plan ini", "planned start", "inicio planejado", "início planejado", "data inicio", "data início"], planFim: ["plan fim", "planned finish", "fim planejado", "data fim"], realIni: ["real ini", "actual start", "inicio real", "início real"], realFim: ["real fim", "actual finish", "fim real"], hhDisp: ["hh disp", "hh disponivel", "hh disponível"], hhPrev: ["hh prev", "hh prevista", "hh planejada", "hh planned"], hhReal: ["hh real", "hh realizada", "hh actual"], observacoes: ["observacoes", "observações", "obs"], progresso: ["progresso", "progress", "%"], prioridade: ["prioridade", "priority"], tipoServico: ["tipo de servico", "tipo de serviço", "servico", "serviço"], programacao: ["programacao", "programação", "programado"], milestone: ["marco", "milestone"], baselineStart: ["baseline start", "inicio baseline", "início baseline"], baselineFinish: ["baseline finish", "fim baseline"] };
  ALIASES.progresso.push("progresso (%)");
  Object.assign(FIELD_LABELS, { desvio: "Desvio", pd: "PD", planIniDate: "Data Ini Planejada", planFimDate: "Data Fim Planejada", realIniDate: "Data Ini Realizada", realFimDate: "Data Fim Realizada" });
  const PD_OPTIONS = ["Alta", "Médio", "Baixa"];
  FIELDS.push(...Object.values(DATE_FIELDS));

  // Registros de demonstração mostram os campos e a sincronização logo na abertura.
  const SEED_TASKS = [
    { id: "AT-001", setor: "Extração de Caldo", area: "Extração", conjunto: "Desfibrador de Cana", equipamento: "Motor principal", atividade: "Manutenção", familia: "Acionamento", responsavel: "CT_Mecan", equipe: "Mec_01", planIni: 1, planFim: 2, realIni: 1, realFim: "", hhDisp: 120, hhPrev: 96, hhReal: 33.6, observacoes: "Inspecionar acoplamento e alinhamento", progresso: 35, prioridade: "Alta", tipoServico: "Interno", programacao: true, milestone: false, dependencies: [], dependencyTypes: {}, baselineStart: "", baselineFinish: "" },
    { id: "AT-002", setor: "Extração de Caldo", area: "Extração", conjunto: "Desfibrador de Cana", equipamento: "Redutor", atividade: "Manutenção", familia: "Transmissão", responsavel: "CT_Mecan", equipe: "Mec_02", planIni: 3, planFim: 4, realIni: "", realFim: "", hhDisp: 80, hhPrev: 64, hhReal: 0, observacoes: "Aguardar inspeção do motor", progresso: 0, prioridade: "Média", tipoServico: "Interno", programacao: false, milestone: false, dependencies: ["AT-001"], dependencyTypes: { "AT-001": "TI" }, baselineStart: "", baselineFinish: "" },
    { id: "AT-003", setor: "Moenda", area: "Moenda", conjunto: "Tambor Alimentador", equipamento: "Bomba hidráulica", atividade: "Manutenção", familia: "Hidráulica", responsavel: "CT_Lubrificacao", equipe: "Mec_03", planIni: 2, planFim: 3, realIni: "", realFim: "", hhDisp: 48, hhPrev: 40, hhReal: 0, observacoes: "Troca de selos e análise de óleo", progresso: 0, prioridade: "Baixa", tipoServico: "Externo", programacao: true, milestone: false, dependencies: [], dependencyTypes: {}, baselineStart: "", baselineFinish: "" },
    { id: "AT-004", setor: "Caldeira", area: "Caldeira", conjunto: "Esteira de Bagaço", equipamento: "Motor elétrico", atividade: "Manutenção", familia: "Elétrica", responsavel: "CT_Eletrica", equipe: "Ele_01", planIni: 5, planFim: 6, realIni: "", realFim: "", hhDisp: 56, hhPrev: 48, hhReal: 0, observacoes: "", progresso: 0, prioridade: "Média", tipoServico: "Interno", programacao: false, milestone: false, dependencies: [], dependencyTypes: {}, baselineStart: "", baselineFinish: "" },
    { id: "AT-005", setor: "Utilidades", area: "Utilidades", conjunto: "Estação de Tratamento", equipamento: "Bomba centrífuga", atividade: "Manutenção", familia: "Bombeamento", responsavel: "CT_Usinagem", equipe: "Cald_01", planIni: 8, planFim: 8, realIni: "", realFim: "", hhDisp: 8, hhPrev: 8, hhReal: 0, observacoes: "Marco de liberação do sistema", progresso: 0, prioridade: "Alta", tipoServico: "Externo", programacao: false, milestone: true, dependencies: [], dependencyTypes: {}, baselineStart: "", baselineFinish: "" }
  ];

  // Estado compartilhado pelos componentes da página.
  let idSequence = 0;
  let weekTableLoadError = false;
  let weekTable = loadWeekTable();
  let records = loadRecords();
  let table;
  let improvementTaskLinks = new Set();
  let improvementGroupLinks = new Set();
  let ganttTooltipRows = new Map();
  let ganttInteractionsInstalled = false;
  let ganttHoverTooltip;
  let ganttHoverTooltipInstalled = false;
  let printCollapsedRows = null;
  let chart;
  let levelingChart;
  let resourceLevelingChart;
  let resourceFilterScope = { active: false, resourceIds: [], unidentified: 0 };
  let availableHours = loadAvailableHours();
  let availableHoursSource = localStorage.getItem(`${STORAGE_KEY}-available-hours-source`) || "";
  let capacityTeams = loadCapacityTeams();
  const indicatorFilters = new Map();
  const expandedRows = new Set();
  const activeFilters = new Map();
  const activeStatusFilters = new Set();
  let sourceRows = [];
  let sourceHeaders = [];
  let sourceImprovements = null;
  let showCriticalPath = false;
  let saveTimer;
  let tableRefreshPromise = Promise.resolve();
  let restoringHierarchy = false;
  let hierarchyReady = false;
  let tableReady = false;
  let refreshingOutlineRollups = false;
  let allocationRevision = 0;
  let editingPlanningCell = false;
  let allocationRefreshPending = false;
  let workloadSort = null;
  let scheduleScrollSyncInstalled = false;
  let splitRatio = Number(localStorage.getItem(`${STORAGE_KEY}-split`)) || 60;
  let ganttZoom = clamp(Number(localStorage.getItem(`${STORAGE_KEY}-gantt-zoom`)) || 1, 0.5, 2);
  let currentWeek = clamp(Number(localStorage.getItem(`${STORAGE_KEY}-current-week`)) || 1, 1, MAX_WEEK);

  function ganttWeekCount() {
    let last = weekTable.size ? 1 : DEFAULT_WEEK_COUNT;
    weekTable.forEach(entry => { last = Math.max(last, entry.week); });
    records.forEach(record => {
      ["planIni", "planFim", "realIni", "realFim", "baselineStart", "baselineFinish"].forEach(field => {
        const week = Number(record[field]);
        if (Number.isInteger(week) && week >= 1 && week <= MAX_WEEK) last = Math.max(last, week);
      });
    });
    return last;
  }
  function weekOptions(count) { return Array.from({ length: count }, (_, index) => index + 1); }
  function updateWeekSelector() {
    const select = document.getElementById("currentWeek");
    const count = Math.max(ganttWeekCount(), currentWeek);
    if (select.options.length !== count) {
      select.innerHTML = weekOptions(count).map(week => `<option value="${week}">${String(week).padStart(2, "0")}</option>`).join("");
    }
    select.value = String(currentWeek);
  }

  function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function parseCalendarDate(value) {
    if (value instanceof Date) return Number.isNaN(value.valueOf()) ? "" : localDateKey(value);
    if (typeof value === "number") {
      const excel = XLSX.SSF.parse_date_code(value);
      if (!excel) return "";
      value = `${excel.y}-${String(excel.m).padStart(2, "0")}-${String(excel.d).padStart(2, "0")}`;
    }
    const text = String(value ?? "").trim();
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    const br = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if (!iso && !br) return "";
    const year = Number(iso ? iso[1] : br[3]);
    const month = Number(iso ? iso[2] : br[2]);
    const day = Number(iso ? iso[3] : br[1]);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? localDateKey(date) : "";
  }
  function loadWeekTable() {
    try {
      const saved = localStorage.getItem(WEEK_TABLE_KEY);
      if (!saved) return new Map();
      const entries = JSON.parse(saved);
      if (!Array.isArray(entries) || !entries.length) throw new Error("Tabela de semanas inválida.");
      const result = new Map();
      entries.forEach(entry => {
        if (!entry || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || parseCalendarDate(entry.date) !== entry.date || !Number.isInteger(entry.week) || entry.week < 1 || entry.week > MAX_WEEK || typeof entry.workingDay !== "boolean" || result.has(entry.date)) throw new Error("Tabela de semanas inválida.");
        result.set(entry.date, entry);
      });
      return result;
    } catch (error) {
      console.error("Não foi possível carregar a tabela de semanas.", error);
      weekTableLoadError = true;
      return new Map();
    }
  }

  // Semanas são o dado oficial; datas só são usadas para importar planilhas.
  function dateToWeek(value, missingDates) {
    const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.valueOf())) return "";
    const key = localDateKey(date);
    if (weekTable.has(key)) return weekTable.get(key).week;
    if (weekTable.size && missingDates) missingDates.add(key);
    return clamp(Math.floor((date - WEEK_ANCHOR) / 604800000) + 1, 1, MAX_WEEK);
  }
  function normalizeWeek(value, missingDates) {
    if (value === null || value === undefined || value === "") return "";
    if (value instanceof Date) return dateToWeek(value, missingDates);
    const numeric = Number(value);
    if (Number.isFinite(numeric) && String(value).trim() !== "") {
      if (numeric > MAX_WEEK && window.XLSX) {
        const excelDate = XLSX.SSF.parse_date_code(numeric);
        if (excelDate) return dateToWeek(new Date(excelDate.y, excelDate.m - 1, excelDate.d), missingDates);
      }
      return clamp(Math.round(numeric), 1, MAX_WEEK);
    }
    const legacyDate = normalizeDate(value);
    return legacyDate ? dateToWeek(legacyDate, missingDates) : "";
  }
  function normalizeDate(value) {
    if (value === null || value === undefined || value === "") return "";
    if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
    if (typeof value === "number" && window.XLSX) {
      const date = XLSX.SSF.parse_date_code(value);
      if (date) return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }
    const text = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const brDate = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
    if (brDate) return `${brDate[3].length === 2 ? `20${brDate[3]}` : brDate[3]}-${brDate[2].padStart(2, "0")}-${brDate[1].padStart(2, "0")}`;
    const parsed = new Date(text);
    return Number.isNaN(parsed.valueOf()) ? "" : parsed.toISOString().slice(0, 10);
  }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function calculateActualHours(plannedHours, progress) { return Math.round((Math.max(0, Number(plannedHours) || 0) * clamp(Number(progress) || 0, 0, 100) / 100) * 100) / 100; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
  function formatWeek(value) { return value ? `S${String(value).padStart(2, "0")}` : "—"; }
  function taskName(record) { return [record.setor, record.conjunto, record.equipamento, record.atividade].filter(Boolean).join(" · ") || "Nova atividade"; }
  function allocatedHours(record) {
    return window.resourceAllocations ? window.resourceAllocations.getAllocatedHours(record.id) : null;
  }
  function effectiveHours(record) {
    const allocated = allocatedHours(record);
    return allocated === null ? record.hhDisp : allocated;
  }
  // Os nós de contexto são derivados dos campos hierárquicos; somente atividades são persistidas.
  function buildOutlineRows(sourceRecords) {
    let groupIndex = 0;
    const root = { id: "__outline_root__", outlineGroup: true, outlinePath: "[]", identificacao: "Usina da Pedra", _children: [] };
    const childMaps = new WeakMap();
    sourceRecords.forEach(record => {
      let parent = root;
      OUTLINE_FIELDS.forEach(({ field, empty }) => {
        const label = String(record[field] || "").trim() || empty;
        let children = childMaps.get(parent);
        if (!children) { children = new Map(); childMaps.set(parent, children); }
        let child = children.get(label);
        if (!child) {
          child = { id: `__outline_group_${++groupIndex}`, outlineGroup: true, outlinePath: JSON.stringify([...JSON.parse(parent.outlinePath), label]), identificacao: label, _children: [] };
          children.set(label, child);
          parent._children.push(child);
        }
        parent = child;
      });
      const allocated = allocatedHours(record);
      parent._children.push({ ...record, ...(allocated === null ? {} : { baseHhDisp: record.hhDisp, hhDisp: allocated }), identificacao: record.atividade || "Nova atividade", status: getTaskStatus(record) });
    });
    function assignRollups(node) {
      if (!node.outlineGroup) return node;
      const children = (node._children || []).map(assignRollups);
      const weeks = field => children
        .map(child => child[field])
        .filter(value => value !== "" && value !== null && value !== undefined)
        .map(Number)
        .filter(Number.isFinite);
      node.planIni = weeks("planIni").length ? Math.min(...weeks("planIni")) : "";
      node.planFim = weeks("planFim").length ? Math.max(...weeks("planFim")) : "";
      node.realIni = weeks("realIni").length ? Math.min(...weeks("realIni")) : "";
      node.realFim = weeks("realFim").length ? Math.max(...weeks("realFim")) : "";
      ["hhDisp", "hhPrev", "hhReal"].forEach(field => {
        node[field] = children.reduce((total, child) => total + (Number(child[field]) || 0), 0);
      });
      node.progresso = node.hhPrev > 0
        ? clamp(Math.round(node.hhReal / node.hhPrev * 100), 0, 100)
        : children.length
          ? Math.round(children.reduce((total, child) => total + (Number(child.progresso) || 0), 0) / children.length)
          : 0;
      node.ganttStatus = getTaskStatus(node);
      return node;
    }
    assignRollups(root);
    function assignNumbers(node, number) {
      node.outlineNumber = number;
      (node._children || []).forEach((child, index) => assignNumbers(child, `${number}.${index + 1}`));
    }
    assignNumbers(root, "1");
    return [root];
  }
  function stripOutlineFields(record) {
    const { outlineNumber, outlineGroup, identificacao, _children, rowSelectionFlag, status, baseHhDisp, ...task } = record;
    if (baseHhDisp !== undefined) task.hhDisp = baseHhDisp;
    return task;
  }
  function flattenOutlineRows(rows) {
    return rows.flatMap(row => row._children
      ? flattenOutlineRows(row._children)
      : row.outlineGroup ? [] : [stripOutlineFields(row)]);
  }
  function outlineNumbers(sourceRecords) {
    const result = new Map();
    function collect(rows) {
      rows.forEach(row => {
        if (row.outlineGroup) collect(row._children || []);
        else result.set(row.id, row.outlineNumber);
      });
    }
    collect(buildOutlineRows(sourceRecords));
    return result;
  }
  function getOutlineItems(sourceRecords = records) {
    const items = [];
    function collect(rows, ancestors = {}) {
      rows.forEach(row => {
        if (row.outlineGroup) {
          const path = JSON.parse(row.outlinePath);
          const values = { ...ancestors };
          if (path.length) {
            const field = OUTLINE_FIELDS[path.length - 1];
            values[field.field] = row.identificacao === field.empty ? "" : row.identificacao;
          }
          items.push({ et: row.outlineNumber, type: "group", key: row.outlinePath, ...values });
          collect(row._children || [], values);
        } else {
          items.push({ et: row.outlineNumber, type: "task", key: row.id, ...Object.fromEntries(OUTLINE_FIELDS.map(({ field }) => [field, row[field] || ""])) });
        }
      });
    }
    collect(buildOutlineRows(sourceRecords));
    return items;
  }
  function refreshImprovementHighlights() {
    const links = window.improvementActions?.getLinks() || [];
    improvementTaskLinks = new Set(links.filter(link => link.type === "task").map(link => link.key));
    improvementGroupLinks = new Set(links.filter(link => link.type === "group").map(link => link.key));
    if (!tableReady) return;
    function refreshRows(rows) {
      rows.forEach(row => {
        row.reformat();
        refreshRows(row.getTreeChildren());
      });
    }
    refreshRows(table.getRows());
  }
  function hasImprovement(data) {
    return data.outlineGroup ? improvementGroupLinks.has(data.outlinePath) : improvementTaskLinks.has(data.id);
  }
  function showDeviationList() {
    const body = document.getElementById("deviationRows");
    body.replaceChildren();
    function appendRows(rows) {
      rows.forEach(row => {
        if (row.outlineGroup) {
          appendRows(row._children || []);
        } else if (String(row.desvio ?? "").trim()) {
          const tr = document.createElement("tr");
          const project = [row.setor, row.area, row.conjunto, row.equipamento, row.identificacao].filter(Boolean).join(" · ");
          [row.outlineNumber, project, formatWeek(row.planIni), formatWeek(row.planFim), formatWeek(row.realIni), formatWeek(row.realFim), `${Number(row.progresso) || 0}%`, row.desvio, row.pd || "—"].forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = value;
            tr.append(cell);
          });
          body.append(tr);
        }
      });
    }
    appendRows(buildOutlineRows(records));
    if (!body.children.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 9;
      cell.className = "deviation-empty";
      cell.textContent = "Nenhuma atividade com desvio preenchido.";
      row.append(cell);
      body.append(row);
    }
    bootstrap.Modal.getOrCreateInstance(document.getElementById("deviationModal")).show();
  }
  function newTaskId() {
    idSequence += 1;
    return `AT-${Date.now().toString(36).toUpperCase()}${idSequence.toString(36).toUpperCase()}`;
  }
  // Ids repetidos fariam a tabela sobrescrever linhas diferentes ao salvar.
  function ensureUniqueIds(list) {
    const seen = new Set();
    return list.map(record => {
      if (record.id && !seen.has(record.id)) { seen.add(record.id); return record; }
      let id = newTaskId();
      while (seen.has(id)) id = newTaskId();
      seen.add(id);
      return { ...record, id };
    });
  }
  function emptyTask(overrides = {}) {
    const id = newTaskId();
    return { id, setor: "", area: "", conjunto: "", equipamento: "", atividade: "Manutenção", familia: "", responsavel: RESPONSIBLES[0], equipe: TEAMS[0], os: "", planIni: 1, planFim: 1, realIni: "", realFim: "", hhDisp: 0, hhPrev: 0, hhReal: 0, observacoes: "", progresso: 0, prioridade: "Média", tipoServico: "Interno", programacao: false, desvio: "", pd: "", milestone: false, dependencies: [], dependencyTypes: {}, baselineStart: "", baselineFinish: "", ...overrides };
  }
  function normalizeRecord(record) {
    const defaults = emptyTask();
    const progresso = clamp(Number(record.progresso) || 0, 0, 100);
    const hhPrev = Number(record.hhPrev) || 0;
    const savedActualHours = Number(record.hhReal);
    const hhReal = record.hhReal !== "" && record.hhReal !== null && record.hhReal !== undefined && Number.isFinite(savedActualHours) && savedActualHours >= 0
      ? savedActualHours
      : calculateActualHours(hhPrev, progresso);
    return { ...defaults, ...record, id: record.id || defaults.id, planIni: normalizeWeek(record.planIni), planFim: normalizeWeek(record.planFim), realIni: normalizeWeek(record.realIni), realFim: normalizeWeek(record.realFim), baselineStart: normalizeWeek(record.baselineStart), baselineFinish: normalizeWeek(record.baselineFinish), progresso, hhDisp: Number(record.hhDisp) || 0, hhPrev, hhReal, dependencies: Array.isArray(record.dependencies) ? record.dependencies : [], dependencyTypes: record.dependencyTypes || {} };
  }
  function loadRecords() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(saved) ? ensureUniqueIds(saved.map(normalizeRecord)) : SEED_TASKS.map(normalizeRecord);
    } catch (error) {
      console.warn("Não foi possível recuperar o cronograma salvo.", error);
      return SEED_TASKS.map(normalizeRecord);
    }
  }
  function loadAvailableHours() {
    try {
      const saved = JSON.parse(localStorage.getItem(`${STORAGE_KEY}-available-hours`) || "null");
      return Array.isArray(saved) && saved.length <= MAX_WEEK
        ? saved.map(value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0)
        : Array(DEFAULT_WEEK_COUNT).fill(0);
    } catch (error) {
      console.warn("Não foi possível recuperar a capacidade semanal salva.", error);
      return Array(DEFAULT_WEEK_COUNT).fill(0);
    }
  }
  function loadCapacityTeams() {
    try {
      const saved = JSON.parse(localStorage.getItem(`${STORAGE_KEY}-capacity-teams`) || "null");
      if (saved === null) return null;
      const data = Array.isArray(saved) ? { hasSector: false, entries: saved } : saved;
      if (!data || typeof data.hasSector !== "boolean" || !Array.isArray(data.entries) || !data.entries.every(item => typeof item.team === "string" && (!data.hasSector || typeof item.sector === "string") && Array.isArray(item.hours) && item.hours.length <= MAX_WEEK && item.hours.every(value => typeof value === "number" && Number.isFinite(value) && value >= 0))) throw new Error("Formato de capacidade por setor e equipe inválido.");
      return data;
    } catch (error) {
      console.error("Não foi possível carregar a capacidade por equipe.", error);
      return null;
    }
  }

  // Tabulator fornece edição, filtros, seleção e reorganização das colunas da árvore.
  function createTable() {
    table = new Tabulator("#activityTable", {
      data: buildOutlineRows(records), index: "id", height: "443px", layout: "fitData", movableColumns: true, resizableColumnFit: true, selectableRows: true, dataTree: true, dataTreeChildField: "_children", dataTreeElementColumn: "identificacao", dataTreeChildIndent: 18, dataTreeStartExpanded: true, dataTreeSort: false, pagination: false, placeholder: "Nenhuma atividade para exibir",
      columnDefaults: { headerSort: false, resizable: true, tooltip: true, editor: "input", editable: cell => !cell.getRow().getData().outlineGroup },
      columns: [
        { title: "", field: "rowSelectionFlag", formatter: "rowSelection", width: 38, minWidth: 38, maxWidth: 38, frozen: true, hozAlign: "center", headerSort: false, resizable: false, cellClick: (_event, cell) => cell.getRow().toggleSelect() },
        { title: "ET", field: "outlineNumber", width: 62, minWidth: 45, frozen: true, hozAlign: "right", headerHozAlign: "right", headerSort: false, editor: false },
        { title: "Projeto", field: "identificacao", width: 250, frozen: true, headerSort: false, editor: false, formatter: identificationFormatter },
        { title: "Setor", field: "setor", width: 110, visible: false, editor: "list", editorParams: { values: listValues("setor", SECTORS), autocomplete: true, freetext: true, allowEmpty: true, listOnEmpty: true } },
        { title: "Área", field: "area", width: 90, visible: false, formatter: suppressRepeatedLabel },
        { title: "Conjunto", field: "conjunto", width: 115, visible: false, formatter: suppressRepeatedLabel },
        { title: "Equipamento", field: "equipamento", width: 110, visible: false, formatter: suppressRepeatedLabel },
        { title: "Atividade", field: "atividade", width: 110, visible: false, editor: "list", editorParams: { values: EQUIPMENT_STAGES, allowEmpty: true }, formatter: stageFormatter },
        { title: "Família", field: "familia", width: 85, visible: false },
        { title: "Responsável", field: "responsavel", width: 100, visible: false, editor: "list", editorParams: { values: listValues("responsavel", RESPONSIBLES), autocomplete: true, freetext: true, allowEmpty: true, listOnEmpty: true } },
        { title: "Equipe", field: "equipe", width: 72, editor: "list", editorParams: { values: listValues("equipe", TEAMS), autocomplete: true, freetext: true, allowEmpty: true, listOnEmpty: true } },
        { title: "OS", field: "os", width: 90 },
        { title: "Planejado", columns: [{ title: "Sem. Ini", field: "planIni", width: 68, editor: weekEditor, formatter: weekFormatter, tooltip: weekTooltip }, { title: "Sem. Fim", field: "planFim", width: 68, editor: weekEditor, formatter: weekFormatter, tooltip: weekTooltip }, { title: "Data Ini Planejada", field: "planIniDate", width: 125, visible: false, editor: dateEditor, formatter: dateFormatter, tooltip: dateTooltip }, { title: "Data Fim Planejada", field: "planFimDate", width: 125, visible: false, editor: dateEditor, formatter: dateFormatter, tooltip: dateTooltip }] },
        { title: "Realizado", columns: [{ title: "Sem. Ini", field: "realIni", width: 68, editor: weekEditor, formatter: weekFormatter, tooltip: weekTooltip }, { title: "Sem. Fim", field: "realFim", width: 68, editor: weekEditor, formatter: weekFormatter, tooltip: weekTooltip }, { title: "Data Ini Realizada", field: "realIniDate", width: 125, visible: false, editor: dateEditor, formatter: dateFormatter, tooltip: dateTooltip }, { title: "Data Fim Realizada", field: "realFimDate", width: 125, visible: false, editor: dateEditor, formatter: dateFormatter, tooltip: dateTooltip }] },
        { title: "HH", columns: [{ title: "HH Disp", field: "hhDisp", width: 65, editor: "number", editorParams: { min: 0 }, validator: "min:0", formatter: hoursFormatter, hozAlign: "right", editable: cell => !cell.getRow().getData().outlineGroup && window.resourceAllocations.isAvailable() && allocatedHours(cell.getRow().getData()) === null, tooltip: cell => allocatedHours(cell.getRow().getData()) === null ? "HH disponível" : "Valor calculado pelas alocações; estorne-as para editar." }, { title: "HH Prev", field: "hhPrev", width: 65, editor: boundedNumberEditor, formatter: hoursFormatter, hozAlign: "right" }, { title: "HH Real", field: "hhReal", width: 65, editor: false, formatter: hoursFormatter, hozAlign: "right" }] },
        { title: "Observações", field: "observacoes", width: 140, editor: "textarea", formatter: "textarea" },
        { title: "Status", field: "status", width: 100, editor: false, editable: false, formatter: statusFormatter },
        { title: "Avanço", field: "progresso", width: 90, editor: boundedNumberEditor, formatter: progressFormatter, hozAlign: "center" },
        { title: "Prioridade", field: "prioridade", width: 75, editor: "list", editorParams: { values: ["Alta", "Média", "Baixa"] }, formatter: priorityFormatter },
        { title: "Serviço", field: "tipoServico", width: 105, editor: false, formatter: serviceFormatter, hozAlign: "center" },
        { title: "Prog.", field: "programacao", width: 50, editor: "tickCross", formatter: "tickCross", formatterParams: { allowEmpty: false, tickElement: "<span class='programmed-mark'>X</span>", crossElement: "" }, hozAlign: "center" },
        { title: "Desvio", field: "desvio", width: 140 },
        { title: "PD", field: "pd", width: 75, editor: "list", editorParams: { values: PD_OPTIONS } },
        { title: "AM", field: "improvementFlag", width: 55, editor: false, editable: false, hozAlign: "center", formatter: cell => hasImprovement(cell.getRow().getData()) ? "<span class='programmed-mark' aria-label='Possui ações de melhoria' title='Possui ações de melhoria'>X</span>" : "" },
        { title: "Marco", field: "milestone", width: 54, visible: false, editor: "tickCross", formatter: "tickCross", formatterParams: { allowEmpty: false }, hozAlign: "center" },
        { title: "Baseline Ini", field: "baselineStart", width: 78, visible: false, editor: weekEditor, formatter: weekFormatter }, { title: "Baseline Fim", field: "baselineFinish", width: 78, visible: false, editor: weekEditor, formatter: weekFormatter }
      ],
      rowFormatter: row => {
        const data = row.getData();
        const isGroup = Boolean(data.outlineGroup);
        row.getElement().classList.toggle("outline-summary-row", isGroup);
        row.getElement().classList.toggle("has-improvement", hasImprovement(data));
        row.getCells().forEach(cell => cell.getElement().classList.toggle("outline-empty-cell", isGroup && !["rowSelectionFlag", "outlineNumber", "identificacao", "improvementFlag", ...OUTLINE_ROLLUP_FIELDS].includes(cell.getField())));
      },
      dataChanged: () => { if (!refreshingOutlineRollups) syncRecordsFromTable(); },
      rowSelectionChanged: updateActionState,
      tableBuilt: () => { tableReady = true; updateActionState(); restoreHierarchyState(); hierarchyReady = true; refreshImprovementHighlights(); }
    });
    table.on("rowSelectionChanged", updateActionState);
    table.on("renderComplete", renderGantt);
    table.on("dataTreeRowExpanded", () => { if (hierarchyReady) persistHierarchyState(); renderGantt(); });
    table.on("dataTreeRowCollapsed", () => { if (hierarchyReady) persistHierarchyState(); renderGantt(); });
    table.on("cellEdited", cell => {
      const row = cell.getRow();
      const field = cell.getField();
      if (Object.hasOwn(DATE_FIELDS, field)) {
        const data = row.getData();
        const changes = {};
        if (cell.getValue() !== cell.getOldValue()) changes[DATE_FIELDS[field]] = "";
        const startField = field.endsWith("Ini") ? field : field.replace("Fim", "Ini");
        const finishField = field.endsWith("Fim") ? field : field.replace("Ini", "Fim");
        if (data[startField] && data[finishField] && Number(data[startField]) > Number(data[finishField])) {
          const other = field === startField ? finishField : startField;
          changes[other] = data[field];
          changes[DATE_FIELDS[other]] = "";
        }
        row.update(changes);
      } else if (Object.values(DATE_FIELDS).includes(field)) {
        const data = row.getData();
        const weekField = Object.keys(DATE_FIELDS).find(key => DATE_FIELDS[key] === field);
        const date = data[field];
        const changes = {};
        if (date) {
          const missing = new Set();
          changes[weekField] = dateToWeek(date, missing);
          const otherWeek = weekField.endsWith("Ini") ? weekField.replace("Ini", "Fim") : weekField.replace("Fim", "Ini");
          const otherDate = data[DATE_FIELDS[otherWeek]];
          const inconsistent = otherDate ? (weekField.endsWith("Ini") ? date > otherDate : date < otherDate) : data[otherWeek] && (weekField.endsWith("Ini") ? changes[weekField] > Number(data[otherWeek]) : changes[weekField] < Number(data[otherWeek]));
          if (inconsistent) { changes[otherWeek] = changes[weekField]; changes[DATE_FIELDS[otherWeek]] = date; }
          if (missing.size) alert(`A data ${formatCalendarDate(date)} não consta na tabela de semanas e foi convertida pela regra anterior.`);
        }
        row.update(changes);
      }
      if (["hhPrev", "progresso"].includes(field)) {
        const data = row.getData();
        row.update({ hhReal: calculateActualHours(data.hhPrev, data.progresso) });
      }
      if (field === "progresso" || Object.hasOwn(DATE_FIELDS, field) || Object.values(DATE_FIELDS).includes(field)) {
        row.update({ status: getTaskStatus(row.getData()) });
        row.reformat();
      }
      syncRecordsFromTable();
      if (OUTLINE_FIELDS.some(({ field: outlineField }) => outlineField === field) || field === "atividade" || (activeStatusFilters.size && (field === "progresso" || Object.hasOwn(DATE_FIELDS, field) || Object.values(DATE_FIELDS).includes(field)))) renderOutlineTable();
      else if (OUTLINE_ROLLUP_FIELDS.includes(field) || Object.values(DATE_FIELDS).includes(field) || ["hhPrev", "progresso"].includes(field)) refreshOutlineRollups();
    });
    table.on("cellEditing", () => { editingPlanningCell = true; });
    const finishCellEdit = () => {
      editingPlanningCell = false;
      if (allocationRefreshPending) window.setTimeout(refreshAllocationHours, 0);
    };
    table.on("cellEdited", finishCellEdit);
    table.on("cellEditCancelled", finishCellEdit);
  }
  function syncRecordsFromTable() {
    if (!table) return;
    mergeLatestTableData();
    refreshViews();
    scheduleSave();
  }
  function mergeLatestTableData() {
    if (!table) return;
    const updated = new Map(flattenOutlineRows(table.getData()).map(record => [record.id, record]));
    if (!updated.size) return;
    records = records.map(record => updated.has(record.id) ? { ...record, ...updated.get(record.id) } : record);
  }
  function filteredRecords() {
    const query = document.getElementById("globalSearch").value.trim().toLocaleLowerCase("pt-BR");
    return records.filter(record => {
      const matchesQuery = !query || [record.setor, record.area, record.conjunto, record.equipamento, record.atividade, record.familia, record.responsavel, record.equipe, record.os, record.observacoes]
        .some(value => String(value || "").toLocaleLowerCase("pt-BR").includes(query));
      const matchesFilters = [...activeFilters].every(([field, selected]) => selected.has(String(record[field] || "")));
      return matchesQuery && matchesFilters;
    });
  }
  function filteredOutlineRows() {
    const rows = buildOutlineRows(filteredRecords());
    if (!activeStatusFilters.size) return rows;
    function keepMatches(row) {
      if (!row.outlineGroup) return activeStatusFilters.has(getTaskStatus(row));
      row._children = (row._children || []).filter(keepMatches);
      return row._children.length > 0;
    }
    rows[0]._children = rows[0]._children.filter(keepMatches);
    return rows;
  }
  function renderOutlineTable(selectIds = []) {
    tableRefreshPromise = table.replaceData(filteredOutlineRows()).then(() => {
      restoreHierarchyState();
      if (activeStatusFilters.size) {
        restoringHierarchy = true;
        try { expandHierarchyAll(); } finally { restoringHierarchy = false; }
      }
      if (selectIds.length) table.selectRow(selectIds);
      updateActionState();
      renderGantt();
    });
    return tableRefreshPromise;
  }
  function refreshOutlineRollups() {
    const summaries = [];
    const tableRows = new Map();
    function collectTableRows(rows) {
      rows.forEach(row => {
        tableRows.set(String(row.getIndex()), row);
        collectTableRows(row.getTreeChildren());
      });
    }
    function collect(rows) {
      rows.forEach(row => {
        if (!row.outlineGroup) return;
        summaries.push(row);
        collect(row._children || []);
      });
    }
    collectTableRows(table.getRows());
    collect(filteredOutlineRows());
    refreshingOutlineRollups = true;
    try {
      summaries.forEach(summary => {
        const row = tableRows.get(String(summary.id));
        if (row) row.update(Object.fromEntries([...OUTLINE_ROLLUP_FIELDS, "progresso", "ganttStatus"].map(field => [field, summary[field]])));
      });
    } finally {
      refreshingOutlineRollups = false;
    }
    renderGantt();
  }
  function weekDates(week) {
    if (!week) return [];
    const dates = [...weekTable.values()].filter(entry => entry.week === Number(week)).map(entry => entry.date).sort();
    if (dates.length || weekTable.size) return dates;
    const start = new Date(WEEK_ANCHOR);
    start.setDate(start.getDate() + (Number(week) - 1) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return [localDateKey(start), localDateKey(end)];
  }
  function formatCalendarDate(value) {
    return value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : "";
  }
  function weekTooltip(_event, cell) {
    const dates = weekDates(cell.getValue());
    if (!cell.getValue()) return "";
    const dateField = DATE_FIELDS[cell.getField()];
    const exactDate = dateField && cell.getRow().getData()[dateField];
    if (!dates.length) return `${exactDate ? `Data da atividade: ${formatCalendarDate(exactDate)}. ` : ""}Sem datas cadastradas para esta semana na Tab Sem.`;
    const range = dates.length === 1 ? formatCalendarDate(dates[0]) : `${formatCalendarDate(dates[0])} a ${formatCalendarDate(dates[dates.length - 1])}`;
    const period = weekTable.size ? `Datas cadastradas: ${range}` : `Período estimado: ${range}`;
    return exactDate ? `Data da atividade: ${formatCalendarDate(exactDate)}. ${period}` : period;
  }
  function displayedDate(cell) {
    const field = cell.getField();
    const data = cell.getRow().getData();
    if (data[field]) return { value: data[field], estimated: false };
    const weekField = Object.keys(DATE_FIELDS).find(key => DATE_FIELDS[key] === field);
    const dates = weekDates(data[weekField]);
    return { value: weekField.endsWith("Ini") ? dates[0] : dates[dates.length - 1], estimated: true };
  }
  function dateFormatter(cell) {
    const date = displayedDate(cell);
    return date.value ? `${date.estimated ? "~ " : ""}${formatCalendarDate(date.value)}` : "—";
  }
  function dateTooltip(_event, cell) {
    const date = displayedDate(cell);
    return date.value ? (date.estimated ? "Data estimada pelo limite da semana; não é uma data exata da atividade." : "Data informada para a atividade.") : "Sem data informada ou data de referência para esta semana.";
  }
  function dateEditor(cell, onRendered, success, cancel) {
    const input = document.createElement("input");
    input.type = "date";
    input.value = displayedDate(cell).value || "";
    input.style.cssText = "width:100%;height:100%;box-sizing:border-box;padding:4px";
    let finished = false;
    const commit = () => {
      if (finished) return;
      if (input.value && !parseCalendarDate(input.value)) { alert("Informe uma data válida."); return; }
      finished = true;
      success(input.value);
    };
    input.addEventListener("change", commit);
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); commit(); }
      if (event.key === "Escape") { finished = true; cancel(); }
    });
    onRendered(() => input.focus());
    return input;
  }
  function weekFormatter(cell) { return formatWeek(cell.getValue()); }
  function hasScheduleDelay(record) {
    return (Boolean(record.realIni) && Boolean(record.planIni) && Number(record.realIni) > Number(record.planIni))
      || (Boolean(record.realFim) && Boolean(record.planFim) && Number(record.realFim) > Number(record.planFim));
  }
  function getTaskStatus(record) {
    const progress = Number(record.progresso) || 0;
    if (progress >= 100) return "Concluído";
    if (hasScheduleDelay(record)) return "Atraso";
    return record.realIni ? "Em Andamento" : "Pendente";
  }
  function taskStatusSlug(record) {
    const status = getTaskStatus(record);
    if (status === "Concluído" && hasScheduleDelay(record)) return "completed-late";
    return statusSlug(status);
  }
  function statusFormatter(cell) {
    const record = cell.getRow().getData();
    const status = getTaskStatus(record);
    const statusClass = taskStatusSlug(record);
    return `<span class="task-status task-status-${statusClass}">${status}</span>`;
  }
  function listValues(field, values) { return [...new Set([...values, ...records.map(record => record[field]).filter(Boolean)])].sort((a, b) => String(a).localeCompare(String(b), "pt-BR")); }
  function identificationFormatter(cell) {
    const record = cell.getRow().getData();
    if (record.outlineGroup) return `<div class="identity-cell outline-group-label"><span class="identity-summary">${escapeHtml(record.identificacao)}</span></div>`;
    const expanded = expandedRows.has(String(record.id));
    const summary = record.identificacao || "Nova atividade";
    const details = [["Setor", record.setor], ["Área", record.area], ["Conjunto", record.conjunto], ["Equipamento", record.equipamento], ["Atividade", record.atividade]];
    return `<div class="identity-cell"><button class="identity-toggle" type="button" data-expand-id="${escapeHtml(record.id)}" aria-expanded="${expanded}" aria-label="${expanded ? "Recolher" : "Expandir"} detalhes"><i class="fa-solid fa-chevron-${expanded ? "down" : "right"}"></i></button><span class="identity-summary">${escapeHtml(summary)}</span><div class="identity-details" ${expanded ? "" : "hidden"}>${details.map(([label, value]) => `<div><span>${label}</span><strong>${escapeHtml(value || "—")}</strong></div>`).join("")}</div></div>`;
  }
  function suppressRepeatedLabel(cell) {
    const previous = cell.getRow().getPrevRow();
    const value = cell.getValue();
    return previous && previous.getData()[cell.getField()] === value ? "" : escapeHtml(value);
  }
  function stageFormatter(cell) { return escapeHtml(cell.getValue() || "Manutenção"); }
  function hoursFormatter(cell) { return (Number(cell.getValue()) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 }); }
  function weekEditor(cell, onRendered, success, cancel) {
    const input = document.createElement("input");
    let finished = false;
    input.type = "number";
    input.min = "1";
    input.max = String(MAX_WEEK);
    input.step = "1";
    input.value = cell.getValue() ?? "";
    input.style.cssText = "width:100%;height:100%;box-sizing:border-box;padding:4px";
    const synchronize = () => setTimeout(syncRecordsFromTable, 0);
    const commit = () => {
      if (finished) return;
      if (input.value === "") { finished = true; success(""); synchronize(); return; }
      const value = Number(input.value);
      if (!Number.isInteger(value) || value < 1 || value > MAX_WEEK) return;
      finished = true;
      success(value);
      synchronize();
    };
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); commit(); }
      if (event.key === "Escape") { finished = true; cancel(); }
    });
    input.addEventListener("change", commit);
    input.addEventListener("blur", commit);
    onRendered(() => { input.focus(); input.select(); });
    return input;
  }
  function boundedNumberEditor(cell, onRendered, success, cancel) {
    const input = document.createElement("input");
    const isProgress = cell.getField() === "progresso";
    let finished = false;
    input.type = "number";
    input.min = "0";
    if (isProgress) input.max = "100";
    input.step = isProgress ? "1" : "any";
    input.value = cell.getValue() ?? "0";
    input.style.cssText = "width:100%;height:100%;box-sizing:border-box;padding:4px";
    const commit = () => {
      if (finished) return;
      if (input.value === "") { finished = true; success(0); return; }
      const value = Number(input.value);
      if (!Number.isFinite(value) || value < 0 || (isProgress && value > 100)) return;
      finished = true;
      success(value);
    };
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); commit(); }
      if (event.key === "Escape") { finished = true; cancel(); }
    });
    input.addEventListener("change", commit);
    input.addEventListener("blur", commit);
    onRendered(() => { input.focus(); input.select(); });
    return input;
  }
  function progressFormatter(cell) {
    const value = clamp(Number(cell.getValue()) || 0, 0, 100);
    return progressMarkup(value);
  }
  function progressMarkup(value) {
    const color = value < 50 ? "#cc5b56" : value < 80 ? "#d79b45" : "#4a9a70";
    return `<div class="progress-cell"><div class="progress-track"><div class="progress-fill" style="width:${value}%;background:${color}"></div></div><span class="progress-label">${value}%</span></div>`;
  }
  function priorityFormatter(cell) {
    const value = cell.getValue() || "Média";
    return `<span class="priority-badge ${escapeHtml(value.toLocaleLowerCase("pt-BR"))}">${escapeHtml(value)}</span>`;
  }
  function serviceFormatter(cell) {
    const selected = cell.getValue() || "Interno";
    const name = `service-${String(cell.getRow().getIndex()).replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const taskId = escapeHtml(cell.getRow().getIndex());
    return `<label><input type="radio" name="${name}" data-task-id="${taskId}" value="Interno" ${selected === "Interno" ? "checked" : ""}> Int. </label><label><input type="radio" name="${name}" data-task-id="${taskId}" value="Externo" ${selected === "Externo" ? "checked" : ""}> Ext.</label>`;
  }

  // Gantt próprio no padrão do Microsoft Project: escala de meses e semanas, barras de tarefa, barras-resumo e marcos alinhados às linhas da tabela.
  function ganttWeekWidth() {
    const host = document.getElementById("ganttHost");
    const fitWidth = host ? host.clientWidth / ganttWeekCount() : 0;
    return Math.max(GANTT_WEEK_WIDTH * ganttZoom, fitWidth);
  }
  function ganttMonthTiers(weekCount) {
    const tiers = [];
    const weekDates = new Map();
    [...weekTable.values()].sort((a, b) => a.date.localeCompare(b.date)).forEach(entry => {
      if (!weekDates.has(entry.week)) weekDates.set(entry.week, []);
      weekDates.get(entry.week).push(entry.date);
    });
    for (let week = 1; week <= weekCount; week++) {
      let dates = weekDates.get(week);
      if (!dates && weekTable.size) {
        const last = tiers[tiers.length - 1];
        if (last?.label === "Sem data") last.weeks += 1;
        else tiers.push({ label: "Sem data", weeks: 1 });
        continue;
      }
      if (!dates) {
        const start = new Date(WEEK_ANCHOR);
        start.setDate(start.getDate() + (week - 1) * 7);
        dates = Array.from({ length: 7 }, (_, offset) => {
          const date = new Date(start);
          date.setDate(date.getDate() + offset);
          return localDateKey(date);
        });
      }
      const months = new Map();
      dates.forEach(date => {
        const month = date.slice(0, 7);
        months.set(month, (months.get(month) || 0) + 1);
      });
      let selectedMonth;
      let maxDays = 0;
      months.forEach((days, month) => {
        if (days > maxDays) { selectedMonth = month; maxDays = days; }
      });
      const [year, month] = selectedMonth.split("-").map(Number);
      const label = `${GANTT_MONTHS[month - 1]} ${year}`;
      const last = tiers[tiers.length - 1];
      if (last?.label === label) last.weeks += 1;
      else tiers.push({ label, weeks: 1 });
    }
    return tiers;
  }
  function renderGantt() {
    const host = document.querySelector("#ganttHost");
    if (!host) return;
    const previousLeft = host.scrollLeft;
    const previousTop = host.scrollTop;
    const visibleRows = [];
    function collectVisibleRows(rows) {
      rows.forEach(row => {
        visibleRows.push(row);
        if (row.isTreeExpanded()) collectVisibleRows(row.getTreeChildren());
      });
    }
    if (table) collectVisibleRows(table.getRows());
    ganttTooltipRows = new Map(visibleRows.map(row => [String(row.getIndex()), row.getData()]));
    installGanttInteractions(host);
    const tableHolder = document.querySelector("#activityTable .tabulator-tableholder");
    const holderTop = tableHolder?.getBoundingClientRect().top || 0;
    const holderScroll = tableHolder?.scrollTop || 0;
    const printMode = document.body.classList.contains("print-project");
    const weekWidth = ganttWeekWidth();
    const weekCount = ganttWeekCount();
    const canvasWidth = weekWidth * weekCount;
    setText("ganttRangeTitle", `Cronograma · Semanas 01–${String(weekCount).padStart(2, "0")}`);
    setText("ganttRangeBadge", `${weekCount} ${weekCount === 1 ? "SEMANA" : "SEMANAS"}`);
    updateWeekSelector();
    const criticalIds = showCriticalPath ? criticalTaskIds() : new Set();
    const placed = new Map();
    let bottom = 0;
    const rowsHtml = [];
    const barsHtml = [];
    visibleRows.forEach(row => {
      const data = row.getData();
      const rect = row.getElement().getBoundingClientRect();
      const height = printMode ? 18 : rect.height || 31;
      const top = printMode ? bottom : rect.height ? rect.top - holderTop + holderScroll : bottom;
      bottom = top + height;
      const isGroup = Boolean(data.outlineGroup);
      rowsHtml.push(`<div class="pg-row${isGroup ? " is-summary" : ""}" style="top:${top}px;height:${height}px"></div>`);
      if (!data.planIni) return;
      const start = Number(data.planIni);
      const end = Math.max(start, Number(data.planFim) || start);
      const progress = clamp(Number(data.progresso) || 0, 0, 100);
      const id = escapeHtml(String(row.getIndex()));
      const left = (start - 1) * weekWidth;
      const width = (end - start + 1) * weekWidth;
      const classes = `pg-bar status-${taskStatusSlug(data)}`;
      if (isGroup) {
        barsHtml.push(`<div class="${classes} pg-summary" data-id="${id}" style="left:${left + 1}px;top:${top + (height - 8) / 2 - 2}px;width:${width - 2}px"><i class="pg-progress" style="width:${progress}%"></i></div>`);
        return;
      }
      const barTop = top + (height - GANTT_BAR_HEIGHT) / 2;
      placed.set(String(row.getIndex()), { top, height, left, right: left + width, end });
      if (data.baselineStart && data.baselineFinish) {
        const baselineLeft = (Number(data.baselineStart) - 1) * weekWidth;
        const baselineWidth = weekSpan(data.baselineStart, data.baselineFinish) * weekWidth;
        barsHtml.push(`<div class="pg-baseline" style="left:${baselineLeft}px;top:${barTop + GANTT_BAR_HEIGHT + 1}px;width:${baselineWidth}px"></div>`);
      }
      const critical = criticalIds.has(data.id) ? " is-critical" : "";
      if (data.milestone) {
        barsHtml.push(`<div class="${classes} pg-task pg-milestone${critical}" data-id="${id}" style="left:${left + weekWidth / 2 - 8}px;top:${top + (height - 16) / 2}px"></div>`);
        placed.get(String(row.getIndex())).right = left + weekWidth / 2 + 8;
        placed.get(String(row.getIndex())).left = left + weekWidth / 2 - 8;
        return;
      }
      barsHtml.push(`<div class="${classes} pg-task${critical}" data-id="${id}" style="left:${left + 1}px;top:${barTop}px;width:${width - 2}px;height:${GANTT_BAR_HEIGHT}px"><i class="pg-progress" style="width:${progress}%"></i><b class="pg-handle pg-handle-start"></b><b class="pg-handle pg-handle-end"></b><u class="pg-link" title="Arraste até outra atividade para criar um vínculo"></u></div>`);
    });
    const arrows = [];
    visibleRows.forEach(row => {
      const data = row.getData();
      const target = placed.get(String(row.getIndex()));
      if (!target || data.outlineGroup) return;
      (data.dependencies || []).forEach(predecessorId => {
        const source = placed.get(String(predecessorId));
        if (!source) return;
        const x1 = source.right;
        const y1 = source.top + source.height / 2;
        const x2 = target.left;
        const y2 = target.top + target.height / 2;
        const path = x2 >= x1 + 14
          ? `M ${x1} ${y1} H ${x1 + 7} V ${y2} H ${x2 - 1}`
          : `M ${x1} ${y1} H ${x1 + 7} V ${(y1 + y2) / 2} H ${x2 - 8} V ${y2} H ${x2 - 1}`;
        arrows.push(`<path d="${path}" marker-end="url(#pgArrow)"/>`);
      });
    });
    const monthsHtml = ganttMonthTiers(weekCount).map(tier => `<div style="width:${tier.weeks * weekWidth}px">${escapeHtml(tier.label)}</div>`).join("");
    const weeksHtml = weekOptions(weekCount).map(week => `<div style="width:${weekWidth}px">S${String(week).padStart(2, "0")}</div>`).join("");
    const bodyHeight = bottom;
    host.innerHTML = `<div class="pg-canvas" style="width:${canvasWidth}px;--pg-week:${weekWidth}px"><div class="pg-header"><div class="pg-tier pg-months">${monthsHtml}</div><div class="pg-tier pg-weeks">${weeksHtml}</div></div><div class="pg-body" style="height:${bodyHeight}px"><div class="pg-now" style="left:${(currentWeek - 1) * weekWidth}px;width:${weekWidth}px"></div>${rowsHtml.join("")}<svg class="pg-links" width="${canvasWidth}" height="${bodyHeight}"><defs><marker id="pgArrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L8 4 L0 8 z"/></marker></defs>${arrows.join("")}</svg>${barsHtml.join("")}</div></div>`;
    updateGanttZoomControls();
    if (tableHolder) {
      // A barra horizontal do Gantt ocupa espaço próprio; a tabela recebe a mesma folga para manter os limites de rolagem iguais.
      const visibleHeight = window.innerWidth <= 800
        ? tableHolder.clientHeight + host.querySelector(".pg-header").offsetHeight
        : tableHolder.getBoundingClientRect().top + tableHolder.clientHeight - host.getBoundingClientRect().top;
      host.style.height = `${Math.max(120, visibleHeight)}px`;
      const horizontalScrollbarHeight = Math.max(0, host.offsetHeight - host.clientHeight);
      host.style.height = `${Math.max(120, visibleHeight + horizontalScrollbarHeight)}px`;
      host.querySelector(".pg-body").style.height = `${bodyHeight + horizontalScrollbarHeight}px`;
      const tableContent = tableHolder.querySelector(".tabulator-table");
      if (tableContent) tableContent.style.marginBottom = `${horizontalScrollbarHeight}px`;
    }
    host.scrollLeft = previousLeft;
    host.scrollTop = previousTop;
  }
  function prioritySlug(priority) { return priority === "Alta" ? "high" : priority === "Baixa" ? "low" : "medium"; }
  function statusSlug(status) { return { Pendente: "pending", "Em Andamento": "in-progress", "Concluído": "completed", Atraso: "late" }[status] || "pending"; }
  function ganttTooltip(record) {
    if (!record) return "<div>Atividade</div>";
    const title = record.outlineGroup ? record.identificacao : taskName(record);
    const hours = value => Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    const lines = [
      ["Planejado", `Ini: ${formatWeek(record.planIni)} · Fim: ${formatWeek(record.planFim)}`],
      ["Realizado", `Ini: ${formatWeek(record.realIni)} · Fim: ${formatWeek(record.realFim)}`],
      ["HH", `Prev: ${hours(record.hhPrev)} · Real: ${hours(record.hhReal)}`],
      ["% avanço", `${Math.round(Number(record.progresso) || 0)}%`]
    ];
    return `<div class="gantt-tooltip"><strong>${escapeHtml(title)}</strong>${lines.map(([label, value]) => `<div><span>${label}</span><b>${escapeHtml(value)}</b></div>`).join("")}</div>`;
  }
  function installGanttHoverTooltip(host) {
    if (ganttHoverTooltipInstalled) return;
    ganttHoverTooltipInstalled = true;
    ganttHoverTooltip = document.createElement("div");
    ganttHoverTooltip.className = "gantt-hover-tooltip";
    ganttHoverTooltip.hidden = true;
    document.body.appendChild(ganttHoverTooltip);
    const hide = () => { ganttHoverTooltip.hidden = true; };
    const position = event => {
      const gap = 12;
      const bounds = ganttHoverTooltip.getBoundingClientRect();
      const left = Math.min(event.clientX + gap, window.innerWidth - bounds.width - 8);
      const top = Math.min(event.clientY + gap, window.innerHeight - bounds.height - 8);
      ganttHoverTooltip.style.left = `${Math.max(8, left)}px`;
      ganttHoverTooltip.style.top = `${Math.max(8, top)}px`;
    };
    host.addEventListener("pointerover", event => {
      const wrapper = event.target.closest?.(".pg-bar[data-id]");
      const row = wrapper && ganttTooltipRows.get(wrapper.getAttribute("data-id"));
      if (!row) { hide(); return; }
      ganttHoverTooltip.innerHTML = ganttTooltip(row);
      ganttHoverTooltip.hidden = false;
      position(event);
    });
    host.addEventListener("pointermove", event => {
      if (!ganttHoverTooltip.hidden) position(event);
    });
    host.addEventListener("pointerout", event => {
      const from = event.target.closest?.(".pg-bar[data-id]");
      const to = event.relatedTarget?.closest?.(".pg-bar[data-id]");
      if (from && from !== to) hide();
    });
    host.addEventListener("pointerdown", hide);
  }
  // Interações do Gantt: arrastar/redimensionar barras por semana, criar vínculos e selecionar a linha correspondente.
  function installGanttInteractions(host) {
    if (ganttInteractionsInstalled) return;
    ganttInteractionsInstalled = true;
    installGanttHoverTooltip(host);
    let suppressClick = false;
    host.addEventListener("click", event => {
      if (suppressClick) { suppressClick = false; return; }
      const bar = event.target.closest(".pg-task[data-id]");
      if (!bar) return;
      table?.deselectRow();
      table?.selectRow(bar.dataset.id);
    });
    host.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      const bar = event.target.closest(".pg-task[data-id]");
      if (!bar) return;
      const record = records.find(item => item.id === bar.dataset.id);
      if (!record) return;
      if (event.target.classList.contains("pg-link")) {
        const handle = event.target;
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        handle.addEventListener("pointerup", upEvent => {
          const target = document.elementFromPoint(upEvent.clientX, upEvent.clientY)?.closest(".pg-task[data-id]");
          const targetId = target?.dataset.id;
          if (!targetId || targetId === record.id) return;
          populateDependencyOptions();
          document.getElementById("dependencyFrom").value = record.id;
          document.getElementById("dependencyTo").value = targetId;
          bootstrap.Modal.getOrCreateInstance(document.getElementById("dependencyModal")).show();
        }, { once: true });
        return;
      }
      const mode = event.target.classList.contains("pg-handle-start") ? "start" : event.target.classList.contains("pg-handle-end") ? "end" : "move";
      const originStart = Number(record.planIni) || 1;
      const originEnd = Math.max(originStart, Number(record.planFim) || originStart);
      const originX = event.clientX;
      const weekWidth = ganttWeekWidth();
      let start = originStart;
      let end = originEnd;
      bar.setPointerCapture(event.pointerId);
      const onMove = moveEvent => {
        const delta = Math.round((moveEvent.clientX - originX) / weekWidth);
        const span = originEnd - originStart;
        if (mode === "move") { start = clamp(originStart + delta, 1, ganttWeekCount() - span); end = start + span; }
        else if (mode === "start") { start = clamp(originStart + delta, 1, originEnd); end = originEnd; }
        else { start = originStart; end = clamp(originEnd + delta, originStart, ganttWeekCount()); }
        if (!record.milestone) {
          bar.style.left = `${(start - 1) * weekWidth + 1}px`;
          bar.style.width = `${(end - start + 1) * weekWidth - 2}px`;
        } else bar.style.left = `${(start - 1) * weekWidth + weekWidth / 2 - 8}px`;
      };
      const onUp = () => {
        bar.removeEventListener("pointermove", onMove);
        bar.removeEventListener("pointerup", onUp);
        bar.removeEventListener("pointercancel", onUp);
        if (start === originStart && end === originEnd) return;
        suppressClick = true;
        if (record.planIni !== start) record.planIniDate = "";
        if (record.planFim !== (record.milestone ? start : end)) record.planFimDate = "";
        record.planIni = start;
        record.planFim = record.milestone ? start : end;
        updateTableData();
      };
      bar.addEventListener("pointermove", onMove);
      bar.addEventListener("pointerup", onUp);
      bar.addEventListener("pointercancel", onUp);
    });
  }

  // Critical path highlights the longest dependency chain with a forward duration pass.
  function criticalTaskIds() {
    const byId = new Map(records.map(record => [record.id, record]));
    const memo = new Map();
    const visiting = new Set();
    function longestFrom(id) {
      if (memo.has(id)) return memo.get(id);
      if (visiting.has(id)) return 0;
      visiting.add(id);
      const task = byId.get(id);
      const duration = Math.max(1, weekSpan(task?.planIni, task?.planFim));
      const successors = records.filter(item => item.dependencies.includes(id)).map(item => item.id);
      const path = duration + Math.max(0, ...successors.map(longestFrom));
      visiting.delete(id); memo.set(id, path); return path;
    }
    records.forEach(record => longestFrom(record.id));
    const longest = Math.max(0, ...memo.values());
    return new Set(records.filter(record => memo.get(record.id) === longest || record.dependencies.some(id => memo.get(id) === longest)).map(record => record.id));
  }
  function weekSpan(start, finish) { if (!start || !finish) return 1; return Math.max(1, Number(finish) - Number(start) + 1); }

  function indicatorValue(record, field) {
    if (field === "status") return getTaskStatus(record);
    if (field === "programacao") return record.programacao ? "Sim" : "Não";
    return String(record[field] ?? "").trim();
  }
  function indicatorRecords() {
    return records.filter(record => [...indicatorFilters].every(([field, values]) => {
      const value = indicatorValue(record, field);
      return field === "setor" || field === "equipe" ? [...values].some(selected => normalizeHeader(selected) === normalizeHeader(value)) : values.has(value);
    }));
  }
  function indicatorSum(list, field) {
    return list.reduce((total, record) => total + (Number(record[field]) || 0), 0);
  }
  function renderIndicatorFilters() {
    const host = document.getElementById("indicatorFilterFields");
    host.replaceChildren();
    INDICATOR_FIELDS.forEach(({ field, label }) => {
      const fieldset = document.createElement("fieldset");
      const legend = document.createElement("legend");
      legend.textContent = label;
      const options = document.createElement("div");
      options.className = "indicator-filter-options";
      const capacityValues = capacityTeams && (field === "equipe" || (field === "setor" && capacityTeams.hasSector)) ? capacityTeams.entries.map(item => field === "equipe" ? item.team : item.sector) : [];
      const allValues = [...records.map(record => indicatorValue(record, field)), ...capacityValues, ...(indicatorFilters.get(field) || [])];
      const values = [...new Map(allValues.map(value => [field === "setor" || field === "equipe" ? normalizeHeader(value) : value, value])).values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
      values.forEach(value => {
        const option = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.dataset.field = field;
        input.value = value;
        input.checked = indicatorFilters.get(field)?.has(value) || false;
        const text = document.createElement("span");
        text.textContent = value || "Não informado";
        option.append(input, text);
        options.append(option);
      });
      if (!values.length) options.textContent = "Nenhuma opção disponível";
      fieldset.append(legend, options);
      host.append(fieldset);
    });
  }
  function updateIndicatorFilterViews() {
    setText("indicatorFilterCount", indicatorFilters.size ? `(${indicatorFilters.size})` : "");
    updateKpis(); updateCurve(); updateLevelingChart();
  }

  // KPIs are recalculated from actual effort and planned effort after each mutation.
  function updateKpis() {
    const list = indicatorRecords();
    const total = list.length;
    const done = list.filter(item => item.progresso >= 100).length;
    const active = list.filter(item => getTaskStatus(item) === "Em Andamento").length;
    const late = list.filter(item => getTaskStatus(item) === "Atraso").length;
    const pending = list.filter(item => getTaskStatus(item) === "Pendente").length;
    const capacity = filteredCapacity();
    const available = capacity.hours === null ? null : capacity.hours.reduce((totalHours, hours) => totalHours + hours, 0);
    const planned = indicatorSum(list, "hhPrev");
    const actual = indicatorSum(list, "hhReal");
    const completionWeight = list.reduce((totalWeight, item) => totalWeight + (item.hhPrev || 1), 0);
    const completion = completionWeight ? list.reduce((totalValue, item) => totalValue + item.progresso * (item.hhPrev || 1), 0) / completionWeight : 0;
    setText("kpiTotal", total); setText("kpiDone", done); setText("kpiActive", active); setText("kpiLate", late); setText("kpiPlannedHours", planned.toLocaleString("pt-BR")); setText("kpiActualHours", actual.toLocaleString("pt-BR")); setText("kpiCompletion", `${Math.round(completion)}%`); setText("kpiSpi", planned ? (actual / planned).toFixed(2) : "—");
    setText("kpiPending", pending);
    setText("kpiAvailableHours", available === null ? "—" : available.toLocaleString("pt-BR", { maximumFractionDigits: 0 }));
    setText("kpiPlannedPercent", available > 0 ? `${(planned / available * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—");
    const plannedPercentCard = document.getElementById("kpiPlannedPercent").closest(".kpi-card");
    plannedPercentCard.title = capacity.notice || (available === 0 ? "Não é possível calcular: HH disponível é zero." : "HH previstas divididas por HH disponível.");
    const capacityCard = document.getElementById("kpiAvailableHours").closest(".kpi-card");
    capacityCard.title = capacity.notice || "Total de horas disponíveis com os filtros de setor e equipe selecionados.";
    setText("kpiAvailableHoursDetail", capacity.notice ? "veja o aviso na Curva S" : "horas de setor e equipe");
    setText("rowCount", `${records.length} ${records.length === 1 ? "atividade" : "atividades"}`);
  }
  function setText(id, value) { const element = document.getElementById(id); if (element) element.textContent = value; }
  function formatUpdateTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? "" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  const chartValueLabels = {
    id: "chartValueLabels",
    afterDatasetsDraw(instance, _args, options) {
      const { ctx, chartArea } = instance;
      const occupied = [];
      const dark = document.body.classList.contains("theme-dark");
      ctx.save();
      ctx.font = `600 ${options.fontSize || 10}px 'DM Sans', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = dark ? "#17292a" : "#ffffff";
      instance.data.datasets.forEach((dataset, datasetIndex) => {
        if (!instance.isDatasetVisible(datasetIndex)) return;
        const meta = instance.getDatasetMeta(datasetIndex);
        meta.data.forEach((element, index) => {
          if (options.skipFirst && index === 0) return;
          const value = dataset.data[index];
          if (typeof value !== "number" || !Number.isFinite(value) || element.skip) return;
          const position = element.tooltipPosition();
          if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
          const text = options.metric === "physical" ? `${formatChartNumber(value)}%` : options.metric === "cost" ? `R$ ${formatChartNumber(value)}` : `${formatChartNumber(value)} HH`;
          if (options.vertical) {
            const height = ctx.measureText(text).width + 4;
            const x = Math.max(chartArea.left + 6, Math.min(chartArea.right - 6, position.x));
            const minY = chartArea.top + height / 2;
            const maxY = chartArea.bottom - height / 2;
            const preferred = Math.max(minY, maxY - 4);
            let y = preferred;
            for (let step = 0; step < 40; step++) {
              const offset = step === 0 ? 0 : Math.ceil(step / 2) * 13 * (step % 2 ? -1 : 1);
              const candidate = preferred + offset;
              if (candidate < minY || candidate > maxY) continue;
              if (!occupied.some(box => Math.abs(box.x - x) < 12 && Math.abs(box.y - candidate) < (box.height + height) / 2)) {
                y = candidate;
                break;
              }
            }
            occupied.push({ x, y, height });
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(-Math.PI / 2);
            ctx.fillStyle = element.options.borderColor || dataset.borderColor;
            ctx.strokeText(text, 0, 0);
            ctx.fillText(text, 0, 0);
            ctx.restore();
            return;
          }
          const width = ctx.measureText(text).width + 4;
          const x = Math.max(chartArea.left + width / 2, Math.min(chartArea.right - width / 2, position.x));
          const preferred = Math.max(chartArea.top + 6, Math.min(chartArea.bottom - 6, position.y - 9));
          let y = preferred;
          for (let step = 0; step < 40; step++) {
            const offset = step === 0 ? 0 : Math.ceil(step / 2) * 13 * (step % 2 ? -1 : 1);
            const candidate = preferred + offset;
            if (candidate < chartArea.top + 6 || candidate > chartArea.bottom - 6) continue;
            if (!occupied.some(box => Math.abs(box.x - x) < (box.width + width) / 2 && Math.abs(box.y - candidate) < 12)) {
              y = candidate;
              break;
            }
          }
          occupied.push({ x, y, width });
          ctx.fillStyle = dataset.borderColor;
          ctx.strokeText(text, x, y);
          ctx.fillText(text, x, y);
        });
      });
      ctx.restore();
    }
  };
  function sizeChartForLabels(canvasId, weeks) {
    document.getElementById(canvasId).parentElement.style.width = `max(100%, ${Math.min(weeks * 140 + 100, 16000)}px)`;
  }
  function formatChartNumber(value) {
    return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  }

  // Curvas acumulam planejamento e execução nos períodos semanais do projeto.
  function curveSeries() {
    const list = indicatorRecords();
    const metric = document.getElementById("curveMetric").value;
    const labels = weekOptions(lastDataWeek(false, list));
    const factor = metric === "cost" ? COST_PER_HOUR : 1;
    const plannedTotal = metric === "physical" ? list.length || 1 : indicatorSum(list, "hhPrev") * factor || 1;
    const scale = metric === "physical" ? 100 / plannedTotal : 1;
    const planned = labels.map(week => list.reduce((acc, item) => {
      if (!item.planIni || !item.planFim || week < item.planIni) return acc;
      const span = weekSpan(item.planIni, item.planFim);
      const fraction = week >= item.planFim ? 1 : (week - item.planIni + 1) / span;
      const weight = metric === "physical" ? 1 : item.hhPrev * factor;
      return acc + weight * fraction;
    }, 0) * scale);
    const actualContribution = (item, week) => {
      const actualStart = item.realIni || item.planIni;
      const actualFinish = item.realFim || item.planFim || actualStart;
      if (!actualStart || week < actualStart) return 0;
      const elapsed = week >= actualFinish ? 1 : (week - actualStart + 1) / weekSpan(actualStart, actualFinish);
      const progress = metric === "physical" && item.progresso < 100 ? Math.min(item.progresso / 100, elapsed) : elapsed;
      const weight = metric === "physical" ? 1 : item.hhReal * factor;
      return weight * (metric === "physical" ? progress : elapsed);
    };
    const actual = labels.map(week => list.reduce((acc, item) => acc + actualContribution(item, week), 0) * scale);
    let lastActualIndex = -1;
    list.forEach(item => {
      if (!(metric === "physical" ? item.progresso > 0 : item.hhReal > 0)) return;
      const start = Number(item.realIni || item.planIni);
      if (!start || (!item.realIni && start > currentWeek && !item.realFim)) return;
      const end = Number(item.realFim) || Math.max(start, currentWeek);
      labels.forEach((week, index) => {
        if (week <= end && actualContribution(item, week) > (index ? actualContribution(item, labels[index - 1]) : 0)) lastActualIndex = Math.max(lastActualIndex, index);
      });
    });
    const actualDisplay = actual.map((value, index) => index <= lastActualIndex ? value : null);
    return { labels, planned, actual, actualDisplay, max: metric === "physical" ? 100 : plannedTotal };
  }

  // Métricas do gráfico e legenda usam a unidade selecionada pelo usuário.
  function updateCurve() {
    const list = indicatorRecords();
    const series = curveSeries();
    const metric = document.getElementById("curveMetric").value;
    const weekIndex = Math.min(currentWeek, series.labels.length) - 1;
    const plannedValue = series.planned[weekIndex] || 0;
    const actualValue = series.actual[weekIndex] || 0;
    setText("curveChartTitle", metric === "hours" ? "HH acumulada" : metric === "cost" ? "Custo acumulado" : "Avanço acumulado");
    const variance = actualValue - plannedValue;
    const unitValue = value => metric === "physical" ? `${value.toFixed(1)}%` : metric === "cost" ? `R$ ${Math.round(value).toLocaleString("pt-BR")}` : `${Math.round(value).toLocaleString("pt-BR")} HH`;
    const plannedPercent = series.max ? plannedValue / series.max * 100 : 0;
    const actualPercent = series.max ? actualValue / series.max * 100 : 0;
    const spi = plannedValue ? (actualValue / plannedValue).toFixed(2) : "—";
    const earnedHours = list.reduce((total, item) => total + item.hhPrev * item.progresso / 100, 0);
    const actualHours = indicatorSum(list, "hhReal");
    const cpi = actualHours ? (earnedHours / actualHours).toFixed(2) : "—";
    setText("curvePlanned", unitValue(plannedValue)); setText("curveActual", unitValue(actualValue)); setText("curveVariance", `${variance > 0 ? "+" : ""}${unitValue(variance)}`); setText("curveSpi", spi); setText("curveCpi", cpi); setText("curveHoursPlanned", indicatorSum(list, "hhPrev").toLocaleString("pt-BR")); setText("curveHoursActual", actualHours.toLocaleString("pt-BR"));
    setText("chartPeriod", `Semana ${String(series.labels[0]).padStart(2, "0")} — ${String(series.labels.at(-1)).padStart(2, "0")}`);
    const labels = ["", ...series.labels.map(week => `S${String(week).padStart(2, "0")}`)];
    const datasets = [
      { label: "Planejada", data: [0, ...series.planned], borderColor: "#4a82b6", backgroundColor: "rgba(74,130,182,.08)", fill: true, tension: .32, pointRadius: 0, borderWidth: 2 },
      { label: "Realizada", data: [0, ...series.actualDisplay], borderColor: "#469366", backgroundColor: "rgba(70,147,102,.05)", fill: false, tension: .32, pointRadius: 0, borderWidth: 2 },
      { label: "Desvio", data: [0, ...series.actual.map((value, index) => value - series.planned[index])], borderColor: "#cb625a", backgroundColor: "rgba(203,98,90,.08)", fill: false, tension: .25, pointRadius: 0, borderWidth: 1, borderDash: [4, 4], hidden: true }
    ];
    const tickFormat = value => metric === "physical" ? `${value}%` : metric === "cost" ? `R$ ${Math.round(value).toLocaleString("pt-BR")}` : `${Math.round(value)} HH`;
    const tooltipFormat = value => metric === "physical" ? `${Math.round(value).toLocaleString("pt-BR")}%` : tickFormat(value);
    sizeChartForLabels("sCurveChart", series.labels.length + 1);
    if (!chart) {
      chart = new Chart(document.getElementById("sCurveChart"), { type: "line", plugins: [chartValueLabels], data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16 } }, interaction: { intersect: false, mode: "index" }, plugins: { chartValueLabels: { skipFirst: true, metric }, legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 7, boxHeight: 7, padding: 20, font: { family: "DM Sans", size: 10 } } }, tooltip: { callbacks: { label: context => `${context.dataset.label}: ${tooltipFormat(context.parsed.y)}` } } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 12, maxRotation: 0, color: "#82908c", font: { family: "IBM Plex Mono", size: 9 } } }, y: { suggestedMin: 0, suggestedMax: series.max, grid: { display: false }, ticks: { color: "#82908c", callback: tickFormat, font: { family: "IBM Plex Mono", size: 9 } } } } } });
    } else { chart.data.labels = labels; chart.data.datasets = datasets; chart.options.plugins.chartValueLabels.metric = metric; chart.options.scales.y.suggestedMax = series.max; chart.options.plugins.tooltip.callbacks.label = context => `${context.dataset.label}: ${tooltipFormat(context.parsed.y)}`; chart.options.scales.y.ticks.callback = tickFormat; chart.resize(); chart.update(); }
  }

  // Última semana com algum dado, para limitar o eixo horizontal dos gráficos.
  function lastDataWeek(includeCapacity = false, list = records) {
    let last = 1;
    list.forEach(record => {
      ["planIni", "planFim", "realIni", "realFim"].forEach(field => { const week = Number(record[field]); if (week > last) last = week; });
    });
    if (includeCapacity && availableHoursSource) last = Math.max(last, availableHours.length);
    return Math.min(last, MAX_WEEK);
  }
  function weeklyHours(list = records, includeCapacity = true) {
    const weeks = weekOptions(Math.max(lastDataWeek(includeCapacity, list), currentWeek));
    const planned = weeks.map(week => list.reduce((total, record) => {
      if (!record.planIni || !record.planFim || week < record.planIni || week > record.planFim) return total;
      return total + (Number(record.hhPrev) || 0) / weekSpan(record.planIni, record.planFim);
    }, 0));
    const actual = weeks.map(week => list.reduce((total, record) => {
      if (!record.hhReal) return total;
      const start = record.realIni || record.planIni;
      if (!start) return total;
      const finish = record.realFim || Math.max(start, currentWeek);
      if (week < start || week > finish) return total;
      return total + record.hhReal / weekSpan(start, finish);
    }, 0));
    return { planned, actual };
  }
  function createWeeklyHoursChart(canvasId, labels, datasets) {
    return new Chart(document.getElementById(canvasId), {
      type: "bar",
      plugins: [chartValueLabels, ...(canvasId === "resourceLevelingChart" ? [{
        id: "resourceBarSpacing",
        afterLayout(instance) {
          const count = instance.data.datasets.filter((_, index) => instance.isDatasetVisible(index)).length;
          const weeks = instance.data.labels.length;
          instance.options.datasets.bar.barThickness = count && weeks
            ? Math.min(18, (instance.chartArea.right - instance.chartArea.left) * 0.8 / (weeks * count))
            : 18;
        }
      }] : [])],
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16 } },
        ...(canvasId === "resourceLevelingChart" ? { datasets: { bar: { barThickness: 18 } } } : {}),
        interaction: { intersect: false, mode: "index" },
        plugins: {
          chartValueLabels: { metric: "hours", vertical: canvasId === "resourceLevelingChart", ...(canvasId === "resourceLevelingChart" ? { fontSize: 8 } : {}) },
          legend: { display: canvasId !== "resourceLevelingChart", position: "bottom", labels: { usePointStyle: true, boxWidth: 7, boxHeight: 7, padding: 20, font: { family: "DM Sans", size: 10 } } },
          tooltip: { callbacks: { label: context => `${context.dataset.label}: ${Number(context.parsed.y).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} HH` } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { autoSkip: true, maxRotation: 0, color: "#82908c", font: { family: "IBM Plex Mono", size: 9 } } },
          y: { beginAtZero: true, title: { display: true, text: "Horas (HH)", color: "#82908c" }, grid: { display: false }, ticks: { color: "#82908c", callback: value => Number(value).toLocaleString("pt-BR"), font: { family: "IBM Plex Mono", size: 9 } } }
        }
      }
    });
  }
  function updateLevelingChart() {
    const list = indicatorRecords();
    const capacityResult = filteredCapacity();
    const showCapacity = capacityResult.hours !== null;
    const capacity = capacityResult.hours;
    setText("capacityFilterNotice", capacityResult.notice);
    const { planned: allPlanned, actual: allActual } = weeklyHours(list, showCapacity);
    const indexes = allPlanned.flatMap((hours, index) =>
      hours > 0 || allActual[index] > 0 || (showCapacity && capacity[index] > 0) ? [index] : []
    );
    const labels = indexes.map(index => `S${String(index + 1).padStart(2, "0")}`);
    const planned = indexes.map(index => allPlanned[index]);
    const actual = indexes.map(index => allActual[index]);
    setText("levelingPeriod", labels.length ? `Semanas com dados: ${labels[0]}–${labels[labels.length - 1]}` : "Nenhuma semana com dados");
    const datasets = [
      ...(showCapacity ? [{ label: "HH Disponível", data: indexes.map(index => capacity[index] || 0), backgroundColor: "rgba(128,136,140,.72)", borderColor: "#80888c", borderWidth: 0 }] : []),
      { label: "HH Planejado", data: planned, backgroundColor: "rgba(74,130,182,.72)", borderColor: "#4a82b6", borderWidth: 0 },
      { label: "HH Realizado", data: actual, backgroundColor: "rgba(62,150,97,.72)", borderColor: "#3e9661", borderWidth: 0 }
    ];
    document.getElementById("levelingChart").parentElement.style.width = "100%";
    if (!levelingChart) {
      levelingChart = createWeeklyHoursChart("levelingChart", labels, datasets);
    } else {
      levelingChart.data.labels = labels;
      levelingChart.data.datasets = datasets;
      levelingChart.resize();
      levelingChart.update();
    }
  }
  function updateResourceChartLegend() {
    const container = document.getElementById("resourceChartLegend");
    const colors = { "HH Disponível": "rgba(128,136,140,.72)", "HH Planejado": "rgba(74,130,182,.72)", "HH Realizado": "rgba(62,150,97,.72)" };
    const labels = new Set(resourceLevelingChart.data.datasets.map(dataset => dataset.label));
    [...container.children].forEach(button => { if (!labels.has(button.dataset.label)) button.remove(); });
    resourceLevelingChart.data.datasets.forEach((dataset, index) => {
      let button = [...container.children].find(item => item.dataset.label === dataset.label);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.dataset.label = dataset.label;
        const swatch = document.createElement("span");
        swatch.className = "resource-chart-legend-swatch";
        swatch.style.backgroundColor = colors[dataset.label];
        button.append(swatch, document.createTextNode(dataset.label));
        button.addEventListener("click", () => {
          const currentIndex = resourceLevelingChart.data.datasets.findIndex(item => item.label === button.dataset.label);
          if (currentIndex < 0) return;
          resourceLevelingChart.setDatasetVisibility(currentIndex, !resourceLevelingChart.isDatasetVisible(currentIndex));
          resourceLevelingChart.update();
          updateResourceChartLegend();
        });
        container.append(button);
      }
      button.setAttribute("aria-pressed", String(resourceLevelingChart.isDatasetVisible(index)));
      if (container.children[index] !== button) container.insertBefore(button, container.children[index] || null);
    });
  }
  function updateResourceLevelingChart() {
    const showAvailable = window.resourceAllocations.isAvailable();
    const linkedIds = resourceFilterScope.active ? window.resourceAllocations.getTaskIdsForResources(resourceFilterScope.resourceIds) : null;
    const list = resourceFilterScope.active ? (linkedIds ? records.filter(record => linkedIds.has(record.id)) : []) : records;
    const { planned, actual } = weeklyHours(list, false);
    const available = planned.map((_, index) => list.reduce((sum, record) => {
      const week = index + 1;
      if (!record.planIni || !record.planFim || week < record.planIni || week > record.planFim) return sum;
      return sum + (Number(effectiveHours(record)) || 0) / weekSpan(record.planIni, record.planFim);
    }, 0));
    const indexes = planned.flatMap((value, index) =>
      value > 0 || actual[index] > 0 || (showAvailable && available[index] > 0) ? [index] : []);
    const labels = indexes.map(index => `S${String(index + 1).padStart(2, "0")}`);
    const datasets = [
      ...(showAvailable ? [{
        label: "HH Disponível", data: indexes.map(index => available[index]),
        backgroundColor: context => available[indexes[context.dataIndex]] < planned[indexes[context.dataIndex]] ? "rgba(203,62,54,.78)" : "rgba(128,136,140,.72)",
        borderColor: context => available[indexes[context.dataIndex]] < planned[indexes[context.dataIndex]] ? "#b52f29" : "#80888c",
        borderWidth: 0
      }] : []),
      { label: "HH Planejado", data: indexes.map(index => planned[index]), backgroundColor: "rgba(74,130,182,.72)", borderColor: "#4a82b6", borderWidth: 0 },
      { label: "HH Realizado", data: indexes.map(index => actual[index]), backgroundColor: "rgba(62,150,97,.72)", borderColor: "#3e9661", borderWidth: 0 }
    ];
    const missingActual = list.filter(record => (Number(record.hhReal) || 0) > 0 && !record.realIni && !record.planIni).length;
    const notices = [];
    if (!showAvailable) notices.push(resourceFilterScope.active
      ? "Gráfico filtrado indisponível: não foi possível recuperar as alocações."
      : "HH disponível não exibido: não foi possível recuperar as alocações.");
    if (resourceFilterScope.active && showAvailable) notices.push("Filtro de recursos ativo: valores completos das atividades com alocação nos recursos filtrados.");
    if (resourceFilterScope.active && resourceFilterScope.unidentified) notices.push(`${resourceFilterScope.unidentified} recurso(s) filtrado(s) sem identificação única não puderam ser relacionados às atividades.`);
    if (missingActual) notices.push(`${missingActual} atividade(s) com HH Real sem semana inicial real ou planejada não foram incluídas na série realizada.`);
    setText("resourceChartNotice", notices.join(" "));
    if (!resourceLevelingChart) {
      resourceLevelingChart = createWeeklyHoursChart("resourceLevelingChart", labels, datasets);
    } else {
      const visibility = new Map(resourceLevelingChart.data.datasets.map((dataset, index) => [dataset.label, resourceLevelingChart.isDatasetVisible(index)]));
      datasets.forEach(dataset => { if (visibility.has(dataset.label)) dataset.hidden = !visibility.get(dataset.label); });
      resourceLevelingChart.data.labels = labels;
      resourceLevelingChart.data.datasets = datasets;
      resourceLevelingChart.update();
    }
    updateResourceChartLegend();
  }
  function filteredCapacity() {
    const selections = [...indicatorFilters].filter(([field]) => field === "setor" || field === "equipe");
    const ignored = INDICATOR_FIELDS.filter(({ field }) => field !== "setor" && field !== "equipe" && indicatorFilters.has(field)).map(({ label }) => label);
    const notes = ignored.length ? [`HH disponível considera apenas Setor e Equipe; os filtros ${ignored.join(", ")} não se aplicam a essas horas.`] : [];
    if (!selections.length) return { hours: availableHours, notice: notes.join(" ") };
    if (!capacityTeams || (indicatorFilters.has("setor") && !capacityTeams.hasSector)) {
      return { hours: null, notice: "HH disponível indisponível para os filtros selecionados. Recarregue uma planilha detalhada com Setor e Equipe." };
    }
    for (const [field, values] of selections) {
      const property = field === "setor" ? "sector" : "team";
      if ([...values].some(value => !capacityTeams.entries.some(item => normalizeHeader(item[property]) === normalizeHeader(value)))) {
        return { hours: null, notice: `HH disponível indisponível: há ${field === "setor" ? "setor selecionado" : "equipe selecionada"} sem correspondência na planilha carregada.` };
      }
    }
    const matched = capacityTeams.entries.filter(item => selections.every(([field, values]) => [...values].some(value => normalizeHeader(value) === normalizeHeader(field === "setor" ? item.sector : item.team))));
    if (selections.some(([field, values]) => ![...values].some(value => !normalizeHeader(value)) && capacityTeams.entries.some(item => !String(field === "setor" ? item.sector : item.team).trim() && item.hours.some(hours => hours > 0)))) notes.push("Linhas sem setor ou equipe no filtro não foram incluídas.");
    return { hours: availableHours.map((_, index) => matched.reduce((sum, item) => sum + (item.hours[index] || 0), 0)), notice: notes.join(" ") };
  }
  function parseCapacityWeek(value) {
    const match = String(value ?? "").trim().match(/^(?:s(?:emana)?\s*)?0*(\d{1,3})$/i);
    const week = match ? Number(match[1]) : NaN;
    return Number.isInteger(week) && week >= 1 && week <= MAX_WEEK ? week : null;
  }
  function parseCapacityHours(value, location) {
    if (value === "" || value === null || value === undefined || (typeof value === "string" && !value.trim())) return 0;
    const text = String(value).trim();
    const validText = /^(?:\d+(?:\.\d+)?|\d{1,3}(?:\.\d{3})*,\d+|\d+,\d+)$/.test(text);
    const hours = typeof value === "number" ? value : validText ? Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text) : NaN;
    if (!Number.isFinite(hours) || hours < 0) throw new Error(`${location}: informe HH disponível válida e maior ou igual a zero.`);
    return hours;
  }
  function parseCapacityRows(rows) {
    const header = rows[0] || [];
    const headers = header.map(normalizeHeader);
    const weekIndex = headers.findIndex(value => ["semana", "week", "sem"].includes(value));
    const hoursIndex = headers.findIndex(value => ["hh disponivel", "hh disponivel semana", "horas disponiveis", "horas disponivel", "disponivel"].includes(value));
    const imported = [];
    const seenWeeks = new Set();
    let teams = null;
    if (weekIndex >= 0 && hoursIndex >= 0) {
      rows.slice(1).forEach((row, index) => {
        if (!row.some(value => String(value ?? "").trim())) return;
        const week = parseCapacityWeek(row[weekIndex]);
        if (!week) throw new Error(`Linha ${index + 2}: informe uma semana de 1 a ${MAX_WEEK}.`);
        if (row[hoursIndex] === "" || row[hoursIndex] === null || row[hoursIndex] === undefined || !String(row[hoursIndex]).trim()) throw new Error(`Linha ${index + 2}: informe HH disponível.`);
        if (seenWeeks.has(week)) throw new Error(`A semana ${week} aparece mais de uma vez.`);
        seenWeeks.add(week);
        imported[week - 1] = parseCapacityHours(row[hoursIndex], `Linha ${index + 2}`);
      });
    } else {
      const employeeIndex = headers.findIndex(value => ["funcionarios", "funcionario"].includes(value));
      const teamIndex = headers.indexOf("equipe");
      const responsibleIndex = headers.indexOf("responsavel");
      const sectorIndex = headers.indexOf("setor");
      if (employeeIndex < 0 || teamIndex < 0 || responsibleIndex < 0) throw new Error("Use Semana e HH Disponível ou as colunas Funcionários, Equipe, Responsável, Setor opcional e semanas.");
      const fixedColumns = new Set([employeeIndex, teamIndex, responsibleIndex, ...(sectorIndex >= 0 ? [sectorIndex] : [])]);
      if (fixedColumns.size !== (sectorIndex >= 0 ? 4 : 3)) throw new Error("Os cabeçalhos de identificação da capacidade devem ser distintos.");
      const columns = [];
      teams = new Map();
      header.forEach((value, index) => {
        if (fixedColumns.has(index)) return;
        if (!String(value ?? "").trim()) return;
        const week = parseCapacityWeek(value);
        if (!week) throw new Error(`Coluna ${index + 1}: cabeçalho de semana inválido.`);
        if (seenWeeks.has(week)) throw new Error(`A semana ${week} aparece mais de uma vez.`);
        seenWeeks.add(week);
        columns.push({ index, week });
        imported[week - 1] = 0;
      });
      rows.slice(1).forEach((row, index) => {
        if (!row.some(value => String(value ?? "").trim())) return;
        if (/^total(?:\s|$)/i.test(String(row[employeeIndex] ?? "").trim())) throw new Error(`Linha ${index + 2}: remova a linha de total para evitar soma duplicada.`);
        const team = String(row[teamIndex] ?? "").trim();
        const sector = sectorIndex >= 0 ? String(row[sectorIndex] ?? "").trim() : null;
        const key = JSON.stringify([normalizeHeader(sector ?? ""), normalizeHeader(team)]);
        if (!teams.has(key)) teams.set(key, { team, ...(sectorIndex >= 0 ? { sector } : {}), hours: [] });
        const teamHours = teams.get(key).hours;
        columns.forEach(({ index: column, week }) => {
          const hours = parseCapacityHours(row[column], `Linha ${index + 2}, semana ${week}`);
          imported[week - 1] += hours;
          teamHours[week - 1] = (teamHours[week - 1] || 0) + hours;
          if (!Number.isFinite(imported[week - 1])) throw new Error(`O total da semana ${week} excede o limite permitido.`);
        });
        for (let column = 0; column < row.length; column++) {
          if (!fixedColumns.has(column) && String(row[column] ?? "").trim() && !columns.some(item => item.index === column)) throw new Error(`Linha ${index + 2}, coluna ${column + 1}: falta o cabeçalho da semana.`);
        }
      });
      teams = { hasSector: sectorIndex >= 0, entries: [...teams.values()].map(item => ({ ...item, hours: Array.from({ length: imported.length }, (_, index) => item.hours[index] || 0) })) };
    }
    if (!seenWeeks.size) throw new Error("A planilha não contém semanas para importar.");
    return { hours: Array.from({ length: imported.length }, (_, index) => imported[index] ?? 0), count: seenWeeks.size, teams };
  }
  function importAvailableHours(file) {
    const reader = new FileReader();
    reader.onerror = () => alert("Não foi possível abrir o arquivo de capacidade semanal.");
    reader.onload = event => {
      try {
        const workbook = XLSX.read(event.target.result, { type: "array", cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!sheet) throw new Error("A planilha não contém uma aba de dados.");
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
        const imported = parseCapacityRows(rows);
        const hoursKey = `${STORAGE_KEY}-available-hours`;
        const sourceKey = `${STORAGE_KEY}-available-hours-source`;
        const teamsKey = `${STORAGE_KEY}-capacity-teams`;
        const oldHours = localStorage.getItem(hoursKey);
        const oldSource = localStorage.getItem(sourceKey);
        const oldTeams = localStorage.getItem(teamsKey);
        try {
          localStorage.setItem(hoursKey, JSON.stringify(imported.hours));
          localStorage.setItem(sourceKey, file.name);
          if (imported.teams === null) localStorage.removeItem(teamsKey); else localStorage.setItem(teamsKey, JSON.stringify(imported.teams));
        } catch (error) {
          try {
            if (oldHours === null) localStorage.removeItem(hoursKey); else localStorage.setItem(hoursKey, oldHours);
            if (oldSource === null) localStorage.removeItem(sourceKey); else localStorage.setItem(sourceKey, oldSource);
            if (oldTeams === null) localStorage.removeItem(teamsKey); else localStorage.setItem(teamsKey, oldTeams);
          } catch (rollbackError) {
            console.error("Não foi possível restaurar a capacidade anterior.", rollbackError);
            throw new Error("Falha ao salvar e ao restaurar a capacidade anterior. Verifique o armazenamento do navegador.");
          }
          throw error;
        }
        availableHours = imported.hours;
        availableHoursSource = file.name;
        capacityTeams = imported.teams;
        setText("capacityFileStatus", `Arquivo carregado: ${file.name} (${imported.count} semanas).`);
        updateKpis();
        updateLevelingChart();
      } catch (error) {
        console.error(error);
        alert(error.message || "Não foi possível ler a planilha de capacidade.");
      }
    };
    reader.readAsArrayBuffer(file);
  }
  function answerLocalQuestion(question) {
    const normalized = normalizeHeader(question);
    const requestedWeek = normalized.match(/sem(?:ana)?\s*0?(\d{1,3})\b/);
    const week = requestedWeek ? Number(requestedWeek[1]) : currentWeek;
    const { planned, actual } = weeklyHours();
    const formatHours = value => `${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} HH`;
    const statusQuestion = [
      { pattern: /atrasad|fora do prazo|em atraso/, status: "Atraso" },
      { pattern: /concluid|finalizad/, status: "Concluído" },
      { pattern: /em andamento|iniciad|em execucao/, status: "Em Andamento" },
      { pattern: /pendente|nao iniciad/, status: "Pendente" }
    ].find(({ pattern }) => pattern.test(normalized));
    if (statusQuestion) {
      const tasks = records.filter(record => getTaskStatus(record) === statusQuestion.status);
      return {
        text: `${tasks.length} atividade(s) com status ${statusQuestion.status}, conforme a coluna Status da tabela.`,
        tasks
      };
    }
    if (/semana|semanal/.test(normalized) && requestedWeek && week >= 1 && week <= MAX_WEEK && /hh|hora|carga|disponivel|previst|realiz/.test(normalized)) {
      return {
        text: `Semana ${String(week).padStart(2, "0")}: HH Disponível ${formatHours(availableHours[week - 1])}, HH Previsto ${formatHours(planned[week - 1])} e HH Realizado ${formatHours(actual[week - 1])}.`,
        tasks: []
      };
    }
    if (requestedWeek && week >= 1 && week <= MAX_WEEK && /atividade|tarefa|cronograma/.test(normalized)) {
      const tasks = records.filter(record => Number(record.planIni) <= week && Number(record.planFim) >= week);
      return { text: `${tasks.length} atividade(s) planejada(s) para a semana ${String(week).padStart(2, "0")}.`, tasks };
    }
    if (/quantas atividades|total de atividades|numero de atividades|total do cronograma/.test(normalized)) {
      return { text: `O cronograma contém ${records.length} atividade(s).`, tasks: [] };
    }
    if (/hh|horas|esforco/.test(normalized) && /previst|planejad/.test(normalized)) {
      return { text: `HH prevista total: ${formatHours(records.reduce((total, record) => total + (Number(record.hhPrev) || 0), 0))}.`, tasks: [] };
    }
    if (/hh|horas|esforco/.test(normalized) && /realiz|apontad/.test(normalized)) {
      return { text: `HH realizada total: ${formatHours(records.reduce((total, record) => total + (Number(record.hhReal) || 0), 0))}.`, tasks: [] };
    }
    if (/quais abas|abas da pagina|informacoes da pagina|quais campos|quais colunas/.test(normalized)) {
      return {
        text: "Esta página reúne Planejamento & Gantt, Curva S, Evolução e nivelamento de HH e Perguntas. A tabela contém hierarquia/ET, identificação, semanas planejadas e realizadas, HH, observações, status, avanço, prioridade, serviço, programação, marco e baseline.",
        tasks: []
      };
    }
    const ignored = new Set(["quantas", "quantos", "atividades", "atividade", "tarefas", "tarefa", "para", "com", "dos", "das", "uma", "por", "semana", "setor", "equipe", "responsavel", "em", "no", "na", "de", "do", "da", "que", "qual", "quais", "me", "mostre", "liste", "existe", "sao", "estao", "total", "do", "da", "sobre", "cronograma"]);
    const terms = normalized.split(/[^a-z0-9]+/).filter(term => term.length > 2 && !ignored.has(term));
    const matches = terms.length ? records.filter(record => {
      const searchable = normalizeHeader([record.id, record.setor, record.area, record.conjunto, record.equipamento, record.atividade, record.familia, record.responsavel, record.equipe, record.observacoes].join(" "));
      return terms.every(term => searchable.includes(term));
    }) : [];
    if (matches.length) return { text: `Encontrei ${matches.length} atividade(s) na tabela que correspondem à pergunta:`, tasks: matches };
    return { text: "Não encontrei correspondências nos dados disponíveis da tabela e da página. Posso consultar atividades, hierarquia, responsável, equipe, status, semanas, avanço, HH e as informações dos gráficos.", tasks: [] };
  }
  function submitAssistantQuestion(question) {
    const answer = answerLocalQuestion(question);
    const host = document.getElementById("assistantAnswer");
    const outlineById = outlineNumbers(records);
    const tasks = answer.tasks.length
      ? `<ul>${answer.tasks.map(record => {
        const path = [record.setor, record.area, record.conjunto, record.equipamento, record.atividade].filter(Boolean).join(" · ") || "Atividade sem identificação";
        const details = `ET ${outlineById.get(record.id) || "—"} · ${getTaskStatus(record)} · Plan. ${formatWeek(record.planIni)}–${formatWeek(record.planFim)} · Real. ${formatWeek(record.realIni)}–${formatWeek(record.realFim)} · HH ${Number(record.hhPrev || 0).toLocaleString("pt-BR")} prev. / ${Number(record.hhReal || 0).toLocaleString("pt-BR")} real · ${Number(record.progresso) || 0}%`;
        return `<li><strong>${escapeHtml(path)}</strong><span>${escapeHtml(details)}</span><span>${escapeHtml(record.responsavel || "Sem responsável")} · ${escapeHtml(record.equipe || "Sem equipe")}</span></li>`;
      }).join("")}</ul>`
      : "";
    host.innerHTML = `<p><strong>Pergunta:</strong> ${escapeHtml(question)}</p><p>${escapeHtml(answer.text)}</p>${tasks}`;
  }

  // Salvamento automático com debounce reduz gravações repetidas em edições sequenciais.
  function persistRecordsNow(status = "Salvo localmente") {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      setText("saveStatus", status);
      document.getElementById("saveStatus").title = status;
      return true;
    } catch (error) {
      console.error("Não foi possível salvar o cronograma neste navegador.", error);
      setText("saveStatus", "Falha ao salvar");
      return false;
    }
  }
  function scheduleSave() {
    persistRecordsNow();
  }
  async function updateRecordsInBase() {
    setText("saveStatus", "Atualizando...");
    try {
      if (document.activeElement?.closest("#activityTable")) document.activeElement.blur();
      await new Promise(resolve => setTimeout(resolve, 0));
      await waitForTableRefresh();
      if (table?.modules.edit.currentCell) {
        setText("saveStatus", "Conclua a edição antes de atualizar");
        alert("Conclua ou cancele a edição atual da tabela antes de atualizar os dados.");
        return;
      }
      mergeLatestTableData();
      const timestampKey = `${STORAGE_KEY}-last-update`;
      const timestamp = new Date().toISOString();
      const status = `Dados atualizados localmente · ${formatUpdateTime(timestamp)}`;
      if (!persistRecordsNow()) {
        alert("Não foi possível salvar as alterações neste navegador. Verifique o espaço disponível e tente novamente.");
        return;
      }
      localStorage.setItem(timestampKey, timestamp);
      setText("saveStatus", status);
      document.getElementById("saveStatus").title = status;
    } catch (error) {
      console.error("Não foi possível atualizar a base local do cronograma.", error);
      setText("saveStatus", "Falha ao atualizar");
      alert("Não foi possível salvar as alterações neste navegador. Verifique o espaço disponível e tente novamente.");
    }
  }
  function saveBeforeLeaving() {
    if (document.activeElement?.closest("#activityTable")) document.activeElement.blur();
    mergeLatestTableData();
    persistRecordsNow();
  }
  function reloadAfterSaving(event) {
    if (event.key !== "F5") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (document.activeElement?.closest("#activityTable")) document.activeElement.blur();
    window.setTimeout(async () => {
      await waitForTableRefresh();
      if (table?.modules.edit.currentCell) {
        setText("saveStatus", "Conclua a edição antes de atualizar");
        alert("Não foi possível confirmar o campo editado. Verifique o valor e tente pressionar F5 novamente.");
        return;
      }
      mergeLatestTableData();
      if (persistRecordsNow("Dados salvos antes da atualização")) window.location.reload();
      else alert("Não foi possível salvar os dados. A página não será atualizada.");
    }, 0);
  }
  function renderResourceWorkload() {
    const body = document.getElementById("resourceWorkloadRows");
    const filters = [...document.querySelectorAll("[data-workload-filter]")];
    const filterValue = (record, field) => field === "hhPrev"
      ? String(window.resourceAllocations.getBalance(record))
      : String(record[field] || "");
    filters.forEach(select => {
      const field = select.dataset.workloadFilter;
      const selected = select.value;
      const values = new Set(records.map(record => filterValue(record, field)));
      if (selected) values.add(JSON.parse(selected));
      const options = [new Option("Todos", "")];
      [...values].sort((a, b) => field === "hhPrev" ? Number(a) - Number(b) : a.localeCompare(b, "pt-BR", { numeric: true }))
        .forEach(value => options.push(new Option(field === "hhPrev" ? window.resourceAllocations.formatHours(Number(value)) : field === "planIni" && value ? formatWeek(value) : value || "(Não informado)", JSON.stringify(value))));
      select.replaceChildren(...options);
      select.value = selected;
    });
    const rows = document.createDocumentFragment();
    const visible = records.filter(record => filters.every(select => !select.value || filterValue(record, select.dataset.workloadFilter) === JSON.parse(select.value)));
    if (workloadSort && (workloadSort.field !== "hhPrev" || window.resourceAllocations.isAvailable())) {
      const { field, direction } = workloadSort;
      visible.sort((a, b) => {
        const left = filterValue(a, field);
        const right = filterValue(b, field);
        const result = field === "hhPrev" ? Number(left) - Number(right) : left.localeCompare(right, "pt-BR", { numeric: true, sensitivity: "base" });
        return direction === "ascending" ? result : -result;
      });
    }
    document.querySelectorAll("[data-workload-sort]").forEach(button => {
      const field = button.dataset.workloadSort;
      const active = workloadSort && workloadSort.field === field && (field !== "hhPrev" || window.resourceAllocations.isAvailable());
      const direction = active ? workloadSort.direction : "none";
      const next = direction === "none" ? "crescente" : direction === "ascending" ? "decrescente" : "original";
      const label = button.dataset.label;
      button.textContent = direction === "ascending" ? "▲" : direction === "descending" ? "▼" : "↕";
      button.setAttribute("aria-label", `Ordenar ${label}: ${next}`);
      button.title = `Ordenar ${label}: ${next}`;
      button.disabled = field === "hhPrev" && !window.resourceAllocations.isAvailable();
      button.closest("th").setAttribute("aria-sort", direction);
    });
    visible.forEach(record => {
      const row = document.createElement("tr");
      [record.setor, record.area, record.familia, record.equipe, record.atividade].forEach(value => {
        const cell = row.insertCell();
        cell.textContent = value || "—";
        cell.title = cell.textContent;
      });
      const startWeek = row.insertCell();
      startWeek.textContent = formatWeek(record.planIni);
      startWeek.title = startWeek.textContent;
      const hours = row.insertCell();
      const balance = window.resourceAllocations.getBalance(record);
      const available = window.resourceAllocations.isAvailable();
      hours.classList.toggle("resource-workload-zero", available && balance === 0);
      const returnedBalance = available && balance > 0 && window.resourceAllocations.hasReturnedBalance(record.id);
      hours.classList.toggle("resource-workload-returned", returnedBalance);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "resource-workload-value";
      button.dataset.taskId = record.id;
      button.dataset.canAllocate = String(available && balance > 0);
      button.draggable = available && balance > 0;
      button.disabled = !available;
      button.title = !available ? "Saldo indisponível: não foi possível recuperar as alocações." : balance === 0 ? "Saldo de HH: zero. Duplo clique para verificar alocações e estornar." : "Arraste ou selecione para programar; duplo clique para estornar as alocações da atividade.";
      if (returnedBalance) button.title = `Diferença devolvida ao saldo. ${button.title}`;
      if (available) button.title = `${window.resourceAllocations.formatHours(balance)} HH. ${button.title}`;
      button.textContent = !available ? "—" : balance === 0 ? "-" : window.resourceAllocations.formatHours(balance);
      hours.append(button);
      rows.append(row);
    });
    if (!visible.length) {
      const row = document.createElement("tr");
      const cell = row.insertCell();
      cell.colSpan = 7;
      cell.className = "resource-empty";
      cell.textContent = records.length ? "Nenhuma atividade corresponde aos filtros." : "Nenhuma atividade no planejamento.";
      rows.append(row);
    }
    body.replaceChildren(rows);
    window.resourceAllocations.syncWorkloadSelection();
  }
  function refreshViews() {
    updateKpis(); renderGantt(); updateCurve(); updateLevelingChart(); updateActionState();
    if (resourceLevelingChart) updateResourceLevelingChart();
    if (document.getElementById("resourcesPane").classList.contains("active")) window.resourceAllocations.refresh();
  }
  function updateTableData(selectIds = []) {
    records = records.map(record => ({ ...record, progresso: clamp(Number(record.progresso) || 0, 0, 100), hhReal: calculateActualHours(record.hhPrev, record.progresso) }));
    renderOutlineTable(selectIds); refreshViews(); scheduleSave();
  }
  function selectedTaskData() { return table ? table.getSelectedData().filter(item => !item.outlineGroup && records.some(record => record.id === item.id)) : []; }
  function updateActionState() { if (!table) return; const selected = selectedTaskData(); document.getElementById("duplicateButton").disabled = selected.length !== 1; document.getElementById("deleteButton").disabled = selected.length === 0; }

  // Importação SheetJS propõe um mapeamento automático e permite revisão antes da gravação.
  function openImport(file) {
    const reader = new FileReader();
    sourceImprovements = null;
    reader.onerror = () => alert("Não foi possível abrir o arquivo do projeto.");
    reader.onload = event => {
      try {
        const workbook = XLSX.read(event.target.result, { type: "array", cellDates: true });
        const improvementSheet = workbook.Sheets["Ações de Melhoria"];
        const parsedImprovements = improvementSheet ? window.improvementActions.parseProjectSheet(improvementSheet) : null;
        const scheduleSheet = workbook.Sheets.Cronograma || workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(scheduleSheet, { header: 1, raw: true, defval: "" });
        sourceHeaders = rows.shift()?.map(String) || []; sourceRows = rows.filter(row => row.some(value => value !== ""));
        if (!sourceHeaders.length || (!sourceRows.length && !improvementSheet)) return alert("A planilha não contém linhas de dados.");
        sourceImprovements = parsedImprovements;
        const actionInfo = parsedImprovements ? ` · ${parsedImprovements.length} ações de melhoria` : " · sem aba de ações de melhoria";
        buildMappingForm(); setText("importFileName", `${file.name} · ${sourceRows.length} linhas${actionInfo} · confira o mapeamento.`); bootstrap.Modal.getOrCreateInstance(document.getElementById("importModal")).show();
      } catch (error) { console.error(error); alert(error.message || "Não foi possível ler essa planilha."); }
    };
    reader.readAsArrayBuffer(file);
  }
  function normalizeHeader(value) { return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[_-]/g, " ").trim(); }
  function importWeekTable(file) {
    const reader = new FileReader();
    reader.onerror = () => alert("Não foi possível abrir o arquivo da tabela de semanas.");
    reader.onload = event => {
      try {
        const workbook = XLSX.read(event.target.result, { type: "array", cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!sheet) throw new Error("A planilha não contém uma aba de dados.");
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
        const headers = rows.shift()?.map(normalizeHeader) || [];
        const dateIndex = headers.findIndex(header => ["data", "date"].includes(header));
        const weekIndex = headers.findIndex(header => ["semana", "sem", "week"].includes(header));
        const workingIndex = headers.findIndex(header => ["dia util", "util", "dia de trabalho", "working day"].includes(header));
        if ([dateIndex, weekIndex, workingIndex].includes(-1)) throw new Error("Use as colunas Data, Semana e Dia útil.");
        const entries = new Map();
        rows.forEach((row, index) => {
          if (!row.some(value => value !== "" && value !== null && value !== undefined)) return;
          const date = parseCalendarDate(row[dateIndex]);
          const match = String(row[weekIndex] ?? "").trim().match(/^(?:s(?:emana)?\s*)?0*(\d{1,3})$/i);
          const week = match ? Number(match[1]) : NaN;
          const working = normalizeHeader(row[workingIndex] ?? "");
          const yes = ["sim", "s", "1", "true", "x", "util"];
          const no = ["nao", "n", "0", "false", "nao util"];
          if (!date || !Number.isInteger(week) || week < 1 || week > MAX_WEEK || (!yes.includes(working) && !no.includes(working))) throw new Error(`Linha ${index + 2} inválida: informe uma data válida, semana de 1 a ${MAX_WEEK} e dia útil (Sim/Não).`);
          if (entries.has(date)) throw new Error(`Linha ${index + 2}: a data ${date} aparece mais de uma vez.`);
          entries.set(date, { date, week, workingDay: yes.includes(working) });
        });
        if (!entries.size) throw new Error("A planilha não contém datas para importar.");
        localStorage.setItem(WEEK_TABLE_KEY, JSON.stringify([...entries.values()]));
        weekTable = entries;
        weekTableLoadError = false;
        updateWeekTableStatus();
        renderOutlineTable();
        renderGantt();
        alert(`Tabela de semanas importada: ${entries.size} datas. As atividades existentes permanecem inalteradas; a tabela será usada nas próximas importações.`);
      } catch (error) {
        console.error("Não foi possível importar a tabela de semanas.", error);
        alert(error.message || "Não foi possível importar a tabela de semanas.");
      }
    };
    reader.readAsArrayBuffer(file);
  }
  function updateWeekTableStatus() {
    setText("weekTableStatus", weekTableLoadError ? "Erro ao carregar tabela de semanas; importe novamente." : weekTable.size ? `Tab Sem: ${weekTable.size} datas` : "");
  }
  function buildMappingForm() {
    document.getElementById("mappingGrid").innerHTML = FIELDS.map(field => {
      const aliases = (ALIASES[field] || [FIELD_LABELS[field].toLocaleLowerCase("pt-BR")]).map(normalizeHeader);
      const match = sourceHeaders.findIndex(header => aliases.includes(normalizeHeader(header).replace(/\s*\(semana\)$/, "")));
      const options = [`<option value="">Não importar</option>`, ...sourceHeaders.map((header, index) => `<option value="${index}" ${index === match ? "selected" : ""}>${escapeHtml(header)}</option>`)].join("");
      return `<label class="mapping-row"><span>${escapeHtml(FIELD_LABELS[field])}</span><select class="form-select form-select-sm" data-field="${field}">${options}</select></label>`;
    }).join("");
  }
  function confirmImport() {
    const mapping = [...document.querySelectorAll("#mappingGrid select")].reduce((result, select) => { if (select.value !== "") result[select.dataset.field] = Number(select.value); return result; }, {});
    const missingDates = new Set();
    let imported;
    try {
    imported = sourceRows.map((row, rowIndex) => {
      const task = emptyTask();
      Object.entries(mapping).forEach(([field, index]) => {
        let value = row[index];
        if (Object.hasOwn(DATE_FIELDS, field)) {
          const date = value instanceof Date || (typeof value === "number" && value > MAX_WEEK) || (typeof value === "string" && /[\/.-]/.test(value)) ? parseCalendarDate(value) : "";
          if (date) task[DATE_FIELDS[field]] = date;
          value = normalizeWeek(value, missingDates);
        } else if (["baselineStart", "baselineFinish"].includes(field)) value = normalizeWeek(value, missingDates);
        if (Object.values(DATE_FIELDS).includes(field)) {
          if (value !== "" && value !== null && value !== undefined) {
            value = parseCalendarDate(value);
            if (!value) throw new Error(`Linha ${rowIndex + 2}: data inválida em ${FIELD_LABELS[field]}.`);
          } else value = task[field] || "";
        }
        if (["hhDisp", "hhPrev", "hhReal", "progresso"].includes(field)) value = Number(String(value).replace(",", ".")) || 0;
        if (["programacao", "milestone"].includes(field)) value = [true, 1, "x", "sim", "true"].includes(typeof value === "string" ? value.toLowerCase() : value);
        if (field === "desvio") value = String(value ?? "");
        if (field === "pd") {
          const text = String(value ?? "").trim();
          value = PD_OPTIONS.find(option => option.toLocaleLowerCase("pt-BR") === text.toLocaleLowerCase("pt-BR")) || "";
          if (text && !value) throw new Error(`Linha ${rowIndex + 2}: PD deve ser Alta, Médio ou Baixa.`);
        }
        task[field] = value;
      });
      Object.entries(DATE_FIELDS).forEach(([weekField, dateField]) => {
        if (task[dateField]) task[weekField] = dateToWeek(task[dateField], missingDates);
      });
      task.progresso = clamp(Number(task.progresso) || 0, 0, 100);
      if (!Object.hasOwn(mapping, "hhReal")) task.hhReal = calculateActualHours(task.hhPrev, task.progresso);
      if (task.planIni && !task.planFim) task.planFim = task.planIni;
      return task;
    });
    } catch (error) {
      console.error("Não foi possível importar as atividades.", error);
      alert(error.message || "Não foi possível importar as atividades.");
      return;
    }
    const replace = document.getElementById("replaceImport").checked;
    const nextRecords = ensureUniqueIds(replace ? imported : [...records, ...imported]);
    if (sourceImprovements !== null) {
      try {
        const importedRecords = nextRecords.slice(replace ? 0 : records.length);
        const nextActions = window.improvementActions.prepareProjectImport(sourceImprovements, importedRecords, getOutlineItems(nextRecords), replace);
        const actionKey = window.improvementActions.storageKey;
        const previousRecords = localStorage.getItem(STORAGE_KEY);
        const previousActions = localStorage.getItem(actionKey);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRecords));
          localStorage.setItem(actionKey, JSON.stringify(nextActions));
        } catch (error) {
          try {
            if (previousRecords === null) localStorage.removeItem(STORAGE_KEY); else localStorage.setItem(STORAGE_KEY, previousRecords);
            if (previousActions === null) localStorage.removeItem(actionKey); else localStorage.setItem(actionKey, previousActions);
          } catch (rollbackError) {
            console.error("Não foi possível restaurar os dados anteriores.", rollbackError);
            throw new Error("Falha ao salvar e ao restaurar os dados anteriores. Não atualize a página e verifique o armazenamento do navegador.");
          }
          throw error;
        }
        records = nextRecords;
        window.improvementActions.applyProjectImport(nextActions);
      } catch (error) {
        console.error("Não foi possível importar o projeto com as ações.", error);
        alert(error.message || "Não foi possível importar o projeto e as ações de melhoria.");
        return;
      }
    } else records = nextRecords;
    renderFilterControls();
    renderOutlineTable(); refreshViews(); scheduleSave(); bootstrap.Modal.getInstance(document.getElementById("importModal")).hide();
    if (missingDates.size) alert(`${missingDates.size} data(s) não constam na tabela de semanas e foram convertidas pela regra anterior: ${[...missingDates].sort().join(", ")}.`);
  }

  // Exportação inclui colunas completas, datas localizadas e vínculos entre atividades.
  function exportWorkbook() {
    try {
    if (!window.resourceAllocations.isAvailable()) throw new Error("Não é possível exportar HH Disp: as alocações não puderam ser recuperadas.");
    const improvementSheet = window.improvementActions.projectSheet(records);
    const numbers = outlineNumbers(records);
    const rows = records.map(record => ({ "Estrutura de tópicos": numbers.get(record.id), "Setor": record.setor, "Área": record.area, "Conjunto": record.conjunto, "Equipamento": record.equipamento, "Atividade": record.atividade, "Família": record.familia, "Responsável": record.responsavel, "Equipe": record.equipe, "OS": record.os, "Plan Ini (Semana)": record.planIni, "Plan Fim (Semana)": record.planFim, "Real Ini (Semana)": record.realIni, "Real Fim (Semana)": record.realFim, "HH Disp": effectiveHours(record), "HH Prev": record.hhPrev, "HH Real": record.hhReal, "Observações": record.observacoes, "Status": getTaskStatus(record), "Progresso (%)": record.progresso, "Prioridade": record.prioridade, "Tipo de Serviço": record.tipoServico, "Programação": record.programacao ? "X" : "", "Marco": record.milestone ? "X" : "", "Baseline Start (Semana)": record.baselineStart, "Baseline Finish (Semana)": record.baselineFinish, "Dependências": record.dependencies.join(", "), "Tipos de vínculo": Object.entries(record.dependencyTypes).map(([id, type]) => `${id}:${type}`).join(", ") }));
    rows.forEach((row, index) => {
      row.Desvio = records[index].desvio;
      row.PD = records[index].pd;
      Object.values(DATE_FIELDS).forEach(field => { row[FIELD_LABELS[field]] = records[index][field] || ""; });
    });
    const sheet = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([["Estrutura de tópicos", ...FIELDS.map(field => FIELD_LABELS[field])]]);
    sheet["!cols"] = (rows.length ? Object.keys(rows[0]) : ["Estrutura de tópicos", ...FIELDS]).map(() => ({ wch: 17 }));
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, "Cronograma"); XLSX.utils.book_append_sheet(workbook, improvementSheet, "Ações de Melhoria"); XLSX.writeFile(workbook, "cronograma-manutencao.xlsx");
    } catch (error) {
      console.error("Não foi possível exportar o projeto.", error);
      alert(error.message || "Não foi possível exportar o projeto.");
    }
  }
  function restoreProjectPrintState() {
    document.body.classList.remove("print-project");
    document.body.style.removeProperty("--print-fit-scale");
    document.body.style.removeProperty("--print-gantt-scale");
    document.getElementById("splitWorkspace").style.removeProperty("width");
    document.getElementById("printProjectList")?.remove();
    if (!printCollapsedRows || !table) return;
    const rows = [];
    function collectRows(currentRows) {
      currentRows.forEach(row => { rows.push(row); collectRows(row.getTreeChildren()); });
    }
    collectRows(table.getRows());
    rows.reverse().forEach(row => { if (printCollapsedRows.has(String(row.getIndex()))) row.treeCollapse(); });
    printCollapsedRows = null;
    table.redraw(true);
    renderGantt();
  }
  async function printProject() {
    document.body.classList.add("print-project");
    try {
      printCollapsedRows = new Set();
      const allRows = [];
      const rowDepths = new Map();
      function collectRows(rows, depth = 0) {
        rows.forEach(row => {
          allRows.push(row);
          rowDepths.set(String(row.getIndex()), depth);
          const children = row.getTreeChildren();
          if (children.length) {
            if (!row.isTreeExpanded()) printCollapsedRows.add(String(row.getIndex()));
            row.treeExpand();
            collectRows(children, depth + 1);
          }
        });
      }
      collectRows(table.getRows());
      const printList = document.createElement("div");
      printList.id = "printProjectList";
      printList.className = "print-project-list";
      const printHeading = document.createElement("div");
      printHeading.className = "print-project-heading";
      printHeading.textContent = "Projeto";
      printList.append(printHeading);
      allRows.forEach(row => {
        const data = row.getData();
        const line = document.createElement("div");
        line.className = data.outlineGroup ? "print-project-group" : "print-project-task";
        line.style.paddingLeft = `${Math.min(rowDepths.get(String(row.getIndex())), 6) * 5}px`;
        line.style.height = "18px";
        line.textContent = data.identificacao || "Nova atividade";
        printList.append(line);
      });
      document.getElementById("activityTable").after(printList);
      const tableHolder = document.querySelector("#activityTable .tabulator-tableholder");
      if (tableHolder) tableHolder.scrollTop = 0;
      document.getElementById("ganttHost").scrollTop = 0;
      table.redraw(true);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      renderGantt();
      const ganttCanvas = document.querySelector("#ganttHost .pg-canvas");
      const fitScale = Math.min(1, 680 / (allRows.length * 18 + 54));
      const workspace = document.getElementById("splitWorkspace");
      workspace.style.width = `${100 / fitScale}%`;
      document.body.style.setProperty("--print-fit-scale", String(fitScale));
      if (ganttCanvas) document.body.style.setProperty("--print-gantt-scale", String((1000 * 0.69 / fitScale) / ganttCanvas.scrollWidth));
      window.print();
    } catch (error) {
      restoreProjectPrintState();
      console.error("Não foi possível imprimir o projeto.", error);
      alert("Não foi possível imprimir o projeto.");
    }
  }
  function printDeviationList() {
    document.body.classList.add("print-deviations");
    try {
      window.print();
    } catch (error) {
      document.body.classList.remove("print-deviations");
      console.error("Não foi possível imprimir a lista de desvios.", error);
      alert("Não foi possível imprimir a lista de desvios.");
    }
  }

  // Validação de dependências impede ciclos no grafo de atividades.
  function wouldCreateCycle(predecessorId, successorId) {
    const visited = new Set();
    function visit(id) { if (id === predecessorId) return true; if (visited.has(id)) return false; visited.add(id); const task = records.find(item => item.id === id); return (task?.dependencies || []).some(visit); }
    return visit(successorId);
  }
  function populateDependencyOptions() {
    const options = records.map(record => `<option value="${escapeHtml(record.id)}">${escapeHtml(taskName(record))}</option>`).join("");
    document.getElementById("dependencyFrom").innerHTML = options; document.getElementById("dependencyTo").innerHTML = options;
  }
  function addDependency() {
    const predecessor = document.getElementById("dependencyFrom").value;
    const successor = document.getElementById("dependencyTo").value;
    if (!predecessor || !successor || predecessor === successor) return alert("Selecione duas atividades diferentes.");
    if (wouldCreateCycle(predecessor, successor)) return alert("Esse vínculo criaria um ciclo no cronograma.");
    const task = records.find(record => record.id === successor);
    if (!task.dependencies.includes(predecessor)) task.dependencies.push(predecessor);
    task.dependencyTypes[predecessor] = document.getElementById("dependencyType").value;
    updateTableData(); bootstrap.Modal.getInstance(document.getElementById("dependencyModal")).hide();
  }
  function generateEquipmentStages() {
    const selected = selectedTaskData();
    if (selected.length !== 1) return alert("Selecione uma atividade do equipamento que deseja expandir.");
    const source = stripOutlineFields(selected[0]);
    if (!source.equipamento) return alert("Informe o equipamento antes de gerar as três atividades.");
    const sameEquipment = record => record.setor === source.setor && record.area === source.area && record.conjunto === source.conjunto && record.equipamento === source.equipamento;
    const group = records.filter(sameEquipment);
    const stageRecords = new Map(EQUIPMENT_STAGES.map(stage => [stage, group.find(record => record.atividade === stage)]));
    let nextId = Date.now();
    for (const stage of EQUIPMENT_STAGES) {
      if (stageRecords.get(stage)) continue;
      const task = emptyTask({ ...source, id: `AT-${(nextId++).toString(36).toUpperCase()}`, atividade: stage, hhDisp: 0, hhPrev: 0, hhReal: 0, realIni: "", realFim: "", realIniDate: "", realFimDate: "", observacoes: "", progresso: 0, programacao: false, milestone: false, dependencies: [], dependencyTypes: {}, baselineStart: "", baselineFinish: "" });
      stageRecords.set(stage, task);
    }
    EQUIPMENT_STAGES.forEach((stage, index) => {
      if (index === 0) return;
      const task = stageRecords.get(stage);
      const predecessor = stageRecords.get(EQUIPMENT_STAGES[index - 1]);
      task.dependencies = [...new Set([...(task.dependencies || []), predecessor.id])];
      task.dependencyTypes = { ...task.dependencyTypes, [predecessor.id]: "TI" };
    });
    const groupIds = new Set(group.map(record => record.id));
    const insertionIndex = Math.max(0, records.findIndex(sameEquipment));
    const orderedStages = EQUIPMENT_STAGES.map(stage => stageRecords.get(stage));
    const extras = group.filter(record => !orderedStages.includes(record));
    const remaining = records.filter(record => !groupIds.has(record.id));
    const before = remaining.filter(record => records.indexOf(record) < insertionIndex);
    const after = remaining.filter(record => records.indexOf(record) >= insertionIndex);
    records = [...before, ...orderedStages, ...extras, ...after];
    updateTableData(orderedStages.map(task => task.id));
  }

  function renderFilterControls() {
    const host = document.getElementById("filterControls");
    host.innerHTML = FILTER_FIELDS.map(({ field, label, options }) => {
      const values = listValues(field, options);
      const selected = activeFilters.get(field);
      return `<details class="filter-menu"><summary>${label}</summary><div class="filter-options">${values.map(value => `<label><input type="checkbox" data-filter-field="${field}" data-filter-value="${escapeHtml(value)}" ${!selected || selected.has(String(value)) ? "checked" : ""}><span>${escapeHtml(value)}</span></label>`).join("")}</div></details>`;
    }).join("");
  }
  function applyRecordFilters() {
    renderOutlineTable();
  }
  function refreshColumnMenu() {
    const columns = table.getColumns().filter(column => column.getField() && !["rowSelectionFlag", "outlineNumber", "identificacao"].includes(column.getField()));
    document.getElementById("columnsMenu").innerHTML = columns.map(column => `<label class="column-option"><input type="checkbox" data-column-field="${escapeHtml(column.getField())}" ${column.isVisible() ? "checked" : ""}><span>${escapeHtml(column.getDefinition().title || column.getField())}</span></label>`).join("");
  }
  function openColumnChooser() {
    refreshColumnMenu();
  }
  function collectHierarchyRows() {
    const result = [];
    function collect(rows, depth, ancestorsExpanded) {
      rows.forEach(row => {
        const data = row.getData();
        const isGroup = Boolean(data.outlineGroup);
        const expanded = isGroup && row.isTreeExpanded();
        result.push({ row, depth, isGroup, ancestorsExpanded, expanded });
        if (isGroup) collect(row.getTreeChildren(), depth + 1, ancestorsExpanded && expanded);
      });
    }
    collect(table.getRows(), 0, true);
    return result;
  }
  function persistHierarchyState() {
    if (!table || restoringHierarchy || activeStatusFilters.size) return;
    try {
      const expanded = collectHierarchyRows()
        .filter(item => item.isGroup && item.expanded)
        .map(item => item.row.getData().outlinePath);
      localStorage.setItem(HIERARCHY_STATE_KEY, JSON.stringify(expanded));
    } catch (error) {
      console.error("Não foi possível salvar o estado da hierarquia.", error);
    }
  }
  function restoreHierarchyState() {
    if (!table) return;
    const saved = localStorage.getItem(HIERARCHY_STATE_KEY);
    if (saved === null) return;
    let expandedPaths;
    try {
      expandedPaths = new Set(JSON.parse(saved));
    } catch (error) {
      console.warn("O estado salvo da hierarquia é inválido.", error);
      return;
    }
    restoringHierarchy = true;
    try {
      collectHierarchyRows()
        .filter(item => item.isGroup && !expandedPaths.has(item.row.getData().outlinePath) && item.expanded)
        .sort((a, b) => b.depth - a.depth)
        .forEach(item => item.row.treeCollapse());
      collectHierarchyRows()
        .filter(item => item.isGroup && expandedPaths.has(item.row.getData().outlinePath) && !item.expanded)
        .sort((a, b) => a.depth - b.depth)
        .forEach(item => item.row.treeExpand());
    } finally {
      restoringHierarchy = false;
    }
  }
  async function waitForTableRefresh() {
    let pending;
    do {
      pending = tableRefreshPromise;
      await pending;
    } while (pending !== tableRefreshPromise);
  }
  function expandHierarchyAll() {
    collectHierarchyRows()
      .filter(item => item.isGroup && !item.expanded)
      .sort((a, b) => a.depth - b.depth)
      .forEach(item => item.row.treeExpand());
  }
  function collapseHierarchyAll() {
    collectHierarchyRows()
      .filter(item => item.isGroup && item.depth > 0 && item.expanded)
      .sort((a, b) => b.depth - a.depth)
      .forEach(item => item.row.treeCollapse());
  }
  function expandHierarchyStep() {
    const rows = collectHierarchyRows();
    const nextDepth = Math.min(...rows
      .filter(item => item.isGroup && item.ancestorsExpanded && !item.expanded)
      .map(item => item.depth));
    if (!Number.isFinite(nextDepth)) return;
    rows.filter(item => item.isGroup && item.depth === nextDepth && item.ancestorsExpanded && !item.expanded)
      .forEach(item => item.row.treeExpand());
  }
  function collapseHierarchyStep() {
    const expandedDepth = Math.max(0, ...collectHierarchyRows()
      .filter(item => item.isGroup && item.depth > 0 && item.expanded)
      .map(item => item.depth));
    if (!expandedDepth) return;
    collectHierarchyRows()
      .filter(item => item.isGroup && item.depth === expandedDepth && item.expanded)
      .forEach(item => item.row.treeCollapse());
  }
  // Alça redimensionável trabalha no sentido vertical em telas compactas.
  function installSplitter() {
    const splitter = document.getElementById("splitter");
    const workspace = document.getElementById("splitWorkspace");
    let start = 0; let initialRatio = splitRatio;
    splitter.addEventListener("pointerdown", event => { start = innerWidth <= 800 ? event.clientY : event.clientX; initialRatio = splitRatio; splitter.setPointerCapture(event.pointerId); });
    splitter.addEventListener("pointermove", event => {
      if (!splitter.hasPointerCapture(event.pointerId)) return;
      const rect = workspace.getBoundingClientRect(); const stacked = innerWidth <= 800;
      const delta = (stacked ? event.clientY : event.clientX) - start;
      splitRatio = clamp(initialRatio + delta / (stacked ? rect.height : rect.width) * 100, 25, 75);
      workspace.style.gridTemplateColumns = stacked ? "" : `minmax(280px,${splitRatio}fr) 8px minmax(240px,${100 - splitRatio}fr)`;
      if (stacked) workspace.querySelector(".grid-panel").style.height = `${clamp(410 + delta, 270, 650)}px`;
      localStorage.setItem(`${STORAGE_KEY}-split`, String(splitRatio));
      renderGantt();
    });
    splitter.addEventListener("pointerup", event => { if (splitter.hasPointerCapture(event.pointerId)) splitter.releasePointerCapture(event.pointerId); });
    splitter.addEventListener("keydown", event => { if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return; event.preventDefault(); splitRatio = clamp(splitRatio + (event.key === "ArrowLeft" ? -3 : 3), 25, 75); workspace.style.gridTemplateColumns = `minmax(280px,${splitRatio}fr) 8px minmax(240px,${100 - splitRatio}fr)`; localStorage.setItem(`${STORAGE_KEY}-split`, String(splitRatio)); renderGantt(); });
  }
  function installScheduleScrollSync() {
    if (scheduleScrollSyncInstalled) return;
    const tableHolder = document.querySelector("#activityTable .tabulator-tableholder");
    const ganttHost = document.getElementById("ganttHost");
    if (!tableHolder || !ganttHost) return;
    scheduleScrollSyncInstalled = true;
    tableHolder.addEventListener("scroll", () => synchronizeScheduleScroll(tableHolder, ganttHost));
    ganttHost.addEventListener("scroll", () => synchronizeScheduleScroll(ganttHost, tableHolder));
    tableHolder.addEventListener("wheel", event => { event.preventDefault(); ganttHost.scrollTop += event.deltaY; }, { passive: false });
  }
  function resizeSchedule() {
    if (!table || !document.getElementById("planningPane").classList.contains("active")) return;
    const element = document.getElementById("activityTable");
    const stacked = window.innerWidth <= 800;
    const panel = document.querySelector(".grid-panel");
    const panelTitle = panel.querySelector(".panel-title");
    const height = stacked
      ? Math.max(120, panel.clientHeight - panelTitle.offsetHeight)
      : Math.max(240, Math.floor(window.innerHeight - element.getBoundingClientRect().top - 36));
    const ganttPanel = document.querySelector(".gantt-panel");
    ganttPanel.style.height = stacked ? "auto" : "";
    if (Math.abs(element.getBoundingClientRect().height - height) > 1) table.setHeight(height);
    else table.redraw(true);
    renderGantt();
  }
  function synchronizeScheduleScroll(source, target) {
    if (target && target.scrollTop !== source.scrollTop) target.scrollTop = source.scrollTop;
  }
  function updateGanttZoomControls() {
    const label = document.getElementById("ganttZoomLabel");
    const zoomOut = document.getElementById("ganttZoomOutButton");
    const zoomIn = document.getElementById("ganttZoomInButton");
    if (label) label.textContent = `${Math.round(ganttZoom * 100)}%`;
    if (zoomOut) zoomOut.disabled = ganttZoom <= 0.5;
    if (zoomIn) zoomIn.disabled = ganttZoom >= 2;
  }
  function changeGanttZoom(direction) {
    ganttZoom = clamp(Math.round((ganttZoom + direction * 0.1) * 10) / 10, 0.5, 2);
    localStorage.setItem(`${STORAGE_KEY}-gantt-zoom`, String(ganttZoom));
    renderGantt();
  }

  // Eventos da interface atualizam somente a fonte de dados e sincronizam os componentes.
  function wireEvents() {
    window.addEventListener("improvement-links-changed", refreshImprovementHighlights);
    document.getElementById("indicatorFiltersButton").addEventListener("click", () => {
      renderIndicatorFilters();
      bootstrap.Modal.getOrCreateInstance(document.getElementById("indicatorFiltersModal")).show();
    });
    document.getElementById("clearIndicatorFilters").addEventListener("click", () => {
      document.querySelectorAll('#indicatorFilterFields input[type="checkbox"]').forEach(input => { input.checked = false; });
    });
    document.getElementById("applyIndicatorFilters").addEventListener("click", () => {
      indicatorFilters.clear();
      document.querySelectorAll('#indicatorFilterFields input[type="checkbox"]:checked').forEach(input => {
        if (!indicatorFilters.has(input.dataset.field)) indicatorFilters.set(input.dataset.field, new Set());
        indicatorFilters.get(input.dataset.field).add(input.value);
      });
      updateIndicatorFilterViews();
      bootstrap.Modal.getOrCreateInstance(document.getElementById("indicatorFiltersModal")).hide();
    });
    document.querySelectorAll("[data-status-filter]").forEach(button => {
      button.addEventListener("click", () => {
        const status = button.dataset.statusFilter;
        if (activeStatusFilters.has(status)) activeStatusFilters.delete(status);
        else activeStatusFilters.add(status);
        updateStatusFilterButtons();
        renderOutlineTable();
      });
    });
    document.getElementById("statusFilterAll").addEventListener("click", () => {
      activeStatusFilters.clear();
      updateStatusFilterButtons();
      renderOutlineTable();
    });
    document.getElementById("activityTable").addEventListener("click", event => {
      const toggle = event.target.closest?.("[data-expand-id]");
      if (!toggle) return;
      const id = String(toggle.dataset.expandId);
      if (expandedRows.has(id)) expandedRows.delete(id);
      else expandedRows.add(id);
      table.getRow(id)?.reformat();
    });
    document.getElementById("activityTable").addEventListener("change", event => {
      const radio = event.target.closest?.("input[type='radio'][data-task-id]");
      if (!radio) return;
      const row = table.getRow(radio.dataset.taskId);
      row?.update({ tipoServico: radio.value });
    });
    document.getElementById("addRowButton").addEventListener("click", () => {
      const selected = selectedTaskData()[0];
      const task = emptyTask(selected ? Object.fromEntries(OUTLINE_FIELDS.map(({ field }) => [field, selected[field]])) : {});
      records.push(task);
      table.deselectRow();
      renderOutlineTable([task.id]);
      refreshViews();
      scheduleSave();
    });
    document.getElementById("createStagesButton").addEventListener("click", generateEquipmentStages);
    document.getElementById("duplicateButton").addEventListener("click", () => {
      const selected = selectedTaskData()[0];
      if (!selected) return;
      const copy = emptyTask({ ...stripOutlineFields(selected), id: newTaskId(), dependencies: [...selected.dependencies], dependencyTypes: { ...selected.dependencyTypes }, baselineStart: "", baselineFinish: "" });
      records.push(copy);
      renderOutlineTable([copy.id]);
      refreshViews();
      scheduleSave();
    });
    document.getElementById("deleteButton").addEventListener("click", () => { const ids = selectedTaskData().map(item => item.id); if (!ids.length || !confirm(`Excluir ${ids.length} atividade(s) selecionada(s)?`)) return; records = records.filter(item => !ids.includes(item.id)).map(item => ({ ...item, dependencies: item.dependencies.filter(id => !ids.includes(id)) })); updateTableData(); });
    document.getElementById("globalSearch").addEventListener("input", applyRecordFilters);
    document.getElementById("filterControls").addEventListener("change", event => {
      const checkbox = event.target.closest?.("input[data-filter-field]");
      if (!checkbox) return;
      const field = checkbox.dataset.filterField;
      const boxes = [...document.querySelectorAll(`#filterControls input[data-filter-field="${field}"]`)];
      const selected = new Set(boxes.filter(input => input.checked).map(input => input.dataset.filterValue));
      if (selected.size === boxes.length) activeFilters.delete(field);
      else activeFilters.set(field, selected);
      applyRecordFilters();
    });
    document.getElementById("clearFiltersButton").addEventListener("click", () => {
      document.getElementById("globalSearch").value = "";
      activeFilters.clear();
      activeStatusFilters.clear();
      updateStatusFilterButtons();
      document.querySelectorAll("#filterControls input[type='checkbox']").forEach(input => { input.checked = true; });
      applyRecordFilters();
    });
    document.getElementById("updateDataButton").addEventListener("click", updateRecordsInBase);
    document.getElementById("columnsButton").addEventListener("click", openColumnChooser);
    document.getElementById("columnsMenu").addEventListener("click", event => event.stopPropagation());
    document.getElementById("columnsMenu").addEventListener("change", event => {
      const checkbox = event.target.closest?.("input[data-column-field]");
      if (!checkbox) return;
      const column = table.getColumn(checkbox.dataset.columnField);
      if (column) checkbox.checked ? column.show() : column.hide();
    });
    document.getElementById("hierarchyExpandAllButton").addEventListener("click", expandHierarchyAll);
    document.getElementById("hierarchyCollapseAllButton").addEventListener("click", collapseHierarchyAll);
    document.getElementById("hierarchyExpandStepButton").addEventListener("click", expandHierarchyStep);
    document.getElementById("hierarchyCollapseStepButton").addEventListener("click", collapseHierarchyStep);
    document.getElementById("criticalButton").addEventListener("click", event => { showCriticalPath = !showCriticalPath; event.currentTarget.setAttribute("aria-pressed", String(showCriticalPath)); event.currentTarget.classList.toggle("critical-active", showCriticalPath); renderGantt(); });
    document.getElementById("deviationListButton").addEventListener("click", showDeviationList);
    document.getElementById("printDeviationButton").addEventListener("click", printDeviationList);
    window.addEventListener("afterprint", () => {
      document.body.classList.remove("print-deviations");
      restoreProjectPrintState();
    });
    document.getElementById("baselineButton").addEventListener("click", () => { if (!confirm("Congelar as semanas planejadas atuais como baseline?")) return; records = records.map(record => ({ ...record, baselineStart: record.planIni, baselineFinish: record.planFim })); updateTableData(); });
    document.getElementById("milestoneButton").addEventListener("click", () => { const task = emptyTask({ setor: "Marco", equipamento: "Novo marco", planIni: currentWeek, planFim: currentWeek, milestone: true }); records.push(task); renderOutlineTable([task.id]); refreshViews(); scheduleSave(); });
    document.getElementById("ganttZoomOutButton").addEventListener("click", () => changeGanttZoom(-1));
    document.getElementById("ganttZoomInButton").addEventListener("click", () => changeGanttZoom(1));
    document.getElementById("dependencyButton").addEventListener("click", () => { if (records.length < 2) return alert("Adicione pelo menos duas atividades para criar um vínculo."); populateDependencyOptions(); bootstrap.Modal.getOrCreateInstance(document.getElementById("dependencyModal")).show(); });
    document.getElementById("saveDependencyButton").addEventListener("click", addDependency);
    document.getElementById("importButton").addEventListener("click", () => document.getElementById("fileInput").click());
    document.getElementById("fileInput").addEventListener("change", event => { const file = event.target.files[0]; if (file) openImport(file); event.target.value = ""; });
    document.getElementById("capacityImportButton").addEventListener("click", () => document.getElementById("capacityFileInput").click());
    document.getElementById("capacityFileInput").addEventListener("change", event => { const file = event.target.files[0]; if (file) importAvailableHours(file); event.target.value = ""; });
    document.getElementById("confirmImportButton").addEventListener("click", confirmImport);
    document.getElementById("exportButton").addEventListener("click", exportWorkbook);
    document.getElementById("printButton").addEventListener("click", printProject);
    document.getElementById("weekTableImportButton").addEventListener("click", () => document.getElementById("weekTableFileInput").click());
    document.getElementById("weekTableFileInput").addEventListener("change", event => { const file = event.target.files[0]; if (file) importWeekTable(file); event.target.value = ""; });
    document.getElementById("curveMetric").addEventListener("change", updateCurve);
    document.getElementById("assistantForm").addEventListener("submit", event => {
      event.preventDefault();
      const input = document.getElementById("assistantQuestion");
      const question = input.value.trim();
      if (!question) return;
      submitAssistantQuestion(question);
      input.value = "";
    });
    updateWeekSelector();
    document.getElementById("currentWeek").addEventListener("change", event => {
      currentWeek = clamp(Number(event.target.value) || 1, 1, MAX_WEEK);
      localStorage.setItem(`${STORAGE_KEY}-current-week`, String(currentWeek));
      const selectedIds = table.getSelectedData().map(row => row.id);
      renderOutlineTable(selectedIds);
      updateKpis(); updateCurve(); updateLevelingChart();
      if (resourceLevelingChart) updateResourceLevelingChart();
    });
    document.getElementById("themeToggle").addEventListener("click", toggleTheme);
    document.getElementById("curve-tab").addEventListener("shown.bs.tab", () => { chart?.resize(); levelingChart?.resize(); });
    document.getElementById("planning-tab").addEventListener("shown.bs.tab", resizeSchedule);
    document.getElementById("resources-tab").addEventListener("shown.bs.tab", () => {
      window.resourceAllocations.refresh();
      updateResourceLevelingChart();
      resourceLevelingChart.resize();
    });
    document.querySelectorAll("[data-workload-filter]").forEach(select => select.addEventListener("change", renderResourceWorkload));
    document.querySelectorAll("[data-workload-filter]").forEach(select => {
      const field = select.dataset.workloadFilter;
      const label = select.parentElement.firstChild.textContent.trim();
      const button = document.createElement("button");
      button.type = "button";
      button.className = "resource-workload-sort";
      button.dataset.workloadSort = field;
      button.dataset.label = label;
      button.textContent = "↕";
      button.setAttribute("aria-label", `Ordenar ${label}: crescente`);
      button.title = `Ordenar ${label}: crescente`;
      select.closest("th").setAttribute("aria-sort", "none");
      select.parentElement.before(button);
      button.addEventListener("click", () => {
        if (!workloadSort || workloadSort.field !== field) workloadSort = { field, direction: "ascending" };
        else if (workloadSort.direction === "ascending") workloadSort = { field, direction: "descending" };
        else workloadSort = null;
        renderResourceWorkload();
      });
    });
    window.addEventListener("resize", () => { resizeSchedule(); chart?.resize(); levelingChart?.resize(); resourceLevelingChart?.resize(); });
  }
  function updateStatusFilterButtons() {
    document.querySelectorAll("[data-status-filter]").forEach(button => {
      button.setAttribute("aria-pressed", String(activeStatusFilters.has(button.dataset.statusFilter)));
    });
  }
  function toggleTheme() {
    document.body.classList.toggle("theme-dark");
    const dark = document.body.classList.contains("theme-dark");
    localStorage.setItem(`${STORAGE_KEY}-theme`, dark ? "dark" : "light");
    document.querySelector("#themeToggle i").className = dark ? "fa-solid fa-sun" : "fa-solid fa-moon";
    chart?.update(); levelingChart?.update(); resourceLevelingChart?.update(); renderGantt();
  }

  // Limite preparado para trocar LocalStorage por uma API REST com persistência SQL Server.
  class BackendAdapter {
    async load() { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    async save(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    async request(_path, _options = {}) { throw new Error("Configure um endpoint REST para ativar a persistência remota."); }
  }

  // Inicialização recupera preferências e constrói a tabela antes das visualizações dependentes.
  function initialize() {
    allocationRevision = window.resourceAllocations.getRevision();
    updateAllocationSyncWarning();
    if (localStorage.getItem(`${STORAGE_KEY}-theme`) === "dark") { document.body.classList.add("theme-dark"); document.querySelector("#themeToggle i").className = "fa-solid fa-sun"; }
    const lastUpdate = localStorage.getItem(`${STORAGE_KEY}-last-update`);
    if (lastUpdate) {
      const status = `Dados atualizados localmente · ${formatUpdateTime(lastUpdate)}`;
      setText("saveStatus", status);
      document.getElementById("saveStatus").title = status;
    }
    createTable(); renderFilterControls(); wireEvents(); installSplitter();
    updateWeekTableStatus();
    window.addEventListener("keydown", reloadAfterSaving, true);
    window.addEventListener("beforeunload", saveBeforeLeaving);
    window.addEventListener("pagehide", saveBeforeLeaving);
    setText("capacityFileStatus", availableHoursSource ? `Arquivo carregado: ${availableHoursSource}.` : "Carregue um XLS de capacidade semanal.");
    refreshViews();
    window.setTimeout(() => {
      resizeSchedule();
      installScheduleScrollSync();
    }, 100);
    window.maintenanceSchedule = { getRecords: () => structuredClone(records.map(record => ({ ...record, hhDisp: effectiveHours(record) }))), getOutlineItems, save: scheduleSave, adapter: new BackendAdapter() };
  }
  document.addEventListener("DOMContentLoaded", initialize, { once: true });
  function updateAllocationSyncWarning() {
    const warning = document.getElementById("allocationSyncWarning");
    const available = window.resourceAllocations.isAvailable();
    warning.hidden = available;
    warning.textContent = available ? "" : "Não foi possível recuperar as alocações. Os valores de HH Disp exibidos podem estar desatualizados; a edição e exportação estão bloqueadas.";
  }
  function refreshAllocationHours() {
    if (!allocationRefreshPending || editingPlanningCell) return;
    allocationRefreshPending = false;
    renderOutlineTable().catch(error => {
      console.error("Não foi possível atualizar HH Disp no planejamento.", error);
      setText("saveStatus", "Falha ao atualizar HH Disp");
    });
  }
  window.addEventListener("resource-allocations-changed", () => {
    if (document.getElementById("resourcesPane").classList.contains("active")) renderResourceWorkload();
    const revision = window.resourceAllocations.getRevision();
    if (!table || revision === allocationRevision) return;
    allocationRevision = revision;
    updateAllocationSyncWarning();
    if (resourceLevelingChart) updateResourceLevelingChart();
    allocationRefreshPending = true;
    window.setTimeout(refreshAllocationHours, 0);
  });
  window.addEventListener("resource-filter-changed", event => {
    const next = event.detail;
    if (JSON.stringify(resourceFilterScope) === JSON.stringify(next)) return;
    resourceFilterScope = next;
    if (resourceLevelingChart) updateResourceLevelingChart();
  });
})();