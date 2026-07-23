"use client";

// Kitchen Sink — the in-app catalogue of the @uprise/ui design system (companion to Storybook
// + COMPONENTS.md). Super-admin only. Renders every shared primitive live so the whole kit can
// be eyeballed against real tokens in both light + dark themes. This is also where the old
// future/form-elements demo now lives (the Forms section), on the shared primitives.
import { useState } from "react";
import { Bell, Inbox, Star } from "lucide-react";
import {
  Alert,
  Avatar,
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Carousel,
  CarouselItem,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  Image,
  Input,
  Label,
  Link,
  List,
  ListItem,
  Modal,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Pagination,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
  RadioGroup,
  RadioGroupItem,
  Ribbon,
  Select,
  SelectItem,
  Skeleton,
  Spinner,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TabNav,
  TabNavItem,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  useToast,
} from "@uprise/ui";

/** A titled block; each primitive group gets one. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="section-stack">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <div className="rounded-2xl border border-border bg-surface p-5">{children}</div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

export default function KitchenSinkPage() {
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [checked, setChecked] = useState(true);
  const [toggled, setToggled] = useState(true);
  const [radio, setRadio] = useState("email");
  const [select, setSelect] = useState("sms");
  const [tab, setTab] = useState("overview");
  const [navTab, setNavTab] = useState("all");
  const [page, setPage] = useState(3);

  return (
    <div className="page-stack">
      <div>
        <h1 className="text-3xl font-semibold text-foreground">Kitchen Sink</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every <code className="rounded bg-surface-variant px-1">@uprise/ui</code> primitive, live. See{" "}
          <code className="rounded bg-surface-variant px-1">packages/ui/COMPONENTS.md</code> for the catalogue.
        </p>
      </div>

      {/* ── Primitives ─────────────────────────────────────────────────────── */}
      <Section title="Buttons">
        <Row>
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="success">Success</Button>
          <Button variant="warning">Warning</Button>
          <Button variant="link">Link</Button>
        </Row>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="Star">
            <Star className="h-5 w-5" />
          </Button>
          <ButtonGroup>
            <Button variant="outline">Day</Button>
            <Button variant="outline">Week</Button>
            <Button variant="outline">Month</Button>
          </ButtonGroup>
        </div>
      </Section>

      <Section title="Badges">
        <Row>
          <Badge>Default</Badge>
          <Badge variant="neutral">Neutral</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="success" dot>
            Active
          </Badge>
          <Badge variant="warning" dot>
            Pending
          </Badge>
          <Badge variant="error" dot>
            Failed
          </Badge>
          <Badge variant="info">Info</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge size="sm">Small</Badge>
        </Row>
      </Section>

      <Section title="Avatar, Image, Link, Ribbon, Spinner">
        <Row>
          <Avatar name="Ada Lovelace" size="xs" />
          <Avatar name="Ada Lovelace" size="sm" />
          <Avatar name="Ada Lovelace" />
          <Avatar name="Grace Hopper" size="lg" />
          <Avatar name="Grace Hopper" size="xl" />
          <Image
            src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=96&h=96&fit=crop"
            alt=""
            rounded="lg"
            ratio="square"
            className="h-16 w-16"
          />
          <Link href="#">Default link</Link>
          <Link href="#" variant="muted">
            Muted link
          </Link>
          <Spinner />
        </Row>
        <div className="relative mt-4 h-24 w-56 overflow-hidden rounded-2xl border border-border bg-surface-variant">
          <Ribbon tone="primary" position="top-right">
            New
          </Ribbon>
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Card with ribbon</div>
        </div>
      </Section>

      {/* ── Forms (folds in the old future/form-elements demo) ─────────────── */}
      <Section title="Forms">
        <div className="grid max-w-xl gap-4">
          <Field label="Full name" htmlFor="ks-name" hint="As it appears on the electoral roll.">
            <Input id="ks-name" placeholder="Ada Lovelace" />
          </Field>
          <Field label="Message" htmlFor="ks-msg">
            <Textarea id="ks-msg" placeholder="Write something…" />
          </Field>
          <Field label="Channel" htmlFor="ks-channel">
            <Select value={select} onValueChange={setSelect} placeholder="Pick a channel">
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
            Send me updates
          </label>
          <RadioGroup value={radio} onValueChange={setRadio}>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <RadioGroupItem value="email" /> Email
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <RadioGroupItem value="sms" /> SMS
            </label>
          </RadioGroup>
          <div className="flex items-center gap-3">
            <Switch checked={toggled} onCheckedChange={setToggled} />
            <Label className="normal-case">Notifications {toggled ? "on" : "off"}</Label>
          </div>
        </div>
      </Section>

      {/* ── Feedback ───────────────────────────────────────────────────────── */}
      <Section title="Feedback">
        <div className="grid gap-3">
          <Alert variant="success" title="Saved" message="Your changes are live." />
          <Alert variant="warning" title="Heads up" message="This can't be undone." dismissible />
          <Alert variant="error" title="Something went wrong" message="Please try again." />
          <Alert variant="info" title="FYI" message="A new version is available." />
        </div>
        <div className="mt-4 grid max-w-md gap-3">
          <Progress value={72} />
          <Progress value={40} tone="success" size="sm" />
          <Progress value={90} tone="warning" size="lg" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="mt-4">
          <Button onClick={() => showToast({ tone: "success", title: "Toast!", description: "A notification fired." })}>
            Fire a toast
          </Button>
        </div>
        <div className="mt-4">
          <EmptyState title="Nothing here yet" description="Create your first item to get started." icon={Inbox} ctaLabel="Create" onCta={() => showToast({ tone: "info", title: "Create clicked" })} />
        </div>
      </Section>

      {/* ── Overlays ───────────────────────────────────────────────────────── */}
      <Section title="Overlays">
        <Row>
          <Button onClick={() => setModalOpen(true)}>Open modal</Button>
          <Modal open={modalOpen} onOpenChange={setModalOpen}>
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

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">Open popover</Button>
            </PopoverTrigger>
            <PopoverContent>
              <p className="text-sm font-semibold text-foreground">Anchored panel</p>
              <p className="mt-1 text-sm text-muted-foreground">Dismisses on outside-click or Escape.</p>
            </PopoverContent>
          </Popover>

          <Tooltip content="A helpful hint">
            <Button variant="outline">Hover me</Button>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Bell className="mr-1.5 h-4 w-4" />
                Menu
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem>Edit</DropdownMenuItem>
              <DropdownMenuItem>Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Row>
      </Section>

      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <Section title="Navigation">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Settings</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Kitchen Sink</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mt-4">
          <TabNav>
            {["all", "unread", "flagged"].map((t) => (
              <TabNavItem key={t} active={navTab === t} onClick={() => setNavTab(t)} className="cursor-pointer capitalize">
                {t}
              </TabNavItem>
            ))}
          </TabNav>
        </div>

        <div className="mt-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList variant="underline">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="text-sm text-muted-foreground">
              Overview panel.
            </TabsContent>
            <TabsContent value="activity" className="text-sm text-muted-foreground">
              Activity panel.
            </TabsContent>
          </Tabs>
        </div>

        <div className="mt-4">
          <Pagination page={page} pageCount={12} onPageChange={setPage} />
        </div>
      </Section>

      {/* ── Data display ───────────────────────────────────────────────────── */}
      <Section title="Cards, List, Table, Carousel">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Card title</CardTitle>
              <CardDescription>A bordered surface panel.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Body content.</CardContent>
            <CardFooter>
              <Button size="sm" variant="outline">
                Action
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>List</CardTitle>
            </CardHeader>
            <CardContent>
              <List variant="divided">
                <ListItem>First item</ListItem>
                <ListItem>Second item</ListItem>
                <ListItem>Third item</ListItem>
              </List>
            </CardContent>
          </Card>
        </div>

        <div className="mt-4">
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
        </div>

        <div className="mt-4">
          <Carousel>
            {["One", "Two", "Three", "Four"].map((s) => (
              <CarouselItem key={s} className="w-64">
                <div className="flex h-28 items-center justify-center rounded-2xl border border-border bg-surface-variant text-sm font-semibold text-foreground">
                  Slide {s}
                </div>
              </CarouselItem>
            ))}
          </Carousel>
        </div>
      </Section>
    </div>
  );
}
