(() => {
  const nav = document.querySelector(".page-nav");
  const layout = nav && nav.nextElementSibling;
  if (!nav || !layout || !layout.classList.contains("layout")) {
    console.error("Não foi possível posicionar a barra lateral.");
    return;
  }

  const style = document.createElement("style");
  style.textContent = `
    body.has-decorative-rail {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    .page-with-rail {
      display: grid;
      flex: 1 0 auto;
      grid-template-columns: 30px minmax(0, 1fr);
      grid-template-rows: auto 1fr;
    }
    .decorative-rail {
      box-sizing: border-box;
      position: relative;
      z-index: 10;
      grid-column: 1;
      grid-row: 1 / 3;
      width: 30px;
      padding: 8px 0;
      border-right: 1px solid #e6e9e9;
      background: #fff;
      color: #9da3a2;
    }
    .decorative-rail > svg {
      display: block;
      width: 16px;
      height: 16px;
      margin: 0 auto 10px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .decorative-rail > svg:nth-child(5),
    .decorative-rail > svg:nth-child(6),
    .decorative-rail > svg:nth-child(9),
    .decorative-rail > svg:nth-child(12) {
      box-sizing: content-box;
      padding-bottom: 7px;
      border-bottom: 1px solid #e6e9e9;
    }
    .rail-panel-wrap {
      position: absolute;
      inset: 0 auto 0 100%;
      width: min(220px, calc(100vw - 30px));
      pointer-events: none;
      visibility: hidden;
    }
    .decorative-rail:hover .rail-panel-wrap {
      visibility: visible;
    }
    .rail-panel {
      position: sticky;
      top: 0;
      box-sizing: border-box;
      width: 100%;
      max-height: 100vh;
      overflow-y: auto;
      padding: 16px 16px 20px;
      background: #fff;
      box-shadow: 5px 4px 12px rgb(16 43 70 / 16%);
      pointer-events: auto;
    }
    .rail-panel-section {
      padding: 12px 0 14px;
      border-top: 1px solid #00d1fb;
    }
    .rail-panel-section h2 {
      margin: 0 0 10px;
      color: #00d1fb;
      font: 700 12px/1.2 "Segoe UI", Arial, sans-serif;
    }
    .rail-panel-item {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 30px;
      padding-left: 10px;
      color: #626c75;
      font: 10px/1.3 "Segoe UI", Arial, sans-serif;
    }
    .rail-panel-item svg {
      flex: 0 0 16px;
      width: 16px;
      height: 16px;
      fill: none;
      stroke: #00d1fb;
      stroke-width: 1.7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .page-with-rail > .page-nav,
    .page-with-rail > .layout {
      grid-column: 2;
      min-width: 0;
    }
  `;
  document.head.append(style);

  const icons = [
    '<circle cx="12" cy="12" r="8"/><path d="m8.8 12 2.1 2.1 4.4-4.5"/>',
    '<path d="M4 5h7l9 9-6 6-9-9V5Z"/><circle cx="8" cy="8" r="1"/>',
    '<path d="M6 3h7l5 5v12H6z"/><path d="M13 3v5h5"/>',
    '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15"/>',
    '<path d="M5 5h14v11H9l-4 3z"/><path d="M8 10h.1m3.9 0h.1m3.9 0h.1"/>',
    '<path d="M6 21V4m0 1h11l-2 4 2 4H6"/>',
    '<path d="M6 3h8l4 4v13H6zM14 3v4h4"/><circle cx="10" cy="13" r="2"/><path d="M10 15v2"/>',
    '<rect x="6" y="10" width="12" height="10" rx="2"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>',
    '<path d="m10 14 4-4M8 16l-1 1a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0M16 8l1-1a3 3 0 0 1 4 4l-4 4a3 3 0 0 1-4 0"/>',
    '<path d="M4 7h5m4 0h7M4 17h8m4 0h4"/><circle cx="11" cy="7" r="2"/><circle cx="14" cy="17" r="2"/>',
    '<rect x="7" y="3" width="10" height="18" rx="3"/><path d="M11 18h2"/>',
    '<path d="M5 5h14v11H9l-4 3z"/><path d="M8 10h.1m3.9 0h.1m3.9 0h.1"/>'
  ];
  const rail = document.createElement("aside");
  rail.className = "decorative-rail";
  rail.setAttribute("aria-hidden", "true");
  const ns = "http://www.w3.org/2000/svg";
  const createIcon = (shape) => {
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.innerHTML = shape;
    return svg;
  };
  icons.forEach((shape) => rail.append(createIcon(shape)));

  const groups = [
    { title: "OPERACIONAL", items: [
      ["Login", icons[1]],
      ["Conta", '<circle cx="12" cy="8" r="3"/><path d="M6 20v-2a6 6 0 0 1 12 0v2M5 13a4 4 0 0 1-1-7m15 7a4 4 0 0 0 1-7"/>'],
      ["Senha", icons[5]]
    ] },
    { title: "MÓDULOS", items: [
      ["Planejamento e Programação", icons[6]],
      ["Cronogramas de Paradas", icons[3]],
      ["Painel de Confiabilidade", icons[10]]
    ] },
    { title: "CONFIGURAÇÕES", items: [
      ["Painel", icons[9]],
      ["Fechar", icons[7]]
    ] }
  ];
  const panelWrap = document.createElement("div");
  panelWrap.className = "rail-panel-wrap";
  const panel = document.createElement("div");
  panel.className = "rail-panel";
  groups.forEach(({ title, items }) => {
    const section = document.createElement("section");
    section.className = "rail-panel-section";
    const heading = document.createElement("h2");
    heading.textContent = title;
    section.append(heading);
    items.forEach(([label, shape]) => {
      const item = document.createElement("div");
      item.className = "rail-panel-item";
      const text = document.createElement("span");
      text.textContent = label;
      item.append(createIcon(shape), text);
      section.append(item);
    });
    panel.append(section);
  });
  panelWrap.append(panel);
  rail.append(panelWrap);
  const container = document.createElement("div");
  container.className = "page-with-rail";
  nav.before(container);
  container.append(rail, nav, layout);
  document.body.classList.add("has-decorative-rail");
})();
