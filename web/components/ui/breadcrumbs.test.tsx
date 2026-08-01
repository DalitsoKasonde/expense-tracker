import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Breadcrumbs } from "./breadcrumbs";

describe("Breadcrumbs", () => {
  it("links every ancestor and marks the last crumb as the current page", () => {
    render(
      <Breadcrumbs
        items={[
          { label: "Home", href: "/today" },
          { label: "Portfolio", href: "/investments" },
          { label: "Add investment" },
        ]}
      />,
    );

    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/today");
    expect(screen.getByRole("link", { name: "Portfolio" })).toHaveAttribute(
      "href",
      "/investments",
    );
    // The page you are already on is not a link.
    expect(screen.queryByRole("link", { name: "Add investment" })).not.toBeInTheDocument();
    expect(trail.querySelector('[aria-current="page"]')).toHaveTextContent("Add investment");
  });

  it("does not link the last crumb even when it carries an href", () => {
    render(
      <Breadcrumbs
        items={[
          { label: "Home", href: "/today" },
          { label: "Portfolio", href: "/investments" },
        ]}
      />,
    );

    expect(screen.queryByRole("link", { name: "Portfolio" })).not.toBeInTheDocument();
  });

  it("renders nothing without crumbs", () => {
    const { container } = render(<Breadcrumbs items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
