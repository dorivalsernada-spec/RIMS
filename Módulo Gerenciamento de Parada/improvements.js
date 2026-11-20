(() => {
  "use strict";

  const STORAGE_KEY = "usina-maintenance-schedule-v1-improvements";
  const OUTLINE_FIELDS = ["setor", "area", "conjunto", "equipamento"];
  const FIELDS = [
    { key: "et", label: "ET" },
    { key: "setor", label: "Setor", source: "setor" },
    { key: "area", label: "Área", source: "area" },
    { key: "conjunto", label: "Conjunto", source: "conjunto" },
    { key: "equipamento", label: "Equipamento", source: "equipamento" },
    { key: "responsavel", label: "Responsável", source: "responsavel" },
    { key: "status", label: "Status", options: ["PEN", "AND", "ENC", "CAN"] },
    { key: "prioridade", label: "Prioridade", options: ["Baixa", "Média", "Alta"] },
    { key: "custo", label: "Custo" },
    { key: "observacoes", label: "Observações" }
  ];
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const PROJECT_HEADERS = [...FIELDS.map(field => field.label), "Tipo vínculo ET", "Referência vínculo ET", "Valores vínculo ET"];
  let actions = [];
  let loadFailed = false;
  function notifyLinksChanged() {
    window.dispatchEvent(new Event("improvement-links-changed"));
  }

  function message(text, isError = false) {
    const element = document.getElementById("improvementMessage");
    element.textContent = text;
    element.classList.toggle("is-error", isError);
  }

  function load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === null) return;
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || !parsed.every(action =>
        action && typeof action === "object" &&
        FIELDS.filter(field => !["custo", "et", "area", "equipamento"].includes(field.key)).every(field => typeof action[field.key] === "string") &&
        ["et", "area", "equipamento"].every(field => action[field] === undefined || typeof action[field] === "string") &&
        (action.etLink === undefined || action.etLink === null || (["group", "task"].includes(action.etLink.type) && typeof action.etLink.key === "string")) &&
        (action.etValues === undefined || action.etValues === null || (typeof action.etValues === "object" && OUTLINE_FIELDS.every(field => typeof action.etValues[field] === "string"))) &&
        Number.isSafeInteger(action.custo) && action.custo >= 0
      ) || !Number.isSafeInteger(parsed.reduce((sum, action) => sum + action.custo, 0))) {
        throw new Error("Formato de dados inválido.");
      }
      actions = parsed.map(action => ({ et: "", area: "", equipamento: "", etLink: null, ...action }));
    } catch (error) {
      console.error("Não foi possível carregar as ações de melhoria.", error);
      loadFailed = true;
      message("Não foi possível carregar as ações salvas. Os dados existentes não serão substituídos.", true);
      document.getElementById("addImprovement").disabled = true;
      document.getElementById("exportImprovements").disabled = true;
      document.getElementById("printImprovements").disabled = true;
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(actions));
      message("Alterações salvas neste navegador.");
    } catch (error) {
      console.error("Não foi possível salvar as ações de melhoria.", error);
      message("Não foi possível salvar as ações neste navegador. Verifique o espaço disponível e tente novamente.", true);
    }
  }

  function totalCents() {
    return actions.reduce((sum, action) => sum + action.custo, 0);
  }

  function updateTotal() {
    document.getElementById("improvementTotal").textContent = currency.format(totalCents() / 100);
  }

  function choices(field) {
    return [...new Set(window.maintenanceSchedule.getRecords().map(record => record[field.source]).filter(value => typeof value === "string" && value.trim()))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  function populateSelect(select, field, value) {
    const currentValues = field.source
      ? choices(field)
      : field.options;
    select.replaceChildren(new Option("Selecione", ""));
    currentValues.forEach(option => select.append(new Option(option, option)));
    if (value && !currentValues.includes(value)) {
      select.append(new Option(`${value} (${field.source ? "não está no Gantt" : "opção inválida"})`, value));
    }
    select.value = value;
  }

  function render() {
    if (loadFailed) return;
    const body = document.getElementById("improvementRows");
    body.replaceChildren();
    actions.forEach((action, index) => {
      const row = document.createElement("tr");
      FIELDS.forEach(field => {
        const cell = document.createElement("td");
        let input;
        if (field.source || field.options) {
          input = document.createElement("select");
          populateSelect(input, field, action[field.key]);
        } else if (field.key === "observacoes") {
          input = document.createElement("textarea");
          input.rows = 1;
          input.value = action.observacoes;
        } else if (field.key === "et") {
          input = document.createElement("input");
          input.type = "text";
          input.placeholder = "Ex.: 1.1.1";
          input.value = action.et;
          input.title = "Informe a ET da hierarquia completa, sem filtros.";
        } else {
          input = document.createElement("input");
          input.type = "text";
          input.inputMode = "decimal";
          input.placeholder = "0,00";
          input.value = action.custo ? (action.custo / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
        }
        input.className = "form-control form-control-sm";
        input.setAttribute("aria-label", `${field.label}, ação ${index + 1}`);
        input.dataset.index = index;
        input.dataset.field = field.key;
        cell.append(input);
        row.append(cell);
      });
      const cell = document.createElement("td");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-button subtle-button danger-action";
      remove.setAttribute("aria-label", `Excluir ação ${index + 1}`);
      remove.title = "Excluir ação";
      remove.dataset.remove = index;
      const icon = document.createElement("i");
      icon.className = "fa-regular fa-trash-can";
      remove.append(icon);
      cell.append(remove);
      row.append(cell);
      body.append(row);
    });
    updateTotal();
  }

  function refreshChoices() {
    if (loadFailed) return;
    syncOutlineLinks();
    document.querySelectorAll("#improvementRows select").forEach(select => {
      const field = FIELDS.find(item => item.key === select.dataset.field);
      if (!field.source) return;
      const value = select.value;
      populateSelect(select, field, value);
    });
  }

  function syncOutlineLinks() {
    const items = window.maintenanceSchedule.getOutlineItems();
    let changed = false;
    let missing = false;
    actions.forEach((action, index) => {
      if (!action.etLink) return;
      const item = items.find(candidate => candidate.type === action.etLink.type && candidate.key === action.etLink.key);
      const input = document.querySelector(`#improvementRows input[data-field="et"][data-index="${index}"]`);
      if (!item) {
        missing = true;
        if (input) input.title = "O item vinculado não existe mais no Gantt. Informe uma nova ET.";
        return;
      }
      if (action.et !== item.et) {
        const previousEt = action.et;
        action.et = item.et;
        changed = true;
        if (input && input.validity.valid && input.value === previousEt) input.value = item.et;
      }
      if (action.etValues) {
        OUTLINE_FIELDS.forEach(key => {
          const value = item[key] || "";
          if (action.etValues[key] !== value) {
            if (action[key] === action.etValues[key]) {
              action[key] = value;
              const select = document.querySelector(`#improvementRows select[data-field="${key}"][data-index="${index}"]`);
              if (select) populateSelect(select, FIELDS.find(field => field.key === key), value);
            }
            action.etValues[key] = value;
            changed = true;
          }
        });
      }
      if (input) input.title = "Informe a ET da hierarquia completa, sem filtros.";
    });
    if (changed) save();
    if (missing) message("Uma ou mais ETs vinculadas não existem mais no Gantt. Informe uma nova ET para essas ações.", true);
  }

  function commitEt(input) {
    const action = actions[Number(input.dataset.index)];
    const value = input.value.trim();
    if (value === action.et && action.etLink) {
      const linked = window.maintenanceSchedule.getOutlineItems().some(item => item.type === action.etLink.type && item.key === action.etLink.key);
      if (!linked) {
        input.setCustomValidity("O item vinculado não existe mais. Limpe a ET e informe um novo código.");
        input.reportValidity();
        message("Uma ET vinculada não existe mais no Gantt. Limpe o código e informe uma nova ET.", true);
        return false;
      }
      input.setCustomValidity("");
      if (document.getElementById("improvementMessage").textContent.startsWith("ET não encontrada")) message("");
      return true;
    }
    if (!value) {
      const changed = Boolean(action.et || action.etLink);
      action.et = "";
      action.etLink = null;
      action.etValues = null;
      input.value = "";
      input.setCustomValidity("");
      if (changed) { save(); notifyLinksChanged(); }
      return true;
    }
    const item = window.maintenanceSchedule.getOutlineItems().find(candidate => candidate.et === value);
    if (!item) {
      input.setCustomValidity("ET não encontrada na hierarquia completa do Gantt.");
      input.reportValidity();
      message("ET não encontrada na hierarquia completa do Gantt. Confira o código informado.", true);
      return false;
    }
    action.et = item.et;
    action.etLink = { type: item.type, key: item.key };
    action.etValues = Object.fromEntries(OUTLINE_FIELDS.map(key => [key, item[key] || ""]));
    input.value = item.et;
    input.setCustomValidity("");
    const row = input.closest("tr");
    OUTLINE_FIELDS.forEach(key => {
      action[key] = item[key] || "";
      populateSelect(row.querySelector(`select[data-field="${key}"]`), FIELDS.find(field => field.key === key), action[key]);
    });
    save();
    notifyLinksChanged();
    return true;
  }

  function parseCost(value) {
    const text = value.trim();
    if (!text) return 0;
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text)) return null;
    const [whole, fraction = ""] = text.replace(/\./g, "").split(",");
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    return Number.isSafeInteger(cents) ? cents : null;
  }

  function commitCost(input) {
    const index = Number(input.dataset.index);
    const cents = parseCost(input.value);
    if (cents === null || !Number.isSafeInteger(totalCents() - actions[index].custo + cents)) {
      input.setCustomValidity("Informe um valor válido em reais, por exemplo 1.234,56.");
      input.reportValidity();
      message("Corrija o custo informado antes de continuar.", true);
      return false;
    }
    input.setCustomValidity("");
    const changed = actions[index].custo !== cents;
    actions[index].custo = cents;
    input.value = cents ? (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
    updateTotal();
    if (changed) save();
    return true;
  }

  function exportExcel() {
    if (!commitInputs()) return;
    if (!window.XLSX) {
      message("A biblioteca de Excel não está disponível. Verifique a conexão e tente novamente.", true);
      return;
    }
    try {
      const rows = [FIELDS.map(field => field.label)];
      actions.forEach(action => rows.push(FIELDS.map(field => field.key === "custo" ? action.custo / 100 : action[field.key])));
      rows.push([...Array(8).fill(""), totalCents() / 100, ""]);
      rows[rows.length - 1][0] = "Total geral";
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      sheet["!cols"] = [16, 20, 20, 25, 25, 20, 10, 12, 16, 40].map(wch => ({ wch }));
      for (let row = 2; row <= rows.length; row++) {
        const cell = sheet[`I${row}`];
        if (cell) cell.z = '"R$" #,##0.00';
      }
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Ações de Melhoria");
      XLSX.writeFile(workbook, "acoes-de-melhoria.xlsx");
    } catch (error) {
      console.error("Não foi possível exportar as ações de melhoria.", error);
      message("Não foi possível exportar as ações de melhoria para Excel.", true);
    }
  }

  function commitCosts() {
    return [...document.querySelectorAll('#improvementRows input[data-field="custo"]')].every(commitCost);
  }

  function commitInputs(excludedIndex = null) {
    syncOutlineLinks();
    const inputs = [...document.querySelectorAll('#improvementRows input[data-field="et"]')];
    return inputs.filter(input => Number(input.dataset.index) !== excludedIndex).every(commitEt) && commitCosts();
  }

  function projectSheet(records) {
    if (loadFailed) throw new Error("Não foi possível carregar as ações de melhoria; a exportação foi cancelada.");
    if (!commitInputs()) throw new Error("Corrija os dados das ações de melhoria antes de exportar o projeto.");
    const rows = [PROJECT_HEADERS];
    actions.forEach(action => {
      const link = action.etLink;
      let reference = "";
      if (link?.type === "task") {
        const index = records.findIndex(record => record.id === link.key);
        if (index < 0) throw new Error("Uma ação está vinculada a uma atividade que não existe mais.");
        reference = index + 1;
      } else if (link?.type === "group") reference = link.key;
      rows.push([...FIELDS.map(field => field.key === "custo" ? action.custo / 100 : action[field.key]), link?.type || "", reference, action.etValues ? JSON.stringify(action.etValues) : ""]);
    });
    const total = [...Array(8).fill(""), totalCents() / 100, "", "__TOTAL__", "", ""];
    total[0] = "Total geral";
    rows.push(total);
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = [...[16, 20, 20, 25, 25, 20, 10, 12, 16, 40].map(wch => ({ wch })), ...Array.from({ length: 3 }, () => ({ hidden: true }))];
    for (let row = 2; row <= rows.length; row++) if (sheet[`I${row}`]) sheet[`I${row}`].z = '"R$" #,##0.00';
    return sheet;
  }

  function parseProjectSheet(sheet) {
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
    const header = rows.shift() || [];
    if (!PROJECT_HEADERS.every((name, index) => header[index] === name)) throw new Error("A aba Ações de Melhoria tem um formato inválido para importação do projeto.");
    return rows.filter(row => row.some(value => value !== "") && row[10] !== "__TOTAL__").map((row, index) => {
      const text = column => String(row[column] ?? "");
      const cost = Number(row[8]);
      const cents = Math.round(cost * 100);
      if (typeof row[8] !== "number" || !Number.isFinite(cost) || cost < 0 || !Number.isSafeInteger(cents) || Math.abs(cost * 100 - cents) > 0.00001) throw new Error(`Ações de Melhoria, linha ${index + 2}: custo inválido.`);
      const type = text(10);
      const ref = row[11];
      if (type !== "" && type !== "task" && type !== "group") throw new Error(`Ações de Melhoria, linha ${index + 2}: vínculo ET inválido.`);
      let etValues = null;
      if (text(12)) {
        try { etValues = JSON.parse(text(12)); } catch (error) { throw new Error(`Ações de Melhoria, linha ${index + 2}: dados do vínculo inválidos.`); }
        if (!etValues || typeof etValues !== "object" || !OUTLINE_FIELDS.every(field => typeof etValues[field] === "string")) throw new Error(`Ações de Melhoria, linha ${index + 2}: dados do vínculo inválidos.`);
      }
      if ((type === "task" && (!Number.isInteger(ref) || ref < 1)) || (type === "group" && typeof ref !== "string") || (!type && (ref !== "" || etValues))) throw new Error(`Ações de Melhoria, linha ${index + 2}: referência ET inválida.`);
      if (text(6) && !["PEN", "AND", "ENC", "CAN"].includes(text(6))) throw new Error(`Ações de Melhoria, linha ${index + 2}: status inválido.`);
      if (text(7) && !["Baixa", "Média", "Alta"].includes(text(7))) throw new Error(`Ações de Melhoria, linha ${index + 2}: prioridade inválida.`);
      return { et: text(0), setor: text(1), area: text(2), conjunto: text(3), equipamento: text(4), responsavel: text(5), status: text(6), prioridade: text(7), custo: cents, observacoes: text(9), etLink: type ? { type, key: ref } : null, etValues };
    });
  }

  function prepareProjectImport(importedActions, importedRecords, outlineItems, replace) {
    if (loadFailed) throw new Error("As ações locais não puderam ser carregadas; a importação foi cancelada para evitar perda de dados.");
    if (!commitInputs()) throw new Error("Corrija os dados das ações locais antes de importar o projeto.");
    const mapped = importedActions.map((source, index) => {
      const action = structuredClone(source);
      const link = action.etLink;
      if (link?.type === "task") {
        const record = importedRecords[link.key - 1];
        if (!record) throw new Error(`Ação ${index + 1}: atividade vinculada não encontrada no cronograma importado.`);
        link.key = record.id;
      }
      if (link) {
        const item = outlineItems.find(candidate => candidate.type === link.type && candidate.key === link.key);
        if (!item) throw new Error(`Ação ${index + 1}: item vinculado não encontrado no cronograma importado. Confira o mapeamento dos campos.`);
        action.et = item.et;
      }
      return action;
    });
    const result = replace ? mapped : [...actions, ...mapped];
    if (!Number.isSafeInteger(result.reduce((sum, action) => sum + action.custo, 0))) throw new Error("O custo total das ações importadas excede o limite permitido.");
    return result;
  }

  function applyProjectImport(importedActions) {
    actions = importedActions;
    render();
    refreshChoices();
    notifyLinksChanged();
  }

  function printImprovements() {
    if (!commitInputs()) return;
    const printArea = document.getElementById("improvementPrint");
    const title = document.createElement("h1");
    title.textContent = "Ações de Melhoria";
    const table = document.createElement("table");
    const head = table.createTHead().insertRow();
    FIELDS.forEach(field => {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = field.key === "custo" ? "Custo (R$)" : field.label;
      head.append(th);
    });
    const body = table.createTBody();
    actions.forEach(action => {
      const row = body.insertRow();
      FIELDS.forEach(field => {
        row.insertCell().textContent = field.key === "custo" ? currency.format(action.custo / 100) : action[field.key];
      });
    });
    const foot = table.createTFoot().insertRow();
    const totalLabel = document.createElement("th");
    totalLabel.scope = "row";
    totalLabel.colSpan = 8;
    totalLabel.textContent = "Total geral";
    foot.append(totalLabel);
    foot.insertCell().textContent = currency.format(totalCents() / 100);
    foot.insertCell();
    printArea.replaceChildren(title, table);
    document.body.classList.add("print-improvements");
    try {
      window.print();
    } catch (error) {
      document.body.classList.remove("print-improvements");
      console.error("Não foi possível imprimir as ações de melhoria.", error);
      message("Não foi possível imprimir as ações de melhoria.", true);
    }
  }

  function initialize() {
    load();
    render();
    window.improvementActions = { projectSheet, parseProjectSheet, prepareProjectImport, applyProjectImport, getLinks: () => actions.filter(action => action.etLink).map(action => action.etLink), storageKey: STORAGE_KEY };
    notifyLinksChanged();
    if (!loadFailed) syncOutlineLinks();
    document.getElementById("improvement-tab").addEventListener("shown.bs.tab", refreshChoices);
    document.getElementById("addImprovement").addEventListener("click", () => {
      if (!commitInputs()) return;
      actions.push({ et: "", etLink: null, setor: "", area: "", conjunto: "", equipamento: "", responsavel: "", status: "", prioridade: "", custo: 0, observacoes: "" });
      render();
      save();
    });
    document.getElementById("exportImprovements").addEventListener("click", exportExcel);
    document.getElementById("printImprovements").addEventListener("click", printImprovements);
    window.addEventListener("afterprint", () => document.body.classList.remove("print-improvements"));
    const body = document.getElementById("improvementRows");
    body.addEventListener("input", event => {
      const input = event.target;
      if (input.dataset.field === "observacoes") {
        actions[Number(input.dataset.index)].observacoes = input.value;
        save();
      } else if (input.dataset.field === "custo" || input.dataset.field === "et") {
        input.setCustomValidity("");
      }
    });
    body.addEventListener("change", event => {
      const input = event.target;
      const field = input.dataset.field;
      if (!field || field === "observacoes") return;
      if (field === "custo") {
        commitCost(input);
      } else if (field === "et") {
        commitEt(input);
      } else {
        actions[Number(input.dataset.index)][field] = input.value;
        save();
      }
    });
    body.addEventListener("click", event => {
      const button = event.target.closest("[data-remove]");
      if (!button || !confirm("Excluir esta ação de melhoria?")) return;
      const index = Number(button.dataset.remove);
      if (!commitInputs(index)) return;
      actions.splice(index, 1);
      render();
      save();
      notifyLinksChanged();
    });
  }

  document.addEventListener("DOMContentLoaded", initialize, { once: true });
})();
