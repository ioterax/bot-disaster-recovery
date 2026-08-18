(() => {
  const storageKey = "dr-docs-primary-navigation-collapsed";

  const installToggle = () => {
    const header = document.querySelector(".md-header__inner");
    if (!header) return;
    const currentButton = header.querySelector("[data-dr-nav-toggle]");
    if (currentButton) {
      const currentPrimary = document.querySelector(".md-sidebar--primary");
      if (currentPrimary) currentPrimary.id = "dr-primary-navigation";
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "md-header__button md-icon dr-nav-toggle";
    button.dataset.drNavToggle = "true";
    button.setAttribute("aria-controls", "dr-primary-navigation");
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z"/></svg>';

    const logo = header.querySelector(".md-header__button.md-logo");
    if (logo) logo.insertAdjacentElement("afterend", button);
    else header.prepend(button);

    const apply = (collapsed) => {
      document.body.classList.toggle("dr-nav-collapsed", collapsed);
      button.setAttribute("aria-expanded", String(!collapsed));
      button.setAttribute("aria-label", collapsed ? "Expandir navegação lateral" : "Recolher navegação lateral");
      button.title = collapsed ? "Expandir menu lateral" : "Recolher menu lateral";
    };

    let collapsed = false;
    try { collapsed = localStorage.getItem(storageKey) === "true"; } catch (_) { /* storage opcional */ }
    apply(collapsed);

    button.addEventListener("click", () => {
      collapsed = !document.body.classList.contains("dr-nav-collapsed");
      apply(collapsed);
      try { localStorage.setItem(storageKey, String(collapsed)); } catch (_) { /* storage opcional */ }
    });

    button.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !document.body.classList.contains("dr-nav-collapsed")) {
        apply(true);
        button.focus();
      }
    });

    const primary = document.querySelector(".md-sidebar--primary");
    if (primary) primary.id = "dr-primary-navigation";
  };

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", installToggle, { once: true });
  else installToggle();
  if (typeof document$ !== "undefined") document$.subscribe(installToggle);
})();
