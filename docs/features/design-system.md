# Curator Design System

The Curator module uses a centralized design system located at `src/modules/curator/components/ui/index.jsx`. All curator components import primitives from this file for consistency.

## Design Tokens

The `tokens` export provides spacing, sizing, radii, shadows, transitions, and z-index values.

### Spacing Scale

Uses a 4px base unit:
- `tokens.spacing[0]` through `tokens.spacing[16]` (0px to 64px)
- `tokens.componentSpacing.sectionGap` - 24px between major sections
- `tokens.componentSpacing.cardPadding` - 16px inside cards
- `tokens.componentSpacing.formGap` - 16px between form fields

### Sizing

- `tokens.sizing.touchTarget` - 44px minimum touch target
- `tokens.sizing.touchTargetComfortable` - 48px comfortable touch target
- `tokens.sizing.inputHeight` - 44px input height
- `tokens.sizing.buttonHeightSm/Md/Lg` - 36px, 44px, 56px

### Shadows

- `tokens.shadows.card` - `4px 4px 0 #000`
- `tokens.shadows.button` - `3px 3px 0 #000`
- `tokens.shadows.modal` - `0 32px 80px rgba(0, 0, 0, 0.64)`

## Button Component

Located at `src/modules/curator/components/ui/index.jsx`. Exported as `Button`.

### Variants

- `primary` - Blue background, black text
- `secondary` - Action color background
- `success` - Green background
- `danger` - Red background, white text
- `dangerOutline` - Transparent with red border
- `ghost` - Transparent, no border
- `olive` - Olive background
- `default` - White background (default)

### Sizes

- `sm` - 36px height, tiny font
- `md` - 44px height, small font (default)
- `lg` - 56px height, body font

### Props

- `$variant` - Button variant name
- `$size` - Button size (`sm`, `md`, `lg`)
- `$fullWidth` - Makes button full width
- `$iconOnly` - Removes padding for icon-only buttons

### Usage

```jsx
import { Button } from './ui/index.jsx';

<Button variant="primary" size="md" onClick={handleClick}>
  Submit
</Button>
```

## Form Components

### Input

Styled input with consistent border, padding, and focus states. Accepts `$error` prop for error styling.

### Select

Styled select with custom dropdown arrow. Accepts `$error` prop.

### TextArea

Styled textarea with vertical resize. Accepts `$error` prop.

### FormField

Composite component that combines label, input, and helper/error text.

Props:
- `label` - Label text
- `error` - Error message (shows in red)
- `helper` - Helper text
- `required` - Shows asterisk if true
- `children` - Input/Select/TextArea component

### Usage

```jsx
import { FormField, Input } from './ui/index.jsx';

<FormField label="Email" error={errors.email} required>
  <Input type="email" value={email} onChange={handleChange} />
</FormField>
```

## Layout Components

### Stack

Flex column with configurable gap. Props:
- `$gap` - Gap size (number for token index or string)
- `$direction` - `column` (default) or `row`
- `$align` - Alignment
- `$justify` - Justification

### Flex

Flex row with configurable gap. Props:
- `$gap` - Gap size
- `$align` - Alignment (default: `center`)
- `$justify` - Justification
- `$wrap` - Enable wrapping

### Grid

CSS Grid with auto-fit columns. Props:
- `$columns` - Fixed column count
- `$gap` - Gap size
- `$minWidth` - Minimum column width (default: `280px`)

## Card Components

### Card

Base card component. Props:
- `$variant` - `dark` for black background
- `$hoverable` - Adds hover transform and shadow
- `$padding` - Custom padding

### SectionCard

Card with bottom margin for sections.

## Section Headers

### SectionHeader

Header with title and optional actions. Props:
- `$noBorder` - Removes bottom border

### SectionTitle

Black background title with white text. Used inside `SectionHeader1` styled component in `CuratorPlaylistCreate.jsx`.

### SectionSubtitle

Uppercase mono subtitle.

## Page Header

### PageHeader

Black background header with title and description. Used for page-level headers.

### PageHeaderActions

Action buttons container for page headers.

## Status & Feedback

### StatusBanner

Banner for success, error, or warning messages. Props:
- `$variant` - `success`, `error`, `warning`, or default

### Badge

Small badge component. Props:
- `$variant` - `success`, `danger`, `warning`, `info`, or default

### StatusDot

Small colored dot indicator. Props:
- `$active` - Green if true, orange if false

## Action Bars

### StickyActionBar

Sticky bottom action bar with backdrop blur. Used for mobile action buttons.

### ActionBar

Flex container for action buttons. Props:
- `$align` - Justification (`flex-start`, `flex-end`, `center`)

## Toolbar & Filters

### Toolbar

Horizontal toolbar container with responsive wrapping.

### ToolbarGroup

Group of toolbar items.

### FilterPill

Toggle button for filters. Props:
- `$active` - Active state styling

### SearchInput

Styled input for search fields with min/max width constraints.

## List Components

### List

Grid container for list items. Responsive columns with 325px minimum.

### ListItem

Individual list item card with shadow and hover states.

## Empty States

### EmptyState

Centered empty state container with dashed border.

## Menu & Navigation

### MenuGroup

Container for menu sections.

### MenuLabel

Uppercase label for menu sections.

### MenuItem

Menu item button with hover transform.

## Tabs

### TabList

Horizontal tab container with bottom border.

### Tab

Individual tab button. Props:
- `$active` - Active state styling

## Container Wrappers

### ContentWrapper

Max-width 1400px centered container.

### PageContainer

Full-width page container with responsive padding.

### TwoColumnGrid

Two-column responsive grid that collapses to one column below 1100px.

## Component Refactoring

The following components were refactored to use the design system:

### CuratorDashboard

Located at `src/modules/curator/components/CuratorDashboard.jsx`. Replaced custom styled components with:
- `PageHeader`, `SectionCard`, `Button`, `Input`, `FilterPill`
- `EmptyStateCard`, `StatusDot`, `MetricFlag`, `MetricCountFlag`
- `SectionHeader`, `InfoModal`
- Header components: `Header`, `HeaderLeft`, `HeaderCenter`, `HeaderRight`, `HeaderDivider`, `Logo`
- Tab components: `Tabs`, `Tab`
- Hamburger menu components: `HamburgerButton`, `HamburgerMenu`, `HamburgerOverlay`, `MenuHeader`, `CloseButton`, `MenuContent`, `MenuGroup`, `SectionLabel`, `MenuItem`, `MenuItemTight`, `HamburgerItem`
- List components: `List`, `ListItem`, `CardTop`, `RowTitle`, `CardInfo`, `RowMeta`, `Actions`
- Toolbar components: `PlaylistToolbar`, `ToolbarGroup`, `SearchField`, `ButtonsBar`
- Layout: `ContentShell`

### CuratorPlaylists

Located at `src/modules/curator/components/CuratorPlaylists.jsx`. Uses design system primitives for sidebar navigation and editor layout.

### CuratorProfilePage

Located at `src/modules/curator/components/CuratorProfilePage.jsx`. Uses `SectionCard`, `Button`, `FormField`, `Input`, `TextArea` for form sections.

### CuratorAccountSettings

Located at `src/modules/curator/components/CuratorAccountSettings.jsx`. Uses `FormField`, `Input`, `Button` for account settings form.

### CuratorPlaylistCreate

Located at `src/modules/curator/components/CuratorPlaylistCreate.jsx`.

#### Cover Image Tab

Uses `SectionHeader1` with black background matching other workspace tabs. `ImageUpload` component uses `hideHeader` prop to avoid duplicate headers.

#### Publish & Export Tab

Uses `SectionHeader1` for consistent header. Removed redundant `WorkspaceTabs` component (was single "Options" tab). Simplified platform card copy and selection banner text.

#### Import Tools

Refactored import tools section:
- Removed toggle button, always visible
- Added tabbed interface with `ImportTabs` and `ImportTab` components
- Two tabs: "Paste Text" and "From DSP"
- Cross-linking status shown in compact `LinkingStatusBar` at bottom
- Simplified hint text and removed redundant explanations

Styled components added:
- `ImportTabs` - Tab container
- `ImportTab` - Individual tab button with `$active` prop
- `ImportTabContent` - Tab content wrapper
- `LinkingStatusBar` - Compact cross-linking status container
- `LinkingStatusRow` - Status row with dot and text
- `LinkingStatusText` - Status message text
- `LinkingStats` - Platform link count pills

## Import Path

All curator components import from:

```jsx
import { Button, Input, FormField, SectionCard, ... } from './ui/index.jsx';
```

Or from parent directories:

```jsx
import { Button, Input } from '../ui/index.jsx';
```

## Styling Conventions

- All buttons use uppercase text with letter-spacing
- Form inputs use mono font for labels, primary font for values
- Cards use `4px 4px 0 #000` shadow by default
- Touch targets minimum 44px, comfortable 48px
- Spacing uses 4px base unit
- Borders use `theme.borders.solid` (2px solid black)
- Transitions use `tokens.transitions.fast` (0.15s) or `normal` (0.2s)









