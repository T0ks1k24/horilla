document.addEventListener("DOMContentLoaded", function () {
  let isDragging = false;

  const COLUMN_ORDER = [
    "ongoing",
    "to_do",
    "in_progress",
    "code_review",
    "completed",
  ];

  function highlightAllowedTargets(fromColumn) {
    const fromIndex = COLUMN_ORDER.indexOf(fromColumn);

    document.querySelectorAll(".kanban-column").forEach((col) => {
      const colStatus = col.dataset.status;
      const colIndex = COLUMN_ORDER.indexOf(colStatus);

      col.classList.remove("allowed-drop", "denied-drop");

      if (Math.abs(colIndex - fromIndex) === 1) {
        col.classList.add("allowed-drop");
      } else if (colStatus !== fromColumn) {
        col.classList.add("denied-drop");
      }
    });
  }

  function clearHighlights() {
    document
      .querySelectorAll(".kanban-column")
      .forEach((c) => c.classList.remove("allowed-drop", "denied-drop"));
  }
  // --- ФУНКЦІЯ СОРТУВАННЯ ---
  // Сортує картки всередині DOM-елемента колонки за датою створення
  function sortTasksByDate(container) {
    const cards = Array.from(container.querySelectorAll(".kanban-card"));

    cards.sort((a, b) => {
      // Отримуємо timestamp з атрибута (якщо немає, ставимо 0)
      const timeA = parseInt(a.getAttribute("data-created-at") || "0");
      const timeB = parseInt(b.getAttribute("data-created-at") || "0");

      // Сортування від старих до нових (ASC)
      // Щоб нові були зверху, замініть на: return timeB - timeA;
      return timeA - timeB;
    });

    // Переміщуємо елементи в DOM у правильному порядку
    cards.forEach((card) => container.appendChild(card));
  }
  // ---------------------------

  window.openTaskModal = function (event, url) {
    if (isDragging) return;

    if (event) event.preventDefault();

    const modal = document.getElementById("taskDetailModal");
    const modalBody = document.getElementById("modalBody");

    if (!modal || !modalBody) return;

    modal.style.display = "flex";
    document.body.style.overflow = "hidden";

    modalBody.innerHTML =
      '<div style="text-align:center; padding:50px;"><i class="fas fa-spinner fa-spin fa-2x text-primary"></i></div>';

    fetch(url, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    })
      .then((response) => {
        if (!response.ok) throw new Error("Network error");
        return response.text();
      })
      .then((html) => {
        modalBody.innerHTML = html;

        if (typeof htmx !== "undefined") {
          htmx.process(modalBody);
        }

        const closeBtn = modalBody.querySelector(".oh-modal__close");
        if (closeBtn) {
          closeBtn.onclick = window.closeTaskModal;
        }

        const dismissButtons = modalBody.querySelectorAll(
          '[data-dismiss="oh-modal"]'
        );
        dismissButtons.forEach((btn) => {
          btn.onclick = window.closeTaskModal;
        });
      })
      .catch((error) => {
        console.error("Error:", error);
        modalBody.innerHTML =
          '<div class="p-3 text-center text-danger">Error loading task details.</div>';
      });
  };

  window.closeTaskModal = function (event) {
    if (event) event.preventDefault();
    const modal = document.getElementById("taskDetailModal");
    const modalBody = document.getElementById("modalBody");

    if (modal) {
      modal.style.display = "none";
      document.body.style.overflow = "";

      if (modalBody) {
        setTimeout(() => {
          modalBody.innerHTML = "";
        }, 200);
      }
    }
  };

  const modalOverlay = document.getElementById("taskDetailModal");
  if (modalOverlay) {
    modalOverlay.addEventListener("click", function (e) {
      if (e.target === this) {
        window.closeTaskModal(e);
      }
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") window.closeTaskModal(event);
  });

  const containers = document.querySelectorAll(".kanban-cards");

  if (containers.length > 0) {
    containers.forEach((container) => {
      new Sortable(container, {
        group: "kanban",
        animation: 200,
        delay: 100,
        delayOnTouchOnly: true,
        ghostClass: "sortable-ghost",

        onStart: function (evt) {
          isDragging = true;
          document.body.style.cursor = "grabbing";

          const fromColumn = evt.from.closest(".kanban-column").dataset.status;
          highlightAllowedTargets(fromColumn);
        },

        onEnd: function (evt) {
          clearHighlights();

          setTimeout(() => {
            isDragging = false;
            document.body.style.cursor = "";
          }, 50);

          const itemEl = evt.item;
          const newContainer = evt.to;
          const newColumn =
            newContainer.closest(".kanban-column").dataset.status;
          const oldColumn = evt.from.closest(".kanban-column").dataset.status;

          // --- Перевірка допустимих переходів ---
          const oldIndex = COLUMN_ORDER.indexOf(oldColumn);
          const newIndex = COLUMN_ORDER.indexOf(newColumn);

          const isAllowedMove = Math.abs(newIndex - oldIndex) === 1;

          if (!isAllowedMove) {
            // ❌ Заборонений перехід — повертаємо назад
            evt.from.insertBefore(
              itemEl,
              evt.from.children[evt.oldIndex] || null
            );
            return;
          }
          // --------------------------------------

          // Сортуємо після переміщення
          sortTasksByDate(newContainer);

          // Якщо колонка не змінилась — стоп
          if (newColumn === oldColumn) return;

          const taskId = itemEl.getAttribute("data-task-id");

          itemEl.classList.remove("status-border-" + oldColumn);
          itemEl.classList.add("status-border-" + newColumn);

          const title = itemEl.querySelector(".card-title");
          if (newColumn === "completed") {
            itemEl.style.opacity = "0.7";
            if (title) title.style.textDecoration = "line-through";
          } else {
            itemEl.style.opacity = "1";
            if (title) title.style.textDecoration = "none";
          }

          const csrfToken = document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute("content");

          const board = document.getElementById("kanbanBoard");

          let baseUrl =
            board.getAttribute("data-update-url") ||
            "/project/update-project-task-status/";

          if (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.slice(0, -1);
          }
          const finalUrl = `${baseUrl}/${taskId}/`;

          const formData = new URLSearchParams();
          formData.append("status", newColumn);

          fetch(finalUrl, {
            method: "POST",
            headers: {
              "X-Requested-With": "XMLHttpRequest",
              "X-CSRFToken": csrfToken,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formData,
          })
            .then((res) => {
              if (!res.ok) throw new Error(`Server error: ${res.status}`);
              return res.json();
            })
            .then((data) => {
              if (data.type !== "success") {
                console.error("Server validation error:", data.message);
              }
            })
            .catch((err) => {
              console.error("AJAX Error:", err);
              alert("Не вдалося оновити статус. Перевірте з'єднання.");
            });
        },
      });
    });
  }
});
