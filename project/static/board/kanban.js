document.addEventListener("DOMContentLoaded", () => {
  // =====================================================
  // 1. MODAL HANDLING
  // =====================================================

  window.closeAllModals = () => {
    document.querySelectorAll(".oh-modal").forEach((modal) => {
      // Ховаємо
      modal.classList.remove("oh-modal--show");
      modal.style.display = "none";

      // Безпечне очищення (перевіряємо чи існує body)
      const body = modal.querySelector(".oh-modal__dialog-body");
      if (body) {
        setTimeout(() => {
          body.innerHTML = "";
        }, 200);
      }
    });
    document.body.style.overflow = "";
  };

  // Глобальний слухач кліків (закриття на хрестик та фон)
  document.addEventListener("click", (e) => {
    // 1. Клік на хрестик (або його іконку)
    if (e.target.closest(".oh-modal__close")) {
      e.preventDefault();
      window.closeAllModals();
    }
    // 2. Клік на темний фон
    if (e.target.classList.contains("oh-modal")) {
      window.closeAllModals();
    }
  });

  // Закриття на ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") window.closeAllModals();
  });

  // ВІДКРИТТЯ: Працює автоматично після того, як HTMX завантажив дані
  document.body.addEventListener("htmx:afterSwap", (evt) => {
    // Перевіряємо, чи подія сталась в одній з наших модалок
    if (
      evt.target.id === "genericModalBody" ||
      evt.target.id === "TaskFormTarget"
    ) {
      const modal = evt.target.closest(".oh-modal");
      if (modal) {
        modal.style.display = "flex";
        setTimeout(() => modal.classList.add("oh-modal--show"), 10);
        document.body.style.overflow = "hidden";
      }
    }
  });

  // =====================================================
  // 2. KANBAN LOGIC (Drag & Drop)
  // =====================================================
  const board = document.getElementById("kanbanBoard");
  // Якщо дошки немає на сторінці - виходимо, щоб не було помилок
  if (!board) return;

  const updateBaseUrl =
    board.getAttribute("data-update-url") ||
    "/project/update-project-task-status/";

  const columnOrder = [
    "ongoing",
    "to_do",
    "in_progress",
    "code_review",
    "completed",
  ];

  const isMoveAllowed = (fromStatus, toStatus) => {
    // return true; // Розкоментуйте для вільного переміщення
    const fromIndex = columnOrder.indexOf(fromStatus);
    const toIndex = columnOrder.indexOf(toStatus);
    if (fromIndex === -1 || toIndex === -1) return false;
    return Math.abs(toIndex - fromIndex) <= 1;
  };

  const containers = document.querySelectorAll(".kanban-cards");

  containers.forEach((container) => {
    new Sortable(container, {
      group: "kanban",
      animation: 150,
      delay: 100, // Затримка, щоб клік працював як відкриття, а довгий клік як перетягування
      delayOnTouchOnly: true,
      ghostClass: "sortable-ghost",

      onStart: (evt) => {
        const fromStatus = evt.from.parentElement.dataset.status;
        document.querySelectorAll(".kanban-column").forEach((col) => {
          if (isMoveAllowed(fromStatus, col.dataset.status)) {
            col.classList.add("allowed-drop");
          } else {
            col.classList.add("denied-drop");
          }
        });
      },

      onEnd: (evt) => {
        document.querySelectorAll(".kanban-column").forEach((col) => {
          col.classList.remove("allowed-drop", "denied-drop");
        });

        const item = evt.item;
        const oldStatus = evt.from.parentElement.dataset.status;
        const newStatus = evt.to.parentElement.dataset.status;

        if (oldStatus === newStatus && evt.oldIndex === evt.newIndex) return;

        if (!isMoveAllowed(oldStatus, newStatus)) {
          alert("Move not allowed!");
          if (evt.from !== evt.to) {
            evt.from.insertBefore(item, evt.from.children[evt.oldIndex]);
          }
          return;
        }

        // Оновлення класів
        item.classList.remove(`status-${oldStatus}`);
        item.classList.add(`status-${newStatus}`);

        // HTMX запит
        const taskId = item.dataset.taskId;
        const finalUrl = `${updateBaseUrl.replace(/\/$/, "")}/${taskId}/`;

        if (typeof htmx !== "undefined") {
          htmx.ajax("POST", finalUrl, {
            target: "#none",
            swap: "none",
            values: { status: newStatus },
          });
        }
      },
    });
  });
});
