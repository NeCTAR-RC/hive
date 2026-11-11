# Design notes

The rule (Hakkim, 2026-10-14): Hive mirrors the existing Horizon dashboard,
built from `@ardc-ui/react` components used exactly as shipped. Where no
component matches, the closest functionally equivalent one is used; where
none is equivalent, Hive builds its own from the ARDC design system (the
`ardc-ui-figma-spec` repo and the library tokens through
`src/styles/tokens.scss`) and records it here. Horizon is consulted for
function only (what a page does, lists and offers); no design value comes
from Horizon's CSS. The header is the design system's service header (the
`services-headers` spec), carrying the links Horizon's bar carries. The
band across its top with the "Explore ARDC" tab is the agency's
`<ardc-megamenu>` web component, loaded from ardc.edu.au as the footer's
`<ardc-footer>` is: every ARDC service shares the one mega menu, so Hive
does not draw its own (Hakkim, 2026-10-21).

Every rule block in Hive's styles names its source in a `///` docblock
beside it: a spec block and line, a library mixin or token, or a gap below.
The appendix "Sources by selector" collects those docblocks, and
`pnpm lint` fails when a block has none or the appendix is stale.

- "Gaps for Darcelle" are requests to the design system: design first, then
  spec, then library. Each says what Hive draws today and what a specced
  component would replace.
- "Engineering items for the library" are library bugs Hive works around or
  leaves alone.
- "Own decisions" are ours: choices made where the specs and the agreed plan
  were silent. Revisit any of them on request.

## Gaps for Darcelle

Ordered by where a designer meets them: the shell, navigation, tables and
lists, forms and dialogs, status and figures, charts, then whole pages.

### Shell

#### Service header: account menu and CTA slot

- Today: the services-headers spec draws navigation items, dropdown panels
  and a purple call-to-action button, but no signed-in account. Hive puts
  the user's name in the navigation row as one more dropdown item (My
  details, OpenStack RC file, Sign out), drawn like "Services", and leaves
  the CTA slot empty: the dashboard has no single action to promote there.
  On the public pages (signed out, the terms) a visitor without a session
  gets "Log in" in the CTA slot, the library primary link in its navigation
  tone at its small size (the drawn 40px Purple-500 button); below 1024px
  it is a row in the navigation dialog, since the Mobile frame draws no CTA.
- Specced: an account item, a signed-out state (where "Log in" goes on
  desktop and mobile), and guidance on when the CTA may stay empty.

#### Dashboard content width

- Today: the grids and layouts specs draw a 1200px content column for site
  pages. A data dashboard's list pages need the whole window for their
  tables, as Horizon's do, so Hive's frame under the header is fluid with
  the grid's 24px gutter; the header keeps the 1200px column (Hakkim,
  2026-10-15).
- Specced: a dashboard layout (content width, sidebar width, gutters).

#### Breakpoints

- Today: the grids spec names desktop, tablet and mobile frames but no
  widths, and marks the smaller two "to check w dev"; the library itself
  only uses 768px. Hive adds 480, 1024 and 1280px: side columns join at
  1280px (below that the main column would fall under about 500px beside a
  384px side column), two panels sit side by side from 1024px, and a search
  button moves beside its field from 480px.
- Specced: the widths of the grid's frames.

#### Page actions row

- Today: the hero spec puts a page's call to action 32px below the title
  block. A dashboard page's actions ("Launch instance", "Create volume")
  sit at the end of the title row from 768px, 12px apart, as Horizon places
  them, and stack under the title below that.
- Specced: a page title row with actions.

### Navigation

#### Vertical navigation: current page

- Today: the library has no vertical (sidebar) navigation. Hive's sidebar
  is the library `Accordion` (one item per section) holding the spec's
  related-list rows as the spec draws them (chevron and bold label; a
  plainer form without the chevron was tried on 2026-10-21 and put back
  the same day, Hakkim: the spec's row is the design system's), which draw
  no current state. A current page row
  reads Purple-500 without the hover underline and carries
  `aria-current="page"`. Home is the exception: Darcelle's 15 Oct 2026
  mockup fills it in Purple-500 with a white label and house glyph while
  it is the page shown, the only current state the mockup draws, so Hive
  fills Home alone. The library `Link` cannot show either state, so the
  rows are drawn from the spec rather than being the library `Link`.
- Specced: a current row (filled, or text only, and for which rows), or a
  vertical navigation component.

#### Navigation sections with chevrons

- Today: Darcelle's 15 Oct 2026 mockup draws the sidebar's sections
  ("Project", "Identity") as bold rows with a chevron at the end, and the
  groups inside them ("Compute", "Usage") as rows that fold the same way.
  Hive keeps the library `Accordion` as shipped for the sections (plus and
  minus, H4 titles, the 6px marker) and shows every group open under a
  Body/16/Bold title, as before.
- Specced: whether a navigation section is the `Accordion` or its own
  disclosure row with a chevron, and whether groups fold.

#### Small uppercase label

- Today: the same mockup labels the sidebar's project facts in small grey
  capitals ("RESOURCE BUNDLE", "PROJECT USAGE"); the Figma file has no
  uppercase label style. Hive draws it as Body/14/Bold Grey-500, uppercase,
  tracked 0.5px (the one tracking the design system draws, on the services
  header's "Explore ARDC"), in one mixin (`small-label`). The mockup's
  "SELECT PROJECT" over the project select is the library field's label as
  shipped ("Project", Body/16/Bold).
- Specced: a small label style, and whether a field's label takes it.

#### Home glyph

- Today: the library icon set has no home glyph. Hive draws a 24px house
  inline (the accordion's icon size), filled in the label's colour, for the
  sidebar's Home row.
- Specced: a home icon in the library set.

#### Text link that wraps

- Today: the library `Link` keeps its label on one line (it shares the
  button surface). Labels can be long ("Tutorial: Security Practices on the
  Nectar Cloud") or URLs (an ORCID iD, a container's public URL) and wider
  than a phone's column. Hive lets a URL break inside the link (library
  `sidebar-block-link-label`) and lays lists out so each column is as wide
  as its longest link.
- Specced: a text link for prose that wraps like the words around it.

#### Breadcrumb that is not a link

- Today: a page's trail starts with the dashboard and group names
  ("Project > DNS > Zones"), which have no page of their own. The library
  `Breadcrumb` always renders a link, so Hive passes `isDisabled` (React
  Aria's own prop on it): the crumb leaves the tab order and is announced
  as an unavailable link, drawn in the link's grey without the hover
  underline. It keeps the link's pointer cursor, which the library does
  not change for a disabled crumb.
- Specced: a plain-text crumb for a level with no page.

#### Target highlight

- Today: a link to one resource's security risks (`/security/risks#<id>`)
  scrolls to that resource's panel and rings it with the library focus ring
  (1.5px Purple-500, 4px out) at the panel's 4px radius while the address
  names it: a focus style borrowed for a "you are here" state.
- Specced: a target state.

### Tables and lists

#### Table toolbar

- Today: list pages carry a toolbar above the table: search, filters, a
  column chooser and refresh, with the page's own actions. The filter spec
  draws a sidebar filter panel, not an inline row. Hive lays the library
  controls out in one wrapping row, 12px apart: the search box from span 2
  to span 4 of the grid, each filter span 3. The reservation chart's filters
  and the console log's controls follow the same row.
- Specced: an inline table toolbar.

#### Table footer

- Today: the pagination spec centres the `Pagination` and draws nothing
  beside it. Dashboard lists also say how many rows there are and let users
  choose the page size, as Horizon does. Hive puts the count (Body/14
  Grey-500) at the start and a "Per page" `Select` (span 2) at the end,
  either side of the centred pagination, 32px under the table; on a phone
  the pagination takes its own line above them.
- Specced: a table footer with a count and a page size.

#### Batch actions

- Today: a list's batch actions sit in a "With selected" menu in the table
  toolbar, before "Columns": the library `Button` (secondary, extra small)
  opening the library `Menu`, as the row "Actions" menu does. It is always
  there, disabled while no row is selected, so ticking a row moves nothing
  (Hakkim, 2026-10-21; Horizon keeps its batch buttons in the table toolbar
  the same way). Its accessible name carries the count ("With selected,
  2"); React Aria's table announces selection changes. An action the
  selection rules out is listed disabled with the reason "Not available for
  the selected rows" (gap "Menu row with a reason"), and "Clear selection"
  is the last item, after a separator. Until 2026-10-21 a Purple-50 bar
  with the count and the actions appeared above the table on selection and
  pushed the table down.
- Specced: batch actions for a table (a selection bar, or a menu like
  this one).

#### Menu row with a reason

- Today: a row action can be unavailable with a reason ("Detach it from its
  instance first"). The library `Menu` has no description line, so the
  reason is the item's description under its label, Body/14 Grey-700, 4px
  below, as the header spec's mega menu rows pair a title with a
  description.
- Specced: a menu row description.

#### Danger row in a menu

- Today: row action menus hold destructive actions ("Delete instance"). The
  library `Menu` has no danger row, so the item looks like the others; the
  confirmation dialog that follows carries the danger tone.
- Specced: a danger menu row.

#### Menu trigger button

- Today: a button that opens a menu ("Actions" on a row and a detail page,
  "With selected" and "Columns" in a table toolbar) is the library `Button`
  (secondary, extra small) as shipped, with no sign that it opens a menu.
  The button spec has no dropdown variant and the library `Button` takes no
  chevron; the only chevroned trigger the design system draws is the
  "Services" item in the services header, a navigation item rather than a
  button. Hive keeps the plain button until one is designed (Hakkim,
  2026-10-21).
- Specced: a button with a dropdown chevron (a menu trigger variant).

#### Icon-only button

- Today: the table toolbar's refresh button is the library `Button`
  (secondary, extra small) holding the library `Rotate` glyph at the
  button's 16px icon size, named "Refresh" for screen readers; the glyph
  turns while the list reloads. The button spec draws icons beside a label
  only.
- Specced: an icon-only button (size, padding, focus ring).

#### Numeric columns in a table

- Today: the library `Table` aligns every column at the start. Hive sets
  tabular digits on numeric values (chart data tables, the bar list's
  figures) and leaves the alignment as shipped.
- Specced: right-aligned numeric columns.

#### List cap

- Today: a list inside a dialog (the files of an upload, one progress bar
  each; the instances a batch action applies to) scrolls after 320px
  (`--hive-list-max-height`), so the dialog's buttons stay in view.
- Specced: a capped, scrolling list.

### Forms and dialogs

#### Option list with descriptions

- Today: the launch wizard lists its boot sources (images, snapshots,
  volumes) as a radio group whose options carry a second line of details
  (size, minimum disk, owner) in Body/14 Grey-500. The library `RadioGroup`
  labels an option with one line. Hive keeps the library radios as shipped,
  12px apart, inside its own box: a Grey-100 rule at the 4px radius, 8px
  inset, scrolling after 384px (`--hive-picker-max-height`).
- Specced: a selectable list, or table row selection drawn for forms.

#### Card radios

- Today: the launch wizard's flavour step offers the flavour classes
  (Reserved, Balanced, Tiny, Preemptible, Other) as one choice whose
  options each need a title, a count with the cheapest rate and a
  sentence. The library `RadioGroupItem` is a list row with a one-line
  label. Hive's `ChoiceCards` (`components/ChoiceCards`) draws React Aria
  radios as cards in a grid of span 2 columns, 8px apart: 12px inside a
  Grey-100 rule at the 4px radius, Grey-50 under the pointer, the brand
  purple rule over Purple-50 when chosen, and the library radio's glyph
  beside a Body/16/Bold title, so the choice does not rest on colour alone.
- Specced: a card radio (a selectable card in a group), its states and
  how a group of them wraps.

#### Reorderable list

- Today: the launch wizard's networks step sets the instance's interface
  order once two networks are chosen. The design system has no drag and
  drop. Hive's `ReorderList` (`components/ReorderList`) is React Aria's
  `GridList` with `useDragAndDrop`: rows 4px apart in a Grey-100 rule at
  the 4px radius, each with a grip handle in the 16px icon frame, its
  position in Body/14/Bold Grey-500 and its name; a brand purple line as thick as the focus ring
  marks the drop point; the dragged row fades to half while its preview
  follows the pointer. The keyboard drags from the handle (Enter, the arrow
  keys, Enter), and focus comes back to the moved row.
- Specced: a reorderable list (handle glyph, row, drop indicator, dragged
  and focus states).

#### Wizard step status

- Today: wizards use the library `Stepper` as shipped, which marks a step
  done, current or to come. A wizard whose steps can be visited in any
  order also needs to say which steps are still incomplete and which hold
  errors ("(incomplete)", "(has errors)"), as an earlier Hive wizard drew
  with a local stepper. Hive does not draw it: step jumping waits for the
  library's `completedSteps`.
- Specced: a step status marker (pending, invalid) on the `Stepper`, with
  its words for screen readers.

#### Code text area

- Today: SSH public keys, cloud-init scripts and Heat templates are pasted
  into the library `TextArea`, in the body face.
- Specced: a code variant of the text area (monospace, perhaps no spell
  check).

#### File input

- Today: the design system has no file picker. Hive's `FileInput` takes the
  text field's label, helper and error anatomy and puts a library `Button`
  and the chosen file's name in a row, 8px apart.
- Specced: a file input.

#### Sticky summary

- Today: a create page's side column (the "Sidebar right" layout's span 4)
  stays in view while the form beside it scrolls: 16px under the window's
  top edge for the create cluster template summary, the database launch
  quota and the stack launch notes, 24px (the gutter) for the launch
  wizard's summary. Horizon's workflows keep their help panel beside the
  form the same way.
- Specced: a rule for side columns that follow the scroll (when they stick,
  how far from the edge).

#### Inline confirmation

- Today: detaching a volume in the attachments dialog asks "Detach?" in the
  attachment's own row, with "Yes, detach" and "Keep" 12px apart, rather
  than opening a second dialog over the first.
- Specced: an inline confirmation.

#### Typed confirmation

- Today: every destructive action confirms with the library `Dialog` and a
  danger button; none asks the user to type the resource's name first, as
  Horizon does not either. A typed confirmation (the name retyped before
  "Delete" enables) would suit the deletions that cannot be undone and
  cost the most, such as a share or a container with its objects.
- Specced: a confirmation dialog with a typed check, if the design system
  wants one at all.

### Status, figures and values

#### Status badge with tones

- Today: the library `Badge` has no tone. `StatusPill` is the `Badge` as
  shipped, so every status ("Active", "Error", "Shutoff") reads alike; its
  `tone` prop names the state but draws nothing, apart from the loader
  glyph a transitional state adds.
- Specced: a toned badge (success, warning, danger, information, neutral),
  so a failed resource stands out in a long list.

#### Meter with threshold tones

- Today: the library `Meter` draws one colour at every level. Quota and
  service unit usage say the level in the description ("82% used", "Over
  quota"), and over the limit a danger `Alert` sits under the meter. The
  reserve dialog's `StackedMeter` fills to the used share and its
  description says what the reservation would add ("7 of 20 days with 5
  added", then ": over the limit" past it).
- Specced: warning and over-limit tones with their thresholds, and a second
  fill for a pending share.

#### Quota meters above a list

- Today: the spec draws a meter only inside the sidebar's project block.
  Quotas above a list (zones, clusters, shares, share snapshots, database
  instances and backups) are the library `Meter` as shipped, 16px apart, in
  a span 4 column (384px, the sidebar block's width), so a track does not
  run the width of the page.
- Specced: a meter width outside the sidebar, or a quota block.

#### Status summary

- Today: the compute overview counts instances by status: the library
  `Badge` and a bold count (Body/16/Bold Grey-700), 8px apart, each a link
  to the filtered instance list, in rows 8px apart (the related list's
  gap).
- Specced: a count beside a status.

#### Stat figure

- Today: the design system draws no headline figure. The home page's usage,
  the compute overview's usage total, the usage trend total, the allocation
  usage tiles and the reserve dialog's figures are each an Info - Sidebar
  pair with the value in Heading/H3 Grey-900 under its Body/16/Bold label.
  Horizon draws the home figure as a large purple H1 between two lines of
  text.
- Specced: a figure style (size, colour, label placement, unit).

#### Code face and copyable value

- Today: the design system has no code face, so SSH keys, scripts, logs and
  identifiers are set in the body face. `CodeBlock` borrows the "Cite this
  resource" block (a grey block holding a white panel with the copy glyph),
  scrolling after 384px (`--hive-code-max-height`), an instance's console
  log after 576px. Copyable values (API endpoints, credentials, the EC2
  access key, a share's access keys) are the value and a copy button 8px
  apart.
- Specced: a code block (monospace, line handling, a copy control) and a
  copyable inline value.

#### Error alert with a reference

- Today: a failed request shows a danger `Alert` with what failed, the
  server's message, a request reference for support and a "Try again"
  button. The `Alert` has no title, reference or action anatomy, so the
  title is a bold lead-in ("Could not load the list: Service unavailable"),
  the reference a second line and the button under them, 8px apart.
- Specced: an alert with a title, a reference and an action.

#### Empty state

- Today: only the table draws an empty state (its own cell). A panel or
  page with nothing to show draws the CTA - Sidebar block's content
  (Heading/H4, Body/16 Grey-700 8px below, the action 24px below), without
  the block's border.
- Specced: a standalone empty state.

#### Inline loading placeholder

- Today: the design system draws one loading state, the 84px loader with
  "Loading items..." (library `Loading`). Hive's placeholders for a list, a
  paragraph or a figure are that `Loading`, far taller than a line of text.
- Specced: a small inline loader, or a skeleton.

### Charts

#### Charts

- Today: no spec draws a chart. Hive's usage charts (Recharts) draw their
  own marks and axes, a caption row with a "View as table" button, and a
  ranked bar list as their accessible stand-in. The tooltip is the library
  tooltip bubble, the bar list's tracks the library meter's track; the
  series colours (`--hive-chart-*`: Blue-600, Pink-500, Yellow-700,
  Green-500, Purple-500, Grey-500 for "Other") are a palette Hive picked.
- Specced: chart marks, axes, captions and a categorical palette.

#### Availability chart

- Today: no spec draws a timeline. The reservation availability chart
  (`SlotGantt`) keeps Hive's drawing on library tokens: a Grey-100 frame at
  the small radius scrolling after 512px (`--hive-timeline-max-height`);
  month headers alternating Grey-100 and Grey-300; day numbers white on
  Grey-900, today on Purple-500, both Body/12; a sticky label column of
  200px (152px below 768px; `--hive-timeline-label`) on Blue-100; 20px day
  columns; free slots as 20px bars in the chart green (`--hive-chart-4`),
  maintenance windows as 12px Orange-500 bars; today's column in Purple-50
  and every other row on Grey-50; a white wash at half opacity over the
  days a press would reserve. Its legend (Body/14 Grey-500, 16 by 12px
  swatches) has no spec either.
- Specced: a timeline or Gantt component.

#### Network topology

- Today: no spec draws a network diagram; Horizon draws a graph on a
  canvas. Hive lists each network as a sidebar block headed by its name in
  Heading/H5 with a 16px glyph, its badges at the end of the row, its
  subnets in a wrapping row, and what is plugged into it as rows 8px apart
  behind a 4px Grey-100 rail, inset 16px. Routers and ports on no network
  sit in a group outlined by a dashed 1px Grey-100 rule at the 4px radius,
  16px padding, the only dashed border in Hive.
- Specced: a topology view (or tree).

### Pages

#### Reading measure

- Today: no spec sets a line length for a paragraph on its own: the "Simple
  text - 75" frame draws its copy the full 1200px of the band. Hive's
  message pages (not found, signed out, the terms) follow the frame and run
  the band's content width. Intro paragraphs above a list or a form,
  single-column pages and the route error page are held to span 9 (894px),
  the narrow single column, so a line stays readable on a wide window.
- Specced: a reading measure.

#### Logo size

- Today: the login page shows the ARDC Nectar Research Cloud logo at the
  width of its form column, as Horizon's splash does (Sam's page). The
  logos spec draws the marks but names no size for a logo on a page of its
  own; the service header's 146px logo is the only specced use.
- Specced: a logo size for a page of its own.

#### News card

- Today: no card is drawn for a news article: the `ImpactCard` (made for
  case studies) has a date but no picture, the `ImageCard` needs a picture,
  so the home feed mixes the two. Neither marks a destination that opens in
  a new tab (only `SimpleCard` and `ResourceCard` take `externalLabel`).
- Specced: a news card with an optional picture and a new-tab mark.

#### CTA fine print

- Today: the `CTA` has one subtitle and a slot after the buttons drawn for
  keyword chips. Banners carry a line of small print (registration details,
  eligibility notes) that Horizon puts before the buttons; Hive puts it in
  that slot, after them, in Body/14 Grey-700.
- Specced: a fine-print slot in the CTA.

## Engineering items for the library

### Dialog overlay stacking

The `Modal` overlay is `position: fixed` with no z-index, so a consumer's
positioned header with a z-index paints above the dimmed overlay. Hive makes
its app root a stacking context (`isolation: isolate` on `#root`), so
overlays portalled to the end of `body` paint above it. The agency mega
menu sits a layer above the app root so its panels cover the page; every
`body` child after the root takes that layer too (zero specificity), so
the overlays, later in the page, still cover the menu. A z-index token on
the overlay would remove the need for consumers to know this.

### Link icon in a wrapping label

The `sidebar-block-link-label` mixin lets a `Link` label wrap, but the
link's trailing icon (`iconAfter`, the new-window icon) has no
`flex-shrink: 0`. When the label wraps, the icon shrinks (to 8.6px from 18px
on "Tutorial: Security Practices on the Nectar Cloud" in a home quick links
block at 1440px) and sits at the far end of the row rather than after the
last word. Hive uses the `Link` as shipped.

### OverlayScrollbar input listener

`OverlayScrollbar` updates its thumb from a native `input` listener on the
scrolling element, setting React state there. The features review
(2026-10-15) found that a keystroke typed while that re-render is pending
can be dropped in a `TextArea`. Deferring the update to the next animation
frame was the review's suggestion; the fix belongs in the library, and Hive
does not work around it.

### Button transitions and reduced motion

The library button mixin sets `transition: $btn-transition` (all 0.3s,
ease-in-out) with no `prefers-reduced-motion` guard, while its overlay,
progress and loader mixins have one. Hive's global reduced-motion rule cuts
every transition to 0.01ms, so Hive's users are covered; other consumers
are not.

## Own decisions

Layer 1 dates from 2026-10-14, the later layers from 2026-10-15, unless a
bullet says otherwise. Each bullet names its source in its text or in
parentheses at its end.

### Layer 1: shell

Typography and icons:

- Page heading ramp, one to one: h1 is Heading/H1 (36/44, the page title
  under breadcrumbs), h2 is H2, and so on to h5. Below 768px h1 to h3 take
  Mobile/Heading/H1 to H3; h4 and h5 have no mobile style and stay
  (typography spec; hero "With Breadcrumbs").
- Text styles reach modules as `font` shorthands (`--hive-text-h3`,
  `--hive-text-body-16-bold`, ...) built in `tokens.scss` from the tokens of
  the library's `text-style` map; modules set the colour separately
  (library typography tokens).
- The global focus ring applies only to raw elements that are not React
  Aria (`:not([data-rac])`), and not to `tabindex="-1"` targets (`main`,
  page headings), which take focus from script after a navigation (library
  focus ring tokens).
- The shell draws no lucide glyphs. Chevrons are the library's
  (`ChevronDown`, `ChevronRight`); the navigation button's list glyph and
  the sidebar's Home house are drawn inline (services-headers "Icon/List";
  gap "Home glyph"; the library icon set has neither).

Service header (services-headers spec: the 1440 `main` cell and the 1280
and 1024 `Stacked` cells from 1024px, the `Mobile` frame below):

- In flow, not sticky, as the spec and ardc.edu.au draw it. Its content
  keeps to the grid's 1200px column, with the 24px gutter once the viewport
  is narrower (the spec's cells put the logo 120px in from a 1441px bar).
- The spec's 20px band with the "Explore ARDC" tab is the agency mega menu
  (`<ardc-megamenu>`, Hakkim 2026-10-21: the locally drawn tab led straight
  to ardc.edu.au and its look drifted from the agency's). index.html places
  it with the attributes of the Nectar Dashboard integration (Gerrit 67353):
  `data-host="ARDC Nectar Research Cloud"` (its "You are in" crumb) and
  `data-content-width="full"`: the component spans the window, so its tab
  sits at the window's right edge, less the component's own padding, at
  every width. The footer keeps "normal". The tab no longer lines up with
  the header's 1200px column and no longer needs to: the header column
  does not set the menu's width (designer preference, 22 Oct 2026; it
  replaces the "normal" 1280px column chosen on 2026-10-22). The menu stays
  in the body column (its stylesheet positions it absolutely over the
  page), a layer above the app so its panels open over the header, sidebar
  and page, with the dialogs' overlays above it; body clips it, so its
  tab's decoration cannot widen or scroll the page. Its strip is reserved from
  1200px before it hydrates. The app appends its loader
  (`shell/megamenu.ts`) and hides the element if the loader fails, with no
  inline handler for a CSP to block. Below 1200px the component collapses
  the strip and shows its own floating "Explore ARDC" button at the
  window's foot, which opens its drawer; Hive leaves that as supplied.
  Being first in the page, its tab is the first tab stop, before the skip
  link.
- Decision (designer preference, 22 Oct 2026; Hakkim: a mix of both
  headers): the header carries the Nectar logo, the mega menu's Explore
  ARDC tab is full width (above), and the mobile handling stays ours (the
  bar and the navigation dialog below). The ARDC logo no longer appears in
  the header, because the mega menu above it is the ARDC-owned part. This
  replaces the spec's ARDC mark ("ardc-logo 1", 146x47, 141x45 on the
  Mobile frame); the geometry around it follows.
- The logo is `public/logo.svg` (alt "ARDC Nectar Research Cloud"), 47px
  high at every width with its width following its proportions (152px),
  beside the product name "Nectar Dashboard" (the logo already reads
  Nectar Research Cloud). The name is set in a 100px box, 24px after the
  logo, so it takes two lines at every width (Frame 1307, Frame 1308; the
  spec's 31px gap and 233px box belong to the ARDC mark).
- Navigation items are 32px apart, as in the 1280 and 1024 sets (the
  1854px-wide 1440 cell spaces them 44px). They stand at the foot of the
  100px row, so the 4px hover rule meets the header's bottom edge, drawn
  inside the item so the label does not move; the brand is centred in the
  row (Nav Service Menu, Breakpoint=Desktop).
- An open dropdown item keeps the hover look; its chevron does not turn
  (the spec draws no open state).
- From 1024px to about 1200px the account name gives way (an ellipsis),
  never the navigation; at full width the whole name shows, as Horizon
  shows it (Stacked cells).
- Dropdown panels are React Aria `MenuTrigger`, `Popover` and `Menu` styled
  from `Frame 1336`, not the library `Menu`, which draws its rows to a
  different frame (12px padding, purple hover text, no chevron, a 320px
  cap). On Hive's white page the panel takes the library menu's Grey-100
  rule and shadow (the spec draws it on grey with no edge). It opens 7px
  under the header; rows carry no description (Horizon's menus have none);
  keyboard focus adds the library menu row's ring just inside the row; each
  menu is named by its trigger (Frame 1336, "Mega Menu Nav Links").
- Mobile: the bar keeps 16px from both edges (the frame draws the logo row
  18px in, the tab and the list icon 16px; 16 is the grid step). The title
  takes the room beside the logo, up to 233px, in 14/18: the Mobile frame's
  98px box would break it over four lines and grow the 71px bar (Mobile,
  Frame 1308).
- The navigation button is a React Aria button around the 24px list glyph
  in Grey-900 with the library focus ring; no hover (none drawn; Icon/List).
- The navigation dialog (library `Modal` and `Dialog`) carries the header's
  links as related-list rows: Support Centre, Tutorials, Request help, the
  "Services" group, then the user's name with My details, OpenStack RC file
  and Sign out; below 768px the sidebar's content comes first. "Request
  help" closes the dialog before the help widget opens. Parts are 12px
  apart, groups 20px (library dialog body gap; Info - Sidebar gap). The
  agency mega menu's own button stands for the Mobile frame's "Explore
  ARDC" tab.

Sidebar (library `Accordion`; sidebar-blocks spec):

- The docked column is span 3 (282px), 24px from the page, from 768px, and
  stays 282px below 1200px so the project field and labels stay whole. It
  runs the frame's full height and scrolls on its own, as Horizon's does
  (see "Page frame"). Where the browser draws classic scrollbars, the
  scrollbar takes its width from the column's content. No collapse rail
  and no leading icons except Home's (grids spec; gap "Home glyph").
- The sidebar is styled after Darcelle's second 15 Oct 2026 mockup
  (`dashboard-styles-only.png`, posted in the group conversation with Sam
  and Hakkim, "keeping all the horizon stuff"; Hakkim 2026-10-21): the
  project block unboxed, in the sidebar's one white panel on the canvas
  (decision "Canvas and panels").
- The project block, top to bottom as in the mockup: the library `Select`
  (or `Combobox` past eight projects) with the library field label as
  shipped, "Learn more about allocations", the labelled pairs (the small
  uppercase label, gap "Small uppercase label", over Body/16 Grey-700, 4px
  apart, the library `InfoButton` 4px after the label), the library `Meter`
  as "Project usage", then "Usage summary" and "Limit summary". The links
  stay related-list rows (chevron, bold label), as the mockup draws them
  bold; parts keep the Info - Sidebar block's 20px gap (Info - Sidebar,
  line 120).
- Every list row is one Hive row: a React Aria link drawn with the library
  `sidebar-block-link-row` and `sidebar-block-link-icon` mixins, label
  Body/16/Bold Grey-700, Purple-500 and underlined on hover, with the
  library Link's focus ring; a long label wraps beside its chevron. The
  navigation's page rows are the same spec row, chevron and all (Hakkim,
  2026-10-21: the design system's row as drawn, not a plainer form of
  Hive's own). The current page's row is the gap "Vertical navigation:
  current page" (Related list - Sidebar, lines 899 and 1909).
- Home is a row above the `Accordion`, 16px from it (the clearance the
  accordion keeps either side of a title); the project block sits 24px
  above Home (accordion spec; grid gap). As in the mockup it runs its
  container's full width (out by a gutter: to the sidebar panel's outer
  edge, over the panel's rule, and to the edge of the navigation dialog's
  24px padding), 12px above and below a Body/16/Bold label with
  the house glyph 8px before it: Grey-700 at rest, Purple-500 and underlined
  on hover; filled Purple-500 with white text while home is shown (gap
  "Vertical navigation: current page"). Its focus ring is drawn just inside
  the row, which reaches the container's edge, in the library's ring colour
  for a filled surface (Yellow-500) while filled.
- The sections (Project, Identity, Allocations, Account) are one library
  `Accordion` as shipped, one open at a time as Horizon opens one dashboard
  at a time (Hakkim, 2026-10-21); titles are h2 in the accordion's H4
  style. The open section persists in localStorage (`hive.sidebar.section`);
  with nothing stored, Project starts open; the section holding the current
  page opens on load and on navigation into it (behaviour; no spec frame).
- Group titles ("Compute", "Network") are h3 in Body/16/Bold Grey-900, 4px
  over their rows, which sit 12px in under the title as the mockup indents
  them (every titled group of rows, the navigation dialog's "Services" and
  account groups too); an untitled run ("API access", "Security risks")
  stays level with the titles. Groups are 20px apart and always open (gap
  "Navigation sections with chevrons"); names are sentence case in the
  navigation registry ("Container infra", "Object store") (Info - Sidebar
  title and gap).
- Rows that still open in Horizon carry the screen reader text "(opens in
  the current dashboard)"; while a project switch is in flight the switcher
  is disabled and says "Switching project" (behaviour; library `Select`
  helper text).
- The usage meter reads "1,234.5 / 5,000" beside its "SU used" label, the
  unit in the label so label and value stay on one line (library `Meter`
  header row).

Page frame and header:

- The public pages (signed out, the terms, a 404 for a visitor without a
  session) wear the service header over one scrolling column, with "Log in"
  in its CTA slot without a session and the account menu with one; the
  login page stands alone under the mega menu, with no header or footer
  (Hakkim, 2026-10-22; gap "Service header: account menu and CTA slot").
- The dashboard's canvas is Grey-50 (`--hive-color-canvas`), the library's
  grey surface, laid by the signed-in frame (`AppLayout`) over the window's
  white, with the sidebar and the page as white panels on it (decision
  "Canvas and panels"). Everything outside that frame (login, the
  signed-out frame's pages, a whole-page error) keeps the white window.
- The frame under the header is fluid; the sidebar's and the page's panels
  each stand the grid's 24px gutter in from the frame's edges, and keep
  the 24px panel padding around their content (gap "Dashboard content
  width"; grids spec, whose tablet and mobile 24px are "to check w dev").
  The padding counts the panel's 1px rule, so the content sits exactly a
  gutter in, as in the sidebar's panel. Below 768px the page panel's inset
  and padding are 16px instead (own decision): the gutter twice over would
  leave the page a quarter narrower than a 390px window; with 16px the
  content is 64px narrower (16px canvas, then 16px to the content with the
  1px rule included, either side).
- The window never scrolls, as in Horizon's theme (`#sidebar` and
  `#content_body` scroll, the footer inside the content column; Hakkim,
  2026-10-21): the mega menu and the header stay put; under them the
  sidebar and the content column scroll on their own, and the agency
  footer closes the content column (and the signed-out frame's single
  column). The router's scroll restoration follows the columns (their
  `data-scroll-restoration-id`): a new page starts the content column at
  the top, Back returns it and the sidebar to where they were, and the
  sidebar keeps its place across pages. Focus moves to the new page's
  heading without scrolling, so it cannot undo a restored position. Body
  clips anything placed against the page past the window (the footer's
  newsletter verification widget), so no script can scroll the window
  either.
- Canvas and panels (designer preference, Darcelle, 22 Oct 2026: "a light
  grey body background with everything in panels or cards"). The canvas
  behind the signed-in shell is Grey-50 (`--hive-color-canvas`, bridged from the
  library's `$card-background-grey`; the library has no page canvas token),
  and the areas below the header are white panels on it, each a gutter in
  from the frame's edges:
  - Panels: the sidebar (project block and navigation; the library sidebar
    block through the `panel` mixin, so its rule, radius and padding are
    every Hive panel's; the column is the scroll box and the panel grows
    with its content) and the page (breadcrumbs, heading, actions and
    content; the block's white surface, Grey-100 rule and radius through
    the `panel-surface` mixin, with the page's own layout, 24px padding and
    the height of its page, so a short page leaves canvas above the
    footer). Tables, cards and sidebar blocks inside a page keep their own
    chrome and stand a gutter inside the page panel, never against its edge
    (checked by script on every page at 1440px).
  - Canvas: the gutters between the panels and the agency footer below the
    page panel (the vendor component, as supplied).
  - White, not panels: the service header and the mega menu above the
    frame. The signed-out frame, the login page, and a whole-page error
    shown without the shell keep the white window; they are not made of
    panels.
  - Below 1024px the canvas and the page panel apply as above, and below
    768px the page panel's inset shrinks to 16px (see the frame bullet in
    Layer 1); the navigation dialog keeps the library dialog's surface.
  - Replaces: the header's foot rule and the sidebar's end rule, which drew
    three areas on white (Hakkim, 2026-10-21: the areas ran together;
    Darcelle's 15 Oct 2026 mockups). The content-blocks pattern of white
    blocks on a Grey-50 section was set aside then because it nests each
    page's blocks in a block; the designer's 22 Oct preference takes that
    nesting on.
- Page header: the library `Breadcrumbs` 16px above the title and 24px from
  the content below; from 768px the actions sit at the end of the title row
  on its baseline, 12px apart, stacking under the title 12px down below
  that; a title that is one long token breaks rather than widening the page
  (hero "With Breadcrumbs", Frame 387; gap "Page actions row").
- The skip link is the library `Link` as a small primary button, positioned
  only: hidden until focused, then fixed a gutter in from the top start
  corner. Deviation from the agreed plan, which named the secondary button:
  the secondary button is unfilled, so the header showed through it. Its
  href carries the current path and query (the router resolves a bare
  "#main" against the site root); pressing it moves focus to `main`
  (library `Link` as shipped).
- The shell renders no raw anchors other than the agency footer's content,
  which the component reads as plain anchors; the global `a` rule (link
  colour only) is for anchors in feature pages (library link colour).
- The agency footer's own acknowledgement of Country replaces the wording
  the local footer carried (`ardc-footer` as supplied). The layouts render
  it from React (`shell/ArdcFooter.tsx`, the same lists that sat in
  index.html): a custom element upgrades whenever it is connected, so one
  mounted after the loader ran hydrates too. On hydration it moves its
  lists into its shadow root; the markup is static, so React never touches
  them again. Known limitation of the component: it places the newsletter
  form's verification widget on body in page coordinates and moves it as
  the column scrolls, so on a window short enough for the form to pass
  under the header (a phone) the widget paints over the header meanwhile.

### Layer 2: shared components

- `Panel` is the sidebar block (library `sidebar-block` through Hive's
  `panel` mixin: 24/24/16 padding, 1px Grey-100, 4px radius). Its title is
  Heading/H4 at either heading level, as the CTA - Sidebar block titles
  itself; no ruled head. Actions sit in the block's action row
  (`sidebar-block-actions`) under the title, and show even when a panel has
  no title. Title, actions and content are 8px apart (CTA - Sidebar heading
  to text gap). Every feature surface that includes `panel` is that block.
- `KeyValueList` draws the Events - Sidebar pairs: Body/16/Bold Grey-900
  label over a Body/16 Grey-700 value, 4px apart, two pairs to a row 16px
  apart, rows 20px apart; one pair to a row below 480px so long identifiers
  are not cut into slivers. A library `Link` in a value wraps through
  `sidebar-block-link-label` (Events - Sidebar, line 1970).
- `StatusPill` is the library `Badge` as shipped; the `progress` state adds
  the library loader glyph at the badge's 14px (library `Badge`; gap
  "Status badge with tones").
- `StackedMeter` is the library `Meter` filled to the used share and named
  by its `label`; the description gives the total and what the choice adds,
  rounded to whole units; a limit of zero reads as a full bar (library
  `Meter`; gap "Meter with threshold tones").
- `QuotaMeter`'s unlimited row is the meter's header row: label Body/16/Bold
  Grey-700 and readout Body/14 Grey-700 on one baseline, at least 16px
  apart; the over-quota alert sits 12px under the meter (library progress
  header tokens; the meter's label to track gap).
- `Skeleton` and `SkeletonLines` render the library `Loading` without a
  message, hidden from assistive technology; their size props are accepted
  and ignored. A loading `DataTable` shows `Loading` with "Loading items..."
  in its empty cell, hidden too, since the table's live region says
  "Loading" (pagination spec, loading frame).
- A `DataTable` with no rows puts `emptyTitle` and `emptyBody` in the
  library table's empty cell (Body/14 Grey-500, centred). A standalone
  `EmptyState`'s title is a paragraph in the H4 style, not a heading, so it
  does not add to the outline (library table empty state; gap "Empty
  state").
- `DataTable`: toolbar, notices and table 12px apart, every toolbar control
  12px from the next; the footer 32px under the table with the `Pagination`
  centred in the table's width; toolbar and footer widths are grid spans
  (paddings-and-margins card row to pagination gap; gaps "Table toolbar",
  "Table footer", "Batch actions").
- A disabled row action's reason is the menu item's description (React Aria
  `Text slot="description"`), so screen readers hear it with the item (gap
  "Menu row with a reason").
- The row "Actions" menu and the toolbar's "With selected" menu are one
  component (`ActionsMenu`). A batch action carries no reason of its own:
  it is disabled when no selected row allows it, so every disabled batch
  action reads "Not available for the selected rows". When a batch or
  "Clear selection" empties the selection, the trigger the menu would hand
  focus back to is disabled, so focus moves to the table instead (gap
  "Batch actions"). Added 2026-10-21.
- `CodeBlock` follows "Cite this resource" on grey: a Grey-50 block, 16px
  padding and gap, its label in the chooser label's style (Body/16/Bold
  Grey-700), then the white citation panel (1px Grey-100, 4px radius, 16px
  padding) holding the text in Body/14 Grey-700 and the 24px Grey-500 copy
  glyph, 8px apart, level with the last line. Long text scrolls, or wraps
  with `wrap`, breaking a word only where it must (library cite tokens).
- `CopyIconButton` is drawn to the library cite copy tokens (Purple-500 on
  hover, press and focus, the ring flush with its 24px frame). Its name is
  "Copy" plus the block's label; it shows the copied glyph for two seconds
  and a polite live region says "Copied to clipboard". `CopyButton` shares
  the copy logic (library cite copy tokens).
- `ConfirmDialog`'s parts are 12px apart; `FormDialog` keeps 16px between
  fields (library dialog body gap; DERIVED-SPACING inter-field gap).
- `ErrorState` is the library `Alert` as shipped: a bold lead-in title, the
  reference as a plain second line, "Try again" under them, 8px apart (gap
  "Error alert with a reference").
- The chart tooltip is drawn to the library tooltip tokens: Grey-900, white
  Body/14, 12px padding, 8px radius, the tooltip shadow, at most 200px
  wide, no beak; the day is its first line without bold (tooltip spec,
  "Paragraph Default").
- `BarList` bars run on the library meter's track (8px, Grey-100, pill
  ends) with pill-ended fills; figures are a meter header row in Body/14;
  items 8px apart, the bar 4px under its figures (library progress tokens).
- The chart caption is Body/16/Bold Grey-900, 8px over the chart; axis,
  legend and guide labels take the library's 12px size, read from the token
  bridge at first render (`src/styles/chart-tokens.ts`); the data table is
  the library `Table` named by the caption, in a region that keeps the
  chart's height and scrolls, 20 rows to a page with the library
  `Pagination` centred 8px under it (Info - Sidebar title; gap "Charts";
  pagination spec). Added 2026-10-16.
- `FileInput` keeps the library text field's anatomy (label Body/16/Bold
  Grey-700, helper Body/14 Grey-500, error Red-500) (library form mixins;
  gap "File input").
- No code face anywhere: `code` and `pre` take the body face, and keys,
  scripts and templates are edited in the library `TextArea` as shipped
  (typography spec; gaps "Code face and copyable value", "Code text area").
- Links: `AppLink` renders the library `Link` for app routes (type-checked
  against the route tree) and URLs; same-site links navigate through the
  React Aria router; other sites open in a new tab with the library's
  new-window icon and "(opens in a new tab)"; Horizon links open in the
  current tab. Sizes follow the text around them: extra small (14px) in
  alerts and muted notes, small in table cells and panel actions, medium in
  body text (library `Link`; its small and medium sizes are both 16px).
- Destructive row actions are not red in the menu (gap "Danger row in a
  menu"). Field bindings (`components/Form/fields.tsx`) accept no class
  name (library components as shipped).
- A detail page that has no record to show (loading, not found, service
  not available, failed) keeps its page header and puts the state under it:
  the library `Loading`, a plain sentence ending in "Back to ..." (an
  `AppLink`), or the `ErrorState` over that link, 32px apart (library
  `content-block-stack`). Added 2026-10-16.
- Wizards (`components/Wizard`): the step's heading, which takes focus on a
  step change, is visually hidden, since the `Stepper` already shows the
  step's title and the design system draws no step heading. Added
  2026-10-16.

### Layer 3: home page

- Sections stack 32px apart; the greeting is the page's Heading/H1 Grey-900
  (library `content-block-stack`; typography spec).
- Outage alerts and the security risk alert are one stack of library
  `Alert`s 12px apart, not rendered when empty (content blocks' card column
  gap).
- The welcome is the "50-50 Media Left" band: library `content-block-band`
  and `content-block-50-50($media: start)` as shipped (64px and 120px
  insets, 64px and 20px under 768px of column, where the video stacks over
  the copy); no fill, rule or video radius; the video keeps the frame's
  16:9, 560 by 315 (content-blocks, line 1319).
- The welcome copy is the frame's intro (library `content-block-intro`): the
  H2 and three Body/16 Grey-700 paragraphs 12px apart; the lead is no
  longer Body/18 semibold; the "Cloud Starter Series" sentence moves above
  the buttons, since the frame puts all the copy before them (Frame 519).
- The buttons sit 32px under the copy, 12px apart, wrapping, at the small
  size; Dismiss is the last of them, a secondary `Button` (Frame 274, Frame
  1400).
- The featured banner is the library `CTA`, small, as shipped; without a
  picture it spans the band (`contentPlacement="wide"`); banner colours map
  as Horizon maps them (blue, pink, orange and purple primary, others
  secondary); a path on this site stays in the dashboard, another site
  opens in a new tab; links in its fine print stay library links, other
  markup is reduced to text (cta spec, Style=Small; gap "CTA fine print").
- Quick links: an intro (H2 and its Body/16 Grey-700 line, 12px apart) 24px
  above four Info - Sidebar blocks (Hive's `info-block`: the library
  `sidebar-block` with its 20px gap), each an h3 title in Body/16/Bold
  Grey-900 4px over its rows (paddings-and-margins body to card grid gap;
  Info - Sidebar, line 120).
- Home link rows compose the library `sidebar-block-list`,
  `sidebar-block-link-row` and `sidebar-block-link-icon` mixins around the
  library `Link` (or the link `Button` for "Request help") at the medium
  size, with `sidebar-block-link-label` so a long title wraps. They are not
  the shell's `LinkRow`, which draws a current state and loses route type
  checking (library sidebar-blocks pattern; engineering item "Link icon in
  a wrapping label").
- Home grids count columns by the width of the page column, not the window
  (`.home` is the container; `$cq-pair`, `$cq-wide`): from 768px of column
  (about a 1122px window) four quick link blocks and three news cards; from
  588px two of each; below that one (card spec, Column=3col; library
  `$content-block-stack-below`).
- Usage is an Info - Sidebar block: its title (an h2 in Body/16/Bold
  Grey-900) over the figure in Heading/H3 Grey-900, then the line to the
  usage trend and the "Usage trend" button at its own width, 20px apart;
  while loading, the library `Loading` holds the figure's place; a failed
  load shows "-" (Info - Sidebar; CTA - Sidebar button wrapper; gap "Stat
  figure").
- Usage (span 4) and the announcements (span 8) share a row 24px apart,
  top-aligned; without announcements usage stands alone at span 4; they
  stack in a column narrower than 768px (layouts spec, "Sidebar left").
- Announcements stay a `Panel` (title, the "Nectar system status" action,
  the list); each is a related-list row: the library `Link` with its new-tab
  icon, then the scheduled, status and date line in Body/14 Grey-700 4px
  under it (Related list - Sidebar; Events - Sidebar pair gap).
- ARDC news stays a `Panel` with the library cards 24px apart: an item
  without a picture is the `ImpactCard` with its date in its grey tone, one
  with a picture the `ImageCard` with the date above its title; cards open
  the article in a new tab and say so; a failed feed shows the shared empty
  state (card spec; gap "News card").

### Layer 4: features, rules shared by every slice

These hold in every feature folder; the slice sections below list only
what differs.

- Page sections (alerts, tabs, panels, hints, a panel over a table) stack
  32px apart (library `content-block-stack`).
- Panels side by side are span 6 (or span 4 where three share a row), 24px
  apart, from 1024px, stacked below (grids spec, the grid gap).
- Create and detail pages with a side column follow the "Sidebar right"
  layout: the side column is span 4 (384px, the sidebar block's width), the
  main column takes the rest, 24px apart, from 1280px (in the fluid column
  at 1024px a 384px side column would leave the main column about 260px),
  stacked below (layouts spec; gap "Breakpoints").
- Single-column pages and intro paragraphs are at most span 9 (894px) wide
  (gap "Reading measure").
- Forms: fields 16px apart in a span 6 column (588px; span 8 where steps
  hold tables), field groups 24px apart, the button row 32px under the
  groups with buttons 12px apart, start-aligned and with no rule above
  (DERIVED-SPACING; content-blocks Frame 1400).
- Dialog field groups are 24px apart with no rule; each group's heading is
  Heading/H5 Grey-900 (still an h3 in the outline) over its fields; parts
  of a dialog body are 12px apart (library dialog body gap; typography H5).
- Bulk actions (`useBulkAction`) wait for the affected lists to refetch
  before their toast shows and their controls re-enable, so one dialog and
  one toast cover the whole batch; a single mutation does not wait for its
  refetch. Revisit if the wait is felt on large batches.
- Wizards are the library `Stepper` as shipped; each step's body is the
  sidebar block chrome (Hive's `panel` mixin), which the `Stepper` sets 24px
  under its steps; Back and Next sit together at the start, 12px apart,
  32px under the step with no rule (library `$stepper-panel-gap`;
  sidebar-blocks). Cancel follows them in the same row as the library
  `Link` in its secondary variant (the button surface on an anchor), since
  it navigates back to the list; the leave guard asks first (own decision:
  the spec draws no wizard Cancel).
- Repeated sub-records (metadata pairs being edited, a volume's
  attachments, load balancer members, trunk subports) and grey summaries (a
  volume quota, eligibility) are library `Card`s in the grey tone, 16px
  padding, 12px apart (library `Card`).
- Verdicts and notices are library `Alert`s: eligibility success or danger
  under a bold lead-in, a security risk in the danger tone, the overview's
  "no usage" notice as a warning (library `Alert`).
- Text: intro paragraphs and sentences that are a panel's whole content are
  Body/16 Grey-700; field helpers, notes in cells and under meters, and
  secondary figures stay Body/14 Grey-500 (typography spec; library helper
  style).
- No monospace: identifiers, addresses, fingerprints and records take the
  surrounding text's style in the body face (Body/14 in a table cell,
  Body/16 in a key and value list) and break anywhere rather than widen a
  column (library `$table-cell-font-size`; gap "Code face and copyable
  value").
- Plain lists (export locations, a group's member shares, roles, a user's
  databases, metadata and attachment lists in cells) are the Related list -
  Sidebar stack: rows 8px apart, no bullets (library `sidebar-block-list`).
- Links to related resources (security groups, server group members,
  attachments) are related-list rows with the purple chevron around
  `AppLink`; a description or date is Body/14 Grey-700 4px under the link
  (library `sidebar-block-link-row`, `sidebar-block-link-icon`).
- Facts are the shared `KeyValueList` (Events - Sidebar pairs), detail
  pages showing their attributes in a `Panel` titled by the resource (on
  tabbed pages in the Overview tab, as an h2); panel titles are h2 under
  the page h1, groups inside a dialog h3 (Events - Sidebar; typography).
- Breadcrumbs and page titles are sentence case ("Container infra", "Load
  balancers", "API access"), since a page's title is the last crumb of its
  trail; the sidebar's own labels are unchanged (navigation registry).
- Buttons in a page header go straight into the header's action row, 12px
  apart, with no wrapper (gap "Page actions row").
- Side summaries stay sticky (gap "Sticky summary"); quotas above a list
  are the shared `QuotaMeter` in a span 4 column, 16px apart (gap "Quota
  meters above a list").

### Layer 4a: compute, volumes, reservations, usage

- The key pair page is a single column at span 9; the launch wizard's step
  fields stop at span 8 (its steps hold tables); its notices sit 12px apart
  and take no room when there is none (grids spec).
- The wizard's two step errors are the library `FieldError`: under the
  source list as the `RadioGroup`'s own child; under the flavour table
  through React Aria's field error context. Both sit in a live region in
  the library field error's Body/14 Red-500 (library `FieldError`).
- The source list keeps its scroll box (gap "Option list with
  descriptions"); the group's 12px item gap is restated on the box, which
  keeps 8px inside so a focus ring is not clipped (library `RadioGroup`).
  Above it, the chosen source is one wrapping row, 8px apart: "Selected:"
  with the name in bold, its details in the helper style and a link-style
  "Clear" (library `Button`, link, xs).
- The flavour step puts the class cards (gap "Card radios") above the
  search and the table; the search looks within the open class, as the
  table lists only that class. The interface order sits under the
  networks with its hint 4px above it (gap "Reorderable list").
- The security groups step lists every group as the library checkbox (name
  and description) with "Rules (n)" under it, in line with the checkbox's
  label (16px indicator plus its 8px gap) and 4px below it, the library's
  label to helper gap. "Rules (n)" is the compact disclosure the
  reservation chart's flavour rows use (React Aria `Disclosure` with the
  accordion's plus and minus, Body/14/Bold Grey-900; mixins
  `disclosure-toggle` and `disclosure-icon`): the library has no
  disclosure component, and its `Accordion` would put an H4 row with a 6px
  marker under every checkbox. Opening it loads the group and lists its
  rules 8px below in the library `Table`, in Horizon's launch columns
  (Direction, Ether type, Protocol, Port range, Remote) drawn by the group
  page's own column definitions, so an open-to-the-internet remote carries
  its badge here too; "Loading rules..." sits in the table's empty cell,
  and a failure is the `ErrorState` with "Try again". The trigger's name
  adds the group for screen readers ("Rules (3) in web"). More than ten
  groups add a search over names and descriptions above the list (Horizon
  pages its list at 20 with a filter); a group the search hides stays
  selected. Added 2026-10-21.
- In a metadata card the key, value and "Remove" share a row 12px apart,
  the link button centred on the inputs (8px up from their foot);
  `KeyValueFields` (`components/Form`) holds that row for both callers
  (DERIVED-SPACING side-by-side gap).
- Quota readouts come from `QuotaMeter` itself: "3 of 10", or
  "3 (unlimited)", each figure in the quota's unit through its `format`
  and what is counted after them through its `unit` ("2 of 10 shares");
  reservation limits read "2 of 20" under their "Days" labels (library
  `Meter` readout).
- The allocation usage tiles are grey `Card`s 24px apart, label over figure
  in the Info - Sidebar pair style (library `Card`; gap "Stat figure").
- A deleted volume or snapshot in the backups table reads in the cell's own
  colour; instance addresses keep whole in their column (library `Table`).
- The create reservation intro moved into the page header, so the panel is
  titled "Available flavour classes"; a class's heading (Body/16/Bold
  Grey-900) sits 12px over its text (content-blocks intro).
- The reservation feedback block is the CTA - Sidebar block at span 4: the
  `Panel` with its H4 title, the text 8px under it, the "Feedback form"
  link as a small primary button 24px under the text (CTA - Sidebar, line
  3).
- The reservation chart's filters and the console log's controls are one
  wrapping row, 12px apart; the zone select is span 3 (gap "Table
  toolbar").
- The instances table shows name, image, address, flavour, status, risks
  (when the project has any) and age by default; key pair, availability
  zone and power state are hidden by default, since with all ten columns at
  1440px the image name wrapped over six lines (library `Table`).
- Availability chart: every free slot is a React Aria button with the
  library `Tooltip`, which sits over the shaded proposal and follows the
  pointer; with keyboard focus it shows the proposal from the first day,
  and Enter or Space reserves exactly what it shows. A tooltip is one
  paragraph ("ardc.g3.xlarge: 29 Oct 2026 to 4 Nov 2026, 7 days, about
  151.03 SU."). Disabled slots show none; maintenance windows are focusable
  images with their own tooltip (tooltip spec, "Paragraph Default"; gap
  "Availability chart").
- A flavour's name discloses its details through React Aria's
  `Disclosure`, with the accordion's plus and minus glyphs (Grey-700) in a
  16px frame; the name is Body/14/Bold Grey-900 and the details the shared
  `KeyValueList`, used as shipped in the 200px label column (library
  `Accordion` anatomy).

### Layer 4b: network, load balancers, kubernetes, DNS

- A zone's facts are one `KeyValueList`, two pairs to a row; a security
  group's rules sit in a "Rules" panel and a cluster's labels in a "Labels"
  panel (Events - Sidebar).
- Create cluster switches to the "Sidebar right" layout from 1024px, not
  1280px; before a template matches, the summary says so in Body/16
  Grey-700 (layouts spec).
- Members in the load balancer wizard take one field column on a phone and
  two from 768px, rows 16px apart and side-by-side fields 12px apart; the
  instance picker's two add buttons sit 12px under it; the listener
  timeouts stay a library `Accordion` item, collapsed (DERIVED-SPACING;
  library `Accordion`).
- Dialog field groups live in `features/network/DialogGroups.module.scss`,
  shared by the network and trunk dialogs; a group's heading sits 16px over
  its first field (library dialog body; DERIVED-SPACING).
- Values listed in a cell or a detail pair (subnets, records, addresses,
  pools) are 8px apart (library `sidebar-block-list` gap).
- At 1440px every default-visible column of the network, load balancer,
  cluster, template and zone lists holds its values on one line (measured
  on the mocked API), so no column changed its visibility; a security group
  rule's remote prefix and its "Open to the internet" badge wrap in a
  narrow column (library `Table`).
- Network topology: networks 24px apart, the unconnected group 32px below
  them; names Heading/H5 with their glyph in the library's 16px icon frame
  (`--hive-icon-frame`, was 20px); addresses Body/14 Grey-700; an
  attachment's kind ("(router)", "(port)") Body/14 Grey-500, shown only
  when there is one (gap "Network topology").

### Layer 4c: orchestration, shares, databases, identity, account, security, API access, object store, auth, terms

- Inside a panel, parts that stack (a note, a key and value list, a meter, a
  button) are 20px apart; buttons keep their own width (Info - Sidebar gap).
- The launch stack template step, which has no side column, keeps to span 8
  (layouts spec, "Sidebar right" main column).
- Launch stack is the library `Stepper` used directly, not the wizard kit
  (`components/Wizard`): its two steps are separate forms with Heat's
  template validation, a request to the server, between them, so the
  second form only exists once the first has passed. The first step's
  marker returns to the template, as Back does; each step keeps its own
  panels and button row (own decision; library `Stepper`).
- My details puts its save button 32px under its fields; page action rows
  inside the header's action slot are 12px apart (DERIVED-SPACING).
- A credential's data in the credentials table is cut with an ellipsis at
  span 4 (384px) (grids spec; gap "Code face and copyable value").
- The container's details are the shared `KeyValueList`, two to a row in
  the 384px side column; the access switch and its failure, and the public
  URL and its copy button, stack 8px apart; the URL wraps through the
  list's link rule (Events - Sidebar).
- Each security risk is a danger `Alert` (name in bold, description,
  address, last detected, "Learn more"), alerts 12px apart and lines 8px
  apart; "Risks detected" (h2) sits 24px over its panels, the resource
  panels at h3 (library `Alert`; gap "Target highlight").
- User lookup is the library `SearchField` with a medium `Button` 8px
  apart, in a span 8 row; below 480px the button goes under the field; the
  "at least 3 characters" note is Body/14 Grey-500 (forms, "Search Field
  with Button", line 7457).
- A user's external identities are one key and value list each, 20px apart
  and without rules (Info - Sidebar gap).
- In the change template dialog, parameter groups are plain field groups
  (an h3 in the H5 style 12px over its fields, 24px apart, no border); on
  the launch page they stay panels (`ParameterFields` `variant="group"`)
  (typography H5; DERIVED-SPACING).
- The ORCID iD is a wrapping link and the sentence no longer ends with a
  stray full stop (library `sidebar-block-link-label`; gap "Text link that
  wraps").
- Not found, signed out and terms share `TextPage.module.scss`: a library
  `content-block-band` holding `content-block-text-75`, the title and
  paragraphs as the content blocks' intro (12px apart, Grey-700) and the
  action 32px under them (content-blocks "Simple text - 75", line 1601).
- The upload dialog keeps one library `ProgressBar` per file, 16px apart
  (gap "List cap").
- Alerts at the top of an overview tab (a database fault, an open CIDR, a
  failed stack, a share with snapshots) sit above the panel grid at full
  width (library `Alert`).
- An application credential's access rules are the library `Table` named
  "Access rules"; code blocks on the stack template tab and the resource
  type page take the shared height; the database log viewer keeps 60% of
  the viewport (library `Table`; gap "Code face and copyable value").
- The ORCID disconnect keeps a hidden native form: it posts to the accounts
  service, which a library field cannot do, and shows nothing (behaviour).
- "Launch instance", "Launch stack", "Log in again" and "Go to the
  dashboard home" go through `AppLink` with a route, so the targets are
  type-checked (library `Link`).

Login page:

- The page is Sam's (review 73411), kept as he and the designer settled it
  (Hakkim, 2026-11-11): layout, copy and artwork reproduce the
  nectar-dashboard login page (theme/templates/auth/_login_page.html,
  _login_form.html, _splash.html, _description.html; theme/_styles.scss
  "Login Page"). The honeycomb artwork fills the page from the left and
  the logo, welcome, the two paragraphs naming the federations, one
  "Log In" (manuka asks for the federation) and the help article sit
  centred in the right half of the container; phones get no artwork. No
  terms line, as Horizon shows none (behaviour). The help article's path
  is resolved against the configured support site's origin.
- The honeycomb illustration is Horizon's login background, reused from the
  Nectar theme as `public/login-bg.svg` with the theme's animations in the
  file (the honeycomb fades in, hexagons flash, dashed lines run). Under
  reduced motion the page loads it as `login-bg.svg#still`, which stops
  them: Chrome does not pass an emulated motion setting into an SVG used
  as an image, so the file's own media query alone was not enough (checked
  in Playwright, 2026-10-27).
- The layout is Horizon's, not a design-system frame: its measures (the
  artwork's 63.75rem minimum width, the 73.125rem container, 100px above
  and below the form) are the theme's Bootstrap values, carried in
  `LoginPage.module.scss` (gap: a login page frame).
- Status alerts are library `Alert`s in the form's column; while the
  configuration loads, the shared `Skeleton` (library `Loading`) holds the
  button's place.
- The page stands alone under the mega menu, with no service header and
  no site footer, as on Horizon (Sam's 73414; Hakkim, 2026-10-14); the
  footer element is hidden while the page is mounted.

### Layer 5: token bridge and guard rails

- Removed the bridge tokens nothing used: the ad hoc widths
  (`--hive-content-narrow`, `--hive-form-width`, `--hive-form-width-wide`,
  `--hive-aside-width`, `--hive-cell-truncate`), `--hive-button-height`,
  `--hive-icon-size`, unused colours, spacing, radius, transition, font size
  and weight tokens, and the unused `h1` and `body-12-bold` text shorthands
  (grids spec spans replaced the widths in Layer 4).
- `--hive-measure` (40rem) is gone: the reservation intros and the route
  error page are held to span 9, as every other intro is (gap "Reading
  measure"). `--hive-meter-column` (28rem) is gone: the share and database
  meters sit in a span 4 column, as the zone and cluster meters do (gap
  "Quota meters above a list").
- Every size left in `tokens.scss` is a library token, a grid span, a
  `var()` of those, or `ardc-fn.pxToRem(N)` with a comment naming the spec
  block or the gap N comes from; the gap sizes keep the values Hive drew
  before (224px logo, 320px list cap, 384px code and picker caps, 576px
  console log, 200px and 152px timeline labels, 512px timeline cap). The
  0.5px label tracking and the 4px item rule are `pxToRem` too
  (services-headers, "Explore ARDC" and Nav Service Menu).
- The appendix table is written without prettier's column padding (inside
  `prettier-ignore` markers), which would triple its size.

## Guard rails

These checks hold the rules above, so a drift fails a run instead of
waiting for a review. The first three run in `pnpm lint`; the visual check
runs in `pnpm test:e2e`.

- `pnpm check:tokens` (`scripts/check-tokens.mjs`) reads every file under
  `src/` and names the file and line of each finding.
  - In `.scss` modules it rejects raw colours (hex, `rgb()`, `hsl()`), px
    sizes other than 0, 1, 2, 3, 4 and 100px (hairlines, accent rules, the
    pill radius), rem and em literals, `letter-spacing`, `font-size`,
    `font-weight` and `line-height` literals, `text-transform: uppercase`
    and `[class*=` selectors. Media and container queries may name a width.
    `tokens.scss`, `global.scss` and `_mixins.scss` are exempt from these.
  - In `.tsx` files it rejects an inline style holding a literal size or
    colour (a computed value such as `${width}%` is fine) and a `className`
    on a component imported from `@ardc-ui/react`, the library's icons
    excepted (positioning or turning a glyph is the consumer's job).
  - In `tokens.scss` it rejects a custom property whose value holds a raw
    px, rem or em literal outside a `#{}` interpolation.
  - Anywhere in `src/` it rejects the retired names `--hive-font-mono` and
    `--hive-rule-accent`.
  - In every CSS module and `global.scss` it rejects a rule block with no
    `///` docblock on itself or on a block enclosing it.
  - `node scripts/check-tokens.mjs --self-test` runs the last three checks
    against fixtures; every normal run does the same first.
- `pnpm design:sources --check` (`scripts/design-sources.mjs`) fails when
  the appendix below no longer matches the docblocks;
  `pnpm design:sources --write` rewrites it.
- Stylelint forbids `:hover` and `:focus-visible` in `*.module.scss`.
  State comes from React Aria data attributes (`[data-hovered]`,
  `[data-focus-visible]`), as in the library. `global.scss` keeps its focus
  ring for raw elements.
- `e2e/visual.spec.ts` captures the content (`main`) of six pages, the
  shell around a page and a confirm dialog on desktop and Pixel 5, and
  attaches the pictures to the test report for a reviewer's eye. The
  repository keeps no reference pictures (Hakkim, 2026-11-11), so nothing
  is compared; the README's testing section explains where the captures
  land.

When a value is genuinely new (no library token or text style fits):

1. Check the library's variables, mixins and text styles once more; a near
   miss is usually the existing token.
2. Add a `--hive-*` custom property to `src/styles/tokens.scss`, built from
   a library token, a grid span, or `ardc-fn.pxToRem(N)` with a comment
   naming the spec block (or the gap) N comes from.
3. Use it in the module, under a `///` docblock that names the source, and
   record the decision here under "Own decisions"; if it is a gap in the
   design system, add it to "Gaps for Darcelle" as well. Then run
   `pnpm design:sources --write`.

## Appendix: Sources by selector

Generated from the `///` docblocks by `pnpm design:sources --write`; do not
edit by hand. One row per rule block that names its own source; a nested
rule without a docblock inherits its parent's row. Paths are under `src/`.

<!-- design-sources:start -->

<!-- prettier-ignore-start -->
| File | Selector | Source |
| --- | --- | --- |
| `app/RouteError.module.scss` | `.page` | The error that replaces a whole page: its parts 16px apart (DERIVED-SPACING: inter-field row gap), at most span 9 of the grid wide (894px, the narrow single column; gap "Reading measure"), inset 32px (the content blocks' section gap) and a gutter from the side. |
| `components/Charts/BarList.module.scss` | `.list` | A ranked list of bars, a stand-in for a chart (gap "Charts"): items 8px apart, the design system's small step (DERIVED-SPACING, 8px). |
| `components/Charts/BarList.module.scss` | `.item` | One item: its figures 4px over its bar, the label to control step (DERIVED-SPACING, 4px). |
| `components/Charts/BarList.module.scss` | `.row` | The figures as the library meter's header row (progress-label-row): label and value at either end on one baseline, at least 16px apart, both in Body/14 (progress-value) to keep the list dense. |
| `components/Charts/BarList.module.scss` | `.label` | A long label wraps; the value keeps the end of the row. |
| `components/Charts/BarList.module.scss` | `.value` | The value keeps whole at the row's end, in tabular digits so a column of figures lines up (gap "Numeric columns in a table"). |
| `components/Charts/BarList.module.scss` | `.share` | The share after the value, in Grey-500 (Body/14 caption colour, typography spec line 86). |
| `components/Charts/BarList.module.scss` | `.track` | The library meter's track (progress-track): 8px, Grey-100, pill ends. |
| `components/Charts/BarList.module.scss` | `.bar1, .bar2, .bar3, .bar4, .bar5, .barOther` | The meter's fill (progress-fill) with pill ends, in the chart palette slot of its rank (gap "Charts"); a muted item ("Other") takes grey. |
| `components/Charts/BarList.module.scss` | `.bar1` | Chart palette slot 1, Blue-600 (`--hive-chart-1`; gap "Charts"). |
| `components/Charts/BarList.module.scss` | `.bar2` | Chart palette slot 2, Pink-500 (`--hive-chart-2`; gap "Charts"). |
| `components/Charts/BarList.module.scss` | `.bar3` | Chart palette slot 3, Yellow-700 (`--hive-chart-3`; gap "Charts"). |
| `components/Charts/BarList.module.scss` | `.bar4` | Chart palette slot 4, Green-500 (`--hive-chart-4`; gap "Charts"). |
| `components/Charts/BarList.module.scss` | `.bar5` | Chart palette slot 5, Purple-500 (`--hive-chart-5`; gap "Charts"). |
| `components/Charts/BarList.module.scss` | `.barOther` | The muted slot for "Other", Grey-500 (`--hive-chart-other`; gap "Charts"). |
| `components/Charts/ChartFigure.module.scss` | `.figure` | A chart with its caption row (gap "Charts"): caption row and chart 8px apart, the design system's small step (DERIVED-SPACING, 8px). |
| `components/Charts/ChartFigure.module.scss` | `.head` | The caption with the "View as table" button at the end, 8px apart when they wrap (gap "Charts"). |
| `components/Charts/ChartFigure.module.scss` | `.caption` | Body/16/Bold in Grey-900, the Info - Sidebar title (sidebar-blocks spec, line 154), as a chart names itself inside a block. |
| `components/Charts/ChartFigure.module.scss` | `.chart` | The chart fills the block's width and may shrink in a grid track (gap "Charts"). |
| `components/Charts/ChartFigure.module.scss` | `.tableWrap` | The table view keeps the chart's height and scrolls inside it, so swapping views does not move the page. |
| `components/Charts/ChartFigure.module.scss` | `.numeric` | Figures in the data table take tabular digits (gap "Numeric columns in a table"). |
| `components/Charts/ChartFigure.module.scss` | `.pager` | The table view's library `Pagination`, centred under the table as the pagination spec places it (gap "Table footer"); the figure's 8px gap sets it under the table. |
| `components/Charts/ChartTooltip.module.scss` | `.tooltip` | The library tooltip bubble (tooltip spec "Tooltip / Simple", line 631; library tooltip tokens): Grey-900 with white Body/14 text, 12px padding, 8px radius and the tooltip shadow, at most 200px wide. |
| `components/ChoiceCards/ChoiceCards.module.scss` | `.grid` | Cards wrap into as many columns of at least span 2 as fit, so every option is on screen at once: four across a wizard step's span 8, one on a phone; 8px apart (DERIVED-SPACING, 8px; gap "Card radios"). |
| `components/ChoiceCards/ChoiceCards.module.scss` | `.card` | A card: its lines 4px apart, the library's label to helper gap, 12px inside a Grey-100 rule at the 4px radius on the surface, as the launch source list's box (gap "Option list with descriptions"). |
| `components/ChoiceCards/ChoiceCards.module.scss` | `.card[data-selected]` | The chosen card: the brand purple on its rule over the Purple-50 wash, the pair the library uses for a selected item; the rule keeps its width so the grid never shifts. |
| `components/ChoiceCards/ChoiceCards.module.scss` | `.head` | The radio glyph and the title in a row 8px apart, as the library radio item sets its indicator beside its label. |
| `components/ChoiceCards/ChoiceCards.module.scss` | `.indicator` | The library radio's glyph in the 16px icon frame, in its colours: Grey-500 when clear, the brand purple when chosen (library `RadioGroupItem`). |
| `components/ChoiceCards/ChoiceCards.module.scss` | `.indicatorDot` | The chosen glyph's white centre (library `RadioGroupItem`). |
| `components/ChoiceCards/ChoiceCards.module.scss` | `.title` | The option's title: Body/16/Bold Grey-900, the library field label weight in the heading colour. |
| `components/ChoiceCards/ChoiceCards.module.scss` | `.meta` | The short line under the title: Body/14 Grey-500, the library field helper style. |
| `components/ChoiceCards/ChoiceCards.module.scss` | `.description` | The option's sentence: Body/12 Grey-500, a step under the meta line. |
| `components/CodeBlock/CodeBlock.module.scss` | `.block` | The cite-this-resource block on grey (cite spec "Background=Grey", line 55; library cite tokens): Grey-50 at the 4px radius, 16px padding, its label and panel 16px apart. |
| `components/CodeBlock/CodeBlock.module.scss` | `.label` | In the place of the block's style chooser, its label's style (cite spec "Style", line 86): Body/16/Bold in Grey-700. |
| `components/CodeBlock/CodeBlock.module.scss` | `.panel` | The citation panel (cite spec "Frame 3", line 147): white, ruled in Grey-100 at the 4px radius, 16px padding, the copy control 8px after the text and level with its last line. |
| `components/CodeBlock/CodeBlock.module.scss` | `.text` | The citation text (cite spec line 173): Body/14 in Grey-700, in the body face. |
| `components/ConfirmDialog/ConfirmDialog.module.scss` | `.body` | The parts of the question (the consequences, a note on skipped items) at the library dialog's body gap (12px). |
| `components/CopyButton/CopyIconButton.module.scss` | `.copy` | The cite-this-resource copy control (cite spec "Copy", line 183; library cite tokens): a 24px Grey-500 glyph with no surface. |
| `components/CopyButton/CopyIconButton.module.scss` | `.icon` | The glyph fills the frame at the cite copy stroke (1.4px). |
| `components/DataTable/DataTable.module.scss` | `.wrapper` | The table and its footer, 32px apart: the design system's card row to pagination gap (paddings-and-margins spec; DERIVED-SPACING, 32px). |
| `components/DataTable/DataTable.module.scss` | `.main` | Toolbar, notices and table, 12px apart: the design system's gap between controls (DERIVED-SPACING, 12px). |
| `components/DataTable/DataTable.module.scss` | `.toolbar` | The toolbar row (gap "Table toolbar"): fields at the start, actions at the end, every control 12px from the next, wrapping when short of room. |
| `components/DataTable/DataTable.module.scss` | `.fields` | The toolbar's fields (search and filters) at its start, 12px apart (gap "Table toolbar"). |
| `components/DataTable/DataTable.module.scss` | `.search` | The search box grows from span 2 to span 4 of the grid (gap "Table toolbar"); the library field inside fills this cell as shipped. |
| `components/DataTable/DataTable.module.scss` | `.filters` | Each filter field is a cell: stacked full width on phones, then span 3 of the grid each, side by side (gap "Table toolbar"). |
| `components/DataTable/DataTable.module.scss` | `.actions` | The toolbar's actions (the page's own, "With selected", the column chooser and refresh) at its end, 12px apart (gap "Table toolbar"). |
| `components/DataTable/DataTable.module.scss` | `.refreshIcon` | The refresh glyph at the extra small button's icon size (library `$btn-content-icon-size-xs`), turning at the library loading pace while a refetch runs; still with reduced motion. |
| `components/DataTable/DataTable.module.scss` | `.refreshIcon[data-spinning]` in `@media (prefers-reduced-motion: no-preference)` | The refresh glyph turns once per library loading cycle (`$loading-spin-duration`) while a refetch runs, unless motion is reduced. |
| `components/DataTable/DataTable.module.scss` | `.hiddenLabel` | The actions column names itself for screen readers only. |
| `components/DataTable/DataTable.module.scss` | `.disabledAction` | A disabled row action with its reason: the row's label over the reason 4px apart, as the header spec's "Mega Menu Nav Links Mobile" row pairs a title with its description (line 35765). |
| `components/DataTable/DataTable.module.scss` | `.reason` | The reason in that row's description style: Body/14 in Grey-700. |
| `components/DataTable/DataTable.module.scss` | `.footer` | The footer (gap "Table footer"): the library `Pagination` centred in the table's width (pagination spec, line 2427), the row count at the start and the page size at the end. |
| `components/DataTable/DataTable.module.scss` | `.pager` | The library `Pagination` centred in the table's width (pagination spec, line 2427); on a phone it takes its own line above the count and page size. |
| `components/DataTable/DataTable.module.scss` | `.count` | The row count in the caption style: Body/14 in Grey-500 (typography spec, line 86). |
| `components/DataTable/DataTable.module.scss` | `.pageSize` | "Per page" beside its select, span 2 of the grid wide (gap "Table footer"). |
| `components/EmptyState/EmptyState.module.scss` | `.empty` | The CTA - Sidebar block's content (sidebar-blocks spec, line 3), without its chrome: the text and the action 24px apart (line 12), start-aligned. |
| `components/EmptyState/EmptyState.module.scss` | `.text` | The title over its text, 8px apart (Frame 246, line 24). |
| `components/EmptyState/EmptyState.module.scss` | `.title` | Heading/H4 in Grey-900 (line 42). |
| `components/EmptyState/EmptyState.module.scss` | `.body` | Body/16/Regular in Grey-700 (line 58). |
| `components/EmptyState/EmptyState.module.scss` | `.action` | The block's action row (library `sidebar-block-actions` mixin), for one button or several 8px apart. |
| `components/ErrorState/ErrorState.module.scss` | `.content` | Stacks the lines inside the library `Alert`, which keeps its own surface and text style: 8px apart, the design system's step between a control and the text it belongs to (DERIVED-SPACING, 8px). |
| `components/Form/FileInput.module.scss` | `.field` | The library text field's anatomy (library forms mixins: the selection group gaps): 4px from the header to the control, 16px when there is helper text. |
| `components/Form/FileInput.module.scss` | `.header` | The label over its helper text, 4px apart (selection-group-header). |
| `components/Form/FileInput.module.scss` | `.label` | The field label (selection-group-label): Body/16/Bold in Grey-700. |
| `components/Form/FileInput.module.scss` | `.required` | The required asterisk in the library's field-required colour (Red-500). |
| `components/Form/FileInput.module.scss` | `.row` | The picker row: the library `Button` and the chosen file's name, 8px apart, wrapping on a phone (gap "File input"). |
| `components/Form/FileInput.module.scss` | `.fileName` | The chosen file's name as helper text (Body/14 in Grey-500, the selection-group-helper style); a long name breaks. |
| `components/Form/FileInput.module.scss` | `.description` | Helper text (selection-group-helper): Body/14 in Grey-500. |
| `components/Form/FileInput.module.scss` | `.error` | The error line in the library `FieldError`'s Body/14 Red-500. |
| `components/Form/KeyValueFields.module.scss` | `.rows` | Repeated sub-records 12px apart, the gap the content blocks keep between cards in a column (library `content-block-card-column`). |
| `components/Form/KeyValueFields.module.scss` | `.row` | Key, value and "Remove" on one row, 12px apart (DERIVED-SPACING: two fields side by side on a row), the button level with the fields' inputs. |
| `components/Form/KeyValueFields.module.scss` | `.remove` | Centres the extra small link button (24px) on the 40px text input beside it: 8px under it. |
| `components/Form/KeyValueFields.module.scss` | `.add` | The add button keeps its own width under the rows. |
| `components/Form/fields/CheckboxesInput.module.scss` | `.option` | An option with details: the library checkbox, then its details 4px under it, the library's label to helper gap (`$selection-gap-label-helper`). |
| `components/Form/fields/CheckboxesInput.module.scss` | `.details` | The details start in line with the checkbox's label: past the library's 16px indicator and its 8px gap to the label (`$selection-indicator-size`, `$selection-gap-indicator-label`). |
| `components/FormDialog/FormDialog.module.scss` | `.form` | Fields 16px apart, the design system's inter-field row gap (DERIVED-SPACING, 16px). |
| `components/KeyValueList/KeyValueList.module.scss` | `.frame` | The list measures its own width, so the pair count follows the column it sits in (a chart's label column, a dialog, a phone) rather than the window (own decision). |
| `components/KeyValueList/KeyValueList.module.scss` | `.list` | The Events - Sidebar block's pairs (sidebar-blocks spec, line 1970): two to a row 16px apart (Frame 516, line 1991), rows 20px apart (the block gap, line 1979). |
| `components/KeyValueList/KeyValueList.module.scss` | `.row` | One pair (Frame 246, line 2004): the label 4px over its value. |
| `components/KeyValueList/KeyValueList.module.scss` | `.label` | Body/16/Bold in Grey-900 (line 2022). |
| `components/KeyValueList/KeyValueList.module.scss` | `.value` | Body/16/Regular in Grey-700 (line 2038). |
| `components/KeyValueList/KeyValueList.module.scss` | `.value a` | A library `Link` as a value keeps its label on one line, which would run into the next pair; the library's own `sidebar-block-link-label` mixin lets it wrap, as it does for related-list rows (gap "Text link that wraps"). |
| `components/Panel/Panel.module.scss` | `.panel` | The sidebar block (sidebar-blocks spec, Events - Sidebar line 1970) via the `panel` mixin: title, actions and content stack 8px apart, the gap the CTA - Sidebar block keeps between its H4 and its text (Frame 246, line 24). |
| `components/Panel/Panel.module.scss` | `.title` | Heading/H4 in Grey-900, the CTA - Sidebar block's title (line 42). |
| `components/Panel/Panel.module.scss` | `.actions` | The block's action row (library `sidebar-block-actions` mixin): one row, 8px apart, wrapping on a narrow block. |
| `components/Panel/Panel.module.scss` | `.body` | The content fills the rest of the block, so panels side by side in a grid row end level. |
| `components/QuotaMeter/QuotaMeter.module.scss` | `.quota` | The library `Meter` fills the width it is given; this gives it the full column and keeps the over-quota alert as far below the track as the meter's label sits above it (the meter's 12px group gap). |
| `components/QuotaMeter/QuotaMeter.module.scss` | `.unlimited` | An unlimited quota has no bar, only the library meter's header row (progress-label-row): label and readout at either end on one baseline, at least 16px apart. |
| `components/QuotaMeter/QuotaMeter.module.scss` | `.label` | The meter's label (progress-label): Body/16/Bold in Grey-700. |
| `components/QuotaMeter/QuotaMeter.module.scss` | `.value` | The meter's readout (progress-value): Body/14 in Grey-700, on one line. |
| `components/ReorderList/ReorderList.module.scss` | `.list` | The rows stacked 4px apart, the library's label to helper gap, no wider than a single field (gap "Reorderable list"). |
| `components/ReorderList/ReorderList.module.scss` | `.item` | A row: handle, position and name 8px apart (DERIVED-SPACING, 8px), in a Grey-100 rule at the 4px radius on the surface, as the launch source list's box (gap "Option list with descriptions"); Grey-50 under the pointer, as a library table row. |
| `components/ReorderList/ReorderList.module.scss` | `.item[data-dragging]` | The row being dragged stays in its place, faded, while its preview follows the pointer (gap "Reorderable list"). |
| `components/ReorderList/ReorderList.module.scss` | `.handle` | The drag handle: the 16px icon frame with 4px around it, in Grey-500, the library field helper colour; a grab cursor while it is the target. |
| `components/ReorderList/ReorderList.module.scss` | `.grip` | The grip glyph in the library's 16px icon frame. |
| `components/ReorderList/ReorderList.module.scss` | `.position` | The row's position: Body/14/Bold Grey-500, as wide as the icon frame so the names line up. |
| `components/ReorderList/ReorderList.module.scss` | `.label` | The row's name takes the rest and wraps a long one (long content wraps inside containers). |
| `components/ReorderList/ReorderList.module.scss` | `.dropIndicator` | Where a drop would land: a line as thick as the library focus ring, kept in the layout so the rows do not jump, in the brand purple while it is the target, the library's selected and focus colour. |
| `components/Wizard/Wizard.module.scss` | `.layout` | "Sidebar right" (layouts spec): the wizard beside its side column, the column span 4 of the grid (the sidebar block's 384px), 24px apart. |
| `components/Wizard/Wizard.module.scss` | `.main` | The wizard's sections (notices, the steps, the error, the buttons) 32px apart, the content blocks' section gap (library `content-block-stack`); 32px is also the field group to submit row gap (DERIVED-SPACING). |
| `components/Wizard/Wizard.module.scss` | `.notices` | The notices above the steps, 12px apart (library `content-block-card-column`); gone when there is none. |
| `components/Wizard/Wizard.module.scss` | `.step` | A step's panel: the sidebar block chrome (library `sidebar-block`), which the library `Stepper` sets 24px under its strip (`$stepper-panel-gap`). |
| `components/Wizard/Wizard.module.scss` | `.buttons` | Back and Next (or the submit button): 12px apart, start-aligned, no rule above (content blocks "Frame 1400"). |
| `features/TextPage.module.scss` | `.band` | A page that is a short message (not found, signed out, the terms): the content blocks' "Simple text - 75" band (content-blocks spec, line 1601) through the library `content-block-band`, with no fill of its own on the white surface it sits on (the page panel, or the signed-out frame). |
| `features/TextPage.module.scss` | `.text` | The band's text column (library `content-block-text-75`): 64px above and below and 120px either side, 20px once the band is narrower than 768px; the text runs the column's width (gap "Reading measure"). |
| `features/TextPage.module.scss` | `.copy` | The message, then its action 32px under it, the gap the content blocks leave between copy and its buttons (Frame 274; library `content-block-stack`). |
| `features/TextPage.module.scss` | `.intro` | "Frame 519": the page title (Heading/H1, the page's own) over Body/16 Grey-700 paragraphs, 12px apart (library `content-block-intro`). |
| `features/account/MyDetailsPage.module.scss` | `.layout` | The "Sidebar right" layout (layouts spec, "Single pages"): the account and contact panels beside a span 4 side column (384px, the sidebar block's width) holding ORCID, 24px apart. |
| `features/account/MyDetailsPage.module.scss` | `.stack` | The main column's panels 32px apart (library `content-block-stack`, the content blocks' section gap). |
| `features/account/MyDetailsPage.module.scss` | `.panelStack` | A panel's parts (a note, the details, a button) 20px apart, the gap the Info - Sidebar block stacks its parts at (sidebar-blocks spec, line 120; the `info-block` gap). |
| `features/account/MyDetailsPage.module.scss` | `.form` | The contact form: its fields, then the save button 32px under them (DERIVED-SPACING: field group to primary action, 32px; library `content-block-stack`). |
| `features/account/MyDetailsPage.module.scss` | `.fields` | Fields 16px apart (DERIVED-SPACING: inter-field row gap), in a span 6 column (588px, the 50-50 content column). |
| `features/account/MyDetailsPage.module.scss` | `.note` | Notes about where the details come from: Body/14 in Grey-500, the text field's helper style (text-input spec, "Input Field with Labels"). |
| `features/account/MyDetailsPage.module.scss` | `.connected` | The connected ORCID iD is a URL: the library's own `sidebar-block-link-label` mixin lets the link's label wrap, and the URL breaks anywhere rather than widening the side column (gap "Text link that wraps"). |
| `features/account/MyDetailsPage.module.scss` | `.hiddenForm` | The native form that posts the ORCID disconnect to the accounts service; it draws nothing. |
| `features/account/ResetPasswordPage.module.scss` | `.stack` | The page's panel in one column of span 9 (894px), the grid's narrow single column; 32px between sections (library `content-block-stack`). |
| `features/account/ResetPasswordPage.module.scss` | `.panelStack` | The panel's parts (the explanation, a failure, the new password, the button) 20px apart, the gap the Info - Sidebar block stacks its parts at (sidebar-blocks spec, line 120; the `info-block` gap). |
| `features/apiaccess/ApiAccessPage.module.scss` | `.stack` | The explanation panel above the endpoints table, 32px apart (library `content-block-stack`, the content blocks' section gap). |
| `features/apiaccess/ApiAccessPage.module.scss` | `.endpoint` | A URL or identifier with its copy button, 8px apart, wrapping under it when narrow (gap "Code face and copyable value"). |
| `features/auth/LoginPage.module.scss` | `.page` | Sam's login page (review 73411), kept as he and the designer settled it (Hakkim, 2026-11-11). |
| `features/auth/LoginPage.module.scss` | `.background` | The honeycomb illustration (theme #login_bg): hidden on phones, from 768px an absolutely placed picture at least 63.75rem wide covering the page from its top left; between 768px and 1200px it is centred, and up to 1400px shifted a tenth to the left, as the theme's media queries do. |
| `features/auth/LoginPage.module.scss` | `.container` | The theme's Bootstrap container (73.125rem, the page gutter at the sides), split in two equal columns from 768px (theme .row and .col-md-6). |
| `features/auth/LoginPage.module.scss` | `.column` | The form takes the right column, centred (theme .col-md-offset-6). |
| `features/auth/LoginPage.module.scss` | `.login` | The form block (theme #login_content .login): centred text, the theme's 100px above and below, the elements a 24px step apart. |
| `features/auth/LoginPage.module.scss` | `.login h1` | The welcome heading in the heading colour (theme h1 in #login_content). |
| `features/auth/LoginPage.module.scss` | `.login p` | Paragraphs carry no margin of their own; the grid gap spaces them (theme .login p). |
| `features/auth/LoginPage.module.scss` | `.logo` | The splash logo fills the form column, with the theme's 24px under it (theme templates/auth/_splash.html, .login-logo). |
| `features/auth/LoginPage.module.scss` | `.buttons` | The login button row (theme _login_form.html .login-buttons), centred with an 8px step above. |
| `features/auth/LoginPage.module.scss` | `.help` | The help link below the button (theme _login_form.html .login-help), padded 24px all round. |
| `features/compute/RelatedList.module.scss` | `.list` | "Related list - Sidebar" (sidebar-blocks spec, line 876): rows 8px apart (library `sidebar-block-list`). |
| `features/compute/RelatedList.module.scss` | `.row` | One row ("List", line 914): the chevron 4px before its label (library `sidebar-block-link-row`). |
| `features/compute/RelatedList.module.scss` | `.icon` | The chevron's 16px Purple-500 frame ("Frame 514", line 927), level with the label's first line (library `sidebar-block-link-icon`). |
| `features/compute/RelatedList.module.scss` | `.body` | The label and its detail line, 4px apart (the Events - Sidebar pair gap, "Frame 246", line 2004). |
| `features/compute/RelatedList.module.scss` | `.meta` | The detail line (a group's description, when an attachment was made): Body/14 Grey-700, as the home page's announcement meta. |
| `features/compute/images/ImageDetailPage.module.scss` | `.statusRow` | The status pills and the visibility under the title, 8px apart (DERIVED-SPACING, 8px). |
| `features/compute/images/ImageDetailPage.module.scss` | `.muted` | Helper text: Body/14 Grey-500, the library field helper style. |
| `features/compute/images/ImageDetailPage.module.scss` | `.grid` | Panels side by side from 1024px, span 6 each with the grid's 24px gap (grids spec, 12 columns, 24px gap). |
| `features/compute/images/ImageDialogs.module.scss` | `.progress` | The upload's progress bar, its note and "Cancel upload", 12px apart (the library dialog body gap). |
| `features/compute/images/ImageDialogs.module.scss` | `.muted` | Helper text: Body/14 Grey-500, the library field helper style. |
| `features/compute/images/ImageDialogs.module.scss` | `.properties` | The properties group, its parts 16px apart as the dialog's fields (DERIVED-SPACING inter-field gap). |
| `features/compute/images/ImageDialogs.module.scss` | `.groupHead` | The group's label and helper, 4px apart, as the library heads a single field (text-input spec, Input Field with Labels). |
| `features/compute/images/ImageDialogs.module.scss` | `.groupLabel` | The group label: Body/16/Bold Grey-700, the library field label. |
| `features/compute/images/ImageDialogs.module.scss` | `.hint` | The group's helper: Body/14 Grey-500, the library field helper style. |
| `features/compute/instances/InstanceActions.module.scss` | `.names` | The instances a batch action applies to, in a confirm dialog: a bulleted list that scrolls after `--hive-list-max-height` (gap "List cap"). |
| `features/compute/instances/InstanceDetailPage.module.scss` | `.statusRow` | The status pills and the power state under the title, 8px apart (DERIVED-SPACING, 8px). |
| `features/compute/instances/InstanceDetailPage.module.scss` | `.muted` | Helper text: Body/14 Grey-500, the library field helper style. |
| `features/compute/instances/InstanceDetailPage.module.scss` | `.page` | The fault alert and the tabs, 32px apart (library `content-block-stack`). |
| `features/compute/instances/InstanceDetailPage.module.scss` | `.stack` | A tab's panels one under another, 32px apart (library `content-block-stack`). |
| `features/compute/instances/InstanceDetailPage.module.scss` | `.grid` | Panels side by side from 1024px, span 6 each with the grid's 24px gap (grids spec, 12 columns, 24px gap). |
| `features/compute/instances/InstanceDetailPage.module.scss` | `.log` | The console log's toolbar above its code block, 12px apart, as a table's toolbar sits above its table (gap "Table toolbar"). |
| `features/compute/instances/InstanceDetailPage.module.scss` | `.logBar` | The toolbar's controls 12px apart (gap "Table toolbar"). |
| `features/compute/instances/InstanceDetailPage.module.scss` | `.logLength` | The "Lines" select at the table footer's "Per page" width, span 2. |
| `features/compute/instances/InstancesPage.module.scss` | `.addresses` | An instance's addresses, one to a line in the table cell's Body/14 (library `$table-cell-font-size`). |
| `features/compute/instances/InstancesPage.module.scss` | `.muted` | A flavour's rate after its name: Body/14 Grey-500, the library field helper style. |
| `features/compute/instances/InstancesPage.module.scss` | `.pills` | The status pill and the "Locked" pill in one cell, 8px apart as on the instance's page (DERIVED-SPACING, 8px); a narrow column stacks them. |
| `features/compute/instances/LaunchPage.module.scss` | `.summary` | The summary keeps level with the wizard as the page scrolls, a gutter from the top (gap "Sticky summary"). |
| `features/compute/instances/LaunchPage.module.scss` | `.fields` | A step's fields 16px apart (DERIVED-SPACING, inter-field row gap), no wider than span 8 of the grid (a wide form: its steps hold tables). |
| `features/compute/instances/LaunchPage.module.scss` | `.inlineButtons` | A row of buttons inside a step ("Create key pair", "Import public key"), 12px apart, as the wizard's button row (content blocks "Frame 1400"). |
| `features/compute/instances/LaunchPage.module.scss` | `.hint` | Helper text in a step: Body/14 Grey-500, the library field helper style. |
| `features/compute/instances/LaunchPage.module.scss` | `.error` | A step's error, the library `FieldError` in the library field error's Body/14 Red-500 (text-input spec, Input Field State=Error). |
| `features/compute/instances/LaunchPage.module.scss` | `.sourceList` | The launch sources: a scrolling list of radios ruled in Grey-100 at the 4px radius, scrolling after `--hive-picker-max-height` (gap "Option list with descriptions"). |
| `features/compute/instances/LaunchPage.module.scss` | `.selectedRow` | The chosen source above the list: its name, details and "Clear" in one wrapping row, 8px apart (DERIVED-SPACING, 8px), in Body/16 and the library's strong body text colour. |
| `features/compute/instances/LaunchPage.module.scss` | `.order` | The interface order under the networks: its hint over the list, 4px apart, as the library heads a field with its description (text-input spec, Input Field with Labels). |
| `features/compute/instances/LaunchPage.module.scss` | `.sourceName` | A source's name on its own line in the radio label. |
| `features/compute/instances/LaunchPage.module.scss` | `.sourceMeta` | A source's details under its name: Body/14 Grey-500, the library field helper style (gap "Option list with descriptions"). |
| `features/compute/instances/LaunchPage.module.scss` | `.metadata` | The metadata group, its parts 16px apart as a step's fields. |
| `features/compute/instances/LaunchPage.module.scss` | `.groupHead` | The group's label and helper, 4px apart, as the library heads a single field (text-input spec, Input Field with Labels). |
| `features/compute/instances/LaunchPage.module.scss` | `.groupLabel` | The group label: Body/16/Bold Grey-700, the library field label. |
| `features/compute/instances/LaunchPage.module.scss` | `.volumeChoice` | A switch with its helper line under it, 4px apart, as the library heads a single field with its description (text-input spec, Input Field with Labels). |
| `features/compute/instances/LaunchPage.module.scss` | `.pills` | A flavour's note pills, 8px apart (DERIVED-SPACING, 8px). |
| `features/compute/instances/steps/SecurityGroupRules.module.scss` | `.toggle` | The "Rules (n)" trigger (mixin `disclosure-toggle`, as the reservation chart's flavour rows draw theirs): Body/14/Bold Grey-900 with the accordion's plus or minus 8px after it. |
| `features/compute/instances/steps/SecurityGroupRules.module.scss` | `.icon` | The plus and minus glyphs (mixin `disclosure-icon`). |
| `features/compute/instances/steps/SecurityGroupRules.module.scss` | `.panel` | The rules 8px under the trigger, as a flavour's details sit under its name (DERIVED-SPACING, 8px). |
| `features/compute/keypairs/KeyPairDetailPage.module.scss` | `.grid` | A single column at span 9 of the grid (894px, the narrow page width), its key pair panel and public key 32px apart (library `content-block-stack`). |
| `features/compute/keypairs/KeyPairsPage.module.scss` | `.fingerprint` | A fingerprint in the table cell's Body/14 (library `$table-cell-font-size`), in the body face. |
| `features/compute/overview/OverviewPage.module.scss` | `.grid` | Panels two to a row from 1024px, span 6 each with the grid's 24px gap (grids spec, 12 columns, 24px gap). |
| `features/compute/overview/OverviewPage.module.scss` | `.wide` | A panel across both columns (the usage trend, the security risks). |
| `features/compute/overview/OverviewPage.module.scss` | `.meters` | The quota meters 16px apart, the inter-field row gap (DERIVED-SPACING); the library `Meter` fills the panel's width. |
| `features/compute/overview/OverviewPage.module.scss` | `.trend` | The chart beside its total ("Sidebar right" layout): the total span 4 of the grid, 24px from the chart, from 1280px; stacked under it before (gap "Charts"). |
| `features/compute/overview/OverviewPage.module.scss` | `.trendChart` | The chart's column may narrow below the chart's drawn width; the chart redraws to fit it. |
| `features/compute/overview/OverviewPage.module.scss` | `.trendTotal` | The total as an "Info - Sidebar" block's content (sidebar-blocks spec, line 120): the pair, the line to the usage trend and its button, 20px apart (the block gap), start-aligned. |
| `features/compute/overview/OverviewPage.module.scss` | `.pair` | "Frame 246" (line 141): the title 4px above the figure. |
| `features/compute/overview/OverviewPage.module.scss` | `.pairTitle` | The pair's "Title" (line 154): Body/16/Bold Grey-900. |
| `features/compute/overview/OverviewPage.module.scss` | `.figure` | The total in Heading/H3 Grey-900, as the home page's usage figure (gap "Stat figure"). |
| `features/compute/overview/OverviewPage.module.scss` | `.text` | The block's text: Body/16 Grey-700 (line 168). |
| `features/compute/overview/OverviewPage.module.scss` | `.action` | The button keeps its own width, as the CTA - Sidebar block's "Buttons_Chevron_Light BG" wrapper (line 69) holds it. |
| `features/compute/overview/OverviewPage.module.scss` | `.muted` | Notes in a panel ("No instances yet", "unavailable"): Body/14 Grey-500, the library field helper style. |
| `features/compute/overview/OverviewPage.module.scss` | `.statusList` | Instances by status, as related-list rows 8px apart (library `sidebar-block-list`); each row is a status badge and its count (gap "Status summary"). |
| `features/compute/overview/OverviewPage.module.scss` | `.statusItem` | The badge and its count 8px apart (DERIVED-SPACING, 8px). |
| `features/compute/overview/OverviewPage.module.scss` | `.count` | The count: Body/16/Bold Grey-700, the related-list row label. |
| `features/compute/servergroups/ServerGroupDetailPage.module.scss` | `.grid` | Panels side by side from 1024px, span 6 each with the grid's 24px gap (grids spec, 12 columns, 24px gap). |
| `features/compute/servergroups/ServerGroupDetailPage.module.scss` | `.muted` | A note in a panel ("No instances are in this group"): Body/14 Grey-500, the library field helper style. |
| `features/databases/Databases.module.scss` | `.stack` | Page sections (an alert above the panels, the panels, a tab's parts) 32px apart (library `content-block-stack`, the content blocks' section gap). |
| `features/databases/Databases.module.scss` | `.panelStack` | The parts of one panel's content (a key and value list, then a meter), 20px apart: the gap the Info - Sidebar block stacks its pairs at (sidebar-blocks spec, line 120; the `info-block` gap). |
| `features/databases/Databases.module.scss` | `.dialogStack` | The parts of a dialog body (the log controls, notes, the log) 12px apart, the library dialog's body gap. |
| `features/databases/Databases.module.scss` | `.muted` | Helper text and notes: Body/14 in Grey-500, the text field's helper style (text-input spec, "Input Field with Labels"). |
| `features/databases/Databases.module.scss` | `.identifier` | An identifier or value in a table cell (a configuration name or value): the cell's own Body/14, breaking anywhere rather than widening the table. |
| `features/databases/Databases.module.scss` | `.actions` | Buttons in a page's action slot, 12px apart, the gap between controls in a row (content-blocks spec, Frame 1400; library dialog actions item gap). |
| `features/databases/Databases.module.scss` | `.grid` | Two panels side by side from 1024px, span 6 each with the grid's 24px gap (grids spec, 12 columns); stacked below. |
| `features/databases/Databases.module.scss` | `.layout` | The "Sidebar right" layout (layouts spec, "Single pages"): the form beside a span 4 side column (384px, the sidebar block's width), 24px apart. |
| `features/databases/Databases.module.scss` | `.form` | A page form: its field groups, then the button row 32px under them (DERIVED-SPACING: field group to primary action, 32px; library `content-block-stack`). |
| `features/databases/Databases.module.scss` | `.groups` | Field groups (a form's panels, a notice, a failure) 24px apart (DERIVED-SPACING: fieldset to fieldset, 24px). |
| `features/databases/Databases.module.scss` | `.fields` | Fields in a group 16px apart (DERIVED-SPACING: inter-field row gap), in a span 6 column (588px, the 50-50 content column) so text fields do not run the panel's full width. |
| `features/databases/Databases.module.scss` | `.summary` | The side column's summary stays in view while the form scrolls (gap "Sticky summary"), 16px under the window's top edge. |
| `features/databases/Databases.module.scss` | `.buttons` | A form's buttons: 12px apart and start-aligned (content-blocks spec, Frame 1400), wrapping on a narrow column. |
| `features/databases/Databases.module.scss` | `.meters` | Quota meters above a list: the library `Meter`s 16px apart, the gap between labelled fields (DERIVED-SPACING: inter-field row gap), in a span 4 column (384px, the sidebar block's width; gap "Quota meters above a list"). |
| `features/dns/Dns.module.scss` | `.stack` | The zone's panel over its record sets, 32px apart (library `content-block-stack`, the content blocks' section gap). |
| `features/dns/Dns.module.scss` | `.recordName` | A record set's name in its table cell: the cell's own Body/14 (library `$table-cell-font-size`), breaking anywhere rather than widening the column. |
| `features/dns/Dns.module.scss` | `.records` | A record set's records in its table cell, one per line, 8px apart (the related-list gap, sidebar-blocks spec "Related list - Sidebar"), in the cell's Body/14. |
| `features/dns/Dns.module.scss` | `.meters` | The zones quota (library `Meter` through `QuotaMeter`) in a span 4 column (384px, the sidebar block's width; gap "Quota meters above a list"). |
| `features/home/HomePage.module.scss` | `.home` | The page's sections 32px apart (library `content-block-stack`, the content blocks' section gap). |
| `features/home/HomePage.module.scss` | `.greeting` | The greeting takes the global h1 (Heading/H1) in Grey-900, the typography spec's heading colour. |
| `features/home/HomePage.module.scss` | `.alerts` | Library `Alert`s 12px apart, the gap the content blocks keep between cards in a column (`content-block-card-column`). |
| `features/home/HomePage.module.scss` | `.welcome` | "50-50 Media Left" (content-blocks spec, line 1319): a band (library `content-block-band`) with no fill of its own on the white page panel. |
| `features/home/HomePage.module.scss` | `.welcomeSplit` | The band's split (library `content-block-50-50`): the video first, the copy beside it, stacked when the band is narrower than 768px. |
| `features/home/HomePage.module.scss` | `.video` | "Frame 1401" (line 1335): the media frame, 560 by 315 (16:9), with no radius or fill. |
| `features/home/HomePage.module.scss` | `.welcomeCopy` | "Frame 274" (line 1340): the copy 32px above its buttons (library `content-block-stack`). |
| `features/home/HomePage.module.scss` | `.intro` | "Frame 519" (line 1353): Heading/H2 Grey-900 over Body/16 Grey-700, 12px apart (library `content-block-intro`). |
| `features/home/HomePage.module.scss` | `.buttons` | "Frame 1400" (line 1385): buttons 12px apart, start-aligned, wrapping on a narrow column. |
| `features/home/HomePage.module.scss` | `.bannerInfo` | The banner's fine print in the CTA's slot after the buttons (gap "CTA fine print"): Body/14 Grey-700. |
| `features/home/HomePage.module.scss` | `.quickLinks` | The quick links: their intro 24px above the blocks (DERIVED-SPACING, body paragraph to card grid). |
| `features/home/HomePage.module.scss` | `.quickGrid` | Four blocks on the 12-column grid, span 3 each, 24px apart; two to a row (span 6) in a narrower column, one on a phone. |
| `features/home/HomePage.module.scss` | `.block` | "Info - Sidebar" (sidebar-blocks spec, line 120) through Hive's `info-block` mixin (the library `sidebar-block` with its 20px gap). |
| `features/home/HomePage.module.scss` | `.pair` | "Frame 246" (line 141): a title 4px above its content. |
| `features/home/HomePage.module.scss` | `.pairTitle` | The pair's "Title" (line 154): Body/16/Bold Grey-900. |
| `features/home/HomePage.module.scss` | `.figure` | The usage figure: Heading/H3 Grey-900 in the pair's content slot (gap "Stat figure"). |
| `features/home/HomePage.module.scss` | `.blockAction` | The block's button keeps its own width, as the CTA - Sidebar block's "Buttons_Chevron_Light BG" wrapper (line 69) holds it, where the block stretches its other children. |
| `features/home/HomePage.module.scss` | `.usageRow` | Usage beside the announcements on the 12-column grid ("Sidebar left" layout): usage span 4, the announcements span 8, 24px apart; stacked in a narrow column. |
| `features/home/HomePage.module.scss` | `.usage` | Span 4: the sidebar block's own 384px on the 1200px grid. |
| `features/home/HomePage.module.scss` | `.announcements` | Span 8: the main column of the "Sidebar left" layout. |
| `features/home/HomePage.module.scss` | `.list` | "Related list - Sidebar" (sidebar-blocks spec, line 876): rows 8px apart (library `sidebar-block-list`). |
| `features/home/HomePage.module.scss` | `.row` | One row ("List", line 914): the chevron 4px before its label (library `sidebar-block-link-row`). |
| `features/home/HomePage.module.scss` | `.rowIcon` | The chevron's 16px Purple-500 frame ("Frame 514", line 927), level with the label's first line (library `sidebar-block-link-icon`). |
| `features/home/HomePage.module.scss` | `.rowBody` | The row's label, the library `Link` (or link `Button`) as shipped, with the library's `sidebar-block-link-label` so a long title wraps beside the chevron; an announcement's meta line sits 4px under it (the Events - Sidebar pair gap, "Frame 246", line 2004). |
| `features/home/HomePage.module.scss` | `.rowMeta` | An announcement's scheduled, status and date line: Body/14 Grey-700. |
| `features/home/HomePage.module.scss` | `.newsGrid` | The news cards: three columns (the card spec's Column=3col, line 1137), two in a narrower column, one on a phone, 24px apart (paddings-and-margins, line 98, between cards). |
| `features/home/HomePage.module.scss` | `.newsCell` | Each card fills its cell, so the cards in a row share one height. |
| `features/identity/appcreds/ApplicationCredentialsPage.module.scss` | `.intro` | The page's intro paragraph: Body/16 in Grey-700, the content blocks' intro paragraph (content-blocks spec, Frame 519), at most span 9 wide (gap "Reading measure"). |
| `features/identity/appcreds/ApplicationCredentialsPage.module.scss` | `.stack` | A credential's panels, one column of span 9 (894px), 32px apart (library `content-block-stack`, the content blocks' section gap). |
| `features/identity/appcreds/ApplicationCredentialsPage.module.scss` | `.list` | The roles: rows 8px apart and no bullets, as the Related list - Sidebar block stacks its rows (sidebar-blocks spec, line 876; library `sidebar-block-list`). |
| `features/identity/appcreds/ApplicationCredentialsPage.module.scss` | `.muted` | A role's ID beside its name: Body/14 in Grey-500, the text field's helper style (text-input spec, "Input Field with Labels"). |
| `features/identity/credentials/CredentialsPage.module.scss` | `.stack` | The EC2 panel above the other projects' keys, 32px apart (library `content-block-stack`, the content blocks' section gap). |
| `features/identity/credentials/CredentialsPage.module.scss` | `.panelStack` | The EC2 panel's parts (its intro, the keys or the create button) 20px apart, the gap the Info - Sidebar block stacks its parts at (sidebar-blocks spec, line 120; the `info-block` gap). |
| `features/identity/credentials/CredentialsPage.module.scss` | `.intro` | The EC2 panel's intro: Body/16 in Grey-700, the content blocks' intro paragraph (content-blocks spec, Frame 519), at most span 9 wide (gap "Reading measure"). |
| `features/identity/credentials/CredentialsPage.module.scss` | `.copyable` | The access key and its copy button side by side, 8px apart (gap "Code face and copyable value"); a long key breaks rather than widening the panel. |
| `features/identity/lookup/UserLookupPage.module.scss` | `.search` | "Search Field with Button" (search spec, line 3): the library `SearchField` and its button on one row, 8px apart, at most span 8 wide (the frame is 748px: a 640px field and the button). |
| `features/identity/lookup/UserLookupPage.module.scss` | `.field` | The field takes the row's width beside its button. |
| `features/identity/lookup/UserLookupPage.module.scss` | `.hint` | The "at least 3 characters" note under the search: Body/14 in Grey-500, the text field's helper style (text-input spec, "Input Field with Labels"). |
| `features/identity/lookup/UserLookupPage.module.scss` | `.intro` | The sentence shown before a search: Body/16 in Grey-700, the content blocks' intro paragraph (content-blocks spec, Frame 519). |
| `features/identity/lookup/UserLookupPage.module.scss` | `.stack` | A user's panels, one column of span 9 (894px), 32px apart (library `content-block-stack`, the content blocks' section gap). |
| `features/identity/lookup/UserLookupPage.module.scss` | `.ids` | One key and value list per external identity, 20px apart and without rules: the gap the Info - Sidebar block stacks its pairs at (sidebar-blocks spec, line 120; the `info-block` gap), so the identities read as further rows of pairs. |
| `features/identity/members/MembersPage.module.scss` | `.intro` | The page's intro paragraph: Body/16 in Grey-700, the content blocks' intro paragraph (content-blocks spec, Frame 519), at most span 9 wide (gap "Reading measure"). |
| `features/identity/members/MembersPage.module.scss` | `.muted` | A secondary line in a table cell: the cell's Body/14 in Grey-500, the text field's helper colour (text-input spec, "Input Field with Labels"). |
| `features/kubernetes/Kubernetes.module.scss` | `.stack` | A page's sections (the quota panel over the clusters, an alert over the node groups) 32px apart (library `content-block-stack`, the content blocks' section gap). |
| `features/kubernetes/Kubernetes.module.scss` | `.meters` | Quota meters (library `Meter` through `QuotaMeter`) and their note, 16px apart, the inter-field row gap (DERIVED-SPACING, 16px), in a span 4 column (384px, the sidebar block's width; gap "Quota meters above a list"). |
| `features/kubernetes/Kubernetes.module.scss` | `.note` | Helper text: Body/14 in Grey-500 (library `body-14-muted`). |
| `features/kubernetes/Kubernetes.module.scss` | `.labels` | Labels and taints in a table cell: the cell's own Body/14 (library `$table-cell-font-size`), breaking anywhere rather than widening the column. |
| `features/kubernetes/Kubernetes.module.scss` | `.grid` | Panels side by side, span 6 each from 1024px, 24px apart (grids spec, 12 columns with a 24px gap); stacked below. |
| `features/kubernetes/Kubernetes.module.scss` | `.layout` | The create form beside its template summary from 1024px: the "Sidebar right" layout (layouts spec), the summary a span 4 column (384px, the sidebar block's width) 24px from the form; stacked below. |
| `features/kubernetes/Kubernetes.module.scss` | `.form` | The form's panels and its button row 32px apart: the content blocks' section gap, and the field group to submit gap (DERIVED-SPACING, 32px). |
| `features/kubernetes/Kubernetes.module.scss` | `.fields` | Fields 16px apart (DERIVED-SPACING, the inter-field row gap) in a span 6 column (588px, the 50-50 content column). |
| `features/kubernetes/Kubernetes.module.scss` | `.summary` | The template summary stays in view while the form scrolls, 16px from the top of the window (gap "Sticky summary"). |
| `features/kubernetes/Kubernetes.module.scss` | `.buttons` | The form's buttons 12px apart, start-aligned (content-blocks spec, "Frame 1400"). |
| `features/loadbalancers/LoadBalancers.module.scss` | `.stack` | A detail page's panels over its tables, 32px apart (library `content-block-stack`, the content blocks' section gap). |
| `features/loadbalancers/LoadBalancers.module.scss` | `.note` | Helper text: Body/14 in Grey-500 (library `body-14-muted`). |
| `features/loadbalancers/LoadBalancers.module.scss` | `.actions` | A row of buttons 12px apart, start-aligned and wrapping (content-blocks spec, "Frame 1400"), so buttons inside stacked fields keep their own width. |
| `features/loadbalancers/LoadBalancers.module.scss` | `.statusRow` | Status badges and the address under the title, 8px apart (DERIVED-SPACING, 8px). |
| `features/loadbalancers/LoadBalancers.module.scss` | `.grid` | Panels side by side, span 6 each from 1024px, 24px apart (grids spec, 12 columns with a 24px gap); stacked below. |
| `features/loadbalancers/LoadBalancers.module.scss` | `.wizard` | The wizard: its notice, the library `Stepper`, an error and the button row, 32px apart (library `content-block-stack`; DERIVED-SPACING, field group to submit 32px). |
| `features/loadbalancers/LoadBalancers.module.scss` | `.stepPanel` | A step's body: the sidebar block chrome (library `sidebar-block` through the `panel` mixin), which the `Stepper` sets 24px under its steps (`$stepper-panel-gap`). |
| `features/loadbalancers/LoadBalancers.module.scss` | `.fields` | Fields 16px apart (DERIVED-SPACING, the inter-field row gap) in a span 6 column (588px, the 50-50 content column). |
| `features/loadbalancers/LoadBalancers.module.scss` | `.buttons` | The wizard's Back and Next buttons, 12px apart and start-aligned (content-blocks spec, "Frame 1400"). |
| `features/loadbalancers/LoadBalancers.module.scss` | `.addMembers` | The instance picker over its two add buttons, 12px apart, so neither squeezes the other on a phone. |
| `features/loadbalancers/LoadBalancers.module.scss` | `.memberList` | The member rows: library `Card`s (grey tone, 16px padding) 12px apart, the gap the content blocks keep between cards in a column (`content-block-card-column`). |
| `features/loadbalancers/LoadBalancers.module.scss` | `.member` | One member's fields inside its card: one column on a phone, two from 768px, rows 16px apart (the inter-field row gap) and side-by-side fields 12px apart (DERIVED-SPACING, 12px). |
| `features/network/DialogGroups.module.scss` | `.groups` | Groups of fields in a dialog form (a network and its first subnet, a trunk and its subports): 24px apart, the fieldset to fieldset gap (DERIVED-SPACING, 24px), with no rule between them. |
| `features/network/DialogGroups.module.scss` | `.group` | One group: its heading and fields 16px apart, the inter-field row gap inside a fieldset (DERIVED-SPACING, 16px). |
| `features/network/DialogGroups.module.scss` | `.heading` | A group's heading: Heading/H5 in Grey-900 (typography spec), at every heading level and width. |
| `features/network/DialogGroups.module.scss` | `.actions` | A row of buttons 12px apart, start-aligned (content blocks "Frame 1400"), so a button inside the stacked fields keeps its own width. |
| `features/network/networks/NetworkDetailPage.module.scss` | `.plainList` | Several values in one detail pair (addresses, allocation pools, routes), one per line, 8px apart (the related-list gap, sidebar-blocks spec "Related list - Sidebar"). |
| `features/network/networks/NetworkDetailPage.module.scss` | `.stack` | A port's panel over its allowed address pairs, 32px apart (library `content-block-stack`, the content blocks' section gap). |
| `features/network/networks/NetworksPage.module.scss` | `.subnets` | A network's subnets in its table cell, one per line, 8px apart (the related-list gap, sidebar-blocks spec "Related list - Sidebar"), in the cell's Body/14. |
| `features/network/securitygroups/SecurityGroupDetailPage.module.scss` | `.stack` | The group's panel over its rules, 32px apart (library `content-block-stack`, the content blocks' section gap). |
| `features/network/securitygroups/SecurityGroupDetailPage.module.scss` | `.remote` | A rule's remote prefix with the "Open to the internet" badge beside it, 8px apart and wrapping in a narrow cell (DERIVED-SPACING, 8px). |
| `features/network/topology/TopologyPage.module.scss` | `.layout` | The networks, then the unconnected group, 32px apart (library `content-block-stack`, the content blocks' section gap). |
| `features/network/topology/TopologyPage.module.scss` | `.networks, .attachments, .subnets` | The tree's three lists drop the browser's bullets and indent; their spacing follows below (gap "Network topology"). |
| `features/network/topology/TopologyPage.module.scss` | `.networks` | One block per network, 24px apart (grids spec, the grid gap). |
| `features/network/topology/TopologyPage.module.scss` | `.network` | A network is a sidebar block (library `sidebar-block` through the `panel` mixin: 24/24/16 padding, 1px Grey-100 rule, 4px radius), its head, subnets and attachments 8px apart. |
| `features/network/topology/TopologyPage.module.scss` | `.networkHead` | The network's name at the start and its badges at the end, wrapping under it on a narrow block, 8px apart. |
| `features/network/topology/TopologyPage.module.scss` | `.networkName, .islandsTitle` | Network names and the unconnected group's title: Heading/H5 in Grey-900 (typography spec). |
| `features/network/topology/TopologyPage.module.scss` | `.networkName` | The name 8px after its glyph (DERIVED-SPACING, icon to text). |
| `features/network/topology/TopologyPage.module.scss` | `.icon` | A glyph in the library's 16px icon frame. |
| `features/network/topology/TopologyPage.module.scss` | `.badges` | Status badges (library `Badge`) 8px apart. |
| `features/network/topology/TopologyPage.module.scss` | `.subnets` | The subnets in one wrapping row: entries 16px apart, lines 8px apart. |
| `features/network/topology/TopologyPage.module.scss` | `.subnet` | A subnet's name as a link with its network address 8px after it. |
| `features/network/topology/TopologyPage.module.scss` | `.cidr, .addresses` | Values beside a name (a network address, a port's addresses): Body/14 in Grey-700, breaking anywhere rather than widening the block. |
| `features/network/topology/TopologyPage.module.scss` | `.attachments` | What is plugged into the network, one row each, 8px apart, inset 16px behind a 4px Grey-100 rail that ties them to the network. |
| `features/network/topology/TopologyPage.module.scss` | `.attachment` | Glyph, then the name and its details (wrapping within their column), then the status badge at the end of the row; 8px apart. |
| `features/network/topology/TopologyPage.module.scss` | `.attachmentBody` | The name, its kind and its addresses, wrapping 8px apart. |
| `features/network/topology/TopologyPage.module.scss` | `.kind, .note` | Helper text (an attachment's kind, "Nothing is connected"): Body/14 in Grey-500 (library `body-14-muted`). |
| `features/network/topology/TopologyPage.module.scss` | `.islands` | Routers and ports on no network: a dashed 1px Grey-100 outline at the 4px radius, 16px padding, title and rows 8px apart. |
| `features/network/trunks/TrunkDetailPage.module.scss` | `.grid` | The trunk panel beside its subports, span 6 each from 1024px, 24px apart (grids spec, 12 columns with a 24px gap); stacked below. |
| `features/network/trunks/TrunkDialogs.module.scss` | `.subportList` | The subport rows: library `Card`s (grey tone, 16px padding) 12px apart, the gap the content blocks keep between cards in a column (`content-block-card-column`). |
| `features/network/trunks/TrunkDialogs.module.scss` | `.subport` | One subport's fields inside its card, 16px apart (DERIVED-SPACING, the inter-field row gap). |
| `features/network/trunks/TrunkDialogs.module.scss` | `.note` | Helper text: Body/14 in Grey-500 (library `body-14-muted`). |
| `features/objectstore/ObjectStore.module.scss` | `.usage` | The account's usage line under the page title: Body/16 in Grey-700, the content blocks' intro paragraph (content-blocks spec, Frame 519), at most span 9 wide (gap "Reading measure"). |
| `features/objectstore/ObjectStore.module.scss` | `.layout` | The "Sidebar right" layout (layouts spec, "Single pages"): the objects beside a span 4 side column (384px, the sidebar block's width), 24px apart. |
| `features/objectstore/ObjectStore.module.scss` | `.main` | The objects column: a notice above the table 12px from it, the gap the shared `DataTable` keeps between its notices and the table. |
| `features/objectstore/ObjectStore.module.scss` | `.valueStack` | A value made of a control and what belongs to it (the access switch and its failure, the public URL and its copy button), 8px apart, the step between a control and its text (DERIVED-SPACING, 8px). |
| `features/objectstore/ObjectStore.module.scss` | `.uploadBody` | The upload dialog's parts 12px apart, the library dialog's body gap. |
| `features/objectstore/ObjectStore.module.scss` | `.uploadList` | One library `ProgressBar` per file, 16px apart (DERIVED-SPACING: inter-field row gap). |
| `features/orchestration/Orchestration.module.scss` | `.stack` | Page sections (an alert above the panels, the panels, a tab's code blocks) 32px apart (library `content-block-stack`, the content blocks' section gap). |
| `features/orchestration/Orchestration.module.scss` | `.muted` | Helper text and notes: Body/14 in Grey-500, the text field's helper style (text-input spec, "Input Field with Labels"). |
| `features/orchestration/Orchestration.module.scss` | `.identifier` | An identifier in a table cell (a resource's physical ID): the cell's own Body/14, breaking anywhere rather than widening the table. |
| `features/orchestration/Orchestration.module.scss` | `.actions` | Buttons in a page's action slot, 12px apart, the gap between controls in a row (content-blocks spec, Frame 1400; library dialog actions item gap). |
| `features/orchestration/Orchestration.module.scss` | `.grid` | Two panels side by side from 1024px, span 6 each with the grid's 24px gap (grids spec, 12 columns); stacked below. |
| `features/orchestration/Orchestration.module.scss` | `.layout` | The "Sidebar right" layout (layouts spec, "Single pages"): the form beside a span 4 side column (384px, the sidebar block's width), 24px apart. |
| `features/orchestration/Orchestration.module.scss` | `.form` | A page form: its field groups, then the button row 32px under them (DERIVED-SPACING: field group to primary action, 32px; library `content-block-stack`). |
| `features/orchestration/Orchestration.module.scss` | `.groups` | Field groups (a form's panels, a notice, a failure) 24px apart (DERIVED-SPACING: fieldset to fieldset, 24px). |
| `features/orchestration/Orchestration.module.scss` | `.group` | A group of parameters inside a dialog: no panel chrome and no rule, its heading 12px above the fields (DERIVED-SPACING: panel heading to body, 12px). |
| `features/orchestration/Orchestration.module.scss` | `.groupTitle` | The group's heading: Heading/H5 in Grey-900 (typography spec), whatever its level in the outline. |
| `features/orchestration/Orchestration.module.scss` | `.fields` | Fields in a group 16px apart (DERIVED-SPACING: inter-field row gap), in a span 6 column (588px, the 50-50 content column) so text fields do not run the panel's full width. |
| `features/orchestration/Orchestration.module.scss` | `.summary` | The side column's summary stays in view while the form scrolls (gap "Sticky summary"), 16px under the window's top edge. |
| `features/orchestration/Orchestration.module.scss` | `.buttons` | A form's buttons: 12px apart and start-aligned (content-blocks spec, Frame 1400), wrapping on a narrow column. |
| `features/reservations/CreateReservationPage.module.scss` | `.intro` | The page intro under the title: Body/16 Grey-700 (typography spec, body text), no wider than span 9 of the grid (894px, the narrow single column; gap "Reading measure"). |
| `features/reservations/CreateReservationPage.module.scss` | `.stack` | The page's sections 32px apart (library `content-block-stack`). |
| `features/reservations/CreateReservationPage.module.scss` | `.columns` | "Sidebar right" (layouts spec): the flavour classes beside the limits, the limits span 4 of the grid (the sidebar block's 384px), 24px apart; stacked until 1280px. |
| `features/reservations/CreateReservationPage.module.scss` | `.aside` | The side column's two blocks, 24px apart (grids spec, 24px gap). |
| `features/reservations/CreateReservationPage.module.scss` | `.panelBody` | A panel's parts (tabs, note, alert; toolbar, chart) 16px apart (DERIVED-SPACING, inter-field row gap). |
| `features/reservations/CreateReservationPage.module.scss` | `.classBody` | A flavour class's heading over its text, 12px apart (library `content-block-intro`). |
| `features/reservations/CreateReservationPage.module.scss` | `.classHeading` | The class heading: Body/16/Bold Grey-900 (typography spec). |
| `features/reservations/CreateReservationPage.module.scss` | `.classText` | The class text: Body/16 Grey-700 (typography spec, body text). |
| `features/reservations/CreateReservationPage.module.scss` | `.note` | The "Note" badge beside its sentence, 8px apart (DERIVED-SPACING, 8px). |
| `features/reservations/CreateReservationPage.module.scss` | `.limits` | The limit meters, 16px apart (DERIVED-SPACING, inter-field row gap). |
| `features/reservations/CreateReservationPage.module.scss` | `.text` | Text in a panel: Body/16 Grey-700 (typography spec, body text). |
| `features/reservations/CreateReservationPage.module.scss` | `.toolbar` | The chart's filters in one wrapping row, 12px apart and start-aligned (gap "Table toolbar"). |
| `features/reservations/CreateReservationPage.module.scss` | `.field` | The class filter: its label 4px over the toggle group, as the library heads a field (text-input spec, Input Field with Labels). |
| `features/reservations/CreateReservationPage.module.scss` | `.fieldLabel` | The class filter's label: Body/16/Bold Grey-700, the library field label. |
| `features/reservations/CreateReservationPage.module.scss` | `.zone` | The zone select at a toolbar filter's width, span 3 of the grid. |
| `features/reservations/CreateReservationPage.module.scss` | `.feedback` | The feedback block at the CTA - Sidebar block's own width, span 4 (sidebar-blocks spec, CTA-Sidebar, line 3: 384px). |
| `features/reservations/CreateReservationPage.module.scss` | `.cta` | The block's text 24px above its button (CTA-Sidebar, line 3: the block gap); the title sits 8px above the text (the panel's own gap). |
| `features/reservations/CreateReservationPage.module.scss` | `.action` | The button keeps its own width ("Buttons_Chevron_Light BG", line 69). |
| `features/reservations/CreateReservationPage.module.scss` | `.reserve` | The reserve dialog's groups (the flavour, the dates beside the eligibility) 24px apart, without rules (DERIVED-SPACING, fieldset to fieldset). |
| `features/reservations/CreateReservationPage.module.scss` | `.reserveHead` | The flavour's name over its details, 12px apart (library `content-block-intro`). |
| `features/reservations/CreateReservationPage.module.scss` | `.reserveFlavor` | The flavour's name: Heading/H5 Grey-900 (typography spec). |
| `features/reservations/CreateReservationPage.module.scss` | `.reserveColumns` | The dates group beside the eligibility card from 768px, 24px apart (DERIVED-SPACING, fieldset to fieldset); stacked before. |
| `features/reservations/CreateReservationPage.module.scss` | `.reserveGroup` | A group's parts 16px apart (DERIVED-SPACING, inter-field row gap). |
| `features/reservations/CreateReservationPage.module.scss` | `.reserveIntro` | A heading or figure with its line under it, 4px apart (the library field label to helper gap). |
| `features/reservations/CreateReservationPage.module.scss` | `.reserveHeading` | A group heading ("Confirm dates", "Eligibility status"): Heading/H5 Grey-900 (typography spec), as dialog group headings are. |
| `features/reservations/CreateReservationPage.module.scss` | `.reserveText` | Text in a group: Body/16 Grey-700 (typography spec, body text). |
| `features/reservations/CreateReservationPage.module.scss` | `.reserveDays` | The reserved day count: Heading/H5 Grey-900 (typography spec). |
| `features/reservations/CreateReservationPage.module.scss` | `.figure` | A figure, its label and its meter, 8px apart (DERIVED-SPACING, 8px). |
| `features/reservations/CreateReservationPage.module.scss` | `.figureValue` | The figure ("9 / 20") in Heading/H3 Grey-900 (gap "Stat figure"). |
| `features/reservations/CreateReservationPage.module.scss` | `.figureLabel` | The figure's label: Body/14 Grey-500, the library field helper style. |
| `features/reservations/ReservationsPage.module.scss` | `.intro` | The page intro under the title: Body/16 Grey-700 (typography spec, body text), no wider than span 9 of the grid (894px, the narrow single column; gap "Reading measure"). |
| `features/reservations/ReservationsPage.module.scss` | `.stack` | The page's sections 32px apart (library `content-block-stack`). |
| `features/reservations/ReservationsPage.module.scss` | `.limits` | The two limit meters side by side from 768px, 24px apart (grids spec, 24px gap); stacked 16px apart before (DERIVED-SPACING, inter-field). |
| `features/reservations/ReservationsPage.module.scss` | `.muted` | A flavour's size after its name in the table: Body/14 Grey-500, the library field helper style. |
| `features/reservations/ReservationsPage.module.scss` | `.grid` | "Sidebar right" (layouts spec): the overview beside the flavour, the flavour span 4 of the grid, 24px apart; stacked until 1280px. |
| `features/reservations/ReservationsPage.module.scss` | `.actions` | The page actions 12px apart (content blocks "Frame 1400"). |
| `features/reservations/SlotGantt.module.scss` | `.wrap` | The chart and its legend, 12px apart (DERIVED-SPACING, 12px). |
| `features/reservations/SlotGantt.module.scss` | `.scroller` | The chart's frame: a Grey-100 rule at the small radius on white, scrolling both ways after `--hive-timeline-max-height`. |
| `features/reservations/SlotGantt.module.scss` | `.grid` | The grid: the sticky label column (`--hive-timeline-label`, narrower below 768px) then one 20px column per day, as wide as a bar is high so a one-day slot is square. |
| `features/reservations/SlotGantt.module.scss` | `.corner` | The top start corner over the label column, above everything as the chart scrolls. |
| `features/reservations/SlotGantt.module.scss` | `.month` | A month's header across its days, 24px high, alternating Grey-100 and Grey-300 with Grey-900 text; sticks to the top. |
| `features/reservations/SlotGantt.module.scss` | `.day` | A day's number under its month: white on Grey-900, ruled in Grey-700; today in Purple-500. |
| `features/reservations/SlotGantt.module.scss` | `.row` | A flavour's row: its label and track sit in the chart's grid directly. |
| `features/reservations/SlotGantt.module.scss` | `.label` | The flavour's label cell, sticky at the start: Blue-100 behind it, ruled in Grey-100, 8px padding. |
| `features/reservations/SlotGantt.module.scss` | `.toggle` | The disclosure trigger (mixin `disclosure-toggle`, the library `Accordion`'s anatomy): the flavour name across the label column with the accordion's plus or minus at its end. |
| `features/reservations/SlotGantt.module.scss` | `.icon` | The plus and minus glyphs (mixin `disclosure-icon`). |
| `features/reservations/SlotGantt.module.scss` | `.details` | The flavour's details 8px under its name, as the shared `KeyValueList`. |
| `features/reservations/SlotGantt.module.scss` | `.track` | A flavour's track: twice a bar's height with the bar centred, ruled in Grey-100; every other row on Grey-50. |
| `features/reservations/SlotGantt.module.scss` | `.noSlots` | The note on a flavour's track when it has no free slot: Body/14 Grey-500, the helper text style, held beside the label column while the chart scrolls so it stays in view. |
| `features/reservations/SlotGantt.module.scss` | `.todayColumn` | Today's column down the track, in Purple-50. |
| `features/reservations/SlotGantt.module.scss` | `.slot` | A free slot: a 20px bar in the chart's green (`--hive-chart-4`) at the small radius; half opacity when it cannot be reserved; the library focus ring on keyboard focus. |
| `features/reservations/SlotGantt.module.scss` | `.shade` | The proposed days, a white wash over the bar while it is pointed at or has keyboard focus; always in place, since it anchors the tooltip. |
| `features/reservations/SlotGantt.module.scss` | `.maintenance` | A maintenance window: a 12px bar in Orange-500 at the small radius. |
| `features/reservations/SlotGantt.module.scss` | `.legend` | The legend under the chart: Body/14 Grey-500 entries, 8px by 16px apart. |
| `features/reservations/SlotGantt.module.scss` | `.swatch` | A legend swatch, 16 by 12px at the small radius, in its bar's colour. |
| `features/security/SecurityRisksPage.module.scss` | `.intro` | The page's intro paragraph: Body/16 in Grey-700, the content blocks' intro paragraph (content-blocks spec, Frame 519), at most span 9 wide (gap "Reading measure"). |
| `features/security/SecurityRisksPage.module.scss` | `.stack` | The page's sections (the count alert, the risks) in one column of span 9 (894px), 32px apart (library `content-block-stack`, the content blocks' section gap). |
| `features/security/SecurityRisksPage.module.scss` | `.section` | "Risks detected" over its resource panels, 24px from the heading and between panels (DERIVED-SPACING: section title to body, 24px; the grid's gap between rows of blocks). |
| `features/security/SecurityRisksPage.module.scss` | `.highlight` | The panel a `#<resource id>` link lands on, ringed with the library focus ring at the panel's 4px radius, so its corner matches the ring the library draws round a focused control (gap "Target highlight"). |
| `features/security/SecurityRisksPage.module.scss` | `.panelStack` | A panel's parts (its note, the risks) 20px apart, the gap the Info - Sidebar block stacks its parts at (sidebar-blocks spec, line 120; the `info-block` gap). |
| `features/security/SecurityRisksPage.module.scss` | `.muted` | The note above a resource's risks: Body/14 in Grey-500, the text field's helper style (text-input spec, "Input Field with Labels"). |
| `features/security/SecurityRisksPage.module.scss` | `.risks` | Each risk is a library `Alert` in the danger tone; the alerts sit 12px apart, the content blocks' card column gap (library `content-block-card-column`), as the home page's alerts do. |
| `features/security/SecurityRisksPage.module.scss` | `.risk` | The lines inside one risk's alert (its name in bold, the description, the address and dates) 8px apart, as the shared error alert stacks its lines (DERIVED-SPACING, 8px). |
| `features/shares/Shares.module.scss` | `.stack` | Page sections (an alert above the panels, the panels) 32px apart (library `content-block-stack`, the content blocks' section gap). |
| `features/shares/Shares.module.scss` | `.intro` | A page's intro paragraph: Body/16 in Grey-700, the content blocks' intro paragraph (content-blocks spec, Frame 519), at most span 9 wide (gap "Reading measure"). |
| `features/shares/Shares.module.scss` | `.muted` | Helper text and notes: Body/14 in Grey-500, the text field's helper style (text-input spec, "Input Field with Labels"). |
| `features/shares/Shares.module.scss` | `.identifier` | An identifier in a table cell (an access rule's target or key): the cell's own Body/14, breaking anywhere rather than widening the table. |
| `features/shares/Shares.module.scss` | `.grid` | Two panels side by side from 1024px, span 6 each with the grid's 24px gap (grids spec, 12 columns); stacked below. |
| `features/shares/Shares.module.scss` | `.meters` | Quota meters above a list: the library `Meter`s 16px apart, the gap between labelled fields (DERIVED-SPACING: inter-field row gap), in a span 4 column (384px, the sidebar block's width; gap "Quota meters above a list"). |
| `features/shares/Shares.module.scss` | `.list` | A list in a panel (export locations, a group's member shares): rows 8px apart and no bullets, as the Related list - Sidebar block stacks its rows (sidebar-blocks spec, line 876; library `sidebar-block-list`). |
| `features/usage/AllocationUsagePage.module.scss` | `.stack` | The page's sections 32px apart (library `content-block-stack`). |
| `features/usage/AllocationUsagePage.module.scss` | `.lead` | The budget line: Body/16 Grey-700 (typography spec, body text). |
| `features/usage/AllocationUsagePage.module.scss` | `.tiles` | The four figures on the grid, 24px apart (grids spec, 24px gap): two to a row on a phone, four (span 3 each at 1200px) from 768px. |
| `features/usage/AllocationUsagePage.module.scss` | `.tile` | Inside a figure's card: its label 4px over the figure (sidebar-blocks spec, Info - Sidebar "Frame 246", line 141). |
| `features/usage/AllocationUsagePage.module.scss` | `.tileLabel` | The figure's label: Body/16/Bold Grey-900 (Info - Sidebar "Title", line 154). |
| `features/usage/AllocationUsagePage.module.scss` | `.tileValue` | The figure in Heading/H3 Grey-900, as the home page's usage figure (gap "Stat figure"). |
| `features/usage/UsageTrendPage.module.scss` | `.controls` | The date range and its presets: stacked 12px apart on a phone, one wrapping row from 768px (DERIVED-SPACING, 12px between side-by-side fields). |
| `features/usage/UsageTrendPage.module.scss` | `.range` | The date range at most span 4 of the grid (`--hive-field-max`). |
| `features/usage/UsageTrendPage.module.scss` | `.note` | The data note under the controls, 8px down: Body/14 Grey-500, the library field helper style. |
| `features/usage/UsageTrendPage.module.scss` | `.grid` | Three panels to a row from 1024px (span 4 each at 1200px), the chart and the table across the row, 24px apart (grids spec, 24px gap). |
| `features/usage/UsageTrendPage.module.scss` | `.wide` | A panel or the table across the whole row. |
| `features/usage/UsageTrendPage.module.scss` | `.total` | The total's panel may narrow below its figure's width. |
| `features/usage/UsageTrendPage.module.scss` | `.totalValue` | The total in Heading/H3 Grey-900 (gap "Stat figure"). |
| `features/usage/UsageTrendPage.module.scss` | `.muted` | Notes in a panel: Body/14 Grey-500, the library field helper style, 8px above what follows. |
| `features/volumes/Volumes.module.scss` | `.statusRow` | The status pill under a detail page's title, 8px below it, as the instance page's status row (DERIVED-SPACING, 8px). |
| `features/volumes/Volumes.module.scss` | `.metadata` | Metadata pairs, one to a line 8px apart (library `sidebar-block-list`, the related list's row gap). |
| `features/volumes/volumes/VolumeDetailPage.module.scss` | `.page` | The fault, the panels and the hints under them, 32px apart (library `content-block-stack`). |
| `features/volumes/volumes/VolumeDetailPage.module.scss` | `.grid` | Panels side by side from 1024px, span 6 each with the grid's 24px gap (grids spec, 12 columns, 24px gap); the last (snapshots, a table) spans both. |
| `features/volumes/volumes/VolumeDetailPage.module.scss` | `.muted` | A note in a panel ("Not attached to any instance"): Body/14 Grey-500, the library field helper style. |
| `features/volumes/volumes/VolumeDetailPage.module.scss` | `.hint` | The hints under the panels (mark bootable, launch from the volume): Body/14 Grey-500, the library field helper style. |
| `features/volumes/volumes/VolumeDialogs.module.scss` | `.quota` | The quota meters inside their grey `Card`, 16px apart (DERIVED-SPACING, inter-field row gap). |
| `features/volumes/volumes/VolumeDialogs.module.scss` | `.groups` | The attachments dialog's groups (what the volume is attached to, the attach form) 24px apart, without rules (DERIVED-SPACING, fieldset to fieldset). |
| `features/volumes/volumes/VolumeDialogs.module.scss` | `.group` | One group: its heading, then its content 16px apart (DERIVED-SPACING, inter-field row gap). |
| `features/volumes/volumes/VolumeDialogs.module.scss` | `.subheading` | A group's heading in Heading/H5 Grey-900 (typography spec). |
| `features/volumes/volumes/VolumeDialogs.module.scss` | `.attachmentList` | The attachments, each a grey `Card`, 12px apart (library `content-block-card-column`). |
| `features/volumes/volumes/VolumeDialogs.module.scss` | `.attachment` | Inside an attachment's card: its label and its detach control at either end, 12px apart when they wrap. |
| `features/volumes/volumes/VolumeDialogs.module.scss` | `.confirmDetach` | "Detach?" and its two buttons in a row, 12px apart (content blocks "Frame 1400"); an inline confirmation (gap "Inline confirmation"). |
| `features/volumes/volumes/VolumeDialogs.module.scss` | `.muted` | Notes in the dialog: Body/14 Grey-500, the library field helper style. |
| `features/volumes/volumes/VolumesPage.module.scss` | `.attachments` | A volume's attachments in its table cell, one to a line 8px apart (library `sidebar-block-list`, the related list's row gap). |
| `shell/AppLayout.module.scss` | `.page` | The signed-in frame: the service header over the body, a column that fills the app root under the mega menu exactly, so the window never scrolls (Horizon's layout, Hakkim 2026-10-21). |
| `shell/AppLayout.module.scss` | `.body` | The dashboard frame under the header: fluid across the window, as a data dashboard needs for its tables (Hakkim, 2026-10-15; gap "Dashboard content width"). |
| `shell/AppLayout.module.scss` | `.content` | The content column beside the sidebar: the page, then the agency footer at its end, scrolling together (Horizon puts its footer inside the content column). |
| `shell/AppLayout.module.scss` | `.main` | The page's `main` ("Sidebar left" layout): one panel on the canvas, a gutter in from the column's edges and from the footer below it, its content a gutter in from the panel's. |
| `shell/AuthLayout.module.scss` | `.frame` | The signed-out frame (signed out, terms, and the login page without its header): the service header over one column, filling the app root under the mega menu exactly, as the signed-in frame does, so the header stays put and the window never scrolls. |
| `shell/AuthLayout.module.scss` | `.page` | The column under the header: no sidebar, scrolling on its own. |
| `shell/AuthLayout.module.scss` | `.main` | The page's `main`, filling its row so a page can fill the frame. |
| `shell/DetailPage/DetailPage.module.scss` | `.failed` | A detail page that failed to load: the error alert over the link back to the list, 32px apart, as every page's sections (library `content-block-stack`). |
| `shell/LinkRows/LinkRows.module.scss` | `.list` | Related list - Sidebar (sidebar-blocks spec, line 876): rows 8px apart. |
| `shell/LinkRows/LinkRows.module.scss` | `.row` | One row of that list (spec "List", line 899): the 16px chevron 4px before a Body/16/Bold Grey-700 label. |
| `shell/LinkRows/LinkRows.module.scss` | `.icon` | The chevron's 16px frame (spec "Frame 514", line 909), via the library mixin that keeps it level with the first line of a wrapping label. |
| `shell/LinkRows/LinkRows.module.scss` | `.group` | A titled group of rows: the Info - Sidebar pair (line 133), a Body/16/Bold Grey-900 title 4px above its content. |
| `shell/LinkRows/LinkRows.module.scss` | `.heading` | The group's title: the Info - Sidebar title (line 154), Body/16/Bold Grey-900. |
| `shell/LinkRows/LinkRows.module.scss` | `.heading + .list` | A titled group's rows sit 12px in under its title, as Darcelle's 15 Oct 2026 mockup indents the pages under "Compute"; an untitled run stays level with the titles around it. |
| `shell/LinkRows/LinkRows.module.scss` | `.groups` | Groups stack at the Info - Sidebar block's 20px gap (line 124). |
| `shell/PageHeader/PageHeader.module.scss` | `.header` | Breadcrumbs 16px above the title (hero spec, "Image Placement=With Breadcrumbs", Frame 387 gap 16), and 24px from the content below (DERIVED-SPACING: section title to body). |
| `shell/PageHeader/PageHeader.module.scss` | `.row` | The title row (gap: page actions). |
| `shell/PageHeader/PageHeader.module.scss` | `.title` | The page title takes the global h1 (Heading/H1). |
| `shell/PageHeader/PageHeader.module.scss` | `.actions` | Actions 12px apart, the gap between controls in a row (gap: page actions). |
| `shell/ServiceHeader/ServiceHeader.module.scss` | `.header` | The desktop header ("Nav with Mega Menu", services-headers spec line 181) under the agency mega menu's strip, which stands for the spec's band: white, in flow with the page, above the scrolling columns. |
| `shell/ServiceHeader/ServiceHeader.module.scss` | `.row` | The 100px row ("Main Nav", line 325) across the content width: the brand at the start, centred in the row; the items at the end, standing on the row's foot so their hover rule meets the header's bottom edge (the items are drawn bottom-aligned at top 40px in the 100px row). |
| `shell/ServiceHeader/ServiceHeader.module.scss` | `.brand` | Logo, then the product name 24px after it ("Frame 1307", line 558; the gap is the Nectar logo's, own decision). |
| `shell/ServiceHeader/ServiceHeader.module.scss` | `.logo` | The Nectar logo, 47px high at every width with its width following its proportions (the spec draws the ARDC mark at 146x47, line 575, and 141x45 on the Mobile frame, line 5690; own decision, as the logo is another). |
| `shell/ServiceHeader/ServiceHeader.module.scss` | `.title` | The product name (line 636): Figtree 16/18 regular, Grey-900, in a 100px box, so "Nectar Dashboard" takes two lines beside the logo (own decision). |
| `shell/ServiceHeader/ServiceHeader.module.scss` | `.nav` | The navigation landmark at the row's end ("Main Nav", line 325). |
| `shell/ServiceHeader/ServiceHeader.module.scss` | `.items` | The items 32px apart (the 1280 and 1024 sets). |
| `shell/ServiceHeader/ServiceHeader.module.scss` | `.item` | One navigation item ("Nav Service Menu", Breakpoint=Desktop cells, lines 5766 to 5923): Body/16/Regular Grey-700, 20px above and below, 8px to the chevron. |
| `shell/ServiceHeader/ServiceHeader.module.scss` | `.row > .item` | Where the row runs short (from 1024px up to about 1200px), the account trigger gives way rather than the navigation: the name is cut shorter (own decision). |
| `shell/ServiceHeader/ServiceHeader.module.scss` | `.cta` | The call to action after the items ("Buttons_Chevron_Light BG", line 508), shown to a visitor without a session: the library primary link in its navigation tone (Purple-500, white Body/16/Bold) at its small size, which is the drawn 40px button with 8px and 24px padding, its foot 10px above the header's. |
| `shell/ServiceHeader/ServiceHeader.module.scss` | `.itemLabel` | The account name is cut short with an ellipsis only once the row runs out of room (own decision); at full width the whole name shows, as Horizon shows it. |
| `shell/ServiceHeader/ServiceHeader.module.scss` | `.itemChevron` | The dropdown chevron ("Vector", 4.98x8 turned 90deg, Grey-700 in every state): the library ChevronDown, which is that glyph already turned. |
| `shell/ServiceHeader/ServiceHeader.module.scss` | `.menu` | The dropdown panel ("Frame 1336", line 1345): 335px, white, 8px padding, 4px radius. |
| `shell/ServiceHeader/ServiceHeader.module.scss` | `.menuList` | The panel's list draws no ring of its own: keyboard focus shows on the row (see `.menuRow`). |
| `shell/ServiceHeader/ServiceHeader.module.scss` | `.menuRow` | One row ("Mega Menu Nav Links", Frame 1295 and 1296, lines 14 to 170): 16px padding, Body/16/Regular Grey-900. |
| `shell/ServiceHeader/ServiceHeader.module.scss` | `.menuChevron` | "Icon/Chevron Right" (line 1480): a 20px frame holding the 9.38px Purple-500 glyph, hidden at rest. |
| `shell/ServiceHeader/ServiceHeader.module.scss` | `.mobileBar` | The Mobile frame's bar ("Frame 1330", line 5480): 71px, the brand at the start and the navigation button at the end, 16px in from either edge ("Icon/List" right 16px; "Frame 1329" left 16px). |
| `shell/ServiceHeader/ServiceHeader.module.scss` | `.navButton` | The navigation button: the 24px "Icon/List" in Grey-900, with the library's focus ring. |
| `shell/ServiceHeader/ServiceHeader.module.scss` | `.listIcon` | The 24px "Icon/List" glyph (Mobile frame, line 5489). |
| `shell/SessionTimeoutWarning.module.scss` | `.banner` | The library `Alert` warning that the session ends soon, 16px above the page (DERIVED-SPACING: inter-field row gap). |
| `shell/Sidebar/HomeLink.module.scss` | `.home` | Home, after Darcelle's 15 Oct 2026 mockup: a row across its container's full width (it runs out by a gutter, to the sidebar panel's outer edge over the panel's rule, and to the edge of the navigation dialog's 24px padding), the glyph 8px before a Body/16/Bold label, 12px above and below. |
| `shell/Sidebar/HomeLink.module.scss` | `.icon` | The house glyph at the accordion's 24px icon size, in the label's colour. |
| `shell/Sidebar/ProjectInfo.module.scss` | `.facts` | The labelled pairs stack at the Info - Sidebar block's 20px gap (sidebar-blocks spec, line 124). |
| `shell/Sidebar/ProjectInfo.module.scss` | `.fact` | One pair (spec "Frame 246", line 133): title 4px above its value. |
| `shell/Sidebar/ProjectInfo.module.scss` | `.term` | The pair's title as the small uppercase label of Darcelle's 15 Oct 2026 mockup ("RESOURCE BUNDLE"; gap "Small uppercase label"), with the library InfoButton 4px after it, centred on the line it shares. |
| `shell/Sidebar/ProjectInfo.module.scss` | `.value` | The pair's value (line 160): Body/16/Regular Grey-700. |
| `shell/Sidebar/Sidebar.module.scss` | `.sidebar` | The docked navigation column: span 3 of the 12-column grid (grids spec) with the page gutter around it, on the start side of the "Sidebar left" layout (layouts spec, variant 2). |
| `shell/Sidebar/Sidebar.module.scss` | `.panel` | The navigation's panel: the sidebar block (sidebar-blocks spec, Events - Sidebar line 1970) through the `panel` mixin, as every Hive panel is. |
| `shell/Sidebar/Sidebar.module.scss` | `.content` | The project block over the navigation, a grid gap (24px) apart. |
| `shell/Sidebar/Sidebar.module.scss` | `.project` | The project block: the switcher, the allocation facts and their links, unboxed on the sidebar's white as Darcelle's 15 Oct 2026 mockup draws them, at the Info - Sidebar block's 20px gap (sidebar-blocks spec, line 124). |
| `shell/Sidebar/Sidebar.module.scss` | `.nav` | Home over the accordion, 16px apart: the clearance the Accordion keeps either side of a section title (accordion spec, header padding). |
| `shell/SkipLink.module.scss` | `.skip` | Positions the library link only: hidden until focused, then fixed at the viewport's top start corner, a gutter in, over the page. |
| `styles/global.scss` | `*, *::before, *::after` | Border-box sizing everywhere, as the library's components assume. |
| `styles/global.scss` | `html` | The page: the library body face (Figtree) in Grey-700 on the white surface the library assumes ("Grey sits on a white page"). |
| `styles/global.scss` | `body` | Body/16 (typography spec, library `text-style(body-16)`). |
| `styles/global.scss` | `ardc-megamenu` | The agency mega menu (`<ardc-megamenu>` in index.html) as its loader supplies it. |
| `styles/global.scss` | `#root` | The app root fills the column under the mega menu (`min-height: 0`, so the layouts' own columns scroll rather than the window), and is its own stacking context (`isolation`), so a positioned or z-indexed element inside it only competes inside the app. |
| `styles/global.scss` | `:where(#root ~ *)` | The overlays React Aria portals to the end of body (dialogs, popovers, menus, tooltips) take the mega menu's layer: equal, and later in the page, so a dialog's dimmed overlay covers the mega menu's strip too. |
| `styles/global.scss` | `h1, h2, h3, h4, h5, p, ul, ol, dl, dd, figure` | No browser margins: spacing comes from each module's spec gaps. |
| `styles/global.scss` | `h1` | A page title is Heading/H1 (typography spec, 36/44), as the hero draws it under breadcrumbs. |
| `styles/global.scss` | `h2` | Heading/H2 (typography spec). |
| `styles/global.scss` | `h3` | Heading/H3 (typography spec). |
| `styles/global.scss` | `h4` | Heading/H4 (typography spec). |
| `styles/global.scss` | `h5` | Heading/H5 (typography spec). |
| `styles/global.scss` | `h1` in `@include down($bp-md)` | Below 768px the typography spec's mobile ramp (Mobile/Heading/H1 to H3) takes over for the three levels it draws. |
| `styles/global.scss` | `h2` in `@include down($bp-md)` | Below 768px the typography spec's mobile ramp (Mobile/Heading/H1 to H3) takes over for the three levels it draws. |
| `styles/global.scss` | `h3` in `@include down($bp-md)` | Below 768px the typography spec's mobile ramp (Mobile/Heading/H1 to H3) takes over for the three levels it draws. |
| `styles/global.scss` | `a` | A raw anchor in feature code takes the library link colour (Purple-500); the shell renders none. |
| `styles/global.scss` | `code, pre` | The design system has no code face (gap "Code face and copyable value"), so code and preformatted text take the body face instead of the browser's monospace. |
| `styles/global.scss` | `img, svg` | Pictures never overflow their column. |
| `styles/global.scss` | `:where(a, button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])):focus-visible:not([data-rac])` | The library focus ring (1.5px Purple-500, 4px out) for raw elements that are not React Aria. |
| `styles/global.scss` | `.visually-hidden` | Text for screen readers only. |
| `styles/global.scss` | `*, *::before, *::after` in `@media (prefers-reduced-motion: reduce)` | With reduced motion, animations and transitions finish at once. |
<!-- prettier-ignore-end -->

<!-- design-sources:end -->
