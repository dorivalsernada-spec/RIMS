(() => {
  const button = document.querySelector("#itss-refresh");
  const progress = document.querySelector("#itss-progress");
  const label = progress.querySelector(".refresh-progress-label");
  const track = progress.querySelector('[role="progressbar"]');
  const value = progress.querySelector(".refresh-progress-value");
  const notice = document.createElement("div");
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");
  notice.hidden = true;
  notice.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:200;max-width:min(420px,90vw);padding:10px 14px;border:1px solid #b42318;border-radius:8px;background:#fff;color:#b42318;font-size:12px;box-shadow:0 4px 14px rgba(0,0,0,.2)";
  document.body.append(notice);

  let startedAt = 0;
  let timer = null;
  let watching = false;

  function display(percent, state, text, message) {
    progress.dataset.state = state;
    progress.title = message || "Estimativa durante a execução; 100% somente após conclusão";
    label.textContent = text;
    track.setAttribute("aria-valuenow", String(percent));
    value.style.width = `${percent}%`;
    notice.hidden = state !== "error";
    notice.textContent = state === "error" ? `ITSS: ${message}` : "";
  }

  async function poll() {
    try {
      const response = await fetch("/api/itss/status", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Não foi possível consultar a execução ITSS.");
      if (result.state === "queued" || result.state === "running") {
        watching = true;
        button.disabled = true;
        if (!startedAt) startedAt = Date.now();
        const estimate = Math.min(95, Math.floor((Date.now() - startedAt) / 60000 * 95));
        display(estimate, "running", `${estimate}%`, result.message);
        timer = window.setTimeout(poll, 1000);
      } else {
        button.disabled = false;
        button.title = "Executar exportação ITSS pelo SAP GUI.";
        startedAt = 0;
        timer = null;
        if (watching && result.state === "done") {
          display(100, "done", "100%", result.message);
          window.dispatchEvent(new Event("itss-updated"));
        }
        if (watching && result.state === "error") display(0, "error", "Falha", result.message);
        if (!watching) display(0, "idle", "0%", result.message);
        watching = false;
      }
    } catch (error) {
      button.disabled = false;
      timer = null;
      watching = false;
      display(0, "error", "Falha", error.message);
    }
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    startedAt = Date.now();
    watching = true;
    display(0, "running", "0%", "Solicitando exportação ITSS.");
    try {
      const response = await fetch("/api/itss/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Não foi possível iniciar a exportação ITSS.");
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(poll, 1000);
    } catch (error) {
      button.disabled = false;
      watching = false;
      display(0, "error", "Falha", error.message);
    }
  });
  poll();
})();
