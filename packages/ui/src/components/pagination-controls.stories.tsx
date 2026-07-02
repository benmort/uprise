import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { PaginationControls } from "./pagination-controls";

/**
 * Prev / "Page X of Y" / Next control. `page` is zero-indexed; the label shows
 * `page + 1`. Prev disables on the first page, Next on the last.
 */
const meta: Meta<typeof PaginationControls> = {
  title: "PaginationControls",
  component: PaginationControls,
};
export default meta;
type Story = StoryObj<typeof PaginationControls>;

/** Page 2 of 10 – both buttons active. */
export const MiddlePage: Story = {
  render: () => {
    const [page, setPage] = React.useState(1);
    return (
      <PaginationControls
        page={page}
        pageSize={10}
        total={100}
        onPrev={() => setPage((p) => Math.max(0, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />
    );
  },
};

/** First page – Prev disabled. */
export const FirstPage: Story = {
  render: () => (
    <PaginationControls page={0} pageSize={10} total={100} onPrev={() => {}} onNext={() => {}} />
  ),
};

/** Last page – Next disabled. */
export const LastPage: Story = {
  render: () => (
    <PaginationControls page={9} pageSize={10} total={100} onPrev={() => {}} onNext={() => {}} />
  ),
};

/** Single page of results – both buttons disabled. */
export const SinglePage: Story = {
  render: () => (
    <PaginationControls page={0} pageSize={25} total={12} onPrev={() => {}} onNext={() => {}} />
  ),
};
