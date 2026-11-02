function on(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("click", () => fn(el));
}

on("mark", () => {
  const out = document.getElementById("mark-out");
  if (out) out.textContent = "marked";
});

on("knock", () => {
  throw new Error("the shelf fell");
});

on("mutter", () => {
  console.error("the hinge squeaks");
});

on("ask", () => {
  fetch("/pantry");
});

on("drop", (el) => {
  el.textContent = "gone";
});

on("leave", (el) => {
  el.textContent = "out";
});

on("mug", (el) => {
  el.textContent = "bought";
});

on("ring", () => {
  const out = document.getElementById("ring-out");
  fetch("/bell").then(() => {
    if (out) out.textContent = "ding";
  });
});

on("fold", () => {
  const out = document.getElementById("fold-out");
  if (out) out.textContent = "folded";
});
