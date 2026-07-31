import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge";
import { Button, buttonClass } from "./button";
import { Card, cardClass } from "./card";
import { Field, Input } from "./field";
import { PageShell } from "./page-shell";

describe("Button", () => {
  it("renders the shared button recipe", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.className).toContain("btn");
    expect(button.className).toContain("btn-primary");
  });

  it("defaults to type=button so secondary actions cannot submit a form", () => {
    render(<Button>Cancel</Button>);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute("type", "button");
  });

  it("still allows an explicit submit button", () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole("button", { name: "Submit" })).toHaveAttribute("type", "submit");
  });

  it("exposes the same recipe to links through buttonClass", () => {
    expect(buttonClass({ variant: "ghost" })).toBe("btn btn-ghost");
    expect(buttonClass({ variant: "danger", size: "sm", block: true })).toBe("btn btn-danger btn-sm btn-block");
  });
});

describe("Card", () => {
  it("renders the single card recipe with a chosen element", () => {
    render(<Card as="section" aria-label="Summary">Body</Card>);
    const card = screen.getByLabelText("Summary");
    expect(card.tagName).toBe("SECTION");
    expect(card.className).toBe("card");
  });

  it("supports padding and interactive variants", () => {
    expect(cardClass({ padding: "none" })).toBe("card card-flush");
    expect(cardClass({ padding: "lg", interactive: true })).toBe("card card-pad-lg card-interactive");
  });
});

describe("Field", () => {
  it("labels the control and links hint and error text", () => {
    render(
      <Field label="Amount" hint="Minor units" error="Required">
        {(props) => <Input {...props} />}
      </Field>,
    );
    const input = screen.getByLabelText("Amount");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(describedBy.split(" ")).toHaveLength(2);
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
    expect(input.className).toContain("control");
  });
});

describe("Badge", () => {
  it("carries tone through a token class", () => {
    render(<Badge tone="income">Paid</Badge>);
    expect(screen.getByText("Paid").className).toBe("badge badge-income");
  });
});

describe("PageShell", () => {
  it("renders one main element and no per-page viewport height", () => {
    render(<PageShell>content</PageShell>);
    const main = screen.getByRole("main");
    expect(main.className).toBe("page-shell");
    expect(main.className).not.toMatch(/min-h-/);
  });

  it("supports a narrow form width", () => {
    render(<PageShell width="narrow">content</PageShell>);
    expect(screen.getByRole("main").className).toContain("page-shell-narrow");
  });
});
