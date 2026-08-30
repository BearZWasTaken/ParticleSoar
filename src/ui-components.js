export function updateRangeVisual(input) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 1;
  const value = Number(input.value) || 0;
  const progress = max === min ? 0 : ((value - min) / (max - min)) * 100;
  input.style.setProperty("--ps-range-progress", `${Math.min(100, Math.max(0, progress))}%`);
}

export function bindRangeControl(root, { format = String, onInput } = {}) {
  const input = root.querySelector('input[type="range"]');
  const output = root.querySelector(".ps-slider__value");
  const refresh = () => {
    updateRangeVisual(input);
    if (output) output.textContent = format(Number(input.value));
  };
  input.addEventListener("input", () => {
    refresh();
    onInput?.(Number(input.value));
  });
  refresh();
  return { input, refresh };
}

export function setRangeValue(control, value) {
  control.input.value = String(value);
  control.refresh();
}
