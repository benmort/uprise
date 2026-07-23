import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import {
  Modal,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "./modal";
import { Button } from "./button";

const meta: Meta<typeof Modal> = {
  title: "Modal",
  component: Modal,
};
export default meta;
type Story = StoryObj<typeof Modal>;

export const Default: Story = {
  render: () => {
    function Demo() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open modal</Button>
          <Modal open={open} onOpenChange={setOpen}>
            <ModalContent>
              <ModalHeader>
                <ModalTitle>Modal title</ModalTitle>
                <ModalDescription>A Radix-backed dialog with focus trap + scroll lock.</ModalDescription>
              </ModalHeader>
              <p className="text-sm text-muted-foreground">Body content goes here.</p>
              <ModalFooter>
                <ModalClose asChild>
                  <Button variant="outline">Cancel</Button>
                </ModalClose>
                <ModalClose asChild>
                  <Button>Confirm</Button>
                </ModalClose>
              </ModalFooter>
            </ModalContent>
          </Modal>
        </>
      );
    }
    return <Demo />;
  },
};
