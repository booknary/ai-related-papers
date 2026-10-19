import {
  fetchModelCatalog,
  ModelConnection,
  ModelOption,
} from "./modelCatalog";

interface ModelSelectorOptions {
  window: Window;
  prefix: string;
  initialModel: string;
  getConnection: () => ModelConnection;
  saveModel: (model: string) => void;
  messages: {
    custom: string;
    current: (model: string) => string;
    loading: string;
    loaded: (count: number) => string;
    failed: (error: unknown) => string;
  };
  loadModels?: typeof fetchModelCatalog;
}

export function bindModelSelector(options: ModelSelectorOptions) {
  const { window, prefix, messages } = options;
  const doc = window.document;
  const select = doc.getElementById(
    `${prefix}-aiModel`,
  ) as HTMLSelectElement | null;
  const custom = doc.getElementById(
    `${prefix}-aiCustomModel`,
  ) as HTMLInputElement | null;
  const refresh = doc.getElementById(
    `${prefix}-aiFetchModels`,
  ) as HTMLButtonElement | null;
  const status = doc.getElementById(
    `${prefix}-aiModelsStatus`,
  ) as HTMLElement | null;
  if (!select || !custom || !refresh || !status) return;

  let currentModel = options.initialModel;
  let models: ModelOption[] = [];
  let version = 0;
  let controller: AbortController | undefined;
  const renderOptions = () => {
    select.replaceChildren();
    const append = (value: string, label: string) => {
      const option = doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "option",
      ) as HTMLOptionElement;
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    };
    if (currentModel && !models.some((model) => model.id === currentModel)) {
      append(currentModel, messages.current(currentModel));
    }
    for (const model of models) {
      append(
        model.id,
        model.name && model.name !== model.id
          ? `${model.name} (${model.id})`
          : model.id,
      );
    }
    append("", messages.custom);
    select.value = currentModel;
    custom.hidden = true;
    custom.value = currentModel;
  };
  renderOptions();

  select.addEventListener("change", () => {
    custom.hidden = Boolean(select.value);
    if (select.value) {
      currentModel = select.value;
      custom.value = currentModel;
      options.saveModel(currentModel);
    } else {
      custom.focus();
    }
  });
  custom.addEventListener("change", () => {
    const model = custom.value.trim();
    if (!model) {
      custom.value = currentModel;
      return;
    }
    currentModel = model;
    options.saveModel(model);
    renderOptions();
  });
  const invalidate = () => {
    version++;
    controller?.abort();
    refresh.disabled = false;
    models = [];
    status.textContent = "";
    renderOptions();
  };
  for (const suffix of ["aiBaseURL", "aiAPIKey"]) {
    doc
      .getElementById(`${prefix}-${suffix}`)
      ?.addEventListener("input", invalidate);
  }
  window.addEventListener(
    "unload",
    () => {
      version++;
      controller?.abort();
    },
    { once: true },
  );
  refresh.addEventListener("click", async () => {
    controller?.abort();
    controller = new (window as Window & typeof globalThis).AbortController();
    const requestVersion = ++version;
    refresh.disabled = true;
    status.textContent = messages.loading;
    try {
      const result = await (options.loadModels ?? fetchModelCatalog)(
        options.getConnection(),
        { signal: controller.signal },
      );
      if (requestVersion !== version) return;
      models = result;
      renderOptions();
      status.textContent = messages.loaded(models.length);
    } catch (error) {
      if (requestVersion !== version) return;
      status.textContent = messages.failed(error);
    } finally {
      if (requestVersion === version) refresh.disabled = false;
    }
  });
}
