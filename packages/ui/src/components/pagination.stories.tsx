import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Pagination } from "./pagination";

const meta: Meta<typeof Pagination> = {
  title: "Pagination",
  component: Pagination,
};
export default meta;
type Story = StoryObj<typeof Pagination>;

export const Default: Story = {
  render: () => {
    function Demo() {
      const [page, setPage] = useState(3);
      return <Pagination page={page} pageCount={12} onPageChange={setPage} />;
    }
    return <Demo />;
  },
};

export const FewPages: Story = {
  render: () => {
    function Demo() {
      const [page, setPage] = useState(1);
      return <Pagination page={page} pageCount={4} onPageChange={setPage} />;
    }
    return <Demo />;
  },
};
