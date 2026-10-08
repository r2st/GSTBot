import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import GstNewsUpdates, { GST_NEWS } from "./GstNewsUpdates";

describe("GstNewsUpdates", () => {
  it("renders the section heading", () => {
    render(
      <MemoryRouter>
        <GstNewsUpdates />
      </MemoryRouter>,
    );
    expect(screen.getByText(/GST News/)).toBeInTheDocument();
  });

  it("renders all news items", () => {
    render(
      <MemoryRouter>
        <GstNewsUpdates />
      </MemoryRouter>,
    );
    for (const item of GST_NEWS) {
      expect(screen.getByText(item.title)).toBeInTheDocument();
    }
  });

  it("renders tags for each news item", () => {
    render(
      <MemoryRouter>
        <GstNewsUpdates />
      </MemoryRouter>,
    );
    expect(screen.getByText("Rate Change")).toBeInTheDocument();
    expect(screen.getByText("Deadline")).toBeInTheDocument();
    expect(screen.getByText("Compliance")).toBeInTheDocument();
    expect(screen.getByText("Filing")).toBeInTheDocument();
  });

  it("renders news items as links", () => {
    render(
      <MemoryRouter>
        <GstNewsUpdates />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole("link");
    const newsLinks = links.filter((l) => l.classList.contains("gst-news-card"));
    expect(newsLinks).toHaveLength(GST_NEWS.length);
  });

  it("shows summaries for all items", () => {
    render(
      <MemoryRouter>
        <GstNewsUpdates />
      </MemoryRouter>,
    );
    for (const item of GST_NEWS) {
      expect(screen.getByText(item.summary)).toBeInTheDocument();
    }
  });
});
