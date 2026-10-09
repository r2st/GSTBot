import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GstAdvisor from "./GstAdvisor";

function renderAdvisor() {
  return render(<GstAdvisor />);
}

describe("GstAdvisor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the floating button initially", () => {
    renderAdvisor();
    expect(screen.getByLabelText("Open GST AI Advisor")).toBeInTheDocument();
  });

  it("opens the chat panel when the button is clicked", async () => {
    renderAdvisor();
    await userEvent.click(screen.getByLabelText("Open GST AI Advisor"));
    expect(screen.getByRole("dialog", { name: "GST AI Advisor" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ask a GST question...")).toBeInTheDocument();
  });

  it("shows the welcome message when no messages exist", async () => {
    renderAdvisor();
    await userEvent.click(screen.getByLabelText("Open GST AI Advisor"));
    expect(screen.getByText("Ask me anything about GST")).toBeInTheDocument();
  });

  it("closes the panel when the close button is clicked", async () => {
    renderAdvisor();
    await userEvent.click(screen.getByLabelText("Open GST AI Advisor"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Close advisor"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Open GST AI Advisor")).toBeInTheDocument();
  });

  it("sends a message and displays the reply", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [
              { content: { parts: [{ text: "The GST rate for IT services is 18%." }] } },
            ],
          }),
      }),
    );

    renderAdvisor();
    await userEvent.click(screen.getByLabelText("Open GST AI Advisor"));
    await userEvent.type(
      screen.getByPlaceholderText("Ask a GST question..."),
      "What is the GST rate for IT services?",
    );
    await userEvent.click(screen.getByLabelText("Send message"));

    expect(screen.getByText("What is the GST rate for IT services?")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("The GST rate for IT services is 18%.")).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("generativelanguage.googleapis.com"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows an error when the API call fails", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      }),
    );

    renderAdvisor();
    await userEvent.click(screen.getByLabelText("Open GST AI Advisor"));
    await userEvent.type(
      screen.getByPlaceholderText("Ask a GST question..."),
      "test",
    );
    await userEvent.click(screen.getByLabelText("Send message"));

    await waitFor(() => {
      expect(screen.getByText("Internal Server Error")).toBeInTheDocument();
    });
  });

  it("disables send when input is empty", async () => {
    renderAdvisor();
    await userEvent.click(screen.getByLabelText("Open GST AI Advisor"));
    expect(screen.getByLabelText("Send message")).toBeDisabled();
  });

  it("sends on Enter key", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [
              { content: { parts: [{ text: "Reply" }] } },
            ],
          }),
      }),
    );

    renderAdvisor();
    await userEvent.click(screen.getByLabelText("Open GST AI Advisor"));
    const textarea = screen.getByPlaceholderText("Ask a GST question...");
    await userEvent.type(textarea, "hello{enter}");

    await waitFor(() => {
      expect(screen.getByText("Reply")).toBeInTheDocument();
    });
  });

  it("clears the welcome message after the first user message", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [
              { content: { parts: [{ text: "Hi!" }] } },
            ],
          }),
      }),
    );

    renderAdvisor();
    await userEvent.click(screen.getByLabelText("Open GST AI Advisor"));
    expect(screen.getByText("Ask me anything about GST")).toBeInTheDocument();

    await userEvent.type(
      screen.getByPlaceholderText("Ask a GST question..."),
      "hello",
    );
    await userEvent.click(screen.getByLabelText("Send message"));

    expect(screen.queryByText("Ask me anything about GST")).not.toBeInTheDocument();
  });
});
