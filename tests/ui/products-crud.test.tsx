import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductsView } from "@/components/products/products-view";
import { ApiRequestError } from "@/lib/api/client";
import type { ProductsApi } from "@/lib/api/products";
import type { ProductDetailDto, ProductDto, ProductInput } from "@/lib/contracts/products";
import { emptyReferenceCounts } from "@/lib/products/references";
import { product, productDetail } from "../support/products";
import { renderWithFluent } from "../support/render";

// The Products page against an in-memory stand-in for the API: it keeps the catalogue,
// answers like the server (canonical SKU, duplicate refusal) and lets a test hold or
// fail any call. The server's own rules are tested against PostgreSQL elsewhere.

const printer = product({ sku: "PRN-80", name: "Receipt printer 80mm", serialised: true, vanMinimum: 3 });
const paper = product({ sku: "PAP-80", name: "Thermal paper 80mm", baseUnit: "roll", packUnit: "box", packSize: 50, vanMinimum: 100 });
const cable = product({ sku: "CBL-ETH", name: "Ethernet cable", vanMinimum: 10 });

const usedPaper = (p: ProductDto): ProductDetailDto =>
  productDetail(p, {
    references: { ...emptyReferenceCounts(), stockBalances: 2, stockMovements: 5 },
    locked: {
      sku: "PAP-80 can't be renamed: 2 stock balances and 5 stock movements already refer to it.",
      baseUnit: "The unit can't change: its quantities are already counted in rolls.",
      serialised: "Serial tracking can't be switched on: 5 stock movements already refer to this product.",
    },
    deletion: { allowed: false, reason: "can't be deleted: 2 stock balances and 5 stock movements refer to it." },
  });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

function fakeServer(initial: ProductDto[], used: Record<string, ProductDetailDto> = {}) {
  let rows = [...initial];
  let nextId = 1;
  const canonical = (input: ProductInput): ProductDto => ({
    id: `new-${nextId++}`,
    ...input,
    sku: input.sku.trim().toUpperCase(),
    restockPolicyNeedsReview: false,
    restockPolicyNote: null,
  });
  const api = {
    list: vi.fn(() => Promise.resolve(rows.map((p) => ({ ...p })))),
    get: vi.fn((id: string) => {
      const row = rows.find((p) => p.id === id);
      return row ? Promise.resolve(used[id] ? { ...used[id], ...row } : productDetail(row)) : Promise.reject(new ApiRequestError("gone", 404, "NOT_FOUND"));
    }),
    create: vi.fn((input: ProductInput) => {
      const made = canonical(input);
      if (rows.some((p) => p.sku === made.sku)) {
        const message = `Another product already uses the SKU ${made.sku}`;
        return Promise.reject(new ApiRequestError(message, 409, "CONFLICT", { fieldErrors: { sku: [message] } }));
      }
      rows = [...rows, made];
      return Promise.resolve(made);
    }),
    update: vi.fn((id: string, input: ProductInput) => {
      rows = rows.map((p) => (p.id === id ? { ...p, ...input, sku: input.sku.toUpperCase() } : p));
      return Promise.resolve(rows.find((p) => p.id === id)!);
    }),
    remove: vi.fn((id: string) => {
      const gone = rows.find((p) => p.id === id)!;
      rows = rows.filter((p) => p.id !== id);
      return Promise.resolve({ id, sku: gone.sku, name: gone.name });
    }),
  } satisfies ProductsApi;
  return { api, rows: () => rows, drop: (id: string) => (rows = rows.filter((p) => p.id !== id)) };
}

// Under jsdom, Fluent's focus manager (Tabster) can miss a modal's initial focus and leave the
// dialog (or, after it closes, the page) aria-hidden until focus moves. Real browsers were
// checked separately, so these queries look through aria-hidden and the dialogs are nudged once.
const table = () => screen.getByRole("table", { name: "Product catalogue", hidden: true });
const bodyRows = () => within(table()).getAllByRole("row", { hidden: true }).slice(1);
const rowNames = () => bodyRows().map((row) => within(row).getByRole("button", { hidden: true }).textContent);

async function findDialog(name: string | RegExp, role: "dialog" | "alertdialog" = "dialog") {
  const surface = await screen.findByRole(role, { name, hidden: true });
  const target = surface.querySelector<HTMLElement>("input, button, [tabindex]");
  act(() => target?.focus());
  return screen.findByRole(role, { name });
}
const button = (name: string) => screen.findByRole("button", { name, hidden: true });

async function openAddDialog(user: ReturnType<typeof renderWithFluent>["user"]) {
  await user.click(await button("Add product"));
  return findDialog("Add product");
}

async function fillAdd(user: ReturnType<typeof renderWithFluent>["user"], dialog: HTMLElement, sku: string, name: string) {
  await user.type(within(dialog).getByRole("textbox", { name: /^SKU/ }), sku);
  await user.type(within(dialog).getByRole("textbox", { name: /^Product name/ }), name);
}

describe("adding a product", () => {
  it("shows each error beside its field, announces them and focuses the first", async () => {
    const server = fakeServer([printer]);
    const { user } = renderWithFluent(<ProductsView api={server.api} />);
    const dialog = await openAddDialog(user);

    await user.clear(within(dialog).getByRole("textbox", { name: /^Unit of measurement/ }));
    await user.clear(within(dialog).getByRole("textbox", { name: /^Van minimum/ }));
    await user.type(within(dialog).getByRole("textbox", { name: /^Van minimum/ }), "2.5");
    await user.click(within(dialog).getByRole("button", { name: "Add product" }));

    const sku = within(dialog).getByRole("textbox", { name: /^SKU/ });
    expect(sku).toHaveFocus();
    expect(sku).toBeInvalid();
    expect(sku).toHaveAccessibleDescription(expect.stringContaining("Enter a SKU"));
    expect(within(dialog).getByRole("textbox", { name: /^Product name/ })).toHaveAccessibleDescription(expect.stringContaining("Enter a product name"));
    expect(within(dialog).getByRole("textbox", { name: /^Unit of measurement/ })).toBeInvalid();
    expect(within(dialog).getByRole("textbox", { name: /^Van minimum/ })).toHaveAccessibleDescription(expect.stringContaining("whole number"));
    expect(within(dialog).getByText("4 fields need attention.")).toBeVisible();
    expect(server.api.create).not.toHaveBeenCalled();

    // Fixing a field clears only its own message.
    await user.type(sku, "ok-1");
    expect(sku).toBeValid();
    expect(within(dialog).getByRole("textbox", { name: /^Product name/ })).toBeInvalid();
  });

  it("is pending while the server works, sends once, and confirms only after the server answers", async () => {
    const server = fakeServer([printer]);
    const held = deferred<ProductDto>();
    server.api.create.mockImplementationOnce(() => held.promise);
    const { user } = renderWithFluent(<ProductsView api={server.api} />);
    const dialog = await openAddDialog(user);
    await fillAdd(user, dialog, " lbl-1 ", "Label printer");

    await user.click(within(dialog).getByRole("button", { name: "Add product" }));
    const pending = within(dialog).getByRole("button", { name: "Adding…" });
    await user.click(pending);
    await user.keyboard("{Enter}");
    await user.keyboard("{Escape}");

    expect(server.api.create).toHaveBeenCalledTimes(1);
    expect(server.api.create).toHaveBeenCalledWith(expect.objectContaining({ sku: "LBL-1", name: "Label printer", baseUnit: "each", vanMinimum: 0, autoRestock: true, serialised: false }));
    expect(screen.getByRole("dialog", { name: "Add product" })).toBeVisible(); // still open, Escape ignored
    expect(screen.queryByText("Label printer was added.")).not.toBeInTheDocument();

    held.resolve({ ...product({ sku: "LBL-1", name: "Label printer", vanMinimum: 0 }), id: "n1" });
    expect(await screen.findByText("Label printer was added.")).toBeVisible();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add product" })).not.toBeInTheDocument());
    expect(screen.getByText(/No stock or equipment was created/)).toBeVisible();
  });

  it("refreshes the catalogue and keeps the search and sort order", async () => {
    const server = fakeServer([printer, paper, cable]);
    const { user } = renderWithFluent(<ProductsView api={server.api} />);
    await screen.findByRole("table", { name: "Product catalogue" });
    await user.click(screen.getByRole("columnheader", { name: "Name" })); // sort by name
    expect(rowNames()).toEqual(["Ethernet cable", "Receipt printer 80mm", "Thermal paper 80mm"]);
    await user.type(screen.getByRole("searchbox"), "e");

    const dialog = await openAddDialog(user);
    await fillAdd(user, dialog, "AAA-1", "Adapter");
    await user.click(within(dialog).getByRole("button", { name: "Add product" }));

    expect(await screen.findByText("Adapter was added.")).toBeVisible();
    await waitFor(() => expect(rowNames()).toEqual(["Adapter", "Ethernet cable", "Receipt printer 80mm", "Thermal paper 80mm"]));
    expect(screen.getByRole("searchbox")).toHaveValue("e");
    expect(server.api.list.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("says when a new product is hidden by the current search", async () => {
    const server = fakeServer([printer]);
    const { user } = renderWithFluent(<ProductsView api={server.api} />);
    await user.type(await screen.findByRole("searchbox"), "printer");
    const dialog = await openAddDialog(user);
    await fillAdd(user, dialog, "ZZZ-1", "Zip tie");
    await user.click(within(dialog).getByRole("button", { name: "Add product" }));

    expect(await screen.findByText(/clear the search to see it/)).toBeVisible();
  });

  it("keeps the entries and explains a duplicate SKU beside the field", async () => {
    const server = fakeServer([printer]);
    const { user } = renderWithFluent(<ProductsView api={server.api} />);
    const dialog = await openAddDialog(user);
    await fillAdd(user, dialog, "prn-80", "Another printer");
    await user.click(within(dialog).getByRole("button", { name: "Add product" }));

    const sku = within(dialog).getByRole("textbox", { name: /^SKU/ });
    await waitFor(() => expect(sku).toHaveFocus());
    expect(sku).toHaveValue("prn-80");
    expect(sku).toHaveAccessibleDescription(expect.stringContaining("Another product already uses the SKU PRN-80"));
    expect(within(dialog).getByRole("textbox", { name: /^Product name/ })).toHaveValue("Another printer");
    expect(screen.queryByText(/was added/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Add product" })).toBeEnabled();
  });

  it("does not claim success when the connection drops, and reloads the list to check", async () => {
    const server = fakeServer([printer]);
    server.api.create.mockRejectedValueOnce(new ApiRequestError("Couldn't reach the server. Check your connection and try again.", null));
    const { user } = renderWithFluent(<ProductsView api={server.api} />);
    const dialog = await openAddDialog(user);
    await fillAdd(user, dialog, "NEW-1", "New thing");
    await user.click(within(dialog).getByRole("button", { name: "Add product" }));

    expect(await within(dialog).findByText("We couldn't confirm the product was created.")).toBeVisible();
    expect(within(dialog).getByRole("textbox", { name: /^SKU/ })).toHaveValue("NEW-1");
    expect(screen.queryByText("New thing was added.")).not.toBeInTheDocument();
    await waitFor(() => expect(server.api.list.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("explains a server failure without leaking detail, and can be retried", async () => {
    const server = fakeServer([printer]);
    server.api.create.mockRejectedValueOnce(new ApiRequestError("The server ran into a problem. Try again in a moment.", 500, "INTERNAL"));
    const { user } = renderWithFluent(<ProductsView api={server.api} />);
    const dialog = await openAddDialog(user);
    await fillAdd(user, dialog, "NEW-2", "Second thing");
    await user.click(within(dialog).getByRole("button", { name: "Add product" }));
    expect(await within(dialog).findByText(/The server ran into a problem/)).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Add product" }));
    expect(await screen.findByText("Second thing was added.")).toBeVisible();
  });

  it("starts the next opening with a fresh form and closes without saving on Cancel", async () => {
    const server = fakeServer([printer]);
    const { user } = renderWithFluent(<ProductsView api={server.api} />);
    let dialog = await openAddDialog(user);
    await fillAdd(user, dialog, "TMP-1", "Draft");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(server.api.create).not.toHaveBeenCalled();

    dialog = await openAddDialog(user);
    expect(within(dialog).getByRole("textbox", { name: /^SKU/ })).toHaveValue("");
  });

  it("offers Add product on an empty catalogue", async () => {
    const server = fakeServer([]);
    const { user } = renderWithFluent(<ProductsView api={server.api} />);
    expect(await screen.findByRole("heading", { name: "No products yet" })).toBeVisible();
    await user.click((await screen.findAllByRole("button", { name: "Add product" }))[0]);
    expect(await screen.findByRole("dialog", { name: "Add product" })).toBeVisible();
  });
});

describe("editing a product", () => {
  async function openEdit(user: ReturnType<typeof renderWithFluent>["user"], name: string) {
    await user.click(await button(`${name}, view details`));
    const details = await findDialog(`${name} details`);
    const edit = await within(details).findByRole("button", { name: "Edit" });
    await waitFor(() => expect(edit).not.toHaveAttribute("aria-disabled", "true"));
    await user.click(edit);
    return findDialog(`Edit ${name}`);
  }

  it("is prefilled, saves canonical values, and refreshes the list and the open details", async () => {
    const server = fakeServer([printer, paper]);
    const { user } = renderWithFluent(<ProductsView api={server.api} />);
    const dialog = await openEdit(user, "Receipt printer 80mm");

    expect(within(dialog).getByRole("textbox", { name: /^SKU/ })).toHaveValue("PRN-80");
    expect(within(dialog).getByRole("switch", { name: "Each unit has a serial number" })).toBeChecked();
    expect(within(dialog).getByRole("textbox", { name: /^Van minimum/ })).toHaveValue("3");

    const name = within(dialog).getByRole("textbox", { name: /^Product name/ });
    await user.clear(name);
    await user.type(name, "  Receipt   printer 58mm ");
    const minimum = within(dialog).getByRole("textbox", { name: /^Van minimum/ });
    await user.clear(minimum);
    await user.type(minimum, "5");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Receipt printer 58mm was saved.")).toBeVisible();
    expect(screen.getByText(/Van restock lists were updated for the new setting/)).toBeVisible();
    expect(server.api.update).toHaveBeenCalledWith("PRN-80".toLowerCase() && printer.id, expect.objectContaining({ name: "Receipt printer 58mm", vanMinimum: 5 }));
    const details = await findDialog("Receipt printer 58mm details");
    expect(within(details).getByText("5 each")).toBeVisible();
    expect(within(table()).getByText("Receipt printer 58mm")).toBeVisible();
  });

  it("locks the SKU, unit and serial tracking of a used product and explains why", async () => {
    const server = fakeServer([paper], { [paper.id]: usedPaper(paper) });
    const { user } = renderWithFluent(<ProductsView api={server.api} />);
    const dialog = await openEdit(user, "Thermal paper 80mm");

    const sku = within(dialog).getByRole("textbox", { name: /^SKU/ });
    expect(sku).toHaveAttribute("readonly");
    expect(sku).toHaveAccessibleDescription(expect.stringContaining("can't be renamed"));
    expect(within(dialog).getByRole("textbox", { name: /^Unit of measurement/ })).toHaveAttribute("readonly");
    expect(within(dialog).getByRole("switch", { name: "Each unit has a serial number" })).toBeDisabled();
    // Pack and policy fields stay editable.
    expect(within(dialog).getByRole("textbox", { name: /^Pack name/ })).not.toHaveAttribute("readonly");
    expect(within(dialog).getByRole("textbox", { name: /^Van minimum/ })).not.toHaveAttribute("readonly");
  });

  it("keeps the entries and shows the server's refusal when a structural change slipped through", async () => {
    const server = fakeServer([paper]);
    const message = "The unit can't change: its quantities (2 stock balances) are already counted in rolls.";
    server.api.update.mockRejectedValueOnce(
      new ApiRequestError("Some of these changes would rewrite existing records, so nothing was saved", 409, "INVALID_STATE", { fieldErrors: { baseUnit: [message] } }),
    );
    const { user } = renderWithFluent(<ProductsView api={server.api} />);
    const dialog = await openEdit(user, "Thermal paper 80mm");
    const unit = within(dialog).getByRole("textbox", { name: /^Unit of measurement/ });
    await user.clear(unit);
    await user.type(unit, "metre");
    const detailCalls = server.api.get.mock.calls.length;
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect(await within(dialog).findByText("Those changes can't be saved.")).toBeVisible();
    expect(unit).toHaveAccessibleDescription(expect.stringContaining("already counted in rolls"));
    expect(unit).toHaveValue("metre");
    expect(screen.queryByText("Thermal paper 80mm was saved.")).not.toBeInTheDocument();
    // What the person saw is out of date: the details are asked for again.
    await waitFor(() => expect(server.api.get.mock.calls.length).toBeGreaterThan(detailCalls));
  });

  it("tells the person when the product was deleted by someone else", async () => {
    const server = fakeServer([paper]);
    server.api.update.mockRejectedValueOnce(new ApiRequestError("Product x was not found", 404, "NOT_FOUND"));
    const { user } = renderWithFluent(<ProductsView api={server.api} />);
    const dialog = await openEdit(user, "Thermal paper 80mm");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect(await within(dialog).findByText("This product no longer exists.")).toBeVisible();
  });

  it("warns that a flagged restocking policy stays flagged", async () => {
    const flagged = product({ sku: "KDS-15", name: "Kitchen display", restockPolicyNeedsReview: true, restockPolicyNote: "Hub says these ship direct.", autoRestock: false });
    const server = fakeServer([flagged]);
    const { user } = renderWithFluent(<ProductsView api={server.api} />);
    const dialog = await openEdit(user, "Kitchen display");

    expect(within(dialog).getByText("Restocking policy needs review")).toBeVisible();
    expect(within(dialog).getByText(/the flag and note stay until it is settled/)).toBeVisible();
  });
});

describe("deleting a product", () => {
  async function openDelete(user: ReturnType<typeof renderWithFluent>["user"], name: string) {
    await user.click(await button(`${name}, view details`));
    const details = await findDialog(`${name} details`);
    const del = await within(details).findByRole("button", { name: "Delete…" });
    await waitFor(() => expect(del).not.toHaveAttribute("aria-disabled", "true"));
    await user.click(del);
    return findDialog(/Delete this product\?|can.t be deleted/, "alertdialog");
  }

  it("asks for confirmation naming the product and SKU, then removes it after the server confirms", async () => {
    const server = fakeServer([printer, cable]);
    const held = deferred<{ id: string; sku: string; name: string }>();
    server.api.remove.mockImplementationOnce(() => held.promise);
    const { user } = renderWithFluent(<ProductsView api={server.api} />);
    const dialog = await openDelete(user, "Ethernet cable");

    expect(within(dialog).getByText("Ethernet cable")).toBeVisible();
    expect(within(dialog).getByText("CBL-ETH")).toBeVisible();
    expect(server.api.remove).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Delete product" }));
    await user.click(within(dialog).getByRole("button", { name: "Deleting…" }));
    expect(server.api.remove).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Ethernet cable was deleted.")).not.toBeInTheDocument();

    server.drop(cable.id);
    held.resolve({ id: cable.id, sku: "CBL-ETH", name: "Ethernet cable" });
    expect(await screen.findByText("Ethernet cable was deleted.")).toBeVisible();
    await waitFor(() => expect(rowNames()).toEqual(["Receipt printer 80mm"]));
    expect(screen.queryByRole("dialog", { name: "Ethernet cable details" })).not.toBeInTheDocument();
  });

  it("does nothing when cancelled", async () => {
    const server = fakeServer([cable]);
    const { user } = renderWithFluent(<ProductsView api={server.api} />);
    const dialog = await openDelete(user, "Ethernet cable");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(server.api.remove).not.toHaveBeenCalled();
    expect(rowNames()).toEqual(["Ethernet cable"]);
  });

  it("explains why a referenced product can't be deleted and offers no delete button", async () => {
    const server = fakeServer([paper], { [paper.id]: usedPaper(paper) });
    const { user } = renderWithFluent(<ProductsView api={server.api} />);
    const dialog = await openDelete(user, "Thermal paper 80mm");

    expect(within(dialog).getByText("This product can't be deleted")).toBeVisible();
    expect(within(dialog).getByText("2 stock balances")).toBeVisible();
    expect(within(dialog).getByText("5 stock movements")).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: /Delete product/ })).not.toBeInTheDocument();
  });

  it("mentions the open restock lines that go with an unused product", async () => {
    const server = fakeServer([cable], { [cable.id]: productDetail(cable, { removableRestockLines: 3 }) });
    const { user } = renderWithFluent(<ProductsView api={server.api} />);
    const dialog = await openDelete(user, "Ethernet cable");

    expect(within(dialog).getByText(/3 lines of open restock lists/)).toBeVisible();
  });

  it("shows the server's refusal when the product became referenced meanwhile, and keeps it", async () => {
    const server = fakeServer([cable]);
    server.api.remove.mockRejectedValueOnce(
      new ApiRequestError("Ethernet cable (CBL-ETH) can't be deleted: 1 stock movement refers to it. Deleting would erase stock, equipment, job or movement history, so the product is kept.", 409, "INVALID_STATE"),
    );
    const { user } = renderWithFluent(<ProductsView api={server.api} />);
    const dialog = await openDelete(user, "Ethernet cable");
    await user.click(within(dialog).getByRole("button", { name: "Delete product" }));

    expect(await within(dialog).findByText("The product wasn't deleted.")).toBeVisible();
    expect(within(dialog).getByText(/1 stock movement refers to it.*Nothing was changed/)).toBeVisible();
    expect(screen.queryByText("Ethernet cable was deleted.")).not.toBeInTheDocument();
    expect(rowNames()).toEqual(["Ethernet cable"]);
  });

  it("reports a lost connection as unconfirmed, not as deleted", async () => {
    const server = fakeServer([cable]);
    server.api.remove.mockRejectedValueOnce(new ApiRequestError("Couldn't reach the server. Check your connection and try again.", null));
    const { user } = renderWithFluent(<ProductsView api={server.api} />);
    const dialog = await openDelete(user, "Ethernet cable");
    await user.click(within(dialog).getByRole("button", { name: "Delete product" }));

    expect(await within(dialog).findByText("We couldn't confirm whether the product was deleted.")).toBeVisible();
    expect(screen.queryByText("Ethernet cable was deleted.")).not.toBeInTheDocument();
  });
});

describe("after a change", () => {
  it("warns when the list can't be reloaded, and reloads on request", async () => {
    const server = fakeServer([printer]);
    const { user } = renderWithFluent(<ProductsView api={server.api} />);
    const dialog = await openAddDialog(user);
    await fillAdd(user, dialog, "NEW-3", "Third thing");
    server.api.list.mockRejectedValueOnce(new ApiRequestError("The server ran into a problem. Try again in a moment.", 500));
    await user.click(within(dialog).getByRole("button", { name: "Add product" }));

    expect(await screen.findByText("Third thing was added.")).toBeVisible();
    expect(await screen.findByText("The list may be out of date.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(screen.queryByText("The list may be out of date.")).not.toBeInTheDocument());
    expect(rowNames()).toContain("Third thing");
  });
});
