import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { ListFooter } from "./list-footer";

const meta: Meta<typeof ListFooter> = {
  title: "ListFooter",
  component: ListFooter,
};
export default meta;

type Story = StoryObj<typeof ListFooter>;

function Demo({ withSelector = false }: { withSelector?: boolean }) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  return (
    <ListFooter
      shown={Math.min(pageSize, 137 - page * pageSize)}
      total={137}
      noun="audiences"
      page={page}
      pageSize={pageSize}
      onPrev={() => setPage((p) => Math.max(0, p - 1))}
      onNext={() => setPage((p) => p + 1)}
      onPageSizeChange={withSelector ? setPageSize : undefined}
      pageSizeOptions={withSelector ? [10, 25, 50] : undefined}
    />
  );
}

export const Basic: Story = {
  render: () => <Demo />,
};

/** With the rows-per-page selector. */
export const WithPageSize: Story = {
  render: () => <Demo withSelector />,
};
