(() => {
  "use strict";

  const STORAGE_KEY = "cehou-research-tasks-v1";
  const MAX_TASKS = 5000;
  const projects = [
    { id: "urban-visual-gene", name: "Urban Visual Gene", page: "urban-visual-gene.html" },
    { id: "urban-visual-primitives", name: "Urban Visual Primitives", page: "urban-visual-primitives.html" },
    { id: "fire-description", name: "Fire Description", page: "fire-description.html" },
    { id: "fire-foundation-model", name: "Fire Foundation Model", page: "fire-foundation-model.html" },
    { id: "fire-database", name: "Fire Database / GeoLakebase", page: "fire-database.html" },
    { id: "general", name: "其他任务", page: null }
  ];
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const $ = (id) => document.getElementById(id);
  const pad = (value) => String(value).padStart(2, "0");
  const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const parseDate = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    if (year < 1900 || year > 2100) return null;
    const date = new Date(year, month - 1, day, 12);
    return dateKey(date) === value ? date : null;
  };
  const todayKey = () => dateKey(new Date());
  const monthKey = (date) => dateKey(date).slice(0, 7);
  const ratio = (done, total) => total ? Math.round(done / total * 100) : 0;
  const tally = (items) => ({ total: items.length, done: items.filter((task) => task.completed).length });
  const node = (tag, className, content) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = content;
    return element;
  };
  const isTimestamp = (value) => typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));

  let tasks = [];
  const requestedDate = new URLSearchParams(location.search).get("date");
  let selected = parseDate(requestedDate) ? requestedDate : todayKey();
  const initialDate = parseDate(selected);
  let viewedMonth = new Date(initialDate.getFullYear(), initialDate.getMonth(), 1, 12);
  const initialProject = new URLSearchParams(location.search).get("project");
  let projectFilter = projectById.has(initialProject) ? initialProject : "all";
  let taskFilter = "all";
  let editingId = null;
  let readable = true;
  let noticeTimer;
  let deletedTask = null;

  function validateData(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.tasks) || data.tasks.length > MAX_TASKS) {
      throw new Error("备份格式不正确，请选择从此日历导出的 JSON 文件（最多 5,000 项任务）。");
    }
    const ids = new Set();
    return data.tasks.map((task) => {
      if (!task || typeof task.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(task.id) || ids.has(task.id)
        || typeof task.title !== "string" || !task.title.trim() || task.title.length > 200
        || !parseDate(task.date) || !projectById.has(task.project)
        || typeof task.notes !== "string" || task.notes.length > 2000
        || typeof task.completed !== "boolean"
        || !isTimestamp(task.createdAt) || !isTimestamp(task.updatedAt)
        || (task.completedAt !== null && !isTimestamp(task.completedAt))) {
        throw new Error("任务数据不完整、包含重复编号或日期无效，未改动现有任务。");
      }
      ids.add(task.id);
      return {
        id: task.id, title: task.title.trim(), date: task.date, project: task.project,
        notes: task.notes, completed: task.completed, createdAt: task.createdAt,
        updatedAt: task.updatedAt, completedAt: task.completedAt
      };
    });
  }

  function readTasks() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? [] : validateData(JSON.parse(raw));
  }

  function showError(message) {
    $("planner-error").textContent = message;
    $("planner-error").hidden = false;
  }

  function loadTasks() {
    try {
      tasks = readTasks();
      readable = true;
      $("planner-error").hidden = true;
    } catch {
      readable = false;
      showError("无法读取浏览器中的任务。为保护原数据，已暂停修改；请先导出原始备份，并确认浏览器允许本站保存数据。");
    }
    $("task-fields").disabled = !readable;
    $("import-tasks").disabled = !readable;
  }

  function saveChange(change) {
    if (!readable) return false;
    try {
      // Read again before writing so another tab's changes are kept.
      const updated = change(readTasks());
      const checked = validateData({ version: 1, tasks: updated });
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, tasks: checked }));
      tasks = checked;
      $("planner-error").hidden = true;
      return true;
    } catch (error) {
      showError(error instanceof DOMException
        ? "未能保存，现有任务未被覆盖。浏览器存储可能已满或被禁用，请先导出备份，再检查存储设置。"
        : `未能保存：${error.message}`);
      return false;
    }
  }

  function notify(message, undoTask = null) {
    clearTimeout(noticeTimer);
    deletedTask = undoTask;
    $("notice-text").textContent = message;
    $("undo-delete").hidden = !undoTask;
    $("planner-notice").hidden = false;
    noticeTimer = setTimeout(() => {
      $("planner-notice").hidden = true;
      deletedTask = null;
    }, undoTask ? 10000 : 4500);
  }

  function filteredTasks() {
    return tasks.filter((task) => projectFilter === "all" || task.project === projectFilter);
  }

  function renderStats() {
    const { total, done } = tally(filteredTasks().filter((task) => task.date.startsWith(monthKey(viewedMonth))));
    $("month-total").textContent = total;
    $("month-done").textContent = done;
    $("month-pending").textContent = total - done;
    $("month-rate").textContent = total ? `${ratio(done, total)}%` : "—";
    $("month-progress").value = ratio(done, total);
    $("stats-scope").textContent = projectFilter === "all" ? "全部项目" : projectById.get(projectFilter).name;
    $("month-heading").textContent = `${viewedMonth.getFullYear()} 年 ${viewedMonth.getMonth() + 1} 月`;
    $("month-picker").value = monthKey(viewedMonth);
    $("prev-month").disabled = monthKey(viewedMonth) === "1900-01";
    $("next-month").disabled = monthKey(viewedMonth) === "2100-12";
  }

  function renderCalendar() {
    const year = viewedMonth.getFullYear();
    const month = viewedMonth.getMonth();
    const offset = (viewedMonth.getDay() + 6) % 7;
    const count = new Date(year, month + 1, 0).getDate();
    const cellCount = Math.ceil((offset + count) / 7) * 7;
    const byDay = new Map();
    for (const task of filteredTasks()) {
      if (!byDay.has(task.date)) byDay.set(task.date, []);
      byDay.get(task.date).push(task);
    }
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < cellCount; index++) {
      const date = new Date(year, month, index - offset + 1, 12);
      const key = dateKey(date);
      const dayTasks = byDay.get(key) || [];
      const { total, done } = tally(dayTasks);
      const button = node("button", "calendar-day");
      button.type = "button";
      button.dataset.date = key;
      button.classList.toggle("outside-month", date.getMonth() !== month);
      button.classList.toggle("has-tasks", total > 0);
      button.classList.toggle("all-done", total > 0 && total === done);
      button.setAttribute("aria-pressed", String(key === selected));
      button.setAttribute("aria-label", `${key}${key === todayKey() ? "，今天" : ""}，${total ? `${total} 项任务，已完成 ${done} 项` : "暂无任务"}`);
      if (key === todayKey()) button.setAttribute("aria-current", "date");
      button.disabled = !parseDate(key);
      button.append(node("span", "day-number", date.getDate()));
      if (total) {
        button.append(node("span", "day-count", `${done} / ${total}`));
        const preview = dayTasks.find((task) => !task.completed) || dayTasks[0];
        button.append(node("span", "day-preview", preview.title));
        const progress = node("span", "day-mini-progress");
        const fill = node("span");
        fill.style.width = `${ratio(done, total)}%`;
        progress.append(fill);
        progress.setAttribute("aria-hidden", "true");
        button.append(progress);
      }
      fragment.append(button);
    }
    $("calendar-grid").replaceChildren(fragment);
  }

  function renderDay() {
    const date = parseDate(selected);
    $("day-heading").textContent = `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
    $("day-weekday").textContent = `当天任务 · ${date.getFullYear()} · ${new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(date)}`;
    $("day-badge").textContent = selected === todayKey() ? "今天" : selected < todayKey() ? "回顾" : "计划";
    const items = filteredTasks().filter((task) => task.date === selected);
    const { total, done } = tally(items);
    const allDayTasks = tasks.filter((task) => task.date === selected);
    const scope = projectFilter === "all" ? "全部项目" : projectById.get(projectFilter).name;
    $("saved-task-summary").textContent = !readable
      ? "暂时无法读取已保存的任务，请查看上方提示。"
      : tasks.length
        ? `本浏览器已保存 ${tasks.length} 项任务。${selected}（${scope}）显示 ${total} 项。`
        : "当前浏览器还没有保存任务。可添加任务，或点击上方“导入备份”恢复记录。";
    $("show-all-projects").hidden = projectFilter === "all";
    $("show-nearest-tasks").hidden = allDayTasks.length > 0 || tasks.length === 0;
    $("day-progress-text").textContent = total ? `${done} / ${total} 项已完成 · ${ratio(done, total)}%` : "尚未安排任务";
    $("day-progress").value = ratio(done, total);
    $("day-all-count").textContent = total;
    $("day-pending-count").textContent = total - done;
    $("day-done-count").textContent = done;
    document.querySelectorAll("[data-task-filter]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.taskFilter === taskFilter));
    });
    const shown = items.filter((task) => taskFilter === "all" || (taskFilter === "done" ? task.completed : !task.completed));
    shown.sort((a, b) => Number(a.completed) - Number(b.completed) || Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const fragment = document.createDocumentFragment();
    for (const task of shown) {
      const item = node("li", `task-item${task.completed ? " is-done" : ""}`);
      item.dataset.id = task.id;
      const main = node("div", "task-main");
      const checkbox = node("input", "task-checkbox");
      checkbox.type = "checkbox";
      checkbox.id = `task-${task.id}`;
      checkbox.dataset.action = "toggle";
      checkbox.checked = task.completed;
      checkbox.disabled = !readable;
      checkbox.setAttribute("aria-label", `${task.completed ? "标记未完成" : "标记完成"}：${task.title}`);
      const content = node("div", "task-content");
      const label = node("label", "task-title", task.title);
      label.htmlFor = checkbox.id;
      content.append(label);
      if (task.notes) content.append(node("p", "task-notes", task.notes));
      main.append(checkbox, content);
      const meta = node("div", "task-meta");
      const tag = node("span", "project-tag", projectById.get(task.project).name);
      tag.dataset.project = task.project;
      const actions = node("div", "task-actions");
      for (const [action, text] of [["edit", "编辑"], ["delete", "删除"]]) {
        const button = node("button", `${action}-task`, text);
        button.type = "button";
        button.dataset.action = action;
        button.disabled = !readable;
        button.setAttribute("aria-label", `${text}：${task.title}`);
        actions.append(button);
      }
      meta.append(tag, actions);
      item.append(main, meta);
      fragment.append(item);
    }
    $("task-list").replaceChildren(fragment);
    $("task-empty").hidden = shown.length > 0;
    $("empty-title").textContent = total && taskFilter === "pending" ? "当天任务已全部完成" : total && taskFilter === "done" ? "还没有已完成的任务" : "这一天还没有任务";
    $("empty-copy").textContent = total ? "可切换上方状态，查看其他任务。" : "从下面添加第一项，为研究留出一点时间。";
    if (!total && allDayTasks.length) {
      $("empty-title").textContent = "当前项目在这一天没有任务";
      $("empty-copy").textContent = `当天其他项目还有 ${allDayTasks.length} 项任务，点击上方“显示全部项目”查看。`;
    }
  }

  function renderProjectProgress() {
    const fragment = document.createDocumentFragment();
    const monthTasks = tasks.filter((task) => task.date.startsWith(monthKey(viewedMonth)));
    for (const project of projects) {
      const { total, done } = tally(monthTasks.filter((task) => task.project === project.id));
      const card = node("article", `project-progress-card${projectFilter === project.id ? " is-filtered" : ""}`);
      const title = node(project.page ? "a" : "span", null, project.name);
      if (project.page) title.href = project.page;
      const progress = node("progress");
      progress.max = 100;
      progress.value = ratio(done, total);
      progress.setAttribute("aria-label", `${project.name} 本月完成率`);
      card.append(title, node("p", null, total ? `${done} / ${total} 项完成 · ${ratio(done, total)}%` : "本月尚未安排任务"), progress);
      fragment.append(card);
    }
    $("project-progress").replaceChildren(fragment);
  }

  function render() {
    renderStats();
    renderCalendar();
    renderDay();
    renderProjectProgress();
  }

  function resetForm() {
    editingId = null;
    $("task-form").reset();
    $("task-title").setCustomValidity("");
    $("task-project").value = projectFilter === "all" ? "general" : projectFilter;
    $("task-date").value = selected;
    $("notes-details").open = false;
    $("form-heading").textContent = "添加任务";
    $("save-task").textContent = "＋ 添加任务";
    $("cancel-edit").hidden = true;
  }

  function selectDate(key, focus = false) {
    const date = parseDate(key);
    if (!date) return;
    selected = key;
    viewedMonth = new Date(date.getFullYear(), date.getMonth(), 1, 12);
    updateFilterUrl();
    resetForm();
    render();
    if (focus) $("calendar-grid").querySelector(`[data-date="${key}"]`)?.focus({ preventScroll: true });
  }

  function moveMonth(step) {
    const next = new Date(viewedMonth.getFullYear(), viewedMonth.getMonth() + step, 1, 12);
    if (!parseDate(dateKey(next))) return;
    const currentDay = parseDate(selected).getDate();
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    selectDate(dateKey(new Date(next.getFullYear(), next.getMonth(), Math.min(currentDay, lastDay), 12)));
  }

  function updateFilterUrl() {
    const url = new URL(location.href);
    url.searchParams.set("date", selected);
    if (projectFilter === "all") url.searchParams.delete("project");
    else url.searchParams.set("project", projectFilter);
    history.replaceState(null, "", url);
  }

  function beginEdit(task) {
    editingId = task.id;
    $("task-title").value = task.title;
    $("task-title").setCustomValidity("");
    $("task-project").value = task.project;
    $("task-date").value = task.date;
    $("task-notes").value = task.notes;
    $("notes-details").open = Boolean(task.notes);
    $("form-heading").textContent = "编辑任务";
    $("save-task").textContent = "保存修改";
    $("cancel-edit").hidden = false;
    $("task-title").focus();
  }

  $("task-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = $("task-title").value.trim();
    if (!title) {
      $("task-title").setCustomValidity("请输入任务内容，不能只填写空格。");
      $("task-title").reportValidity();
      return;
    }
    const date = $("task-date").value;
    if (!parseDate(date)) return;
    const project = $("task-project").value;
    const notes = $("task-notes").value.trim();
    const id = editingId || (crypto.randomUUID ? crypto.randomUUID() : `task-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const wasEditing = Boolean(editingId);
    const saved = saveChange((current) => {
      const previous = current.find((task) => task.id === id);
      if (wasEditing && !previous) throw new Error("此任务已在其他标签页删除，请取消编辑后重新添加。");
      const now = new Date().toISOString();
      const task = {
        id, title, date, project, notes, completed: previous?.completed || false,
        createdAt: previous?.createdAt || now, updatedAt: now, completedAt: previous?.completedAt || null
      };
      return previous ? current.map((item) => item.id === id ? task : item) : [...current, task];
    });
    if (!saved) return;
    if (projectFilter !== "all" && projectFilter !== project) {
      projectFilter = project;
      $("project-filter").value = project;
      updateFilterUrl();
    }
    taskFilter = "all";
    selectDate(date);
    $("task-title").focus({ preventScroll: true });
    notify(wasEditing ? "任务修改已保存" : "任务已添加");
  });
  $("task-title").addEventListener("input", () => $("task-title").setCustomValidity(""));
  $("cancel-edit").addEventListener("click", resetForm);

  $("calendar-grid").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-date]");
    if (button) selectDate(button.dataset.date, true);
  });
  $("calendar-grid").addEventListener("keydown", (event) => {
    const button = event.target.closest("button[data-date]");
    const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!button || !(event.key in steps)) return;
    event.preventDefault();
    const date = parseDate(button.dataset.date);
    date.setDate(date.getDate() + steps[event.key]);
    selectDate(dateKey(date), true);
  });
  $("prev-month").addEventListener("click", () => moveMonth(-1));
  $("next-month").addEventListener("click", () => moveMonth(1));
  $("go-today").addEventListener("click", () => selectDate(todayKey()));
  $("show-day-tasks").addEventListener("click", () => {
    $("day-tasks").scrollIntoView({ behavior: "smooth", block: "start" });
    $("day-tasks").focus({ preventScroll: true });
  });
  function showAllProjects() {
    projectFilter = "all";
    taskFilter = "all";
    $("project-filter").value = "all";
    if (!editingId) $("task-project").value = "general";
    updateFilterUrl();
    render();
  }
  $("show-all-projects").addEventListener("click", showAllProjects);
  $("show-nearest-tasks").addEventListener("click", () => {
    if (!tasks.length) return;
    const target = parseDate(selected).getTime();
    const nearest = [...tasks].sort((a, b) => Math.abs(parseDate(a.date).getTime() - target) - Math.abs(parseDate(b.date).getTime() - target))[0];
    showAllProjects();
    selectDate(nearest.date);
    $("show-day-tasks").click();
  });
  $("month-picker").addEventListener("change", (event) => {
    const key = `${event.target.value}-01`;
    if (parseDate(key)) selectDate(key);
    else event.target.value = monthKey(viewedMonth);
  });
  $("project-filter").addEventListener("change", (event) => {
    projectFilter = event.target.value;
    updateFilterUrl();
    if (!editingId) $("task-project").value = projectFilter === "all" ? "general" : projectFilter;
    render();
  });
  document.querySelectorAll("[data-task-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      taskFilter = button.dataset.taskFilter;
      renderDay();
    });
  });

  $("task-list").addEventListener("change", (event) => {
    if (!event.target.matches("input[data-action='toggle']")) return;
    const id = event.target.closest("[data-id]").dataset.id;
    const completed = event.target.checked;
    const now = new Date().toISOString();
    const saved = saveChange((current) => current.map((task) => task.id === id
      ? { ...task, completed, completedAt: completed ? now : null, updatedAt: now } : task));
    render();
    $("task-list").querySelector(`[data-id="${id}"] input`)?.focus({ preventScroll: true });
    if (saved) notify(completed ? "已完成，继续向前一步" : "任务已恢复为待完成");
  });
  $("task-list").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.closest("[data-id]").dataset.id;
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    if (button.dataset.action === "edit") return beginEdit(task);
    let removed;
    if (saveChange((current) => {
      removed = current.find((item) => item.id === id);
      return current.filter((item) => item.id !== id);
    })) {
      if (editingId === id) resetForm();
      render();
      notify("任务已删除", removed);
    }
  });
  $("undo-delete").addEventListener("click", () => {
    if (!deletedTask) return;
    const restored = { ...deletedTask, updatedAt: new Date().toISOString() };
    if (saveChange((current) => current.some((task) => task.id === restored.id) ? current : [...current, restored])) {
      render();
      notify("任务已恢复");
    }
  });

  $("export-tasks").addEventListener("click", () => {
    try {
      const raw = readable
        ? JSON.stringify({ app: "cehou-research-planner", version: 1, exportedAt: new Date().toISOString(), tasks: readTasks() }, null, 2)
        : localStorage.getItem(STORAGE_KEY);
      if (raw === null) throw new Error("没有可导出的本地数据。");
      const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
      const link = node("a");
      link.href = url;
      link.download = `ce-hou-tasks-${todayKey()}${readable ? "" : "-raw"}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(readable ? "任务备份已导出" : "原始数据已导出，请保留文件以便恢复");
    } catch (error) {
      showError(`无法导出备份：${error.message}`);
    }
  });
  $("import-tasks").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    $("import-tasks").disabled = true;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("备份文件不能超过 5 MB。");
      const imported = validateData(JSON.parse(await file.text()));
      let added = 0;
      let updated = 0;
      if (saveChange((current) => {
        const merged = new Map(current.map((task) => [task.id, task]));
        for (const task of imported) {
          const existing = merged.get(task.id);
          if (!existing) { merged.set(task.id, task); added++; }
          else if (Date.parse(task.updatedAt) > Date.parse(existing.updatedAt)) { merged.set(task.id, task); updated++; }
        }
        return [...merged.values()];
      })) {
        render();
        notify(`备份已合并：新增 ${added} 项，更新 ${updated} 项`);
      }
    } catch (error) {
      showError(`导入失败，现有任务未改动。${error instanceof SyntaxError ? "文件不是有效的 JSON 备份。" : error.message}`);
    } finally {
      event.target.value = "";
      $("import-tasks").disabled = !readable;
    }
  });

  function addLinkedTasks() {
    const importUrl = new URL(location.href);
    const queryPayload = importUrl.searchParams.get("add-tasks");
    const hasFragment = location.hash.startsWith("#add-tasks=");
    if (!hasFragment && queryPayload === null) return;
    try {
      const payload = hasFragment ? location.hash.slice("#add-tasks=".length) : queryPayload;
      if (payload.length > 40000) throw new Error("任务链接过长，请改用导入备份。");
      const incoming = validateData(JSON.parse(hasFragment ? decodeURIComponent(payload) : payload));
      if (!incoming.length || incoming.length > 50) throw new Error("每个任务链接需包含 1–50 项任务。");
      let added = 0;
      // Links only add missing tasks. Reopening a link never resets progress or edits.
      if (!saveChange((current) => {
        const existing = new Set(current.map((task) => task.id));
        const extra = incoming.filter((task) => !existing.has(task.id));
        added = extra.length;
        return [...current, ...extra];
      })) return;
      projectFilter = "all";
      taskFilter = "all";
      $("project-filter").value = "all";
      const url = new URL(location.href);
      url.hash = "";
      url.searchParams.delete("add-tasks");
      url.searchParams.delete("project");
      history.replaceState(null, "", url);
      selectDate(incoming[0].date);
      $("planner-import-result").textContent = added
        ? `已添加 ${added} 项任务（首个任务日期：${incoming[0].date}），已有任务和完成状态均已保留。`
        : "这些任务已在日历中，已保留最新的修改和完成状态，没有重复添加。";
      $("planner-import-result").hidden = false;
      notify(added ? `已添加 ${added} 项任务` : "任务已在日历中");
    } catch (error) {
      showError(`无法添加链接中的任务，现有任务未改动。${error instanceof SyntaxError || error instanceof URIError ? "任务链接格式不正确。" : error.message}`);
    }
  }

  window.addEventListener("hashchange", addLinkedTasks);
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    loadTasks();
    render();
    if (readable) notify("已更新为此浏览器中最新的任务记录");
  });

  $("project-filter").append(new Option("全部项目", "all"));
  for (const project of projects) {
    $("project-filter").append(new Option(project.name, project.id));
    $("task-project").append(new Option(project.name, project.id));
  }
  $("project-filter").value = projectFilter;
  loadTasks();
  resetForm();
  render();
  addLinkedTasks();
})();
