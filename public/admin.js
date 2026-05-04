const mainLabels = { hospital: "병원용", care: "조리원용" };
const importanceLabels = { "★": "★★★", "☆": "★★", "△": "★" };

let items = [];

const els = {
  itemId: document.querySelector("#itemId"),
  mainCategory: document.querySelector("#mainCategory"),
  subCategory: document.querySelector("#subCategory"),
  importance: document.querySelector("#importance"),
  name: document.querySelector("#name"),
  description: document.querySelector("#description"),
  link: document.querySelector("#link"),
  saveItem: document.querySelector("#saveItem"),
  clearForm: document.querySelector("#clearForm"),
  search: document.querySelector("#search"),
  filterMain: document.querySelector("#filterMain"),
  saveAll: document.querySelector("#saveAll"),
  status: document.querySelector("#status"),
  itemList: document.querySelector("#itemList"),
  template: document.querySelector("#adminItemTemplate"),
};

function makeId(item) {
  const slug = `${item.mainCategory}-${item.subCategory}-${item.name}`
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${slug}-${Date.now()}`;
}

async function load() {
  const response = await fetch("/api/items", { cache: "no-store" });
  items = await response.json();
  render();
  setStatus(`${items.length}개 항목을 불러왔어요.`);
}

function itemFromForm() {
  const name = els.name.value.trim();
  if (!name) {
    els.name.focus();
    setStatus("항목명을 입력해 주세요.");
    return null;
  }

  const item = {
    id: els.itemId.value,
    mainCategory: els.mainCategory.value,
    mainLabel: mainLabels[els.mainCategory.value],
    subCategory: els.subCategory.value,
    importance: els.importance.value,
    name,
    description: els.description.value.trim(),
    link: els.link.value.trim(),
    builtIn: true,
  };

  item.id ||= makeId(item);
  return item;
}

function clearForm() {
  els.itemId.value = "";
  els.mainCategory.value = "hospital";
  els.subCategory.value = "산모";
  els.importance.value = "★";
  els.name.value = "";
  els.description.value = "";
  els.link.value = "";
  els.name.focus();
}

function editItem(item) {
  els.itemId.value = item.id;
  els.mainCategory.value = item.mainCategory;
  els.subCategory.value = item.subCategory;
  els.importance.value = item.importance;
  els.name.value = item.name;
  els.description.value = item.description || "";
  els.link.value = item.link || "";
  scrollTo({ top: 0, behavior: "smooth" });
}

function render() {
  const keyword = els.search.value.trim().toLowerCase();
  const main = els.filterMain.value;
  const visibleItems = items.filter((item) => {
    const mainOk = main === "all" || item.mainCategory === main;
    const text = `${item.name} ${item.description || ""} ${item.link || ""}`.toLowerCase();
    return mainOk && (!keyword || text.includes(keyword));
  });

  els.itemList.replaceChildren();

  visibleItems.forEach((item) => {
    const node = els.template.content.firstElementChild.cloneNode(true);
    node.querySelector("strong").textContent = item.name;
    node.querySelector("p").textContent = `${item.mainLabel} · ${item.subCategory}${item.description ? ` · ${item.description}` : ""}`;
    node.querySelector("span").textContent = importanceLabels[item.importance] || "";
    node.querySelector(".edit-btn").addEventListener("click", () => editItem(item));
    node.querySelector(".delete-btn").addEventListener("click", () => {
      const ok = confirm(`"${item.name}" 항목을 삭제할까요?`);
      if (!ok) return;
      items = items.filter((candidate) => candidate.id !== item.id);
      render();
      setStatus("삭제했어요. 전체 저장을 누르면 반영됩니다.");
    });
    els.itemList.append(node);
  });
}

async function saveAll() {
  const response = await fetch("/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(items),
  });
  if (!response.ok) throw new Error("저장에 실패했어요.");
  const result = await response.json();
  setStatus(`${result.count}개 항목을 저장했어요.`);
}

function setStatus(message) {
  els.status.textContent = message;
}

els.saveItem.addEventListener("click", () => {
  const item = itemFromForm();
  if (!item) return;

  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index >= 0) items[index] = item;
  else items.push(item);

  clearForm();
  render();
  setStatus("항목을 목록에 반영했어요. 전체 저장을 누르면 실제 저장됩니다.");
});

els.clearForm.addEventListener("click", clearForm);
els.search.addEventListener("input", render);
els.filterMain.addEventListener("change", render);
els.saveAll.addEventListener("click", () => {
  saveAll().catch((error) => setStatus(error.message));
});

load().catch((error) => setStatus(error.message));
