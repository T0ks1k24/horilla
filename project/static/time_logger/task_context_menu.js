document.addEventListener("DOMContentLoaded", function () {
  const menu = document.getElementById("taskContextMenu");
  if (!menu) return;

  const csrftoken = document
    .querySelector('meta[name="csrf-token"]')
    .getAttribute("content");
  let timers = {}; // живі таймери
  let startTimes = {}; // стартові моменти для збереження

  // Контекстне меню на In Progress
  document.querySelectorAll(".kanban-card").forEach((card) => {
    card.addEventListener("contextmenu", (e) => {
      const column = card.closest(".kanban-column");
      if (!column || column.dataset.status !== "in_progress") return;

      e.preventDefault();
      menu.dataset.taskId = card.dataset.taskId;
      menu.style.top = `${e.pageY}px`;
      menu.style.left = `${e.pageX}px`;
      menu.style.display = "block";
    });
  });

  // Hover + hide
  let hideTimeout = null;
  menu.addEventListener(
    "mouseenter",
    () => hideTimeout && clearTimeout(hideTimeout)
  );
  menu.addEventListener(
    "mouseleave",
    () => (hideTimeout = setTimeout(() => (menu.style.display = "none"), 100))
  );

  // Клік по кнопках
  menu.querySelectorAll(".context-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const taskId = menu.dataset.taskId;
      const action = btn.dataset.action;
      const card = document.querySelector(
        `.kanban-card[data-task-id="${taskId}"]`
      );
      const timerDiv = card.querySelector(".task-timer");

      menu.style.display = "none";

      const response = await fetch(
        `/project/time_logger/${taskId}/${action}/`,
        {
          method: "POST",
          headers: { "X-CSRFToken": csrftoken },
        }
      );
      const data = await response.json();

      if (data.error) {
        alert(data.error);
        return;
      }

      if (action === "start") {
        if (timers[taskId]) clearInterval(timers[taskId]);
        startTimes[taskId] = new Date(data.start_time); // беремо старт з сервера
        timers[taskId] = setInterval(() => {
          let diff = Math.floor((new Date() - startTimes[taskId]) / 1000);
          let min = String(Math.floor(diff / 60)).padStart(2, "0");
          let sec = String(diff % 60).padStart(2, "0");
          timerDiv.textContent = `${min}:${sec}`;
        }, 1000);
      }

      if (action === "stop") {
        // Відкриваємо модалку
        const modal = document.getElementById("timeLoggerModal");
        const modalBody = document.getElementById("timeLoggerModalBody");

        fetch(`/project/time_logger/${data.pk}/update/`)
          .then((res) => res.text())
          .then((html) => {
            modalBody.innerHTML = html;
            modal.style.display = "block";

            modal.querySelector("#closeModal").onclick = () =>
              (modal.style.display = "none");

            const form = modalBody.querySelector("form");
            form.onsubmit = async (e) => {
              e.preventDefault();
              const formData = new FormData(form);
              const response = await fetch(form.action, {
                method: "POST",
                headers: { "X-CSRFToken": csrftoken },
                body: formData,
              });
              if (response.ok) {
                modal.style.display = "none";
                location.reload();
              } else {
                alert("Failed to save description.");
              }
            };
          });
      }
    });
  });

  // Клік поза меню
  document.addEventListener("click", () => {
    menu.style.display = "none";
  });

  document.querySelectorAll(".kanban-card").forEach((card) => {
    const taskId = card.dataset.taskId;
    const timerDiv = card.querySelector(".task-timer");
    const startTimeStr = card.dataset.startTime;

    if (startTimeStr) {
      const startTime = new Date(startTimeStr);
      startTimes[taskId] = startTime;
      timers[taskId] = setInterval(() => {
        let diff = Math.floor((new Date() - startTime) / 1000);
        let min = String(Math.floor(diff / 60)).padStart(2, "0");
        let sec = String(diff % 60).padStart(2, "0");
        timerDiv.textContent = `${min}:${sec}`;
      }, 1000);
    }
  });
});
