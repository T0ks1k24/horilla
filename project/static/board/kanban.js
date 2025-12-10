document.addEventListener("DOMContentLoaded", () => {
  // =====================================================
  // 1. CONFIG
  // =====================================================
  const CONFIG = {
    columnOrder: [
      "ongoing",
      "to_do",
      "in_progress",
      "code_review",
      "completed",
    ],
    selectors: {
      board: "#kanbanBoard",
      columns: ".kanban-column",
      cardContainer: ".kanban-cards",
      card: ".kanban-card",

      // Модалка для перегляду деталей
      detailModal: "#genericModal",
      detailModalBody: "#genericModalBody",

      // Модалка для створення (НОВЕ)
      createModal: "#TaskModal",
      createModalBody: "#TaskFormTarget",
      createBtn: ".create-task-btn",
    },
    classes: {
      allowed: "allowed-drop",
      denied: "denied-drop",
      ghost: "sortable-ghost",
      activeModal: "oh-modal--show", // Клас для показу модалки
    },
  };

  // =====================================================
  // 2. UTILS
  // =====================================================
  const getCsrfToken = () =>
    document
      .querySelector('meta[name="csrf-token"]')
      ?.getAttribute("content") || "";

  const isMoveAllowed = (fromStatus, toStatus) => {
    const fromIndex = CONFIG.columnOrder.indexOf(fromStatus);
    const toIndex = CONFIG.columnOrder.indexOf(toStatus);
    // Дозволяємо переміщення тільки на сусідню колонку (або приберіть умову для вільного переміщення)
    return Math.abs(toIndex - fromIndex) === 1;
  };

  const sortTasksByDate = (container) => {
    const cards = Array.from(container.querySelectorAll(CONFIG.selectors.card));
    cards.sort((a, b) => {
      const dateA = parseInt(a.dataset.createdAt || "0");
      const dateB = parseInt(b.dataset.createdAt || "0");
      return dateA - dateB;
    });
    cards.forEach((c) => container.appendChild(c));
  };

  // =====================================================
  // 3. API
  // =====================================================
  const apiUpdateTaskStatus = (taskId, newStatus) => {
    const board = document.querySelector(CONFIG.selectors.board);
    const baseUrl =
      board.getAttribute("data-update-url") ||
      "/project/update-project-task-status/";
    const url = `${baseUrl.replace(/\/$/, "")}/${taskId}/`;

    const body = new URLSearchParams();
    body.append("status", newStatus);

    return fetch(url, {
      method: "POST",
      headers: {
        "X-CSRFToken": getCsrfToken(),
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }).then((res) => res.json());
  };

  // =====================================================
  // 4. MODAL MANAGER (УНІВЕРСАЛЬНИЙ)
  // =====================================================

  // Функція відкриття будь-якої модалки
  const openModal = (modalSelector, bodySelector, url) => {
    const modal = document.querySelector(modalSelector);
    const modalBody = document.querySelector(bodySelector);

    if (!modal || !modalBody) {
      console.error("Modal not found:", modalSelector);
      return;
    }

    // Показуємо модалку (CSS display: flex + клас активності)
    modal.classList.add("oh-modal--show");
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";

    // Спіннер завантаження
    modalBody.innerHTML = `
        <div style="text-align:center;padding:40px;">
            <i class="fas fa-spinner fa-spin fa-2x text-primary"></i>
        </div>`;

    // Запит на сервер
    fetch(url, { headers: { "X-Requested-With": "XMLHttpRequest" } })
      .then((res) => res.text())
      .then((html) => {
        modalBody.innerHTML = html;

        // Ініціалізація HTMX всередині модалки (для форми)
        if (typeof htmx !== "undefined") {
          htmx.process(modalBody);
        }
      })
      .catch((err) => {
        modalBody.innerHTML = `<p class="text-danger text-center">Error loading content.</p>`;
        console.error(err);
      });
  };

  // Функція закриття всіх модалок
  window.closeAllModals = () => {
    const modals = document.querySelectorAll(".oh-modal");
    modals.forEach((m) => {
      m.style.display = "none";
      m.classList.remove("oh-modal--show");
    });
    document.body.style.overflow = "";

    // Очищаємо контент, щоб уникнути дублікатів ID
    document.querySelector(CONFIG.selectors.createModalBody).innerHTML = "";
    document.querySelector(CONFIG.selectors.detailModalBody).innerHTML = "";
  };

  // Слухачі закриття (клік по фону або хрестику)
  document.querySelectorAll(".oh-modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target.closest(".oh-modal__close")) {
        window.closeAllModals();
      }
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") window.closeAllModals();
  });

  // =====================================================
  // 5. HIGHLIGHT & DRAG-DROP
  // =====================================================
  const highlightColumns = (fromStatus) => {
    document.querySelectorAll(CONFIG.selectors.columns).forEach((col) => {
      const status = col.dataset.status;
      col.classList.remove(CONFIG.classes.allowed, CONFIG.classes.denied);

      if (isMoveAllowed(fromStatus, status))
        col.classList.add(CONFIG.classes.allowed);
      else if (status !== fromStatus) col.classList.add(CONFIG.classes.denied);
    });
  };

  const clearHighlights = () => {
    document
      .querySelectorAll(CONFIG.selectors.columns)
      .forEach((col) =>
        col.classList.remove(CONFIG.classes.allowed, CONFIG.classes.denied)
      );
  };

  let isDragging = false;
  document
    .querySelectorAll(CONFIG.selectors.cardContainer)
    .forEach((container) => {
      new Sortable(container, {
        group: "kanban",
        animation: 200,
        delay: 50, // Трохи зменшив затримку
        ghostClass: CONFIG.classes.ghost,

        onStart: (evt) => {
          isDragging = true;
          const fromStatus = evt.from.closest(CONFIG.selectors.columns).dataset
            .status;
          highlightColumns(fromStatus);
        },

        onEnd: (evt) => {
          clearHighlights();
          setTimeout(() => (isDragging = false), 60);

          const item = evt.item;
          const oldStatus = evt.from.closest(CONFIG.selectors.columns).dataset
            .status;
          const newStatus = evt.to.closest(CONFIG.selectors.columns).dataset
            .status;

          if (oldStatus === newStatus) {
            sortTasksByDate(evt.to);
            return;
          }

          if (!isMoveAllowed(oldStatus, newStatus)) {
            evt.from.insertBefore(
              item,
              evt.from.children[evt.oldIndex] || null
            );
            return;
          }

          sortTasksByDate(evt.to);

          const taskId = item.dataset.taskId;
          item.classList.remove(`status-border-${oldStatus}`);
          item.classList.add(`status-border-${newStatus}`);

          const title = item.querySelector(".card-title");
          if (title) {
            title.style.textDecoration =
              newStatus === "completed" ? "line-through" : "none";
          }

          apiUpdateTaskStatus(taskId, newStatus);
        },
      });
    });

  // =====================================================
  // 6. CLICK HANDLERS (CREATE & DETAIL)
  // =====================================================

  // 1. Клік на кнопку "Create Task"
  document.querySelectorAll(CONFIG.selectors.createBtn).forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const url = btn.dataset.createUrl; // Беремо з data-create-url
      if (url) {
        openModal(
          CONFIG.selectors.createModal,
          CONFIG.selectors.createModalBody,
          url
        );
      } else {
        console.error("No URL found on create button");
      }
    });
  });

  document.body.addEventListener("htmx:afterSwap", (evt) => {
    if (evt.target.id === "genericModalBody") {
      const m = document.querySelector(CONFIG.selectors.detailModal);
      m.style.display = "flex";
      m.classList.add("oh-modal--show");
      document.body.style.overflow = "hidden";
    }
  });

  //Detail
  document
    .querySelector(CONFIG.selectors.board)
    .addEventListener("click", (e) => {
      const card = e.target.closest(CONFIG.selectors.card);

      if (card && !isDragging) {
        e.preventDefault();
        const url = `/task-detail/${card.dataset.taskId}/`;
        openModal(
          CONFIG.selectors.detailModal,
          CONFIG.selectors.detailModalBody,
          url
        );
      }
    });
});
