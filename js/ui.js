let tabButtons = [];
let tabSections = [];
let activeTab = "daily";

export function initTabs() {
  tabButtons = Array.from(document.querySelectorAll("[data-tab-target]"));
  tabSections = Array.from(document.querySelectorAll("[data-tab-section]"));

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tabTarget));
  });

  switchTab(activeTab);
}

function switchTab(tabName) {
  activeTab = tabName;

  tabButtons.forEach((button) => {
    const isActive = button.dataset.tabTarget === tabName;
    button.classList.toggle("active", isActive);
  });

  tabSections.forEach((section) => {
    const isActive = section.dataset.tabSection === tabName;
    section.classList.toggle("active", isActive);
  });
}
