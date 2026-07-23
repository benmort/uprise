import type { Meta, StoryObj } from "@storybook/react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";
import { Badge } from "./badge";

const meta: Meta<typeof Table> = {
  title: "Table",
  component: Table,
};
export default meta;
type Story = StoryObj<typeof Table>;

export const Default: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Ada Lovelace</TableCell>
          <TableCell>Owner</TableCell>
          <TableCell>
            <Badge variant="success" dot>
              Active
            </Badge>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Grace Hopper</TableCell>
          <TableCell>Organiser</TableCell>
          <TableCell>
            <Badge variant="warning" dot>
              Invited
            </Badge>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};
