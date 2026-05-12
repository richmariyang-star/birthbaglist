const subCategories = ["산모", "아기", "보호자"];
const mainCategories = [
  { value: "hospital", label: "병원" },
  { value: "care", label: "조리원" },
];
const importanceLabels = { "★": "필수", "☆": "상황별", "△": "선택" };
const importanceOrder = { "★": 0, "☆": 1, "△": 2 };
const importanceStars = { "★": "★★★", "☆": "★★", "△": "★" };
const mainFilterLabels = { hospital: "병원", care: "조리원" };
const importanceFilterLabels = { all: "전체", "★": "★★★", "☆": "★★", "△": "★" };

const state = {
  babyName: "",
  dueDate: "",
  profileSaved: false,
  selectedMain: "hospital",
  selectedSub: "산모",
  selectedImportance: "all",
  checked: {},
  hiddenIds: [],
  customItems: [],
  customMainCategories: [],
  customSubCategories: [],
};

let baseItems = [];
let saveTimer;
let shareCode = "";
let installPromptEvent;

const els = {
  babyName: document.querySelector("#babyName"),
  dueDate: document.querySelector("#dueDate"),
  profileForm: document.querySelector("#profileForm"),
  profileDisplay: document.querySelector("#profileDisplay"),
  profileText: document.querySelector("#profileText"),
  saveProfile: document.querySelector("#saveProfile"),
  editProfile: document.querySelector("#editProfile"),
  progressText: document.querySelector("#progressText"),
  progressPercent: document.querySelector("#progressPercent"),
  progressBar: document.querySelector("#progressBar"),
  resetList: document.querySelector("#resetList"),
  shareHome: document.querySelector("#shareHome"),
  openSharePanel: document.querySelector("#openSharePanel"),
  closeSharePanel: document.querySelector("#closeSharePanel"),
  sharePanel: document.querySelector("#sharePanel"),
  mainFilter: document.querySelector("#mainFilter"),
  subFilter: document.querySelector("#subFilter"),
  importanceFilter: document.querySelector("#importanceFilter"),
  mainFilterLabel: document.querySelector("#mainFilterLabel"),
  subFilterLabel: document.querySelector("#subFilterLabel"),
  importanceFilterLabel: document.querySelector("#importanceFilterLabel"),
  filterChips: document.querySelector("#filterChips"),
  shareCodeInput: document.querySelector("#shareCodeInput"),
  applyShareCode: document.querySelector("#applyShareCode"),
  copyShareLink: document.querySelector("#copyShareLink"),
  list: document.querySelector("#list"),
  template: document.querySelector("#itemTemplate"),
  addForm: document.querySelector("#addForm"),
  toggleAdd: document.querySelector("#toggleAdd"),
  installApp: document.querySelector("#installApp"),
  newName: document.querySelector("#newName"),
  newMain: document.querySelector("#newMain"),
  newSub: document.querySelector("#newSub"),
  newImportance: document.querySelector("#newImportance"),
  newDescription: document.querySelector("#newDescription"),
  newLink: document.querySelector("#newLink"),
};

function normalizeState(payload) {
  Object.assign(state, {
    babyName: payload.babyName || "",
    dueDate: payload.dueDate || "",
    profileSaved: Boolean(payload.profileSaved || (payload.babyName && payload.dueDate)),
    selectedMain: payload.selectedMain || "hospital",
    selectedSub: payload.selectedSub || "산모",
    selectedImportance: ["all", "★", "☆", "△"].includes(payload.selectedImportance)
      ? payload.selectedImportance
      : "all",
    checked: payload.checked || {},
    hiddenIds: Array.isArray(payload.hiddenIds) ? payload.hiddenIds : [],
    customItems: Array.isArray(payload.customItems) ? payload.customItems : [],
    customMainCategories: Array.isArray(payload.customMainCategories) ? payload.customMainCategories : [],
    customSubCategories: Array.isArray(payload.customSubCategories) ? payload.customSubCategories : [],
  });
  if (!getMainOptions().some((item) => item.value === state.selectedMain)) state.selectedMain = "hospital";
  if (!getSubOptions().includes(state.selectedSub)) state.selectedSub = "산모";
}

async function load() {
  shareCode = getInitialShareCode();
  setShareCode(shareCode, { replace: true });
  const [itemsResponse, stateResponse] = await Promise.all([
    fetch("./items.json"),
    fetch(`/api/state?code=${encodeURIComponent(shareCode)}`).catch(() => null),
  ]);
  baseItems = await itemsResponse.json();

  if (stateResponse?.ok) {
    normalizeState(await stateResponse.json());
  } else {
    normalizeState(JSON.parse(localStorage.getItem(storageKey()) || "{}"));
  }

  syncControls();
  render();
}

function normalizeShareCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 32);
}

function generateShareCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  crypto.getRandomValues(new Uint32Array(8)).forEach((value) => {
    code += alphabet[value % alphabet.length];
  });
  return code;
}

function getInitialShareCode() {
  const params = new URLSearchParams(location.search);
  return normalizeShareCode(params.get("code") || localStorage.getItem("birthBagShareCode")) || generateShareCode();
}

function storageKey() {
  return `birthBagState:${shareCode}`;
}

function setShareCode(code, options = {}) {
  shareCode = normalizeShareCode(code) || generateShareCode();
  localStorage.setItem("birthBagShareCode", shareCode);
  if (els.shareCodeInput) els.shareCodeInput.value = shareCode;
  const url = new URL(location.href);
  url.searchParams.set("code", shareCode);
  if (options.replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
}

function allItems() {
  const hidden = new Set(state.hiddenIds);
  return [...baseItems, ...state.customItems].filter((item) => !hidden.has(item.id));
}

function currentItems() {
  const items = allItems();
  const originalIndex = new Map(items.map((item, index) => [item.id, index]));
  return items
    .filter((item) => {
      const mainOk = item.mainCategory === state.selectedMain;
      const subOk = item.subCategory === state.selectedSub;
      const importanceOk = state.selectedImportance === "all" || item.importance === state.selectedImportance;
      return mainOk && subOk && importanceOk;
    })
    .sort((a, b) => {
      const importanceDiff = (importanceOrder[a.importance] ?? 99) - (importanceOrder[b.importance] ?? 99);
      if (importanceDiff) return importanceDiff;
      return originalIndex.get(a.id) - originalIndex.get(b.id);
    });
}

function syncControls() {
  syncCategoryControls();
  els.babyName.value = state.babyName;
  els.dueDate.value = state.dueDate;
  els.profileText.replaceChildren(getProfileLabel());
  els.profileDisplay.hidden = !state.profileSaved;
  els.profileForm.hidden = state.profileSaved;
  els.mainFilter.value = state.selectedMain;
  els.subFilter.value = state.selectedSub;
  els.importanceFilter.value = state.selectedImportance;
  els.mainFilterLabel.textContent = getMainLabel(state.selectedMain);
  els.subFilterLabel.textContent = state.selectedSub;
  els.importanceFilterLabel.textContent = importanceFilterLabels[state.selectedImportance];
  if (els.shareCodeInput) els.shareCodeInput.value = shareCode;

  document.querySelectorAll("[data-main]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.main === state.selectedMain);
  });
  document.querySelectorAll("[data-sub]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.sub === state.selectedSub);
  });
  document.querySelectorAll("[data-importance]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.importance === state.selectedImportance);
  });
}

function getMainOptions() {
  return [...mainCategories, ...state.customMainCategories];
}

function getSubOptions() {
  return [...subCategories, ...state.customSubCategories];
}

function getMainLabel(value) {
  return getMainOptions().find((item) => item.value === value)?.label || mainFilterLabels[value] || value;
}

function syncSelect(select, options, selected) {
  select.replaceChildren(...options.map((option) => new Option(option.label || option, option.value || option)));
  select.value = selected;
}

function syncCategoryControls() {
  syncSelect(els.newMain, getMainOptions(), state.selectedMain);
  syncSelect(els.mainFilter, getMainOptions(), state.selectedMain);
  syncSelect(els.newSub, getSubOptions(), state.selectedSub);
  syncSelect(els.subFilter, getSubOptions(), state.selectedSub);
}

function closeFilterChips() {
  els.filterChips.hidden = true;
  document.querySelectorAll("[data-filter-group]").forEach((group) => {
    group.hidden = true;
  });
}

function toggleFilterChips(groupName) {
  const target = document.querySelector(`[data-filter-group="${groupName}"]`);
  if (!target) return;
  const willOpen = els.filterChips.hidden || target.hidden;
  closeFilterChips();
  if (willOpen) {
    els.filterChips.hidden = false;
    target.hidden = false;
  }
}

function getProfileText() {
  const babyName = state.babyName || "태명 미입력";
  return `${getDdayLabel(state.dueDate)} ${babyName}`;
}

function getProfileLabel() {
  const babyName = state.babyName || "태명 미입력";
  const fragment = document.createDocumentFragment();
  const dday = document.createElement("span");
  dday.className = "dday-label";
  dday.textContent = getDdayLabel(state.dueDate);
  fragment.append(dday, document.createTextNode(` ${babyName}`));
  return fragment;
}

function getDdayLabel(dateText) {
  if (!dateText) return "D-day 미입력";
  const today = new Date();
  const dueDate = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(dueDate.getTime())) return "D-day 미입력";
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((dueDate - today) / 86400000);
  return days > 0 ? `D-${days}` : days === 0 ? "D-day" : `D+${Math.abs(days)}`;
}

function getDdayText(dateText) {
  if (!dateText) return "출생예정일을 입력하면 D-day가 표시돼요";
  return `${getDdayLabel(dateText)} (${dateText})`;
}

function render() {
  syncControls();
  const visibleItems = currentItems();
  els.list.replaceChildren();

  if (!visibleItems.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "이 조건에 해당하는 항목이 없어요.";
    els.list.append(empty);
  }

  for (const item of visibleItems) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const checkbox = node.querySelector("input");
    const box = node.querySelector(".check-wrap span");
    const importance = node.querySelector(".importance");
    const title = node.querySelector("h3");
    const description = node.querySelector("p");
    const buyLink = node.querySelector(".buy-link");
    const deleteButton = node.querySelector(".delete-btn");

    node.dataset.importance = item.importance;
    node.classList.toggle("is-checked", Boolean(state.checked[item.id]));
    checkbox.checked = Boolean(state.checked[item.id]);
    box.setAttribute("aria-hidden", "true");
    importance.textContent = item.importance;
    importance.textContent = importanceStars[item.importance] || "";
    importance.classList.add(item.importance === "★" ? "must" : item.importance === "☆" ? "nice" : "maybe");
    title.textContent = item.name;
    description.textContent = item.description || "";
    description.hidden = !description.textContent;

    if (item.link) {
      buyLink.href = item.link;
      buyLink.hidden = false;
    } else {
      buyLink.hidden = true;
    }

    checkbox.addEventListener("change", () => {
      state.checked[item.id] = checkbox.checked;
      node.classList.toggle("is-checked", checkbox.checked);
      queueSave();
      renderProgress();
    });

    deleteButton.addEventListener("click", () => {
      if (item.builtIn) {
        state.hiddenIds = [...new Set([...state.hiddenIds, item.id])];
      } else {
        state.customItems = state.customItems.filter((custom) => custom.id !== item.id);
      }
      delete state.checked[item.id];
      queueSave();
      render();
    });

    els.list.append(node);
  }

  renderProgress();
}

function renderProgress() {
  const scopeItems = allItems().filter(
    (item) => item.mainCategory === state.selectedMain && item.subCategory === state.selectedSub,
  );
  const done = scopeItems.filter((item) => state.checked[item.id]).length;
  const total = scopeItems.length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  els.progressText.textContent = `${done}/${total}`;
  els.progressPercent.replaceChildren();
  const percentValue = document.createElement("b");
  percentValue.textContent = `${percent}%`;
  els.progressPercent.append(percentValue, " 완료");
  els.progressBar.style.width = `${percent}%`;
}

function resetChecklist() {
  state.selectedMain = "hospital";
  state.selectedSub = "산모";
  state.selectedImportance = "all";
  state.checked = {};
  state.hiddenIds = [];
  state.customItems = [];
  state.customMainCategories = [];
  state.customSubCategories = [];
  els.addForm.hidden = true;
  els.toggleAdd.textContent = "+";
  els.toggleAdd.setAttribute("aria-expanded", "false");
  save();
  render();
}

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
}

function setupInstallButton() {
  if (isStandaloneMode()) {
    els.installApp.hidden = true;
    return;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPromptEvent = event;
    els.installApp.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    installPromptEvent = undefined;
    els.installApp.hidden = true;
  });
}

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 220);
}

async function save() {
  const payload = JSON.stringify(state);
  localStorage.setItem(storageKey(), payload);
  try {
    await fetch(`/api/state?code=${encodeURIComponent(shareCode)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Share-Code": shareCode },
      body: payload,
    });
  } catch {
    // Local storage keeps the app usable if the page is opened without the Node server.
  }
}

document.querySelectorAll("[data-main]").forEach((button) => {
  button.addEventListener("click", () => {
    state.selectedMain = button.dataset.main;
    closeFilterChips();
    queueSave();
    render();
  });
});

els.mainFilter.addEventListener("change", () => {
  state.selectedMain = els.mainFilter.value;
  queueSave();
  render();
});

els.subFilter.addEventListener("change", () => {
  state.selectedSub = els.subFilter.value;
  queueSave();
  render();
});

els.importanceFilter.addEventListener("change", () => {
  state.selectedImportance = els.importanceFilter.value;
  queueSave();
  render();
});

document.querySelectorAll("[data-filter-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    toggleFilterChips(button.dataset.filterToggle);
  });
});

els.shareHome.addEventListener("click", async () => {
  const homeUrl = `${location.origin}/`;
  const shareData = {
    title: "출산 준비물 리스트",
    text: "출산 준비물 리스트",
    url: homeUrl,
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
    await navigator.clipboard.writeText(homeUrl);
  } catch {
    // The user can cancel the native share sheet without changing app state.
  }
});

els.openSharePanel.addEventListener("click", () => {
  els.sharePanel.hidden = !els.sharePanel.hidden;
});

els.closeSharePanel?.addEventListener("click", () => {
  els.sharePanel.hidden = true;
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    els.sharePanel.hidden = true;
  }
});

els.resetList.addEventListener("click", () => {
  const ok = confirm("체크한 항목, 삭제한 항목, 추가한 항목을 처음 상태로 초기화할까요?");
  if (!ok) return;
  resetChecklist();
});

els.applyShareCode.addEventListener("click", () => {
  setShareCode(els.shareCodeInput.value);
  els.sharePanel.hidden = true;
  load();
});

els.copyShareLink.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(shareCode);
    els.copyShareLink.querySelector("em").textContent = "완료";
    setTimeout(() => {
      els.copyShareLink.querySelector("em").textContent = "코드 공유하기";
      els.sharePanel.hidden = true;
    }, 1200);
  } catch {
    els.shareCodeInput.select();
  }
});

document.querySelectorAll("[data-sub]").forEach((button) => {
  button.addEventListener("click", () => {
    state.selectedSub = button.dataset.sub;
    closeFilterChips();
    queueSave();
    render();
  });
});

document.querySelectorAll("[data-importance]").forEach((button) => {
  button.addEventListener("click", () => {
    state.selectedImportance = button.dataset.importance;
    closeFilterChips();
    queueSave();
    render();
  });
});

els.babyName.addEventListener("input", () => {
  state.babyName = els.babyName.value.trim();
});

els.dueDate.addEventListener("input", () => {
  state.dueDate = els.dueDate.value;
});

els.saveProfile.addEventListener("click", () => {
  state.babyName = els.babyName.value.trim();
  state.dueDate = els.dueDate.value;
  state.profileSaved = Boolean(state.babyName || state.dueDate);
  syncControls();
  queueSave();
});

els.editProfile.addEventListener("click", () => {
  state.profileSaved = false;
  syncControls();
});

els.toggleAdd.addEventListener("click", () => {
  const willOpen = els.addForm.hidden;
  els.addForm.hidden = !willOpen;
  els.toggleAdd.textContent = willOpen ? "−" : "+";
  els.toggleAdd.setAttribute("aria-expanded", String(willOpen));
  if (willOpen) {
    syncCategoryControls();
    els.newMain.value = state.selectedMain;
    els.newSub.value = state.selectedSub;
  }
});

els.installApp.addEventListener("click", async () => {
  if (installPromptEvent) {
    installPromptEvent.prompt();
    await installPromptEvent.userChoice;
    installPromptEvent = undefined;
    return;
  }

  alert("브라우저 메뉴에서 '홈 화면에 추가'를 선택해 주세요.");
});

els.addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = els.newName.value.trim();
  if (!name) return;

  state.selectedMain = els.newMain.value;
  state.selectedSub = els.newSub.value;
  state.customItems.push({
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    mainCategory: els.newMain.value,
    mainLabel: getMainLabel(els.newMain.value),
    subCategory: state.selectedSub,
    importance: els.newImportance.value,
    name,
    description: els.newDescription.value.trim(),
    link: els.newLink.value.trim(),
    builtIn: false,
  });

  els.addForm.reset();
  queueSave();
  render();
});

setupInstallButton();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

load();
