import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddCliDialog, baseCommand } from "./AddCliDialog";
import type { ChatApi } from "../chat/api";

function makeApi(overrides: Partial<ChatApi> = {}): ChatApi {
  return {
    testCustomCli: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ChatApi;
}

function renderDialog(props: Partial<React.ComponentProps<typeof AddCliDialog>> = {}) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const api = props.api ?? makeApi();
  render(
    <AddCliDialog
      api={api}
      existingNames={props.existingNames ?? []}
      existingBaseCommands={props.existingBaseCommands ?? []}
      onSave={onSave}
      onClose={onClose}
    />,
  );
  return { onSave, onClose, api };
}

const nameInput = () => screen.getByLabelText("CLI name") as HTMLInputElement;
const commandInput = () =>
  screen.getByLabelText("CLI Prompt Command") as HTMLInputElement;
const testButton = () => screen.getByRole("button", { name: "Test" });
const saveButton = () => screen.getByRole("button", { name: "Save" });

describe("baseCommand", () => {
  it("returns the first whitespace-delimited token", () => {
    expect(baseCommand("opencode --prompt")).toBe("opencode");
    expect(baseCommand("  cline  ")).toBe("cline");
    expect(baseCommand("")).toBe("");
  });
});

describe("AddCliDialog", () => {
  it("disables Test and Save until both fields are non-empty", async () => {
    renderDialog();
    expect(testButton()).toBeDisabled();
    expect(saveButton()).toBeDisabled();

    await userEvent.type(nameInput(), "OpenCode");
    expect(saveButton()).toBeDisabled(); // command still empty

    await userEvent.type(commandInput(), "opencode --prompt");
    expect(testButton()).toBeEnabled();
    expect(saveButton()).toBeEnabled();
  });

  it("blocks a duplicate (case-sensitive) name with an inline error and disabled Save", async () => {
    renderDialog({ existingNames: ["OpenCode"] });
    await userEvent.type(nameInput(), "OpenCode");
    await userEvent.type(commandInput(), "something");
    expect(screen.getByText("Name already in use")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("blocks a reserved base command", async () => {
    renderDialog();
    await userEvent.type(nameInput(), "Mine");
    await userEvent.type(commandInput(), "codex --foo");
    expect(screen.getByText('"codex" is a reserved command')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("blocks a duplicate base command", async () => {
    renderDialog({ existingBaseCommands: ["opencode"] });
    await userEvent.type(nameInput(), "Mine");
    await userEvent.type(commandInput(), "opencode --stream");
    expect(screen.getByText('"opencode" is already registered')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("shows the not-ready message and re-enables buttons after a failed test", async () => {
    const api = makeApi({
      testCustomCli: vi.fn().mockRejectedValue({ kind: "binaryNotFound" }),
    });
    renderDialog({ api });
    await userEvent.type(nameInput(), "Mine");
    await userEvent.type(commandInput(), "nonexistent-cli");
    await userEvent.click(testButton());

    expect(
      await screen.findByText("Ensure that CLI tool is installed and authenticated"),
    ).toBeInTheDocument();
    // Buttons re-enable after completion so the user can edit and retry.
    expect(testButton()).toBeEnabled();
    expect(saveButton()).toBeEnabled();
  });

  it("shows a distinct timeout message when the test times out", async () => {
    const api = makeApi({
      testCustomCli: vi.fn().mockRejectedValue({ kind: "timedOut" }),
    });
    renderDialog({ api });
    await userEvent.type(nameInput(), "Mine");
    await userEvent.type(commandInput(), "hangs");
    await userEvent.click(testButton());
    expect(await screen.findByText("Test timed out")).toBeInTheDocument();
  });

  it("disables Save while a test run is in flight", async () => {
    let complete!: () => void;
    const api = makeApi({
      testCustomCli: vi.fn().mockReturnValue(
        new Promise<void>((res) => {
          complete = res;
        }),
      ),
    });
    renderDialog({ api });
    await userEvent.type(nameInput(), "OpenCode");
    await userEvent.type(commandInput(), "opencode --prompt {prompt}");

    expect(saveButton()).toBeEnabled();
    await userEvent.click(testButton());
    expect(saveButton()).toBeDisabled();

    complete();
    expect(await screen.findByText("Test succeeded")).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it("saves regardless of whether Test was run", async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <AddCliDialog
        api={makeApi()}
        existingNames={[]}
        existingBaseCommands={[]}
        onSave={onSave}
        onClose={onClose}
      />,
    );
    await userEvent.type(nameInput(), "  OpenCode  ");
    await userEvent.type(commandInput(), "opencode --prompt");
    await userEvent.click(saveButton());
    // Name is trimmed before persistence.
    expect(onSave).toHaveBeenCalledWith("OpenCode", "opencode --prompt");
  });
});
