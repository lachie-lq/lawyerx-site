(() => {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  const copyButton = document.querySelector(".copy-phone");
  if (copyButton) {
    copyButton.addEventListener("click", async () => {
      const value = copyButton.dataset.copy || "";
      try {
        await navigator.clipboard.writeText(value);
        copyButton.textContent = "已复制：15013763869";
      } catch {
        copyButton.textContent = "电话号码：15013763869";
      }
      window.setTimeout(() => {
        copyButton.textContent = "复制电话号码";
      }, 2400);
    });
  }

  const year = document.querySelector("#year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
