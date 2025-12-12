document.addEventListener("DOMContentLoaded", () => {
  const board = document.getElementById("kanbanBoard");
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
      delay: 100,
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

        item.classList.remove(`status-${oldStatus}`);
        item.classList.add(`status-${newStatus}`);

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
