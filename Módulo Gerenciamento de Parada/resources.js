(() => {
  "use strict";

  const DATABASE = "usina-resource-workbook";
  const STORE = "workbooks";
  const KEY = "current";
  const FIELD_VISIBILITY_KEY = "usina-resource-visible-fields";
  const headerNames = new Set([
    "funcionarios", "funcionario", "area", "equipe", "quant", "quantidade",
    "matricula", "funcao", "centro", "setor safra", "setor entressafra", "setor",
    "espec", "rend", "status", "f inicio", "f fim", "dias", "t inicio", "t fim",
    "feriados", "feriado", "descricao", "responsavel", "semana", "hh disponivel"
  ]);
  const input = document.getElementById("resourceFileInput");
  const importButton = document.getElementById("resourceImportButton");
  const exportButton = document.getElementById("resourceExportButton");
  const status = document.getElementById("resourceStatus");
  const tableElement = document.getElementById("resourceTable");
  const tableStatus = document.getElementById("resourceTableStatus");
  const popup = document.createElement("div");
  popup.id = "resourceAllocationPopup";
  popup.className = "resource-allocation-popup";
  popup.setAttribute("role", "tooltip");
  popup.hidden = true;
  document.body.append(popup);
  const popupScopes = new WeakMap();
  let popupCell = null;
  let popupTimer = null;
  function hideAllocationPopup() {
    clearTimeout(popupTimer);
    if (popupCell) popupCell.removeAttribute("aria-describedby");
    popupCell = null;
    popup.hidden = true;
  }
  function schedulePopupHide() {
    clearTimeout(popupTimer);
    popupTimer = setTimeout(hideAllocationPopup, 150);
  }
  function showAllocationPopup(cell) {
    clearTimeout(popupTimer);
    const scope = popupScopes.get(cell);
    if (!scope) return hideAllocationPopup();
    const activities = window.resourceAllocations.getActivitiesForScope(scope.resourceIds, scope.weeks, scope.taskId);
    if (!activities || !activities.length) return hideAllocationPopup();
    if (popupCell && popupCell !== cell) popupCell.removeAttribute("aria-describedby");
    popupCell = cell;
    cell.setAttribute("aria-describedby", popup.id);
    popup.replaceChildren();
    const heading = document.createElement("strong");
    const total = activities.reduce((sum, item) => sum + item.units, 0) / 1000000;
    heading.textContent = `Atividades alocadas · ${window.resourceAllocations.formatHours(total)} HH`;
    const list = document.createElement("ul");
    activities.forEach(item => {
      const li = document.createElement("li");
      const amount = document.createElement("strong");
      amount.textContent = `${window.resourceAllocations.formatHours(item.amount)} HH · ${item.task?.atividade || item.taskName}`;
      const description = document.createElement("span");
      const task = item.task;
      description.textContent = task
        ? `Setor: ${task.setor || "—"} · Área: ${task.area || "—"} · Família: ${task.familia || "—"} · Equipe: ${task.equipe || "—"} · HH Prev. (saldo): ${window.resourceAllocations.formatHours(window.resourceAllocations.getBalance(task))}`
        : "Atividade não encontrada no planejamento.";
      li.append(amount, description);
      list.append(li);
    });
    popup.append(heading, list);
    if (cell.classList.contains("resource-period-total") && cell.classList.contains("resource-reversal")) {
      const instruction = document.createElement("p");
      instruction.textContent = "Duplo clique ou Enter para selecionar alocações e estornar.";
      popup.append(instruction);
    }
    if (scope.partial) {
      const warning = document.createElement("p");
      warning.textContent = "Total parcial: há recursos sem identificação única ou disponibilidade incompleta.";
      popup.append(warning);
    }
    const rect = cell.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const placeBelow = below >= above;
    popup.style.maxHeight = `${Math.max(0, Math.min(320, (placeBelow ? below : above) - 8))}px`;
    popup.hidden = false;
    const width = popup.offsetWidth, height = popup.offsetHeight;
    popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    popup.style.top = `${placeBelow ? rect.bottom + 8 : rect.top - height - 8}px`;
  }
  tableElement.addEventListener("pointerover", event => {
    const cell = event.target.closest(".resource-allocation-inspect");
    if (cell && !cell.contains(event.relatedTarget)) showAllocationPopup(cell);
  });
  tableElement.addEventListener("pointerout", event => {
    if (popupCell && popupCell.contains(event.target) && !popupCell.contains(event.relatedTarget) && !popup.contains(event.relatedTarget)) schedulePopupHide();
  });
  tableElement.addEventListener("focusin", event => {
    const cell = event.target.closest(".resource-allocation-inspect");
    if (cell) showAllocationPopup(cell);
  });
  tableElement.addEventListener("focusout", event => {
    if (popupCell === event.target && !popup.contains(event.relatedTarget)) schedulePopupHide();
  });
  popup.addEventListener("pointerenter", () => clearTimeout(popupTimer));
  popup.addEventListener("pointerleave", event => {
    if (!popupCell || !popupCell.contains(event.relatedTarget)) schedulePopupHide();
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape") hideAllocationPopup(); });
  document.addEventListener("show.bs.modal", hideAllocationPopup);
  document.getElementById("resources-tab").addEventListener("hide.bs.tab", hideAllocationPopup);
  tableElement.parentElement.addEventListener("scroll", hideAllocationPopup);
  window.addEventListener("scroll", hideAllocationPopup);
  window.addEventListener("resize", hideAllocationPopup);
  const fieldsModal = document.getElementById("resourceFieldsModal");
  const fieldsOptions = document.getElementById("resourceFieldsOptions");
  const fieldsError = document.getElementById("resourceFieldsError");
  const resourceFields = [
    { label: "FUNCIONÁRIOS", aliases: ["funcionarios", "funcionario"] },
    { label: "EQUIPE", aliases: ["equipe"] },
    { label: "QUANT.", aliases: ["quant", "quantidade"] },
    { label: "MATRÍCULA", aliases: ["matricula"] },
    { label: "FUNÇÃO", aliases: ["funcao"] },
    { label: "CENTRO", aliases: ["centro"] },
    { label: "SETOR SAFRA", aliases: ["setor safra"] },
    { label: "ESPEC", aliases: ["espec"] },
    { label: "REND", aliases: ["rend"] },
    { label: "STATUS", aliases: ["status"] }
  ];
  let savedWorkbook = null;
  let busy = true;
  let visibleFields = new Set(resourceFields.map(field => field.aliases[0]));
  let fieldVisibilityError = "";
  let updateFieldVisibility = () => {};
  const expandedTeams = new Set();
  try {
    const saved = localStorage.getItem(FIELD_VISIBILITY_KEY);
    if (saved !== null) {
      const selected = JSON.parse(saved);
      if (!Array.isArray(selected) || !selected.length || selected.some(value => !visibleFields.has(value))) {
        throw new Error("Preferências de campos inválidas.");
      }
      visibleFields = new Set(selected);
    }
  } catch (error) {
    console.error("Não foi possível recuperar os campos visíveis.", error);
    fieldVisibilityError = "Não foi possível recuperar os campos salvos. Confira a seleção antes de aplicar.";
  }

  fieldsModal.addEventListener("show.bs.modal", () => {
    fieldsOptions.replaceChildren();
    fieldsError.textContent = fieldVisibilityError;
    resourceFields.forEach(field => {
      const label = document.createElement("label");
      label.className = "form-check";
      const input = document.createElement("input");
      input.className = "form-check-input";
      input.type = "checkbox";
      input.value = field.aliases[0];
      input.checked = visibleFields.has(input.value);
      const text = document.createElement("span");
      text.className = "form-check-label";
      text.textContent = field.label;
      label.append(input, text);
      fieldsOptions.append(label);
    });
  });
  document.getElementById("resourceFieldsApply").addEventListener("click", () => {
    const selected = [...fieldsOptions.querySelectorAll("input:checked")].map(input => input.value);
    if (!selected.length) {
      fieldsError.textContent = "Selecione pelo menos um campo de identificação.";
      return;
    }
    try {
      localStorage.setItem(FIELD_VISIBILITY_KEY, JSON.stringify(selected));
    } catch (error) {
      console.error("Não foi possível salvar os campos visíveis.", error);
      fieldsError.textContent = "Não foi possível salvar a seleção neste navegador.";
      return;
    }
    fieldVisibilityError = "";
    visibleFields = new Set(selected);
    updateFieldVisibility();
    bootstrap.Modal.getOrCreateInstance(fieldsModal).hide();
  });

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  function updateButtons() {
    importButton.disabled = busy;
    exportButton.disabled = busy || !savedWorkbook;
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Feche outras abas do aplicativo e tente novamente."));
    });
  }

  async function accessWorkbook(mode, value) {
    const db = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const store = transaction.objectStore(STORE);
        const request = mode === "readonly" ? store.get(KEY) : store.put(value, KEY);
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error || request.error);
        transaction.onabort = () => reject(transaction.error || new Error("Operação de armazenamento cancelada."));
      });
    } finally {
      db.close();
    }
  }

  function normalizeHeader(value) {
    return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
  }

  function inspectSheet(sheet, name) {
    if (!sheet["!ref"]) return { name, headerRow: null, fields: [] };
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    let best = { score: 0, headerRow: null, fields: [] };
    const lastRow = Math.min(range.e.r, range.s.r + 29);
    for (let row = range.s.r; row <= lastRow; row++) {
      const fields = [];
      let score = 0;
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
        if (!cell || typeof cell.v !== "string" || !cell.v.trim()) continue;
        const label = cell.v.trim();
        if (headerNames.has(normalizeHeader(label))) score++;
        fields.push(`${XLSX.utils.encode_col(col)}: ${label}`);
      }
      if (score >= 2 && score > best.score) best = { score, headerRow: row + 1, fields };
    }
    return { name, headerRow: best.headerRow, fields: best.fields };
  }

  function inspectWorkbook(bytes) {
    if (!window.XLSX) throw new Error("A biblioteca de leitura de planilhas não está disponível. Verifique a conexão e recarregue a página.");
    const workbook = XLSX.read(bytes, { type: "array", sheetRows: 30 });
    if (!workbook.SheetNames.length) throw new Error("A planilha não contém abas.");
    return workbook.SheetNames.map(name => inspectSheet(workbook.Sheets[name], name));
  }

  function parseResourceTable(bytes) {
    if (!window.XLSX) throw new Error("A biblioteca de leitura de planilhas não está disponível.");
    const workbook = XLSX.read(bytes, { type: "array", cellNF: true });
    const sheetName = workbook.SheetNames.find(name => normalizeHeader(name) === "list fun");
    if (!sheetName) throw new Error('A planilha não contém a aba "LIST_FUN".');
    const sheet = workbook.Sheets[sheetName];
    if (!sheet["!ref"]) throw new Error("A aba LIST_FUN está vazia.");
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    let columns, headerRow;
    for (let row = range.s.r; row <= Math.min(range.e.r, range.s.r + 29); row++) {
      const found = resourceFields.map(field => {
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
          if (cell && field.aliases.includes(normalizeHeader(cell.v ?? ""))) return col;
        }
        return -1;
      });
      if (found.every(col => col >= 0)) { columns = found; headerRow = row; break; }
    }
    if (!columns) throw new Error("A aba LIST_FUN não contém todos os cabeçalhos de recursos esperados nas primeiras 30 linhas.");
    let weeks = [];
    let candidate = [];
    for (let col = Math.max(...columns) + 1; col <= range.e.c; col++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: headerRow, c: col })];
      const value = cell?.v;
      const match = String(value ?? "").trim().match(/^(?:s(?:emana)?\s*)?0*(\d{1,3})$/i);
      const number = match ? Number(match[1]) : 0;
      if (number >= 1 && number <= 999) {
        if (candidate.length && number !== candidate[candidate.length - 1].number + 1) candidate = [];
        candidate.push({ number, column: col });
        if (candidate.length > weeks.length || (candidate.length === weeks.length && candidate[0].number === 1 && weeks[0].number !== 1)) weeks = [...candidate];
      } else {
        candidate = [];
      }
    }
    if (!weeks.length) throw new Error("Nenhuma coluna de semana foi identificada na aba LIST_FUN.");
    let missingValues = 0;
    const groups = new Map();
    let sourceRows = 0;
    for (let row = headerRow + 1; row <= range.e.r; row++) {
      const cells = columns.map(col => sheet[XLSX.utils.encode_cell({ r: row, c: col })]);
      const name = cells[0]?.v;
      if (name === undefined || name === null || !String(name).trim()) continue;
      if (/^total(?:\s|$)/i.test(String(name).trim())) continue;
      const values = cells.map((cell, index) => {
        if (!cell || cell.v === undefined || cell.v === null) return "";
        if (index === 8 && typeof cell.v === "number") return `${(cell.v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
        return cell.w ?? String(cell.v);
      });
      const availability = weeks.map(week => {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: week.column })];
        if (!cell || cell.v === undefined || cell.v === null || cell.t === "e") {
          if (cell?.f || cell?.t === "e") missingValues++;
          return null;
        }
        if (typeof cell.v !== "number" || !Number.isFinite(cell.v) || cell.v < 0) {
          throw new Error(`Valor de HH disponível inválido na célula ${XLSX.utils.encode_cell({ r: row, c: week.column })}.`);
        }
        return cell.v;
      });
      sourceRows++;
      const signature = JSON.stringify(Array.from({ length: weeks[0].column - range.s.c }, (_, index) => {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: range.s.c + index })];
        return cell?.v ?? null;
      }));
      const existing = groups.get(signature);
      if (existing) {
        existing.availability = existing.availability.map((value, index) => {
          if (value === null && availability[index] === null) return null;
          return (value === null ? 0 : value) + (availability[index] === null ? 0 : availability[index]);
        });
        existing.availabilityPartial = existing.availabilityPartial.map((value, index) => value || availability[index] === null);
        existing.count++;
      } else {
        const matricula = values[3].trim();
        const resourceId = matricula ? JSON.stringify([matricula, values[0], values[1], values[4], values[5], values[6]]) : "";
        groups.set(signature, { values, resourceId, matricula, availability, availabilityPartial: availability.map(value => value === null), count: 1 });
      }
    }
    return { weeks, rows: [...groups.values()], missingValues, sourceRows };
  }

  function renderResourceTable(bytes) {
    updateFieldVisibility = () => {};
    window.resourceAllocations.setResourceRenderer(() => {});
    tableElement.replaceChildren();
    window.dispatchEvent(new CustomEvent("resource-filter-changed", { detail: { active: false, resourceIds: [], unidentified: 0 } }));
    tableStatus.classList.remove("is-error");
    if (!bytes) {
      window.resourceAllocations.setResourceData(null);
      window.resourceAllocations.refresh();
      tableStatus.textContent = "Carregue uma planilha para visualizar a disponibilidade.";
      return;
    }
    let data;
    try {
      data = parseResourceTable(bytes);
    } catch (error) {
      window.resourceAllocations.setResourceData(null);
      window.resourceAllocations.refresh();
      console.error("Não foi possível montar o painel de recursos.", error);
      tableStatus.textContent = `Não foi possível montar o painel: ${error.message}`;
      tableStatus.classList.add("is-error");
      return;
    }
    window.resourceAllocations.setResourceData(data);
    const resourceIdCounts = new Map();
    data.rows.forEach(row => resourceIdCounts.set(row.resourceId, (resourceIdCounts.get(row.resourceId) || 0) + 1));
    const head = tableElement.createTHead();
    function heading(row, text, span, rowSpan = 1) {
      const th = document.createElement("th");
      th.textContent = text;
      th.colSpan = span;
      th.rowSpan = rowSpan;
      row.append(th);
      return th;
    }
    const columns = head.insertRow();
    columns.className = "resource-columns";
    const subcolumns = head.insertRow();
    subcolumns.className = "resource-subcolumns";
    const body = tableElement.createTBody();
    const filters = resourceFields.map((field, index) => {
      const th = heading(columns, "", 1, 2);
      th.className = "resource-field";
      th.hidden = !visibleFields.has(field.aliases[0]);
      const label = document.createElement("label");
      label.textContent = field.label;
      const select = document.createElement("select");
      select.setAttribute("aria-label", `Filtrar ${field.label}`);
      const all = document.createElement("option");
      all.value = "";
      all.textContent = "Todos";
      select.append(all);
      [...new Set(data.rows.map(row => row.values[index]).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))
        .forEach(value => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = value;
          select.append(option);
        });
      label.append(select);
      th.append(label);
      select.addEventListener("change", renderRows);
      return select;
    });
    data.weeks.forEach(week => {
      const th = heading(columns, `S${String(week.number).padStart(2, "0")}`, 2);
      th.className = "resource-week";
      heading(subcolumns, "D", 1).title = "HH disponível";
      heading(subcolumns, "P", 1).title = "HH programado";
    });
    heading(columns, "TOTAL", 2).className = "resource-week resource-total";
    const totalAvailableHeading = heading(subcolumns, "D", 1);
    totalAvailableHeading.className = "resource-period-total";
    totalAvailableHeading.title = "Total de HH disponível nas semanas carregadas";
    const totalProgrammedHeading = heading(subcolumns, "P", 1);
    totalProgrammedHeading.className = "resource-period-total";
    totalProgrammedHeading.title = "Total de HH programado nas semanas carregadas";
    function showWeeklyHours(cell, value, partial = false) {
      cell.textContent = `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}${partial ? "*" : ""}`;
      cell.title = `Valor exato: ${window.resourceAllocations.formatHours(value)} HH.`;
    }
    function addCellTitle(cell, message) {
      cell.title = [cell.title, message].filter(Boolean).join(" ");
    }
    function inspectProgrammed(cell, amount, eligible, weeks, taskId = "", partial = false) {
      if (!amount || !window.resourceAllocations.isAvailable()) return;
      popupScopes.set(cell, { resourceIds: eligible.map(row => row.resourceId), weeks: weeks.map(week => week.number), taskId, partial });
      cell.classList.add("resource-allocation-inspect");
      cell.removeAttribute("title");
      if (!cell.hasAttribute("tabindex")) cell.tabIndex = 0;
    }
    function enableTotalReversal(cell, amount, eligible, taskId = "", partial = false) {
      if (!amount || !window.resourceAllocations.isAvailable()) return;
      cell.classList.add("resource-reversal");
      cell.tabIndex = 0;
      cell.setAttribute("role", "button");
      cell.dataset.team = "true";
      cell.dataset.resourceIds = JSON.stringify(eligible.map(row => row.resourceId));
      cell.dataset.weeks = JSON.stringify(data.weeks.map(week => week.number));
      cell.dataset.taskId = taskId;
      cell.setAttribute("aria-label", `Estornar ${window.resourceAllocations.formatHours(amount)} HH do total programado nas semanas exibidas. Duplo clique ou Enter para selecionar alocações.${partial ? " Total parcial." : ""}`);
    }
    function appendTotals(tr, members, eligible, allocation = null, weeks = data.weeks, showZero = false) {
      const available = tr.insertCell();
      const programmed = tr.insertCell();
      available.className = programmed.className = "resource-week-value resource-total";
      if (weeks === data.weeks) {
        available.classList.add("resource-period-total");
        programmed.classList.add("resource-period-total");
      }
      if (allocation) {
        available.textContent = "—";
        const sum = weeks.reduce((total, week) => total + (allocation.weeks.get(week.number) || 0), 0);
        if (!window.resourceAllocations.isAvailable()) programmed.textContent = "!";
        else if (sum) showWeeklyHours(programmed, sum);
        else programmed.textContent = "—";
        inspectProgrammed(programmed, sum, eligible, weeks, allocation.taskId);
        if (weeks === data.weeks) enableTotalReversal(programmed, sum, eligible, allocation.taskId);
        return;
      }
      const indices = weeks.map(week => data.weeks.indexOf(week));
      const values = members.flatMap(row => indices.map(index => row.availability[index]));
      const known = values.filter(value => value !== null);
      const partial = members.some(row => indices.some(index => row.availabilityPartial[index])) || eligible.length !== members.length;
      const sum = known.reduce((total, value) => total + value, 0);
      if (known.length) showWeeklyHours(available, sum, partial);
      else available.textContent = "—";
      if (partial) addCellTitle(available, "Total parcial: disponibilidade ausente ou recurso sem identificação única.");
      const amount = eligible.reduce((total, row) => total + weeks.reduce((weekly, week) =>
        weekly + window.resourceAllocations.getProgrammed(row.resourceId, week.number), 0), 0);
      if (!window.resourceAllocations.isAvailable() || (!eligible.length && members.length)) {
        programmed.textContent = "!";
        programmed.title = "Total programado indisponível.";
      } else {
        const incomplete = eligible.length !== members.length;
        if (amount || incomplete || showZero) showWeeklyHours(programmed, amount, incomplete);
        else programmed.textContent = "—";
        if (incomplete) addCellTitle(programmed, "Total parcial: há recursos sem identificação única.");
        inspectProgrammed(programmed, amount, eligible, weeks, "", incomplete);
        if (weeks === data.weeks) enableTotalReversal(programmed, amount, eligible, "", incomplete);
      }
    }
    function renderRows() {
      hideAllocationPopup();
      body.replaceChildren();
      const visible = data.rows.filter(row => filters.every((filter, index) => !filter.value || filter.value === row.values[index]));
      const visibleIdentified = visible.filter(row => row.resourceId && resourceIdCounts.get(row.resourceId) === 1);
      window.dispatchEvent(new CustomEvent("resource-filter-changed", { detail: {
        active: filters.some(filter => Boolean(filter.value)),
        resourceIds: visibleIdentified.map(row => row.resourceId),
        unidentified: visible.length - visibleIdentified.length
      } }));
      const teams = new Map();
      visible.forEach(row => {
        const name = row.values[1].trim();
        if (!teams.has(name)) teams.set(name, []);
        teams.get(name).push(row);
      });
      [...teams.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR", { numeric: true })).forEach(([name, members]) => {
        const groupRow = body.insertRow();
        groupRow.className = "resource-team-row";
        const groupLabel = groupRow.insertCell();
        groupLabel.colSpan = visibleFields.size;
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "resource-team-toggle";
        toggle.setAttribute("aria-expanded", String(expandedTeams.has(name)));
        toggle.textContent = `${expandedTeams.has(name) ? "▾" : "▸"} ${name || "Equipe não informada"} (${members.length})`;
        toggle.addEventListener("click", () => {
          if (expandedTeams.has(name)) expandedTeams.delete(name); else expandedTeams.add(name);
          renderRows();
          const button = [...body.querySelectorAll(".resource-team-toggle")].find(item => item.dataset.team === name);
          if (button) button.focus();
        });
        toggle.dataset.team = name;
        groupLabel.append(toggle);
        const eligible = members.filter(row => row.resourceId && resourceIdCounts.get(row.resourceId) === 1);
        groupLabel.classList.add("resource-team-target");
        groupLabel.dataset.label = name ? `Equipe ${name}` : "Equipe não informada";
        groupLabel.dataset.resourceIds = JSON.stringify(eligible.map(row => row.resourceId));
        groupLabel.dataset.partial = String(eligible.length !== members.length);
        groupLabel.tabIndex = 0;
        groupLabel.setAttribute("role", "group");
        groupLabel.setAttribute("aria-label", `Programar atividades filtradas para ${groupLabel.dataset.label}`);
        data.weeks.forEach((week, index) => {
          const values = members.map(row => row.availability[index]);
          const partial = members.some(row => row.availabilityPartial[index]) || eligible.length !== members.length;
          const known = values.filter(value => value !== null);
          const sum = known.reduce((total, value) => total + value, 0);
          const available = groupRow.insertCell();
          available.className = "resource-week-value";
          if (known.length) showWeeklyHours(available, sum, partial);
          else available.textContent = "—";
          if (partial) addCellTitle(available, "Total parcial: disponibilidade ausente ou recurso sem identificação única.");
          const amount = eligible.reduce((total, row) => total + window.resourceAllocations.getProgrammed(row.resourceId, week.number), 0);
          const cell = groupRow.insertCell();
          cell.className = "resource-week-value resource-programmed resource-team-programmed";
          if (!window.resourceAllocations.isAvailable()) cell.textContent = "!";
          else if (amount) showWeeklyHours(cell, amount);
          else cell.textContent = "—";
          cell.classList.toggle("has-hours", amount > 0 && !partial && amount <= sum + 0.0000005);
          cell.classList.toggle("over-capacity", amount > sum + 0.0000005);
          cell.tabIndex = 0;
          cell.setAttribute("role", "button");
          cell.dataset.team = "true";
          cell.dataset.label = name ? `Equipe ${name}` : "Equipe não informada";
          cell.dataset.week = week.number;
          cell.dataset.partial = String(partial);
          cell.dataset.resourceIds = JSON.stringify(eligible.map(row => row.resourceId));
          cell.setAttribute("aria-label", `Programar HH para ${cell.dataset.label}, semana ${week.number}. Atual: ${window.resourceAllocations.formatHours(amount)}.${partial ? " Disponibilidade parcial." : ""}`);
          inspectProgrammed(cell, amount, eligible, [week], "", partial);
        });
        appendTotals(groupRow, members, eligible);
        if (!expandedTeams.has(name)) return;
        members.forEach(row => {
        const tr = body.insertRow();
        resourceFields.forEach((field, index) => {
          if (!visibleFields.has(field.aliases[0])) return;
          const cell = tr.insertCell();
          if (!visibleFields.has("funcionarios") && tr.cells.length === 1) {
            const employee = document.createElement("span");
            employee.className = "resource-employee-name";
            employee.textContent = row.values[0] || "Funcionário não informado";
            cell.append(employee);
          }
          if (field.aliases[0] !== "equipe") cell.append(document.createTextNode(row.values[index] || "—"));
        });
        row.availability.forEach((value, weekIndex) => {
          const available = tr.insertCell();
          available.className = "resource-week-value";
          if (value === null) available.textContent = "—";
          else showWeeklyHours(available, value, row.availabilityPartial[weekIndex]);
          if (row.availabilityPartial[weekIndex]) addCellTitle(available, "Disponibilidade parcial: há valores não informados nas linhas agrupadas.");
          const programmed = tr.insertCell();
          const unique = row.resourceId && resourceIdCounts.get(row.resourceId) === 1;
          const amount = unique ? window.resourceAllocations.getProgrammed(row.resourceId, data.weeks[weekIndex].number) : 0;
          if (!unique || !window.resourceAllocations.isAvailable()) programmed.textContent = "!";
          else if (amount) showWeeklyHours(programmed, amount);
          else programmed.textContent = "—";
          if (!unique) programmed.title = "Identificação vazia ou ambígua: não é possível identificar este recurso.";
          programmed.className = "resource-week-value resource-programmed";
          programmed.classList.toggle("has-hours", amount > 0 && value !== null && amount <= value + 0.0000005);
          programmed.classList.toggle("over-capacity", amount > 0 && (value === null || amount > value + 0.0000005));
          programmed.tabIndex = 0;
          programmed.setAttribute("role", "button");
          programmed.setAttribute("aria-label", `Programar HH para ${row.values[0]}, semana ${data.weeks[weekIndex].number}. Atual: ${window.resourceAllocations.formatHours(amount)}.`);
          programmed.dataset.resourceId = row.resourceId;
          programmed.dataset.label = row.values[0];
          programmed.dataset.week = data.weeks[weekIndex].number;
          inspectProgrammed(programmed, amount, unique ? [row] : [], [data.weeks[weekIndex]]);
        });
        appendTotals(tr, [row], row.resourceId && resourceIdCounts.get(row.resourceId) === 1 ? [row] : []);
        if (row.count > 1) tr.cells[0].title = `${row.count} linhas idênticas agrupadas; disponibilidades somadas.`;
        if (row.resourceId && resourceIdCounts.get(row.resourceId) === 1) {
          window.resourceAllocations.getResourceAllocations(row.resourceId).forEach(allocation => {
            const detail = body.insertRow();
            detail.className = "resource-allocation-detail";
            const label = detail.insertCell();
            label.colSpan = visibleFields.size;
            label.textContent = `↳ ${allocation.taskName}`;
            data.weeks.forEach(week => {
              const available = detail.insertCell();
              available.className = "resource-week-value";
              available.textContent = "—";
              const cell = detail.insertCell();
              cell.className = "resource-week-value";
              const amount = allocation.weeks.get(week.number);
              if (amount) showWeeklyHours(cell, amount);
              else cell.textContent = "—";
              if (amount) {
                cell.classList.add("resource-reversal");
                cell.tabIndex = 0;
                cell.setAttribute("role", "button");
                cell.dataset.resourceId = row.resourceId;
                cell.dataset.taskId = allocation.taskId;
                cell.dataset.week = week.number;
                cell.dataset.label = `${row.values[0]} · ${allocation.taskName}`;
                addCellTitle(cell, "Duplo clique para estornar as horas desta atividade.");
                cell.setAttribute("aria-label", `Estornar ${window.resourceAllocations.formatHours(amount)} HH de ${allocation.taskName}, semana ${week.number}.`);
                inspectProgrammed(cell, amount, [row], [week], allocation.taskId);
              }
            });
            appendTotals(detail, [row], [row], allocation);
          });
        }
        });
      });
      if (!visible.length) {
        const cell = body.insertRow().insertCell();
        cell.colSpan = visibleFields.size + (data.weeks.length + 1) * 2;
        cell.className = "resource-empty";
        cell.textContent = "Nenhum recurso para exibir.";
      } else {
        const totalRow = body.insertRow();
        totalRow.className = "resource-grand-total";
        const label = totalRow.insertCell();
        label.colSpan = visibleFields.size;
        label.textContent = `TOTAL (${teams.size} Eq. · ${visible.length} Func.)`;
        label.title = `Total: ${teams.size} ${teams.size === 1 ? "equipe" : "equipes"} · ${visible.length} ${visible.length === 1 ? "funcionário" : "funcionários"}`;
        const eligible = visible.filter(row => row.resourceId && resourceIdCounts.get(row.resourceId) === 1);
        data.weeks.forEach(week => appendTotals(totalRow, visible, eligible, null, [week], true));
        appendTotals(totalRow, visible, eligible, null, data.weeks, true);
      }
      const ambiguous = data.rows.filter(row => !row.resourceId || resourceIdCounts.get(row.resourceId) !== 1).length;
      tableStatus.textContent = [
        ambiguous ? `${ambiguous} recurso(s) sem identificação única não podem receber alocações.` : "",
        data.missingValues ? `${data.missingValues} valores de fórmulas indisponíveis ou com erro; recalcule e salve a planilha no Excel.` : ""
      ].filter(Boolean).join(" ");
      tableStatus.classList.toggle("is-error", data.missingValues > 0 || ambiguous > 0);
    }
    updateFieldVisibility = () => {
      filters.forEach((filter, index) => {
        const hidden = !visibleFields.has(resourceFields[index].aliases[0]);
        filter.closest("th").hidden = hidden;
        if (hidden) filter.value = "";
      });
      renderRows();
    };
    window.resourceAllocations.setResourceRenderer(renderRows);
    window.resourceAllocations.refresh();
  }

  function renderWorkbook() {
    if (!savedWorkbook) {
      setStatus("Nenhuma planilha de recursos carregada.");
      renderResourceTable(null);
      return;
    }
    setStatus("");
    renderResourceTable(savedWorkbook.bytes);
  }

  async function importWorkbook(file) {
    busy = true;
    updateButtons();
    setStatus("Lendo e armazenando a planilha...");
    try {
      if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error("Selecione um arquivo XLSX ou XLS.");
      const bytes = await file.arrayBuffer();
      const signature = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
      const isXlsx = signature[0] === 0x50 && signature[1] === 0x4b;
      const isXls = signature[0] === 0xd0 && signature[1] === 0xcf && signature[2] === 0x11 && signature[3] === 0xe0;
      if (!isXlsx && !isXls) throw new Error("O arquivo não é uma planilha Excel válida.");
      const sheets = inspectWorkbook(bytes);
      const nextWorkbook = { name: file.name, type: file.type, bytes, sheets };
      await accessWorkbook("readwrite", nextWorkbook);
      savedWorkbook = nextWorkbook;
      renderWorkbook();
    } catch (error) {
      console.error("Não foi possível carregar a tabela de recursos.", error);
      const previous = savedWorkbook ? " A planilha anteriormente salva permanece disponível." : "";
      setStatus(`Não foi possível carregar a planilha: ${error.message || "erro de leitura ou armazenamento"}${previous}`, true);
    } finally {
      busy = false;
      updateButtons();
    }
  }

  importButton.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const file = input.files[0];
    input.value = "";
    if (file) importWorkbook(file);
  });
  exportButton.addEventListener("click", () => {
    try {
      const url = URL.createObjectURL(new Blob([savedWorkbook.bytes], { type: savedWorkbook.type || "application/octet-stream" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = savedWorkbook.name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      console.error("Não foi possível exportar a tabela de recursos.", error);
      setStatus("Não foi possível exportar a planilha original.", true);
    }
  });

  accessWorkbook("readonly").then(value => {
    savedWorkbook = value || null;
    renderWorkbook();
  }).catch(error => {
    console.error("Não foi possível recuperar a tabela de recursos.", error);
    setStatus("Não foi possível acessar a planilha armazenada neste navegador.", true);
  }).finally(() => {
    busy = false;
    updateButtons();
  });
})();
