(() => {
  "use strict";

  const KEY = "usina-resource-allocations-v1";
  const SCALE = 1000000;
  const hint = document.getElementById("allocationHint");
  const modal = document.getElementById("allocationModal");
  const amountInput = document.getElementById("allocationAmount");
  const details = document.getElementById("allocationDetails");
  const overflow = document.getElementById("allocationOverflow");
  const errorElement = document.getElementById("allocationError");
  const list = document.getElementById("allocationsList");
  const listError = document.getElementById("allocationsError");
  const reversalModal = document.getElementById("reversalModal");
  const reversalDetails = document.getElementById("reversalDetails");
  const reversalList = document.getElementById("reversalList");
  const reversalTotal = document.getElementById("reversalTotal");
  const reversalError = document.getElementById("reversalError");
  const reversalConfirm = document.getElementById("reversalConfirm");
  const batchSelect = document.getElementById("selectFilteredHours");
  const batchModal = document.getElementById("batchAllocationModal");
  const batchDetails = document.getElementById("batchAllocationDetails");
  const batchOverflow = document.getElementById("batchAllocationOverflow");
  const batchPreview = document.getElementById("batchAllocationPreview");
  const batchError = document.getElementById("batchAllocationError");
  let resourceData = null;
  let resourceRenderer = () => {};
  let selectedTask = null;
  let selectedBatch = null;
  let batchTarget = null;
  let target = null;
  let allocations = [];
  let storedValue = null;
  let storageError = "";
  let reversalTarget = null;
  let clickTimer = null;
  let revision = 0;

  const units = value => Math.round(Number(value) * SCALE);
  const hours = value => value / SCALE;
  const formatHours = value => Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 6 });
  const records = () => window.maintenanceSchedule ? window.maintenanceSchedule.getRecords() : [];
  const amountFor = (resourceId, week) => allocations.reduce((sum, item) =>
    sum + (item.resourceId === resourceId && item.week === week ? item.units : 0), 0);
  const taskAmount = taskId => allocations.reduce((sum, item) => sum + (item.taskId === taskId ? item.units : 0), 0);

  function load() {
    revision++;
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw === null ? [] : JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.some(item => !item || typeof item.id !== "string" ||
          typeof item.taskId !== "string" || typeof item.resourceId !== "string" || !item.resourceId ||
          !Number.isSafeInteger(item.week) || item.week < 1 || !Number.isSafeInteger(item.units) || item.units <= 0 ||
          typeof item.resourceName !== "string" || typeof item.matricula !== "string" || typeof item.taskName !== "string" ||
          (item.returnedToBalance !== undefined && typeof item.returnedToBalance !== "boolean")) ||
          new Set(parsed.map(item => item.id)).size !== parsed.length) {
        throw new Error("Dados de alocação inválidos.");
      }
      storedValue = raw;
      allocations = parsed;
      storageError = "";
    } catch (error) {
      console.error("Não foi possível recuperar as alocações.", error);
      storageError = "Não foi possível recuperar as alocações. Nenhuma alteração será salva; verifique os dados do navegador.";
    }
  }

  function save(next) {
    if (storageError) throw new Error(storageError);
    if (localStorage.getItem(KEY) !== storedValue) {
      load();
      refresh();
      throw new Error("As alocações foram alteradas em outra aba. Confira os valores e tente novamente.");
    }
    const raw = JSON.stringify(next);
    localStorage.setItem(KEY, raw);
    storedValue = raw;
    allocations = next;
    revision++;
  }

  function rowFor(id) {
    if (!resourceData || !id) return null;
    const matches = resourceData.rows.filter(row => row.resourceId === id);
    return matches.length === 1 ? matches[0] : null;
  }

  function capacity(row, week) {
    const index = resourceData.weeks.findIndex(item => item.number === week);
    return index < 0 || row.availability[index] === null ? null : units(row.availability[index]);
  }

  function taskBalance(record) {
    const total = units(record.hhPrev);
    if (!Number.isSafeInteger(total) || total < 0) return 0;
    return Math.max(0, total - taskAmount(record.id));
  }

  function warnings() {
    if (storageError) return storageError;
    const tasks = records();
    const problems = allocations.filter(item => {
      const row = rowFor(item.resourceId);
      const task = tasks.find(record => record.id === item.taskId);
      const available = row && capacity(row, item.week);
      return !task || !row || available === null || amountFor(item.resourceId, item.week) > available ||
        taskAmount(item.taskId) > units(task.hhPrev);
    });
    return problems.length ? `${problems.length} alocação(ões) incompatível(is) com o planejamento ou a disponibilidade atual. Confira em Gerenciar alocações.` : "";
  }

  function refresh() {
    const message = warnings();
    hint.textContent = message || "Arraste o saldo de HH Prev. para uma célula P, ou selecione o saldo e clique em P.";
    hint.classList.toggle("resource-allocation-error", Boolean(message));
    resourceRenderer();
    window.dispatchEvent(new Event("resource-allocations-changed"));
  }

  function parseAmount() {
    const value = amountInput.value.trim().replace(",", ".");
    if (!/^\d+(?:\.\d{1,6})?$/.test(value)) return null;
    const result = units(value);
    return Number.isSafeInteger(result) && result > 0 ? result : null;
  }

  function targetInfo() {
    const task = records().find(item => item.id === target.taskId);
    if (!task) throw new Error("A atividade não está mais disponível no planejamento.");
    const members = target.resourceIds.map(rowFor);
    if (members.some(row => !row)) throw new Error("A identificação está vazia, ambígua ou não está mais disponível na planilha.");
    if (!target.team && capacity(members[0], target.week) === null) throw new Error("A semana não possui HH disponível válida. Recalcule e salve a planilha.");
    const free = capacities(members, target.week);
    if (!target.team && free.overloaded) throw new Error("A programação atual excede a disponibilidade. Corrija as alocações antes de continuar.");
    return { task, members, free: free.total, partial: free.partial || target.partial, balance: taskBalance(task) };
  }

  function capacities(members, week) {
    let total = 0, partial = false, overloaded = false;
    const entries = members.map(row => {
      const available = capacity(row, week);
      if (available === null) { partial = true; return { row, free: 0 }; }
      const weekIndex = resourceData.weeks.findIndex(item => item.number === week);
      if (row.availabilityPartial[weekIndex]) partial = true;
      const programmed = amountFor(row.resourceId, week);
      if (programmed > available) { overloaded = true; partial = true; return { row, free: 0 }; }
      const free = available - programmed;
      total += free;
      return { row, free };
    });
    if (!Number.isSafeInteger(total)) throw new Error("Capacidade total excede o limite suportado.");
    return { entries, total, partial, overloaded };
  }

  function distribute(entries, amount, total) {
    if (!amount) return [];
    const amountBig = BigInt(amount), totalBig = BigInt(total);
    const shares = entries.filter(entry => entry.free > 0).map(entry => {
      const product = amountBig * BigInt(entry.free);
      return { row: entry.row, units: Number(product / totalBig), remainder: product % totalBig };
    });
    let remaining = amount - shares.reduce((sum, share) => sum + share.units, 0);
    shares.sort((a, b) => a.remainder === b.remainder ? 0 : a.remainder > b.remainder ? -1 : 1);
    for (const share of shares) {
      if (!remaining) break;
      share.units++;
      remaining--;
    }
    return shares.filter(share => share.units > 0);
  }

  function filteredBatch() {
    const filtered = [...document.querySelectorAll("[data-workload-filter]")].some(input =>
      input.dataset.workloadFilter !== "hhPrev" && input.value);
    if (!filtered || storageError) return [];
    const tasks = new Map(records().map(task => [task.id, task]));
    return [...document.querySelectorAll("#resourceWorkloadRows .resource-workload-value[data-can-allocate='true']")]
      .map(button => tasks.get(button.dataset.taskId)).filter(Boolean)
      .map(task => ({ id: task.id, balance: taskBalance(task) }));
  }

  function selectBatch() {
    const tasks = filteredBatch();
    if (!tasks.length) return showMessage("Aplique um filtro e selecione atividades com saldo para programar.", true);
    const total = tasks.reduce((sum, task) => sum + task.balance, 0);
    if (!Number.isSafeInteger(total)) {
      selectedBatch = null;
      window.resourceAllocations.syncWorkloadSelection();
      return showMessage("O total de HH excede o limite suportado.", true);
    }
    selectedBatch = tasks;
    selectedTask = null;
    window.resourceAllocations.syncWorkloadSelection();
    showMessage(`${tasks.length} atividade(s) selecionada(s) · ${formatHours(hours(total))} HH no saldo. Arraste ou clique em uma equipe para programar.`);
  }

  function batchPlan(scope, useFollowingWeeks) {
    if (storageError) throw new Error(storageError);
    if (!resourceData || resourceData !== scope.data) throw new Error("A planilha de recursos foi alterada. Selecione novamente a equipe.");
    if (storedValue !== scope.storedValue || localStorage.getItem(KEY) !== scope.storedValue) {
      if (localStorage.getItem(KEY) !== storedValue) { load(); refresh(); }
      throw new Error("As alocações mudaram. Feche a janela e selecione novamente.");
    }
    if (JSON.stringify(filteredBatch()) !== JSON.stringify(scope.tasks)) throw new Error("O filtro, a ordem ou os saldos das atividades mudaram. Feche a janela e selecione novamente.");
    const currentTeam = [...table.querySelectorAll(".resource-team-target")].find(cell =>
      cell.dataset.label === scope.label && cell.dataset.resourceIds === JSON.stringify(scope.resourceIds));
    if (!currentTeam || currentTeam.dataset.partial !== String(scope.partial)) throw new Error("A equipe ou seus filtros mudaram. Feche a janela e selecione novamente.");
    const members = scope.resourceIds.map(rowFor);
    if (!members.length || members.some(row => !row)) throw new Error("A equipe não possui recursos com identificação única disponíveis.");
    const weeks = [...resourceData.weeks].sort((a, b) => a.number - b.number);
    if (!weeks.length) throw new Error("A planilha não possui semanas disponíveis.");
    const availability = weeks.map(week => ({ week: week.number, ...capacities(members, week.number) }));
    let total = 0;
    scope.tasks.forEach(task => {
      total += task.balance;
      if (!Number.isSafeInteger(total)) throw new Error("O total de HH excede o limite suportado.");
    });
    const firstFree = availability[0].total;
    const selectedWeeks = useFollowingWeeks ? availability : availability.slice(0, 1);
    const tasks = new Map(records().map(record => [record.id, record]));
    const results = scope.tasks.map(source => {
      const task = tasks.get(source.id);
      if (!task) throw new Error("Uma atividade não existe mais no planejamento.");
      let remaining = source.balance;
      const shares = [];
      selectedWeeks.forEach(week => {
        const available = week.entries.reduce((sum, entry) => sum + entry.free, 0);
        const amount = Math.min(remaining, available);
        if (!amount) return;
        distribute(week.entries, amount, available).forEach(share => {
          week.entries.find(entry => entry.row.resourceId === share.row.resourceId).free -= share.units;
          shares.push({ resourceId: share.row.resourceId, resourceName: share.row.values[0], matricula: share.row.matricula, week: week.week, units: share.units });
        });
        remaining -= amount;
      });
      return { id: task.id, taskName: [task.setor, task.area, task.familia, task.atividade].filter(Boolean).join(" · "), balance: source.balance, remaining, shares };
    });
    const remaining = results.reduce((sum, item) => sum + item.remaining, 0);
    return { total, remaining, firstWeek: availability[0].week, firstFree, partial: scope.partial || selectedWeeks.some(week => week.partial), results };
  }

  function renderBatchPreview() {
    try {
      if (!batchTarget) throw new Error("Selecione novamente a equipe.");
      const first = batchPlan(batchTarget, false);
      batchOverflow.hidden = first.total <= first.firstFree;
      const choice = batchModal.querySelector('input[name="batchAllocationSplit"]:checked');
      const plan = batchPlan(batchTarget, !batchOverflow.hidden && choice?.value === "yes");
      batchDetails.textContent = `${batchTarget.label} · ${plan.results.length} atividade(s) · ${formatHours(hours(plan.total))} HH · capacidade livre na S${String(plan.firstWeek).padStart(2, "0")}: ${formatHours(hours(plan.firstFree))} HH${plan.partial ? " (disponibilidade parcial; apenas recursos e valores identificados serão usados)" : ""}. Prioridade: ordem exibida na carga de trabalho.`;
      batchPreview.replaceChildren();
      if (!batchOverflow.hidden && !choice) {
        batchPreview.textContent = "Escolha como tratar a diferença para visualizar a distribuição.";
      } else {
        const summary = document.createElement("p");
        summary.textContent = `Programar: ${formatHours(hours(plan.total - plan.remaining))} HH · Permanecer no saldo: ${formatHours(hours(plan.remaining))} HH.`;
        batchPreview.append(summary);
        plan.results.forEach(item => {
          const entry = document.createElement("div");
          entry.className = "allocation-entry";
          const byWeek = new Map();
          item.shares.forEach(share => byWeek.set(share.week, (byWeek.get(share.week) || 0) + share.units));
          const distribution = [...byWeek].map(([week, amount]) => `S${String(week).padStart(2, "0")}: ${formatHours(hours(amount))} HH`).join(" · ");
          entry.textContent = `${item.taskName || item.id} — ${distribution || "sem programação"} · saldo restante: ${formatHours(hours(item.remaining))} HH`;
          batchPreview.append(entry);
        });
      }
      batchTarget.preview = !batchOverflow.hidden && !choice ? null : JSON.stringify(plan);
      batchError.textContent = "";
    } catch (error) {
      batchTarget.preview = null;
      batchError.textContent = error.message || "Não foi possível calcular a programação.";
    }
  }

  function beginBatch(cell) {
    try {
      if (!selectedBatch || JSON.stringify(filteredBatch()) !== JSON.stringify(selectedBatch)) throw new Error("Selecione novamente as atividades filtradas.");
      batchTarget = { label: cell.dataset.label, resourceIds: JSON.parse(cell.dataset.resourceIds), partial: cell.dataset.partial === "true", tasks: selectedBatch, data: resourceData, storedValue };
      batchModal.querySelectorAll('input[name="batchAllocationSplit"]').forEach(input => { input.checked = false; });
      renderBatchPreview();
      if (batchError.textContent) throw new Error(batchError.textContent);
      bootstrap.Modal.getOrCreateInstance(batchModal).show();
    } catch (error) {
      showMessage(error.message || "Não foi possível iniciar a programação em lote.", true);
    }
  }

  function applyBatch() {
    try {
      if (!batchTarget) throw new Error("Selecione novamente a equipe.");
      const choice = batchModal.querySelector('input[name="batchAllocationSplit"]:checked');
      if (!batchOverflow.hidden && !choice) throw new Error("Escolha como tratar a diferença antes de programar.");
      const plan = batchPlan(batchTarget, !batchOverflow.hidden && choice.value === "yes");
      if (JSON.stringify(plan) !== batchTarget.preview) throw new Error("Os dados mudaram. Feche a janela e confira a distribuição novamente.");
      if (plan.total === plan.remaining) throw new Error("Não há capacidade livre nas semanas selecionadas; nenhuma hora foi programada.");
      const next = [...allocations];
      plan.results.forEach(item => item.shares.forEach(share => next.push({
        id: `${Date.now()}-${Array.from(crypto.getRandomValues(new Uint32Array(2))).join("-")}`,
        taskId: item.id, taskName: item.taskName, ...share,
        returnedToBalance: item.remaining > 0
      })));
      save(next);
      selectedBatch = null;
      selectedTask = null;
      refresh();
      bootstrap.Modal.getOrCreateInstance(batchModal).hide();
      showMessage(`${formatHours(hours(plan.total - plan.remaining))} HH programadas. ${formatHours(hours(plan.remaining))} HH permaneceram no saldo das atividades.`);
    } catch (error) {
      console.error("Não foi possível programar as atividades filtradas.", error);
      batchError.textContent = error.message || "Não foi possível salvar as alocações.";
    }
  }

  function updateDialog() {
    errorElement.textContent = "";
    try {
      const info = targetInfo();
      const requested = parseAmount();
      details.textContent = `${target.label} · semana ${target.week} · capacidade livre${info.partial ? " conhecida (parcial)" : ""}: ${formatHours(hours(info.free))} HH · saldo da atividade: ${formatHours(hours(info.balance))} HH.${target.team ? " Distribuição proporcional entre recursos elegíveis do grupo exibido." : ""}`;
      overflow.hidden = requested === null || requested <= info.free;
      if (overflow.hidden) modal.querySelectorAll('input[name="allocationSplit"]').forEach(input => { input.checked = false; });
    } catch (error) {
      errorElement.textContent = error.message;
      overflow.hidden = true;
    }
  }

  function begin(taskId, cell) {
    if (storageError) return showMessage(storageError, true);
    try {
      const team = cell.dataset.team === "true";
      target = {
        taskId, team, week: Number(cell.dataset.week),
        resourceIds: team ? JSON.parse(cell.dataset.resourceIds) : [cell.dataset.resourceId],
        label: cell.dataset.label,
        partial: cell.dataset.partial === "true"
      };
      const info = targetInfo();
      if (!info.balance) throw new Error("A atividade não possui saldo disponível.");
      amountInput.value = String(hours(info.balance)).replace(".", ",");
      modal.querySelectorAll('input[name="allocationSplit"]').forEach(input => { input.checked = false; });
      updateDialog();
      bootstrap.Modal.getOrCreateInstance(modal).show();
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  function showMessage(message, isError = false) {
    const warning = warnings();
    hint.textContent = warning ? `${message} ${warning}` : message;
    hint.classList.toggle("resource-allocation-error", isError || Boolean(warning));
  }

  function apply() {
    try {
      if (storageError) throw new Error(storageError);
      const info = targetInfo();
      const requested = parseAmount();
      if (requested === null) throw new Error("Informe um valor positivo com até seis casas decimais.");
      if (requested > info.balance) throw new Error("O valor informado é maior que o saldo da atividade.");
      const split = modal.querySelector('input[name="allocationSplit"]:checked');
      if (requested > info.free && !split) {
        overflow.hidden = false;
        throw new Error("Escolha se deseja distribuir a diferença para a semana seguinte.");
      }
      const first = Math.min(requested, info.free);
      let second = 0;
      if (requested > first && split && split.value === "yes") {
        const nextCapacities = capacities(info.members, target.week + 1);
        second = Math.min(requested - first, nextCapacities.total);
      }
      if (!first && !second) throw new Error("Não há capacidade livre nas semanas selecionadas; nenhuma hora foi programada.");
      const create = (row, week, value) => ({
        id: `${Date.now()}-${Array.from(crypto.getRandomValues(new Uint32Array(2))).join("-")}`,
        taskId: info.task.id, taskName: [info.task.setor, info.task.area, info.task.familia, info.task.atividade].filter(Boolean).join(" · "),
        resourceId: row.resourceId, resourceName: row.values[0], matricula: row.matricula, week, units: value,
        returnedToBalance: requested > info.free && split && split.value === "no"
      });
      const next = [...allocations];
      [target.week, target.week + 1].forEach((week, index) => {
        const value = index === 0 ? first : second;
        if (!value) return;
        const available = capacities(info.members, week);
        distribute(available.entries, value, available.total).forEach(share => next.push(create(share.row, week, share.units)));
      });
      save(next);
      selectedTask = null;
      refresh();
      bootstrap.Modal.getOrCreateInstance(modal).hide();
      const remainder = requested - first - second;
      showMessage(`${formatHours(hours(first + second))} HH programadas.${remainder ? ` ${formatHours(hours(remainder))} HH permaneceram no saldo da atividade.` : ""}`);
    } catch (error) {
      console.error("Não foi possível programar as horas.", error);
      errorElement.textContent = error.message || "Não foi possível salvar as alocações.";
    }
  }

  function renderList() {
    list.replaceChildren();
    listError.textContent = storageError;
    const tasks = records();
    if (!allocations.length) {
      list.textContent = "Nenhuma alocação programada.";
      return;
    }
    allocations.forEach(item => {
      const row = rowFor(item.resourceId);
      const task = tasks.find(record => record.id === item.taskId);
      const available = row && capacity(row, item.week);
      const invalid = !task || !row || available === null || amountFor(item.resourceId, item.week) > available || taskAmount(item.taskId) > units(task.hhPrev);
      const entry = document.createElement("div");
      entry.className = "allocation-entry";
      const text = document.createElement("span");
      text.textContent = `${item.taskName || item.taskId} → ${item.resourceName} (matrícula ${item.matricula}), S${String(item.week).padStart(2, "0")}: ${formatHours(hours(item.units))} HH${invalid ? " — incompatível com os dados atuais" : ""}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn-light action-button";
      remove.textContent = "Remover";
      remove.setAttribute("aria-label", `Remover alocação: ${text.textContent}`);
      remove.addEventListener("click", () => {
        if (!confirm("Remover esta alocação e devolver as horas ao saldo da atividade?")) return;
        try {
          save(allocations.filter(allocation => allocation.id !== item.id));
          refresh();
          renderList();
        } catch (error) {
          console.error("Não foi possível remover a alocação.", error);
          listError.textContent = error.message || "Não foi possível salvar a alteração.";
        }
      });
      entry.append(text, remove);
      list.append(entry);
    });
  }

  document.getElementById("resourceWorkloadRows").addEventListener("click", event => {
    const button = event.target.closest(".resource-workload-value");
    if (!button || button.disabled || button.dataset.canAllocate !== "true") return;
    selectedBatch = null;
    batchSelect.classList.remove("is-selected");
    selectedTask = button.dataset.taskId;
    document.querySelectorAll(".resource-workload-value").forEach(item => item.classList.toggle("is-selected", item === button));
    showMessage("Atividade selecionada. Clique em uma célula P para programar as horas.");
  });
  document.getElementById("resourceWorkloadRows").addEventListener("dragstart", event => {
    const button = event.target.closest(".resource-workload-value");
    if (!button || button.disabled || button.dataset.canAllocate !== "true") return;
    selectedBatch = null;
    batchSelect.classList.remove("is-selected");
    selectedTask = button.dataset.taskId;
    event.dataTransfer.setData("text/plain", selectedTask);
    event.dataTransfer.effectAllowed = "copy";
  });
  const table = document.getElementById("resourceTable");
  batchSelect.addEventListener("click", selectBatch);
  batchSelect.addEventListener("dragstart", event => {
    selectBatch();
    if (!selectedBatch) return event.preventDefault();
    event.dataTransfer.setData("text/plain", "usina-filtered-batch");
    event.dataTransfer.effectAllowed = "copy";
  });
  batchModal.querySelectorAll('input[name="batchAllocationSplit"]').forEach(input => input.addEventListener("change", renderBatchPreview));
  document.getElementById("batchAllocationApply").addEventListener("click", applyBatch);
  batchModal.addEventListener("hide.bs.modal", () => {
    if (batchModal.contains(document.activeElement)) document.activeElement.blur();
  });
  function matchingReversals(scope) {
    return allocations.filter(item => scope.taskOnly
      ? item.taskId === scope.taskId
      : (scope.weeks ? scope.weeks.includes(item.week) : item.week === scope.week) &&
        scope.resourceIds.includes(item.resourceId) && (!scope.taskId || item.taskId === scope.taskId));
  }
  function updateReversalTotal() {
    const selected = [...reversalList.querySelectorAll('input[type="checkbox"]:checked')];
    const total = selected.reduce((sum, input) => sum + Number(input.dataset.units), 0);
    reversalTotal.textContent = `${selected.length} alocação(ões) selecionada(s): ${formatHours(hours(total))} HH a estornar.`;
    reversalError.textContent = "";
  }
  function openReversal(cell, taskOnly = false) {
    if (storageError) return showMessage(storageError, true);
    const scope = taskOnly ? {
      taskOnly: true,
      taskId: cell.dataset.taskId,
      label: records().find(record => record.id === cell.dataset.taskId)?.atividade || cell.dataset.taskId
    } : {
      week: Number(cell.dataset.week),
      weeks: cell.dataset.weeks ? JSON.parse(cell.dataset.weeks) : null,
      resourceIds: cell.dataset.team === "true" ? JSON.parse(cell.dataset.resourceIds) : [cell.dataset.resourceId],
      taskId: cell.dataset.taskId || "",
      label: cell.dataset.label
    };
    const matches = matchingReversals(scope);
    if (!matches.length) return showMessage(taskOnly ? "Não há horas programadas nesta atividade para estornar." : "Não há horas programadas nesta célula para estornar.", true);
    const tasks = new Map(records().map(record => [record.id, record]));
    if (matches.some(item => !tasks.has(item.taskId))) {
      return showMessage("Não é possível devolver horas: uma atividade vinculada não existe mais no planejamento. Confira em Gerenciar alocações.", true);
    }
    reversalTarget = { ...scope, ids: matches.map(item => item.id).sort(), storedValue };
    reversalDetails.textContent = matches.length > 1
      ? "Selecione as alocações que deseja estornar. As horas retornarão ao saldo das respectivas atividades."
      : "Confirme o estorno da alocação abaixo. As horas retornarão ao saldo da atividade.";
    reversalList.replaceChildren();
    matches.forEach(item => {
      const task = tasks.get(item.taskId);
      const entry = document.createElement("label");
      entry.className = "reversal-entry";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "form-check-input";
      checkbox.value = item.id;
      checkbox.dataset.units = item.units;
      checkbox.checked = true;
      const text = document.createElement("span");
      text.className = "reversal-entry-text";
      const allocation = document.createElement("strong");
      allocation.textContent = `${formatHours(hours(item.units))} HH · ${item.resourceName || "Recurso não informado"} · matrícula ${item.matricula || "não informada"} · S${String(item.week).padStart(2, "0")}`;
      const workload = document.createElement("span");
      workload.textContent = `Setor: ${task.setor || "—"} · Área: ${task.area || "—"} · Família: ${task.familia || "—"} · Equipe: ${task.equipe || "—"} · Atividade: ${task.atividade || "—"} · HH Prev. (saldo): ${formatHours(hours(taskBalance(task)))}`;
      text.append(allocation, workload);
      entry.append(checkbox, text);
      reversalList.append(entry);
    });
    updateReversalTotal();
    reversalError.textContent = "";
    bootstrap.Modal.getOrCreateInstance(reversalModal).show();
  }
  reversalModal.addEventListener("show.bs.modal", () => { reversalConfirm.disabled = true; });
  reversalModal.addEventListener("shown.bs.modal", () => { reversalConfirm.disabled = false; });
  reversalList.addEventListener("change", updateReversalTotal);
  reversalConfirm.addEventListener("click", () => {
    try {
      if (!reversalTarget) throw new Error("Selecione novamente a célula a estornar.");
      if (storedValue !== reversalTarget.storedValue || localStorage.getItem(KEY) !== reversalTarget.storedValue) {
        throw new Error("As alocações mudaram. Feche a janela e confira os valores antes de tentar novamente.");
      }
      const current = matchingReversals(reversalTarget);
      if (JSON.stringify(current.map(item => item.id).sort()) !== JSON.stringify(reversalTarget.ids)) {
        throw new Error("As alocações disponíveis mudaram. Feche a janela e confira os valores antes de tentar novamente.");
      }
      const ids = new Set([...reversalList.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value));
      if (!ids.size) throw new Error("Selecione ao menos uma alocação para estornar.");
      if ([...ids].some(id => !reversalTarget.ids.includes(id))) throw new Error("Seleção inválida. Feche a janela e tente novamente.");
      const selected = current.filter(item => ids.has(item.id));
      const taskIds = new Set(records().map(record => record.id));
      if (selected.some(item => !taskIds.has(item.taskId))) throw new Error("Uma atividade vinculada não existe mais no planejamento; o estorno não foi realizado.");
      const total = selected.reduce((sum, item) => sum + item.units, 0);
      save(allocations.filter(item => !ids.has(item.id)));
      selectedTask = null;
      refresh();
      bootstrap.Modal.getOrCreateInstance(reversalModal).hide();
      showMessage(`${formatHours(hours(total))} HH estornadas para o saldo das atividades.`);
    } catch (error) {
      console.error("Não foi possível estornar as horas.", error);
      reversalError.textContent = error.message || "Não foi possível salvar o estorno.";
    }
  });
  reversalModal.addEventListener("hide.bs.modal", () => {
    if (reversalModal.contains(document.activeElement)) document.activeElement.blur();
  });
  document.getElementById("resourceWorkloadRows").addEventListener("dblclick", event => {
    const button = event.target.closest(".resource-workload-value");
    if (button && !button.disabled) openReversal(button, true);
  });
  document.getElementById("resourceWorkloadRows").addEventListener("keydown", event => {
    const button = event.target.closest(".resource-workload-value");
    if (button && !button.disabled && button.dataset.canAllocate !== "true" && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openReversal(button, true);
    }
  });
  table.addEventListener("dragover", event => {
    if (event.target.closest(".resource-team-target") && selectedBatch) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      return;
    }
    if (event.target.closest(".resource-programmed") && selectedTask) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  });
  table.addEventListener("drop", event => {
    const team = event.target.closest(".resource-team-target");
    if (team && selectedBatch) {
      event.preventDefault();
      if (event.dataTransfer.getData("text/plain") === "usina-filtered-batch") beginBatch(team);
      return;
    }
    const cell = event.target.closest(".resource-programmed");
    if (!cell || !selectedTask) return;
    event.preventDefault();
    if (event.dataTransfer.getData("text/plain") !== selectedTask) return;
    begin(selectedTask, cell);
  });
  function clickCell(event) {
    const cell = event.target.closest(".resource-programmed");
    if (!cell) return;
    if (!selectedTask) return showMessage("Selecione primeiro o saldo de uma atividade.", true);
    begin(selectedTask, cell);
  }
  table.addEventListener("click", event => {
    const team = event.target.closest(".resource-team-target");
    if (team && selectedBatch && !event.target.closest(".resource-team-toggle")) {
      beginBatch(team);
      return;
    }
    const cell = event.target.closest(".resource-programmed");
    if (!cell) return;
    if (event.detail > 1) return;
    if (cell.textContent !== "—" && cell.textContent !== "!") {
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => { if (cell.isConnected) clickCell(event); }, 500);
    } else clickCell(event);
  });
  table.addEventListener("dblclick", event => {
    const cell = event.target.closest(".resource-programmed, .resource-reversal");
    if (!cell) return;
    clearTimeout(clickTimer);
    openReversal(cell);
  });
  table.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      const team = event.target.closest(".resource-team-target");
      if (team && event.target === team && selectedBatch) { event.preventDefault(); beginBatch(team); return; }
      if (event.target.closest(".resource-reversal")) { event.preventDefault(); openReversal(event.target.closest(".resource-reversal")); return; }
      if (event.target.closest(".resource-programmed")) { event.preventDefault(); clickCell(event); }
    }
  });
  amountInput.addEventListener("input", updateDialog);
  document.getElementById("allocationApply").addEventListener("click", apply);
  document.getElementById("allocationsModal").addEventListener("show.bs.modal", renderList);
  modal.addEventListener("hide.bs.modal", () => {
    if (modal.contains(document.activeElement)) document.activeElement.blur();
  });
  modal.addEventListener("hidden.bs.modal", () => {
    const cell = [...table.querySelectorAll(".resource-programmed")].find(item =>
      target && (target.team ? item.dataset.team === "true" && item.dataset.label === target.label : item.dataset.resourceId === target.resourceIds[0]) && Number(item.dataset.week) === target.week);
    if (cell) cell.focus();
  });
  window.addEventListener("storage", event => {
    if (event.key === KEY || event.key === null) { load(); refresh(); }
  });
  load();
  window.resourceAllocations = {
    formatHours,
    syncWorkloadSelection: () => {
      const buttons = [...document.querySelectorAll(".resource-workload-value")];
      const batch = filteredBatch();
      batchSelect.disabled = !batch.length;
      if (selectedBatch && JSON.stringify(batch) !== JSON.stringify(selectedBatch)) selectedBatch = null;
      batchSelect.classList.toggle("is-selected", Boolean(selectedBatch));
      const selected = buttons.find(button => button.dataset.taskId === selectedTask && !button.disabled && button.dataset.canAllocate === "true");
      if (!selected && selectedTask) {
        selectedTask = null;
        showMessage("Selecione uma atividade visível para programar as horas.");
      }
      buttons.forEach(button => button.classList.toggle("is-selected", button === selected || Boolean(selectedBatch && selectedBatch.some(task => task.id === button.dataset.taskId))));
    },
    getBalance: record => hours(taskBalance(record)),
    hasReturnedBalance: taskId => allocations.some(item => item.taskId === taskId && item.returnedToBalance === true),
    getAllocatedHours: taskId => {
      if (storageError) return null;
      const allocated = taskAmount(taskId);
      return allocated > 0 ? hours(allocated) : null;
    },
    getRevision: () => revision,
    getProgrammed: (resourceId, week) => hours(amountFor(resourceId, week)),
    getTaskIdsForResources: resourceIds => {
      if (storageError) return null;
      const ids = new Set(resourceIds);
      return new Set(allocations.filter(item => ids.has(item.resourceId)).map(item => item.taskId));
    },
    getActivitiesForScope: (resourceIds, weeks, taskId = "") => {
      if (storageError) return null;
      const ids = new Set(resourceIds);
      const weekNumbers = new Set(weeks);
      const tasks = new Map(records().map(task => [task.id, task]));
      const grouped = new Map();
      allocations.forEach(item => {
        if (!ids.has(item.resourceId) || !weekNumbers.has(item.week) || (taskId && item.taskId !== taskId)) return;
        if (!grouped.has(item.taskId)) grouped.set(item.taskId, { task: tasks.get(item.taskId), taskName: item.taskName || item.taskId, units: 0 });
        grouped.get(item.taskId).units += item.units;
      });
      return [...grouped.values()].map(item => ({ ...item, amount: hours(item.units) }));
    },
    getResourceAllocations: resourceId => {
      const tasks = records();
      const grouped = new Map();
      allocations.filter(item => item.resourceId === resourceId).forEach(item => {
        if (!grouped.has(item.taskId)) {
          const task = tasks.find(record => record.id === item.taskId);
          grouped.set(item.taskId, {
            taskId: item.taskId,
            taskName: task ? [task.setor, task.area, task.familia, task.atividade].filter(Boolean).join(" · ") || task.id : `${item.taskName || item.taskId} (atividade não encontrada)`,
            weeks: new Map()
          });
        }
        const weeks = grouped.get(item.taskId).weeks;
        weeks.set(item.week, (weeks.get(item.week) || 0) + item.units);
      });
      return [...grouped.values()].map(item => ({
        ...item,
        weeks: new Map([...item.weeks].map(([week, amount]) => [week, hours(amount)]))
      }));
    },
    isAvailable: () => !storageError,
    setResourceData: data => { resourceData = data; },
    setResourceRenderer: renderer => { resourceRenderer = renderer; },
    refresh
  };
})();
