import type { Meta, StoryObj } from "@storybook/react";
import { DataTable, type DataTableColumn } from "./data-table";
import { StatusBadge } from "./status-badge";

type Row = { id: string; name: string; doors: number; status: string };

const ROWS: Row[] = Array.from({ length: 23 }, (_unused, i) => ({
  id: `t${i + 1}`,
  name: `Turf ${i + 1}`,
  doors: 40 + ((i * 37) % 160),
  status: i % 5 === 0 ? "FAILED" : i % 2 === 0 ? "DONE" : "SYNCING",
}));

const COLUMNS: DataTableColumn<Row>[] = [
  { key: "name", header: "Turf", cell: (r) => <span className="font-medium">{r.name}</span> },
  { key: "doors", header: "Doors", numeric: true, cell: (r) => r.doors.toLocaleString() },
  { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
];

const meta: Meta<typeof DataTable<Row>> = {
  title: "DataTable",
  component: DataTable,
};
export default meta;

type Story = StoryObj<typeof DataTable<Row>>;

/** The default: 10 rows a page, pagination appears only when needed. */
export const Basic: Story = {
  args: { columns: COLUMNS, rows: ROWS, rowKey: (r: Row) => r.id },
};

export const Loading: Story = {
  args: { columns: COLUMNS, rows: [], rowKey: (r: Row) => r.id, loading: true, skeletonRows: 4 },
};

export const Empty: Story = {
  args: { columns: COLUMNS, rows: [], rowKey: (r: Row) => r.id, empty: "No turf cut yet." },
};

/** Clickable rows + a per-row tint via `rowClassName` (here: failing rows). */
export const Interactive: Story = {
  args: {
    columns: COLUMNS,
    rows: ROWS.slice(0, 8),
    rowKey: (r: Row) => r.id,
    onRowClick: () => {},
    rowClassName: (r: Row) => (r.status === "FAILED" ? "bg-error-container/20" : undefined),
  },
};
